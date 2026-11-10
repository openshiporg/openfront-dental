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
 * A trace number is compared by its key (letters and digits only, upper case), so "chk-71502", " CHK 71502 " and "CHK-71502" are
 * one payment; the database holds one live remittance per payer and key (migration 20261110500000).
 */

/** The comparable form of a payment trace number. Must match SQL dental_trace_key(): strip all but A-Z a-z 0-9, then upper-case. */
export const traceKey = (trace: string) => String(trace ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()

const isTakeback = (c: { statusCode: string; paidMinor: bigint }) => c.statusCode === '22' || c.paidMinor < 0n
/** The amount a takeback recoups, as a positive number (an 835 reversal reports the original payment negated). */
const recoupedOf = (c: { paidMinor: bigint }) => (c.paidMinor < 0n ? -c.paidMinor : c.paidMinor)

type Tx = UnitOfWork['tx']
type ClaimForPosting = { id: string; ref: string; status: string; patientId: string | null; coverageId: string | null; currentVersionId: string | null }
const LEVEL_BY_CODE: Record<string, string> = { '1': 'primary', '2': 'secondary', '3': 'tertiary', '19': 'primary', '20': 'secondary', '21': 'tertiary' }

/**
 * Who is paying, and at which coverage level (Phase 4 r2 N1/N2). The level is the coverage that payer holds for this patient: the
 * claim's own coverage when it is that payer's, otherwise the patient's other coverage with that payer. The 835 status code (2 = as
 * secondary, 3 = as tertiary) only picks between levels when the same payer holds more than one; on its own it never makes a second
 * payment from the primary payer look like a secondary one. A payer that covers the patient at no level gets no level (null).
 */
export async function postingContext(tx: Tx, claim: ClaimForPosting, remittancePayerId: string | null, statusCode: string) {
  const own = claim.coverageId ? await tx.coverage.findUnique({ where: { id: claim.coverageId }, select: { ordinal: true, subscriber: { select: { plan: { select: { payerId: true } } } } } }) : null
  const claimPayerId = own?.subscriber?.plan?.payerId ?? null
  const payerId = remittancePayerId ?? claimPayerId
  const held = claim.patientId && payerId
    ? (await tx.coverage.findMany({ where: { patientId: claim.patientId, status: { not: 'invalid' }, subscriber: { plan: { payerId } } }, select: { id: true, ordinal: true } }))
    : []
  const levels = new Set(held.map(c => c.ordinal))
  if (own && payerId === claimPayerId) levels.add(own.ordinal)
  const byCode = LEVEL_BY_CODE[statusCode]
  const level = byCode && levels.has(byCode) && byCode !== own?.ordinal ? byCode
    : own && payerId === claimPayerId ? own.ordinal
    : ['primary', 'secondary', 'tertiary'].find(l => levels.has(l)) ?? null
  // A payer may pay a claim again only for a new adjudication: a corrected version sent, or an appeal decided. Filing an appeal
  // (outcome still pending) is not a new adjudication, so it never opens a new round (Phase 4 r3 R3-1).
  const version = claim.currentVersionId ? (await tx.claimVersion.findUnique({ where: { id: claim.currentVersionId }, select: { number: true } }))?.number ?? 0 : 0
  const appeals = await tx.appeal.count({ where: { denial: { claimId: claim.id }, outcome: { not: 'pending' } } })
  return { payerId, level, round: `v${version}/a${appeals}` }
}

type Context = Awaited<ReturnType<typeof postingContext>>

/** Live payment postings on this claim from this payer at this level whose own entries nobody has reversed yet. Latest first. */
async function reversiblePayments(tx: Tx, claimId: string, ctx: Context) {
  const candidates = await tx.paymentPosting.findMany({
    where: { claimId, payerId: ctx.payerId, coverageLevel: ctx.level ?? '', kind: 'payment', status: 'posted' },
    orderBy: { createdAt: 'desc' }, include: { entries: true },
  })
  const out: { posting: (typeof candidates)[number]; entries: (typeof candidates)[number]['entries'] }[] = []
  for (const posting of candidates) {
    const own = posting.entries.filter(e => e.kind !== 'reversal' && !e.reversesId)
    if (!own.length) continue
    const already = new Set((await tx.ledgerEntry.findMany({ where: { reversesId: { in: own.map(e => e.id) } }, select: { reversesId: true } })).map(e => e.reversesId))
    const open = own.filter(e => !already.has(e.id))
    if (open.length === own.length) out.push({ posting, entries: open })
  }
  return out
}

/**
 * What a takeback may undo: the latest live payment from the same payer, at the same level, on the same claim, for exactly the amount
 * being recouped, all of whose entries are still standing. A recoupment of part of a payment, from another payer, or of an amount
 * nobody paid matches nothing: the remittance is held as an exception for a person to handle, and nothing is reversed.
 */
async function takebackTarget(tx: Tx, claim: ClaimForPosting, ctx: Context, recoupedMinor: bigint) {
  if (!ctx.level) return { problem: `${claim.ref}: this payer does not cover the patient, so its takeback was not applied.`, found: null }
  const live = await reversiblePayments(tx, claim.id, ctx)
  if (!live.length) return { problem: `${claim.ref} has no payment from this payer left to take back, so nothing was reversed.`, found: null }
  const exact = live.find(p => p.posting.paidMinor === recoupedMinor && recoupedMinor > 0n)
  if (!exact) return { problem: `${claim.ref}: the takeback (${formatMinor(recoupedMinor)}) does not match the payment from this payer (${live.map(p => formatMinor(p.posting.paidMinor)).join(', ')}). Nothing was reversed; handle it by hand.`, found: null }
  return { problem: '', found: exact }
}

/**
 * Why an ordinary payment cannot post: the payer does not cover the patient, or already has a live payment on this claim, at this
 * level, for this adjudication. In a new adjudication (an appeal decided, a corrected version), a payment for the same amount as
 * a payment from this payer that is still standing is a copy of it, not a new payment: it is held too (R3-1).
 */
async function paymentProblem(tx: Tx, claim: ClaimForPosting, ctx: Context, paidMinor: bigint) {
  if (!ctx.level) return `${claim.ref}: this payer does not cover the patient, so its payment was not posted.`
  const live = await tx.paymentPosting.findMany({ where: { claimId: claim.id, payerId: ctx.payerId, coverageLevel: ctx.level, kind: 'payment', status: 'posted' }, select: { round: true, paidMinor: true } })
  if (live.some(p => p.round === ctx.round)) return `${claim.ref} already has a payment from this payer posted. Post a takeback first, or enter it as a secondary payment.`
  const amount = paidMinor > 0n ? paidMinor : 0n
  if (live.some(p => p.paidMinor === amount)) return `${claim.ref} already has a payment of ${formatMinor(amount)} from this payer posted, so this looks like a copy of it and was held. Post a takeback first if the payer paid it again.`
  return ''
}

const ADJUSTABLE_FROM = ['submitted', 'acknowledged', 'pending_payer', 'submission_unknown', 'adjudicated', 'appealed', 'appeal_decided']
const asJson = (list: { group: string; reason: string; amountMinor: bigint }[]) => list.map(a => ({ group: a.group, reason: a.reason, amountMinor: a.amountMinor.toString() }))
const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n)
const lineAdjTotal = (line: EraLine) => sum(line.adjustments.map(a => a.amountMinor))

export type ApplyResult = { remittanceId: string; ref: string; status: string; claimsPosted: number; claimsHeld: number; duplicate: boolean }

export async function applyParsedEra(uow: UnitOfWork, actor: Actor, era: ParsedEra, origin: { source: 'era_835' | 'manual_eob'; adapterKey: string; observationId?: string | null; payerId?: string | null }): Promise<ApplyResult> {
  const { tx } = uow
  // One trace key at a time: a second delivery of the same remittance (in any spelling) waits here, then finds the first.
  const key = traceKey(era.traceNumber)
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`era:${key}`}))`
  const claimRows = await tx.claim.findMany({ where: { patientControlNumber: { in: era.claims.map(c => c.patientControlNumber).filter(Boolean) } }, include: { lines: true, coverage: { include: { subscriber: { include: { plan: true } } } } } })
  const byPcn = new Map(claimRows.map(c => [c.patientControlNumber, c]))
  // The payer named on the remittance itself first; only when it names none we know, the first matched claim's own payer.
  const named = era.payerName ? (await tx.payer.findFirst({ where: { name: era.payerName }, select: { id: true } }))?.id ?? null : null
  const payerId = origin.payerId ?? named ?? claimRows[0]?.coverage?.subscriber?.plan?.payerId ?? null

  const earlier = key
    ? (await tx.$queryRaw<{ id: string; ref: string }[]>`SELECT id, ref FROM "Remittance" WHERE payer IS NOT DISTINCT FROM ${payerId} AND dental_trace_key("traceNumber") = ${key} AND status <> 'duplicate' ORDER BY "createdAt" ASC LIMIT 1`)[0] ?? null
    : null
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
    // One claim at a time: a second remittance for the same claim waits here, then sees this one's posting.
    if (claim) await lockRow<any>(tx, 'Claim', claim.id)
    const ctx = claim ? await postingContext(tx, claim, payerId, parsed.statusCode) : null
    const problem = !claim ? `No claim matches control number ${parsed.patientControlNumber || '(blank)'}.`
      : !ADJUSTABLE_FROM.includes(claim.status) ? `${claim.ref} is ${claim.status.replaceAll('_', ' ')}, so it cannot take a payment.`
      : lineRows.some(l => !l.claimLineId) ? `A line on ${claim.ref} does not match any line sent.`
      : lineRows.some(l => !l.conserves) ? `The amounts on ${claim.ref} do not add up (charge ≠ paid + adjustments).`
      : sum(lineRows.map(l => l.line.paidMinor)) !== parsed.paidMinor && parsed.lines.length ? `The line payments on ${claim.ref} do not add up to the claim payment.`
      : isTakeback(parsed) ? (await takebackTarget(tx, claim, ctx!, recoupedOf(parsed))).problem
      : await paymentProblem(tx, claim, ctx!, parsed.paidMinor)
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
  await lockRow<any>(tx, 'Claim', claim.id)
  const takeback = isTakeback(parsed)
  const writeoff = parsed.lines.length ? sum(parsed.lines.map(l => writeOffMinor(l.adjustments))) : writeOffMinor(parsed.adjustments)
  // Checked again under the claim's lock: callers check first so they can hold the remittance instead of failing.
  const ctx = await postingContext(tx, claim, remittance.payerId, parsed.statusCode)
  const target = takeback ? await takebackTarget(tx, claim, ctx, recoupedOf(parsed)) : null
  const refused = target ? target.problem : await paymentProblem(tx, claim, ctx, parsed.paidMinor)
  if (refused) throw new DomainError(Codes.GUARD_FAILED, refused)
  const posting = await tx.paymentPosting.create({
    data: {
      remittanceId: remittance.id, remittanceClaimId: input.remittanceClaimId, claimId: claim.id, payerId: ctx.payerId, kind: takeback ? 'takeback' : 'payment',
      coverageLevel: ctx.level!, paidMinor: takeback ? recoupedOf(parsed) : parsed.paidMinor > 0n ? parsed.paidMinor : 0n, round: ctx.round, postedById, at: uow.now, status: 'posted',
    },
  })
  const base = { accountId: account.id, patientId: claim.patientId, currencyCode: currency, businessDate, locationId: claim.locationId, paymentPostingId: posting.id, claimId: claim.id, postedById }
  const label = payer?.name ?? 'insurance'

  if (takeback) {
    // The payer took its own payment back, in full: reverse exactly what that posting wrote, entry by entry. Only the same payer's
    // payment at the same level, for the same amount; never an earlier takeback, never an entry already reversed (takebackTarget).
    const found = target!.found!
    const earlier = found.posting
    for (const entry of found.entries) {
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
