import { systemActor, type Actor } from '../lib/actor'
import { auditCreate, lockRow, transition } from '../lib/cas'
import { DomainError, Codes } from '../lib/errors'
import { lineConserves, patientRespOf, writeOffMinor, type EraClaim, type EraLine, type ParsedEra } from '../lib/era'
import { postEntry } from '../lib/ledger'
import { formatMinor } from '../lib/money'
import { nextReference } from '../lib/sequence'
import type { UnitOfWork } from '../lib/unitOfWork'
import { accountFor, dayOf, locationToday } from './clinicalShared'

/*
 * Applying a remittance (STATE-MACHINES §7; INTEGRATIONS §2.4). One function serves the clearinghouse poll and manual EOB entry.
 * Nothing posts twice: a trace number seen before is stored as a duplicate and posts nothing, and the database allows one live
 * posting per remittance claim. A line that does not balance (charge ≠ paid + adjustments) never posts: the remittance waits as an exception.
 */

const ADJUSTABLE_FROM = ['submitted', 'acknowledged', 'pending_payer', 'submission_unknown', 'adjudicated', 'appealed', 'appeal_decided']
const asJson = (list: { group: string; reason: string; amountMinor: bigint }[]) => list.map(a => ({ group: a.group, reason: a.reason, amountMinor: a.amountMinor.toString() }))
const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n)
const lineAdjTotal = (line: EraLine) => sum(line.adjustments.map(a => a.amountMinor))

export type ApplyResult = { remittanceId: string; ref: string; status: string; claimsPosted: number; claimsHeld: number; duplicate: boolean }

export async function applyParsedEra(uow: UnitOfWork, actor: Actor, era: ParsedEra, origin: { source: 'era_835' | 'manual_eob'; adapterKey: string; observationId?: string | null; payerId?: string | null }): Promise<ApplyResult> {
  const { tx } = uow
  // One trace number at a time: a second delivery of the same remittance waits here, then finds the first.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`era:${era.traceNumber}`}))`
  const claimRows = await tx.claim.findMany({ where: { patientControlNumber: { in: era.claims.map(c => c.patientControlNumber).filter(Boolean) } }, include: { lines: true, coverage: { include: { subscriber: { include: { plan: true } } } } } })
  const byPcn = new Map(claimRows.map(c => [c.patientControlNumber, c]))
  const payerId = origin.payerId ?? claimRows[0]?.coverage?.subscriber?.plan?.payerId ?? (era.payerName ? (await tx.payer.findFirst({ where: { name: era.payerName }, select: { id: true } }))?.id ?? null : null)

  const earlier = era.traceNumber ? await tx.remittance.findFirst({ where: { traceNumber: era.traceNumber, payerId, status: { not: 'duplicate' } }, orderBy: { createdAt: 'asc' } }) : null
  const ref = await nextReference(tx, 'ERA', uow.now)
  if (earlier) {
    const dup = await tx.remittance.create({ data: { ref, payerId, source: origin.source, adapterKey: origin.adapterKey, traceNumber: era.traceNumber, paymentMethod: era.paymentMethod, paymentDate: era.paymentDate ? dayOf(era.paymentDate) : null, totalPaidMinor: era.totalPaidMinor, status: 'duplicate', duplicateOfId: earlier.id, exceptionNote: `Same payment trace as ${earlier.ref}. Nothing was posted.`, observationId: origin.observationId ?? null } })
    auditCreate(uow, actor, 'Remittance', dup.id, 'remittance.duplicate_ignored', { duplicateOf: earlier.ref, trace: era.traceNumber })
    return { remittanceId: dup.id, ref, status: 'duplicate', claimsPosted: 0, claimsHeld: 0, duplicate: true }
  }

  const remittance = await tx.remittance.create({
    data: { ref, payerId, source: origin.source, adapterKey: origin.adapterKey, traceNumber: era.traceNumber, paymentMethod: era.paymentMethod, paymentDate: era.paymentDate ? dayOf(era.paymentDate) : null, totalPaidMinor: era.totalPaidMinor, status: 'parsed', providerAdjustments: era.providerAdjustments as never, observationId: origin.observationId ?? null },
  })
  auditCreate(uow, actor, 'Remittance', remittance.id, 'remittance.received', { ref, claims: era.claims.length, totalPaidMinor: era.totalPaidMinor.toString() })

  let posted = 0
  let held = 0
  const notes: string[] = []
  for (const parsed of era.claims) {
    const claim = byPcn.get(parsed.patientControlNumber) ?? null
    const lineByControl = new Map((claim?.lines ?? []).map(l => [l.lineControlNumber, l]))
    const rc = await tx.remittanceClaim.create({
      data: { remittanceId: remittance.id, claimId: claim?.id ?? null, patientControlNumber: parsed.patientControlNumber, payerClaimControlNumber: parsed.payerClaimControlNumber, claimStatusCode: parsed.statusCode, chargeMinor: parsed.chargeMinor, paidMinor: parsed.paidMinor, patientRespMinor: parsed.patientRespMinor, crossoverCarrier: parsed.crossoverCarrier as never },
    })
    const lineRows: { id: string; line: EraLine; claimLineId: string | null; conserves: boolean }[] = []
    for (const line of parsed.lines) {
      const claimLine = lineByControl.get(line.lineControlNumber) ?? null
      const conserves = lineConserves(line)
      const row = await tx.remittanceLine.create({
        data: { remittanceClaimId: rc.id, claimLineId: claimLine?.id ?? null, code: line.code, tooth: '', dateOfService: line.dateOfService ? dayOf(line.dateOfService) : null, lineControlNumber: line.lineControlNumber, chargeMinor: line.chargeMinor, allowedMinor: line.chargeMinor - sum(line.adjustments.filter(a => a.group === 'CO').map(a => a.amountMinor)), paidMinor: line.paidMinor, adjustmentsTotalMinor: lineAdjTotal(line), adjustments: asJson(line.adjustments) as never, rarc: line.remarks as never, conservationOk: conserves },
      })
      lineRows.push({ id: row.id, line, claimLineId: claimLine?.id ?? null, conserves })
    }
    const problem = !claim ? `No claim matches control number ${parsed.patientControlNumber || '(blank)'}.`
      : !ADJUSTABLE_FROM.includes(claim.status) ? `${claim.ref} is ${claim.status.replaceAll('_', ' ')}, so it cannot take a payment.`
      : lineRows.some(l => !l.claimLineId) ? `A line on ${claim.ref} does not match any line sent.`
      : lineRows.some(l => !l.conserves) ? `The amounts on ${claim.ref} do not add up (charge ≠ paid + adjustments).`
      : sum(lineRows.map(l => l.line.paidMinor)) !== parsed.paidMinor && parsed.lines.length ? `The line payments on ${claim.ref} do not add up to the claim payment.` : ''
    if (problem) {
      held += 1
      notes.push(problem)
      continue
    }
    await postClaimPayment(uow, actor, { remittance, remittanceClaimId: rc.id, claim: claim!, parsed, lineRows })
    posted += 1
  }

  const status = posted === 0 ? 'exception' : 'posted'
  const complete = held === 0
  await tx.remittance.update({ where: { id: remittance.id }, data: { status, postedCompleteness: posted === 0 ? '' : complete ? 'complete' : 'partial', exceptionNote: notes.join(' ').slice(0, 500), version: { increment: 1 } } })
  return { remittanceId: remittance.id, ref, status, claimsPosted: posted, claimsHeld: held, duplicate: false }
}

/** Post one matched, balanced claim payment. Called for new remittances and for manual matches. */
export async function postClaimPayment(uow: UnitOfWork, actor: Actor, input: { remittance: { id: string; ref: string; payerId: string | null }; remittanceClaimId: string; claim: any; parsed: EraClaim; lineRows: { id: string; line: EraLine; claimLineId: string | null }[] }) {
  const { tx } = uow
  const { claim, parsed, remittance } = input
  const account = await accountFor(uow, claim.patientId)
  const businessDate = dayOf(await locationToday(tx, claim.locationId, uow.now))
  const currency = (await tx.practiceSettings.findUnique({ where: { id: 1 }, select: { currencyCode: true } }))?.currencyCode ?? 'USD'
  const postedById = actor.kind === 'user' ? actor.userId : null
  const payer = remittance.payerId ? await tx.payer.findUnique({ where: { id: remittance.payerId }, select: { name: true } }) : null
  const takeback = parsed.statusCode === '22' || parsed.paidMinor < 0n
  const writeoff = parsed.lines.length ? sum(parsed.lines.map(l => writeOffMinor(l.adjustments))) : writeOffMinor(parsed.adjustments)
  const posting = await tx.paymentPosting.create({ data: { remittanceId: remittance.id, remittanceClaimId: input.remittanceClaimId, postedById, at: uow.now, status: 'posted' } })
  const base = { accountId: account.id, patientId: claim.patientId, currencyCode: currency, businessDate, locationId: claim.locationId, paymentPostingId: posting.id, claimId: claim.id, postedById }
  const label = payer?.name ?? 'insurance'

  if (takeback) {
    // The payer took a payment back: reverse what that claim's earlier posting wrote, exactly, entry by entry.
    const earlier = await tx.paymentPosting.findFirst({ where: { remittanceClaim: { claimId: claim.id }, status: 'posted', id: { not: posting.id } }, orderBy: { createdAt: 'desc' }, include: { entries: true } })
    if (!earlier) throw new DomainError(Codes.GUARD_FAILED, `${claim.ref} has no earlier payment to take back.`)
    for (const entry of earlier.entries.filter(e => e.kind !== 'reversal' && !e.reversesId)) {
      await postEntry(tx, { ...base, kind: 'reversal', amountMinor: -entry.amountMinor, originalBusinessDate: entry.originalBusinessDate ?? undefined, reversesId: entry.id, providerId: entry.providerId, chartEntryId: entry.chartEntryId, adjustmentId: entry.adjustmentId, memo: `Payment taken back by ${label} (${remittance.ref})` }, uow.now)
    }
    await tx.paymentPosting.update({ where: { id: earlier.id }, data: { status: 'reversed', version: { increment: 1 } } })
    await tx.claim.update({ where: { id: claim.id }, data: { recouped: true, version: { increment: 1 } } })
    auditCreate(uow, actor, 'Claim', claim.id, 'claim.payment_taken_back', { remittance: remittance.ref, reversedPosting: earlier.id })
    return posting
  }

  if (parsed.paidMinor > 0n) await postEntry(tx, { ...base, kind: 'insurance_payment', amountMinor: -parsed.paidMinor, memo: `Insurance payment from ${label} (${remittance.ref}), ${formatMinor(parsed.paidMinor)}` }, uow.now)
  if (writeoff > 0n) await postEntry(tx, { ...base, kind: 'insurance_writeoff', amountMinor: -writeoff, memo: `Contract write-off, ${label} (${remittance.ref})` }, uow.now)
  else if (writeoff < 0n) throw new DomainError(Codes.GUARD_FAILED, `${claim.ref} has a negative write-off. Review the remittance.`)

  // Line outcomes and denials.
  let anyDenied = false
  let anyPaid = false
  for (const { line, claimLineId } of input.lineRows) {
    const paid = line.paidMinor
    const lineStatus = paid <= 0n ? 'denied' : paid < line.chargeMinor - writeOffMinor(line.adjustments) - patientRespOf(line.adjustments) ? 'partially_paid' : 'paid'
    if (lineStatus === 'denied') anyDenied = true
    if (paid > 0n) anyPaid = true
    await tx.claimLine.update({ where: { id: claimLineId! }, data: { status: lineStatus, paidMinor: paid, allowedMinor: line.chargeMinor - writeOffMinor(line.adjustments), patientRespMinor: patientRespOf(line.adjustments), version: { increment: 1 } } })
    if (lineStatus === 'denied') await openDenial(uow, actor, claim, claimLineId!, line)
  }
  const deductibleOnly = parsed.paidMinor === 0n && parsed.lines.length > 0 && parsed.lines.every(l => l.adjustments.some(a => a.group === 'PR' && a.reason === '1'))
  const outcome = deductibleOnly ? 'zero_applied_to_deductible' : parsed.paidMinor === 0n || parsed.statusCode === '4' ? 'denied' : anyDenied && anyPaid ? 'partially_paid' : 'paid'
  const forwarded = ['19', '20', '21'].includes(parsed.statusCode)
  const refs = { ...((claim.clearinghouseRefs as Record<string, unknown>) ?? {}), ...(forwarded ? { forwardedByPayer: true } : {}) }
  const spec = { model: 'Claim', id: claim.id, to: 'adjudicated', actor, eventType: 'claim.adjudicated', metadata: { remittance: remittance.ref, outcome }, data: { adjudicationOutcome: outcome, adjudicatedAt: uow.now, payerClaimControlNumber: parsed.payerClaimControlNumber || claim.payerClaimControlNumber, clearinghouseRefs: refs as never } }
  if (claim.status === 'adjudicated') {
    await tx.claim.update({ where: { id: claim.id }, data: { ...spec.data, version: { increment: 1 } } })
    auditCreate(uow, actor, 'Claim', claim.id, 'claim.readjudicated', { remittance: remittance.ref, outcome })
  } else {
    await transition<any>(uow, { ...spec, from: ADJUSTABLE_FROM.filter(s => s !== 'adjudicated') })
  }
  auditCreate(uow, actor, 'PaymentPosting', posting.id, 'remittance.posted', { remittance: remittance.ref, claim: claim.ref, paidMinor: parsed.paidMinor.toString(), writeOffMinor: writeoff.toString(), patientRespMinor: parsed.patientRespMinor.toString() })
  return posting
}

async function openDenial(uow: UnitOfWork, actor: Actor, claim: any, claimLineId: string, line: EraLine) {
  const { tx } = uow
  const reason = line.adjustments.find(a => a.reason !== '45' && a.group !== 'PR')?.reason ?? line.adjustments[0]?.reason ?? 'unknown'
  const open = await tx.denial.findFirst({ where: { claimLineId, carc: reason, status: { in: ['open', 'working', 'appealed'] } }, select: { id: true } })
  if (open) return
  const mapped = await tx.denialReasonMap.findFirst({ where: { carc: reason } })
  const denial = await tx.denial.create({ data: { claimId: claim.id, claimLineId, carc: reason, rarc: line.remarks as never, preventableClass: mapped?.preventableClass ?? 'other', status: 'open', amountMinor: line.chargeMinor } })
  auditCreate(uow, actor, 'Denial', denial.id, 'denial.opened', { claim: claim.ref, carc: reason, class: denial.preventableClass })
}

/** Link an unmatched remittance claim to a claim by hand, then post it. */
export async function matchRemittanceClaim(uow: UnitOfWork, actor: Actor, remittanceClaimId: string, claimId: string) {
  const { tx } = uow
  const rc = await tx.remittanceClaim.findUnique({ where: { id: remittanceClaimId }, include: { remittance: true, lines: true } })
  if (!rc) throw new DomainError(Codes.NOT_FOUND, 'Remittance claim not found.')
  if (rc.claimId) throw new DomainError(Codes.GUARD_FAILED, 'This payment is already matched to a claim.')
  await lockRow<any>(tx, 'Claim', claimId)
  const claim = await tx.claim.findUniqueOrThrow({ where: { id: claimId }, include: { lines: true } })
  if (!ADJUSTABLE_FROM.includes(claim.status)) throw new DomainError(Codes.GUARD_FAILED, `${claim.ref} is ${claim.status.replaceAll('_', ' ')}, so it cannot take a payment.`)
  const byControl = new Map(claim.lines.map(l => [l.lineControlNumber, l]))
  const lineRows: { id: string; line: EraLine; claimLineId: string | null }[] = []
  for (const row of rc.lines) {
    const claimLine = byControl.get(row.lineControlNumber)
    if (!claimLine) throw new DomainError(Codes.GUARD_FAILED, `Line ${row.lineControlNumber || '(blank)'} does not match any line on ${claim.ref}.`)
    if (!row.conservationOk) throw new DomainError(Codes.GUARD_FAILED, 'A line on this remittance does not balance, so it cannot be posted.')
    const adjustments = ((row.adjustments as any[]) ?? []).map(a => ({ group: String(a.group), reason: String(a.reason), amountMinor: BigInt(a.amountMinor) }))
    lineRows.push({ id: row.id, claimLineId: claimLine.id, line: { lineControlNumber: row.lineControlNumber, code: row.code, dateOfService: null, chargeMinor: row.chargeMinor, paidMinor: row.paidMinor, adjustments, remarks: ((row.rarc as string[]) ?? []) } })
    await tx.remittanceLine.update({ where: { id: row.id }, data: { claimLineId: claimLine.id } })
  }
  await tx.remittanceClaim.update({ where: { id: rc.id }, data: { claimId } })
  const parsed: EraClaim = { patientControlNumber: claim.patientControlNumber, payerClaimControlNumber: rc.payerClaimControlNumber, statusCode: rc.claimStatusCode, chargeMinor: rc.chargeMinor, paidMinor: rc.paidMinor, patientRespMinor: rc.patientRespMinor, adjustments: [], lines: lineRows.map(l => l.line), crossoverCarrier: {} }
  await postClaimPayment(uow, actor, { remittance: rc.remittance as never, remittanceClaimId: rc.id, claim, parsed, lineRows })
  const open = await tx.remittanceClaim.count({ where: { remittanceId: rc.remittanceId, claimId: null } })
  await tx.remittance.update({ where: { id: rc.remittanceId as string }, data: { status: 'posted', postedCompleteness: open ? 'partial' : 'complete', exceptionNote: open ? rc.remittance?.exceptionNote ?? '' : '', version: { increment: 1 } } })
  return { claimId }
}

export const eraActor = () => systemActor('era-poll')
