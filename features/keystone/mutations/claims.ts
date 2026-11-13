import { requirePermission } from '../lib/actor'
import { auditCreate, lockRow, transition } from '../lib/cas'
import { payloadHash } from '../lib/canonical'
import { toCsv } from '../lib/recall'
import type { ClaimPayload } from '../../integrations/clearinghouse'
import { buildPayload, filingDeadline, hasBlocking, scrubClaim as runScrubRules } from '../lib/claims'
import { command } from '../lib/command'
import { DomainError, Codes } from '../lib/errors'
import { parseMoney } from '../lib/ledger'
import { nextReference } from '../lib/sequence'
import { feeFor, dayOf, isoDay, locationToday, oneOf, requireReason } from './clinicalShared'
import { applyParsedEra, matchRemittanceClaim } from './remittance'
import type { ParsedEra } from '../lib/era'
import { ATTACHMENT_KINDS, ATTACHMENT_ROUTES, APPEAL_VIA, APPEAL_OUTCOMES } from '../models/claims'
import { assertLocation, assertPatientInScope, resolvePatientRef, staff, type Ctx } from './shared'

/*
 * Claim commands (STATE-MACHINES §7). Staff build a claim from posted chart entries, scrub it, release it (a human, never automatic),
 * and the worker sends it. Release freezes a ClaimVersion; once frozen, the claim's lines no longer change: a correction is a new version.
 * Every move goes through transition(); the database backs the frozen version, the once-only posting and the append-only evidence.
 */

const EDITABLE = ['draft', 'scrubbed', 'ready', 'rejected', 'correction_required']
const SENT = ['submitted', 'submission_unknown', 'acknowledged', 'pending_payer', 'adjudicated', 'appealed', 'appeal_decided']

async function scopedClaim(tx: any, locationIds: string[] | null, claimId: string) {
  const claim = await lockRow<any>(tx, 'Claim', claimId)
  assertLocation(locationIds, claim.locationId)
  return claim
}

export async function createClaim(_root: unknown, args: { patientId: string; coverageId: string; locationId: string; kind?: string | null; chartEntryIds?: string[] | null; primaryClaimId?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageClaims')
  const kind = oneOf(args.kind || 'original', ['original', 'predetermination', 'secondary', 'tertiary'] as const, 'kind')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'claim.create', actor, idempotencyKey, params }, async uow => {
    const { tx } = uow
    assertLocation(locationIds, args.locationId)
    const patientId = await resolvePatientRef(tx, args.patientId)
    await assertPatientInScope(tx, locationIds, patientId)
    const coverage = await tx.coverage.findUnique({ where: { id: args.coverageId }, include: { subscriber: { include: { plan: { include: { payer: true } } } } } })
    if (!coverage || coverage.patientId !== patientId) throw new DomainError(Codes.NOT_FOUND, 'Coverage not found for this patient.', { field: 'coverageId' })
    const location = await tx.location.findUniqueOrThrow({ where: { id: args.locationId } })
    const payer = coverage.subscriber!.plan!.payer!
    const secondary = kind === 'secondary' || kind === 'tertiary'
    let sourceLines: { chartEntryId: string | null; entry: any }[] = []
    let primary: any = null
    if (secondary) {
      if (!args.primaryClaimId) throw new DomainError(Codes.INVALID_INPUT, 'Choose the primary claim this one follows.', { field: 'primaryClaimId' })
      primary = await tx.claim.findUnique({ where: { id: args.primaryClaimId }, include: { lines: true } })
      if (!primary || primary.patientId !== patientId) throw new DomainError(Codes.NOT_FOUND, 'Primary claim not found.', { field: 'primaryClaimId' })
      if (!['adjudicated', 'closed'].includes(primary.status)) throw new DomainError(Codes.GUARD_FAILED, 'The primary payer has to finish before a secondary claim is made.')
      const entries = await tx.chartEntry.findMany({ where: { id: { in: primary.lines.map((l: any) => l.chartEntryId).filter(Boolean) } }, include: { code: { include: { codeSystem: true } } } })
      sourceLines = entries.map(entry => ({ chartEntryId: entry.id, entry }))
    } else {
      const statuses = kind === 'predetermination' ? ['planned', 'accepted', 'scheduled'] : ['posted']
      const where: any = { patientId, locationId: args.locationId, kind: 'procedure', status: { in: statuses } }
      if (args.chartEntryIds?.length) where.id = { in: args.chartEntryIds }
      const entries = await tx.chartEntry.findMany({ where, orderBy: [{ dateOfService: 'asc' }, { createdAt: 'asc' }], include: { code: { include: { codeSystem: true } } } })
      const claimed = new Set((await tx.claimLine.findMany({ where: { chartEntryId: { in: entries.map(e => e.id) }, claim: { kind, coverageId: coverage.id, status: { notIn: ['voided'] } } }, select: { chartEntryId: true } })).map(l => l.chartEntryId))
      sourceLines = entries.filter(e => !claimed.has(e.id)).map(entry => ({ chartEntryId: entry.id, entry }))
    }
    if (!sourceLines.length) throw new DomainError(Codes.GUARD_FAILED, kind === 'predetermination' ? 'There is no planned treatment to send for approval.' : 'There is no finished, unbilled work for this insurance.')

    const today = await locationToday(tx, args.locationId, uow.now)
    const ref = await nextReference(tx, 'CLM', uow.now)
    const first = sourceLines[0].entry
    const dates = sourceLines.map(s => isoDay(s.entry.dateOfService) ?? today).sort()
    const deadline = filingDeadline(dates[0], payer.timelyFilingDays)
    const claim = await tx.claim.create({
      data: {
        ref, kind, patientId, coverageId: coverage.id, locationId: location.id, billingEntityId: location.billingEntityId, renderingProviderId: first.providerId ?? null,
        placeOfServiceCode: location.placeOfServiceCode || '11', status: 'draft', patientControlNumber: ref, timelyFilingDeadline: deadline ? dayOf(deadline) : null,
        primaryClaimId: primary?.id ?? null, primaryAdjudicationSnapshot: primary ? ({ ref: primary.ref, outcome: primary.adjudicationOutcome, payerClaimControlNumber: primary.payerClaimControlNumber } as never) : {},
      },
    })
    let total = 0n
    let n = 0
    for (const { entry } of sourceLines) {
      n += 1
      const own = entry.code
      let target = own?.codeSystem?.key === 'CDT' ? own : null
      if (own && !target) {
        const cross = await tx.procedureCodeCrosswalk.findFirst({ where: { localCodeId: own.id, status: 'confirmed' }, include: { targetCode: true } })
        target = cross?.targetCode ?? null
      }
      const date = isoDay(entry.dateOfService) ?? today
      let fee = entry.feeMinor as bigint | null
      if (fee === null && own) fee = ((await feeFor(tx, own.id, date))?.amountMinor ?? 0n) * BigInt(entry.units ?? 1)
      total += fee ?? 0n
      await tx.claimLine.create({ data: { claimId: claim.id, chartEntryId: entry.id, codeId: target?.id ?? null, localCodeId: own?.id ?? null, tooth: entry.tooth || '', surfaces: entry.surfaces || '', dateOfService: dayOf(date), units: entry.units ?? 1, feeMinor: fee ?? 0n, lineControlNumber: `L${String(n).padStart(2, '0')}`, status: 'pending' } })
    }
    await tx.claim.update({ where: { id: claim.id }, data: { totalChargeMinor: total } })
    auditCreate(uow, actor, 'Claim', claim.id, 'claim.created', { ref, kind, lines: n, totalChargeMinor: total.toString() })
    return { id: claim.id, ref, lines: n, totalChargeMinor: total.toString() }
  })
  return { replay: result.replay, ...result.value }
}

export async function scrubClaimCommand(_root: unknown, args: { claimId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageClaims')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'claim.scrub', actor, idempotencyKey, params }, async uow => {
    const { tx } = uow
    const claim = await scopedClaim(tx, locationIds, args.claimId)
    if (!EDITABLE.includes(claim.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'A claim that has been released cannot be scrubbed again. Make a correction instead.')
    const today = await locationToday(tx, claim.locationId, uow.now)
    const { findings, rulesetVersion } = await runScrubRules(tx, claim.id, today)
    const versionNumber = (await tx.claimVersion.count({ where: { claimId: claim.id } })) + 1
    await tx.claimScrubResult.create({ data: { claimId: claim.id, versionNumber, rulesetVersion, findings: findings as never } })
    const blocked = hasBlocking(findings)
    const to = blocked ? 'scrubbed' : 'ready'
    const from = EDITABLE
    const moved = await transition<any>(uow, { model: 'Claim', id: claim.id, from, to, expectedVersion: args.expectedVersion, actor, eventType: blocked ? 'claim.scrub_blocked' : 'claim.scrub_clean', metadata: { findings: findings.length } })
    return { id: claim.id, status: moved.status, findings }
  })
  return { replay: result.replay, ...result.value }
}

export async function overrideScrub(_root: unknown, args: { claimId: string; expectedVersion: number; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canOverrideScrub')
  const reason = requireReason(args.reason)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'claim.override_scrub', actor, idempotencyKey, params }, async uow => {
    const { tx } = uow
    const claim = await scopedClaim(tx, locationIds, args.claimId)
    if (claim.status !== 'scrubbed') throw new DomainError(Codes.INVALID_TRANSITION, 'Only a claim with scrub findings needs an override.')
    const last = await tx.claimScrubResult.findFirst({ where: { claimId: claim.id }, orderBy: { ranAt: 'desc' } })
    const versionNumber = (await tx.claimVersion.count({ where: { claimId: claim.id } })) + 1
    await tx.claimScrubResult.create({ data: { claimId: claim.id, versionNumber, rulesetVersion: last?.rulesetVersion ?? '', findings: [...((last?.findings as any[]) ?? []), { rule: 'override', kind: 'override', severity: 'warning', message: `Sent anyway: ${reason}`, overriddenBy: actor.kind === 'user' ? actor.userId : null }] as never } })
    const moved = await transition<any>(uow, { model: 'Claim', id: claim.id, from: ['scrubbed'], to: 'ready', expectedVersion: args.expectedVersion, actor, eventType: 'claim.scrub_overridden', reason })
    return { id: claim.id, status: moved.status }
  })
  return { replay: result.replay, ...result.value }
}

/** Release: a person decides. Freezes the version (payload + hash + idempotency key) and queues the send. */
export async function releaseClaim(_root: unknown, args: { claimId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canSubmitClaims')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'claim.release', actor, idempotencyKey, params }, async uow => {
    const { tx } = uow
    const claim = await scopedClaim(tx, locationIds, args.claimId)
    if (claim.status !== 'ready') throw new DomainError(Codes.INVALID_TRANSITION, 'Scrub the claim first. Only a ready claim can be released.')
    const number = (await tx.claimVersion.count({ where: { claimId: claim.id } })) + 1
    const priorRef = number > 1 ? (claim.payerClaimControlNumber as string) : ''
    if (claim.kind === 'predetermination') { /* sent as an original with the predetermination flag the payer expects */ }
    const payload = await buildPayload(tx, claim.id, number > 1 ? 'replacement' : 'original', priorRef || undefined)
    const hash = payloadHash(payload)
    const key = `claim:${claim.ref}:v${number}:${hash.slice(0, 16)}`
    const version = await tx.claimVersion.create({ data: { claimId: claim.id, number, frequency: payload.frequency, payload: payload as never, payloadHash: hash, idempotencyKey: key, releasedById: actor.kind === 'user' ? actor.userId : null, releasedAt: uow.now } })
    await transition<any>(uow, { model: 'Claim', id: claim.id, from: ['ready'], to: 'released', expectedVersion: args.expectedVersion, actor, eventType: 'claim.released', metadata: { version: number }, data: { currentVersionId: version.id } })
    uow.after(async () => (await import('../messaging/claimWorker')).runClaimSubmit(uow.db, claim.id))
    return { id: claim.id, versionId: version.id, versionNumber: number }
  })
  return { replay: result.replay, ...result.value }
}

/** A released claim with no clearinghouse answer is a manual export: the claim data as a CSV the office submits through the payer's portal. Nothing is marked sent. */
export async function exportClaimCsv(_root: unknown, args: { claimId: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canSubmitClaims')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'claim.export_csv', actor, idempotencyKey, params }, async uow => {
    const claim = await scopedClaim(uow.tx, locationIds, args.claimId)
    if (claim.status !== 'released' || !claim.currentVersionId) throw new DomainError(Codes.INVALID_TRANSITION, 'Only a released claim that has not been sent can be exported.')
    const version = await uow.tx.claimVersion.findUniqueOrThrow({ where: { id: claim.currentVersionId } })
    const p = version.payload as unknown as ClaimPayload
    const dollars = (minor: string) => { const n = BigInt(minor); return `${n / 100n}.${String(n % 100n).padStart(2, '0')}` }
    const header = ['Claim', 'Version', 'Payer', 'Billing provider', 'Billing NPI', 'Rendering provider', 'Rendering NPI', 'Patient', 'Patient DOB', 'Subscriber', 'Subscriber DOB', 'Member ID ends', 'Date of service', 'Procedure', 'Tooth', 'Surfaces', 'Units', 'Charge']
    const rows = p.lines.map(l => [claim.ref, String(version.number), p.payer.name, p.billing.legalName, p.billing.npi, `${p.rendering.name.first} ${p.rendering.name.last}`, p.rendering.npi, `${p.patient.first} ${p.patient.last}`, p.patient.dateOfBirth, `${p.subscriber.first} ${p.subscriber.last}`, p.subscriber.dateOfBirth, p.subscriber.memberIdLast4, l.dateOfService, l.code, l.tooth, l.surfaces, String(l.units), dollars(l.chargeMinor)])
    const csv = toCsv(header, rows)
    auditCreate(uow, actor, 'Claim', claim.id, 'claim.manual_export_prepared', { version: version.number, lines: rows.length })
    return { fileName: `${claim.ref}-v${version.number}.csv`, mimeType: 'text/csv', text: csv, rows: rows.length }
  })
  return { replay: result.replay, ...result.value }
}

/** Something about a sent claim must change: it goes back to staff, and the next release is a replacement version. */
export async function correctClaim(_root: unknown, args: { claimId: string; expectedVersion: number; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageClaims')
  const reason = requireReason(args.reason)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'claim.correct', actor, idempotencyKey, params }, async uow => {
    const claim = await scopedClaim(uow.tx, locationIds, args.claimId)
    const moved = await transition<any>(uow, { model: 'Claim', id: claim.id, from: ['acknowledged', 'pending_payer', 'adjudicated', 'rejected', 'submission_unknown', 'appeal_decided'], to: 'correction_required', expectedVersion: args.expectedVersion, actor, eventType: 'claim.correction_started', reason })
    return { id: claim.id, status: moved.status }
  })
  return { replay: result.replay, ...result.value }
}

export async function voidClaim(_root: unknown, args: { claimId: string; expectedVersion: number; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canSubmitClaims')
  const reason = requireReason(args.reason)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'claim.void', actor, idempotencyKey, params }, async uow => {
    const { tx } = uow
    const claim = await scopedClaim(tx, locationIds, args.claimId)
    if (['draft', 'scrubbed', 'ready', 'correction_required'].includes(claim.status)) {
      const moved = await transition<any>(uow, { model: 'Claim', id: claim.id, from: ['draft', 'scrubbed', 'ready', 'correction_required'], to: 'voided', expectedVersion: args.expectedVersion, actor, eventType: 'claim.voided', reason })
      return { id: claim.id, status: moved.status }
    }
    if (!SENT.includes(claim.status) && claim.status !== 'rejected') throw new DomainError(Codes.INVALID_TRANSITION, 'This claim cannot be voided from where it is.')
    const number = (await tx.claimVersion.count({ where: { claimId: claim.id } })) + 1
    const payload = await buildPayload(tx, claim.id, 'void', claim.payerClaimControlNumber || undefined)
    const hash = payloadHash(payload)
    const version = await tx.claimVersion.create({ data: { claimId: claim.id, number, frequency: 'void', payload: payload as never, payloadHash: hash, idempotencyKey: `claim:${claim.ref}:v${number}:${hash.slice(0, 16)}`, releasedById: actor.kind === 'user' ? actor.userId : null, releasedAt: uow.now } })
    const moved = await transition<any>(uow, { model: 'Claim', id: claim.id, from: [...SENT, 'rejected'], to: 'void_requested', expectedVersion: args.expectedVersion, actor, eventType: 'claim.void_requested', reason, data: { currentVersionId: version.id } })
    uow.after(async () => (await import('../messaging/claimWorker')).runClaimSubmit(uow.db, claim.id))
    return { id: claim.id, status: moved.status }
  })
  return { replay: result.replay, ...result.value }
}

export async function addClaimAttachment(_root: unknown, args: { claimId: string; kind: string; route: string; description: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageClaims')
  const kind = oneOf(args.kind, ATTACHMENT_KINDS, 'kind')
  const route = oneOf(args.route, ATTACHMENT_ROUTES, 'route')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'claim.add_attachment', actor, idempotencyKey, params }, async uow => {
    const claim = await scopedClaim(uow.tx, locationIds, args.claimId)
    if (!EDITABLE.includes(claim.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'Attachments are added before the claim is released.')
    const row = await uow.tx.claimAttachment.create({ data: { claimId: claim.id, kind, route, description: String(args.description ?? '').slice(0, 300), status: route === 'manual_reference' ? 'manual_reference' : 'draft' } })
    auditCreate(uow, actor, 'ClaimAttachment', row.id, 'claim.attachment_added', { claim: claim.ref, kind, route })
    return { id: row.id }
  })
  return { replay: result.replay, ...result.value }
}

export async function saveClaimNarrative(_root: unknown, args: { claimId: string; narrative: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageClaims')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'claim.save_narrative', actor, idempotencyKey, params }, async uow => {
    const claim = await scopedClaim(uow.tx, locationIds, args.claimId)
    if (!EDITABLE.includes(claim.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'The narrative is edited before the claim is released.')
    await uow.tx.claim.update({ where: { id: claim.id }, data: { narrative: String(args.narrative ?? '').slice(0, 2000), version: { increment: 1 } } })
    return { id: claim.id }
  })
  return { replay: result.replay, ...result.value }
}

/** Ask the payer where an unknown or slow claim stands. Never a resend. */
export async function requestClaimStatus(_root: unknown, args: { claimId: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageClaims', 'canSubmitClaims')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'claim.request_status', actor, idempotencyKey, params }, async uow => {
    const claim = await scopedClaim(uow.tx, locationIds, args.claimId)
    if (!SENT.includes(claim.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'This claim has not been sent.')
    const inquiry = await uow.tx.claimStatusInquiry.create({ data: { claimId: claim.id, status: 'queued' } })
    uow.after(async () => (await import('../messaging/claimWorker')).runClaimStatus(uow.db, inquiry.id))
    return { id: inquiry.id }
  })
  return { replay: result.replay, ...result.value }
}

/** Enter a paper or portal explanation of benefits by hand. It is applied by exactly the same code as an electronic remittance. */
export async function enterManualEob(_root: unknown, args: { payerId: string; traceNumber: string; paymentDate: string; method: string; claims: any[]; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canPostRemittances')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'remittance.manual_eob', actor, idempotencyKey, params }, async uow => {
    // r2 M-a: like matchRemittance, every claim named on a hand-entered EOB must be at one of my offices (an unknown one is held as usual).
    const refs = (args.claims ?? []).map((c: any) => String(c?.claimRef ?? '')).filter(Boolean)
    const named = refs.length ? await uow.tx.claim.findMany({ where: { patientControlNumber: { in: refs } }, select: { locationId: true } }) : []
    for (const claim of named) assertLocation(locationIds, claim.locationId)
    const method = oneOf(args.method, ['eft', 'check', 'virtual_card', 'none'] as const, 'method')
    const trace = String(args.traceNumber ?? '').trim()
    if (!trace) throw new DomainError(Codes.INVALID_INPUT, 'Enter the check or payment number.', { field: 'traceNumber' })
    const claims = (args.claims ?? []).map((c: any) => ({
      patientControlNumber: String(c.claimRef ?? ''), payerClaimControlNumber: String(c.payerClaimNumber ?? ''), statusCode: String(c.statusCode ?? '1'),
      chargeMinor: parseMoney(c.charge ?? '0.01'), paidMinor: BigInt(String(c.paidMinor ?? '0')), patientRespMinor: 0n, adjustments: [], crossoverCarrier: {},
      lines: (c.lines ?? []).map((l: any) => ({
        lineControlNumber: String(l.lineControl ?? ''), code: String(l.code ?? ''), dateOfService: null, chargeMinor: BigInt(String(l.chargeMinor)), paidMinor: BigInt(String(l.paidMinor)), remarks: [],
        adjustments: (l.adjustments ?? []).map((a: any) => ({ group: String(a.group), reason: String(a.reason), amountMinor: BigInt(String(a.amountMinor)) })),
      })),
    }))
    const era: ParsedEra = { traceNumber: trace, paymentMethod: method, paymentDate: args.paymentDate || null, totalPaidMinor: claims.reduce((s: bigint, c: any) => s + c.paidMinor, 0n), payerName: '', claims, providerAdjustments: [] }
    return applyParsedEra(uow, actor, era, { source: 'manual_eob', adapterKey: 'manual', payerId: args.payerId })
  })
  return { replay: result.replay, ...result.value }
}

export async function matchRemittance(_root: unknown, args: { remittanceClaimId: string; claimId: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canPostRemittances')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'remittance.match', actor, idempotencyKey, params }, async uow => {
    const claim = await uow.tx.claim.findUnique({ where: { id: args.claimId }, select: { locationId: true } })
    if (!claim) throw new DomainError(Codes.NOT_FOUND, 'Claim not found.')
    assertLocation(locationIds, claim.locationId)
    return matchRemittanceClaim(uow, actor, args.remittanceClaimId, args.claimId)
  })
  return { replay: result.replay, ...result.value }
}

export async function startDenialWork(_root: unknown, args: { denialId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageClaims')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'denial.start', actor, idempotencyKey, params }, async uow => {
    const denial = await lockRow<any>(uow.tx, 'Denial', args.denialId)
    const claim = await uow.tx.claim.findUniqueOrThrow({ where: { id: denial.claimId }, select: { locationId: true } })
    assertLocation(locationIds, claim.locationId)
    const moved = await transition<any>(uow, { model: 'Denial', id: denial.id, from: ['open'], to: 'working', expectedVersion: args.expectedVersion, actor, eventType: 'denial.work_started', data: { assignedToId: actor.kind === 'user' ? actor.userId : null } })
    return { id: denial.id, status: moved.status }
  })
  return { replay: result.replay, ...result.value }
}

export async function resolveDenial(_root: unknown, args: { denialId: string; expectedVersion: number; resolution: string; note: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageClaims')
  const resolution = oneOf(args.resolution, ['corrected', 'written_off', 'billed_to_patient', 'resolved'] as const, 'resolution')
  const note = requireReason(args.note, 'note')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'denial.resolve', actor, idempotencyKey, params }, async uow => {
    const denial = await lockRow<any>(uow.tx, 'Denial', args.denialId)
    const claim = await uow.tx.claim.findUniqueOrThrow({ where: { id: denial.claimId }, select: { locationId: true } })
    assertLocation(locationIds, claim.locationId)
    const moved = await transition<any>(uow, { model: 'Denial', id: denial.id, from: ['open', 'working', 'appealed'], to: resolution, expectedVersion: args.expectedVersion, actor, eventType: 'denial.resolved', reason: note, data: { resolutionNote: note } })
    return { id: denial.id, status: moved.status }
  })
  return { replay: result.replay, ...result.value }
}

export async function fileAppeal(_root: unknown, args: { denialId: string; expectedVersion: number; letter: string; via: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageClaims')
  const via = oneOf(args.via, APPEAL_VIA, 'via')
  const letter = requireReason(args.letter, 'letter')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'denial.appeal', actor, idempotencyKey, params }, async uow => {
    const { tx } = uow
    const denial = await lockRow<any>(tx, 'Denial', args.denialId)
    const claim = await lockRow<any>(tx, 'Claim', denial.claimId)
    assertLocation(locationIds, claim.locationId)
    const level = (await tx.appeal.count({ where: { denialId: denial.id } })) + 1
    const appeal = await tx.appeal.create({ data: { denialId: denial.id, level, letter, submittedVia: via, submittedAt: uow.now, outcome: 'pending' } })
    await transition<any>(uow, { model: 'Denial', id: denial.id, from: ['open', 'working'], to: 'appealed', expectedVersion: args.expectedVersion, actor, eventType: 'denial.appealed' })
    await transition<any>(uow, { model: 'Claim', id: claim.id, from: ['adjudicated', 'appeal_decided'], to: 'appealed', actor, eventType: 'claim.appealed' })
    return { id: appeal.id, level }
  })
  return { replay: result.replay, ...result.value }
}

export async function recordAppealOutcome(_root: unknown, args: { appealId: string; expectedVersion: number; outcome: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageClaims')
  const outcome = oneOf(args.outcome, ['overturned', 'upheld'] as const, 'outcome')
  void APPEAL_OUTCOMES
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'denial.appeal_outcome', actor, idempotencyKey, params }, async uow => {
    const { tx } = uow
    const appeal = await lockRow<any>(tx, 'Appeal', args.appealId)
    const denial = await tx.denial.findUniqueOrThrow({ where: { id: appeal.denialId } })
    const claim = await lockRow<any>(tx, 'Claim', denial.claimId as string)
    assertLocation(locationIds, claim.locationId)
    await transition<any>(uow, { model: 'Appeal', id: appeal.id, from: ['pending'], to: outcome, expectedVersion: args.expectedVersion, actor, eventType: 'appeal.decided', statusField: 'outcome', data: { decidedAt: uow.now } })
    await transition<any>(uow, { model: 'Claim', id: claim.id, from: ['appealed'], to: 'appeal_decided', actor, eventType: 'claim.appeal_decided', metadata: { outcome } })
    if (outcome === 'upheld') await transition<any>(uow, { model: 'Denial', id: denial.id, from: ['appealed'], to: 'working', actor, eventType: 'denial.appeal_upheld' })
    else await transition<any>(uow, { model: 'Denial', id: denial.id, from: ['appealed'], to: 'resolved', actor, eventType: 'denial.appeal_overturned', data: { resolutionNote: 'Overturned on appeal. Await the new remittance.' } })
    return { id: appeal.id, outcome }
  })
  return { replay: result.replay, ...result.value }
}
