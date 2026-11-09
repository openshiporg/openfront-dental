import { systemActor } from '../lib/actor'
import type { Db } from '../lib/db'
import { auditCreate, transition } from '../lib/cas'
import { log } from '../lib/log'
import { readSecret, storeSecret } from '../lib/secretBox'
import { runInTransaction } from '../lib/unitOfWork'
import { parseStediEra } from '../lib/era'
import { sha256 } from '../lib/canonical'
import { applyParsedEra } from '../mutations/remittance'
import { clearinghouseFor, type ClaimPayload, type ClaimSubmitOutcome } from '../../integrations/clearinghouse'
import { adapterContext, type EligibilityDeps } from './eligibilityWorker'

/*
 * The claim send job (STATE-MACHINES §7), shaped like the eligibility check: claim → call → apply, never one transaction.
 *   1. claim: released (or void_requested) → submitted under a row lock; a second delivery finds it already submitted and skips;
 *   2. call the clearinghouse with the frozen version's idempotency key, no transaction open;
 *   3. apply the outcome, guarded on status = submitted.
 * A timeout leaves the claim `submission_unknown`: it may have reached the payer. Within 24 hours staff can retry with the same key;
 * after that only a status lookup is offered, never a blind resend.
 */

const actor = systemActor('claim-submit')
const RETRY_WINDOW_MS = 24 * 3_600_000

export async function runClaimSubmit(db: Db, claimId: string, deps: EligibilityDeps = {}) {
  const now = deps.now ?? (() => new Date())
  const claimed = await runInTransaction(db, async uow => {
    const rows = await uow.tx.$queryRaw<{ status: string }[]>`SELECT status FROM "Claim" WHERE id = ${claimId} FOR UPDATE`
    const status = rows[0]?.status
    if (status !== 'released' && status !== 'void_requested') return null
    await transition<any>(uow, { model: 'Claim', id: claimId, from: [status], to: status === 'void_requested' ? 'void_requested' : 'submitted', actor, eventType: 'claim.send_started', data: { submittedAt: uow.now }, metadata: { from: status } })
    return status
  })
  if (!claimed) return { skipped: true as const }

  const claim = await db.claim.findUniqueOrThrow({ where: { id: claimId }, include: { currentVersion: true, coverage: { include: { subscriber: { include: { plan: { include: { payer: true } } } } } } } })
  const version = claim.currentVersion!
  const payload = version.payload as unknown as ClaimPayload
  const subscriber = claim.coverage!.subscriber!
  const memberId = subscriber.memberIdSecretId ? await readSecret(db as never, subscriber.memberIdSecretId) : ''
  const adapterKey = ((await db.adapterInstallation.findFirst({ where: { area: 'clearinghouse' }, orderBy: { createdAt: 'asc' } }))?.adapterKey) ?? 'manual'

  let outcome: ClaimSubmitOutcome
  try {
    const ctx = await adapterContext(db, null, 'sandbox', deps)
    outcome = await clearinghouseFor(adapterKey).submitClaim({ payload, memberId, idempotencyKey: version.idempotencyKey }, ctx)
  } catch (error) {
    log.error('claim send failed', { claimId, error })
    outcome = { kind: 'unknown', message: 'The claim could not be confirmed as sent.' }
  }

  const result = await runInTransaction(db, async uow => {
    const { tx } = uow
    const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM "Claim" WHERE id = ${claimId} FOR UPDATE`
    const status = rows[0]?.status
    const isVoid = claimed === 'void_requested'
    if (status !== (isVoid ? 'void_requested' : 'submitted')) return { skipped: true as const }
    const refsBase = (claim.clearinghouseRefs as Record<string, unknown>) ?? {}
    if (outcome.kind === 'accepted') {
      const ack = await tx.claimAcknowledgement.create({ data: { claimId, versionNumber: version.number, source: 'clearinghouse', senderName: adapterKey, outcome: 'accepted', statusCodes: { correlationId: outcome.correlationId } as never, at: uow.now } })
      auditCreate(uow, actor, 'ClaimAcknowledgement', ack.id, 'claim.acknowledged', { correlationId: outcome.correlationId })
      await transition<any>(uow, { model: 'Claim', id: claimId, from: [status], to: isVoid ? 'voided' : 'acknowledged', actor, eventType: isVoid ? 'claim.void_accepted' : 'claim.accepted_by_clearinghouse', data: { clearinghouseRefs: { ...refsBase, correlationId: outcome.correlationId } as never } })
      return { status: isVoid ? 'voided' : 'acknowledged' }
    }
    if (outcome.kind === 'rejected') {
      const ack = await tx.claimAcknowledgement.create({ data: { claimId, versionNumber: version.number, source: 'clearinghouse', senderName: adapterKey, outcome: 'rejected', errors: outcome.errors as never, at: uow.now } })
      auditCreate(uow, actor, 'ClaimAcknowledgement', ack.id, 'claim.rejected', { errors: outcome.errors.length })
      await transition<any>(uow, { model: 'Claim', id: claimId, from: [status], to: 'rejected', actor, eventType: 'claim.rejected_by_clearinghouse', metadata: { first: outcome.errors[0]?.message ?? '' } })
      return { status: 'rejected' }
    }
    if (outcome.kind === 'error_retryable') {
      // Nothing reached the payer: put it back where a retry can claim it.
      await transition<any>(uow, { model: 'Claim', id: claimId, from: [status], to: isVoid ? 'void_requested' : 'released', actor, eventType: 'claim.send_deferred', metadata: { message: outcome.message } })
      return { status: 'deferred', message: outcome.message }
    }
    await transition<any>(uow, { model: 'Claim', id: claimId, from: [status], to: 'submission_unknown', actor, eventType: 'claim.submission_unknown', metadata: { message: outcome.message } })
    return { status: 'submission_unknown' }
  })
  void now
  if ('status' in result && result.status === 'deferred') throw new Error(result.message)
  return result
}

/** A claim left `submitted` by a worker that died mid-call may have reached the payer: it becomes unknown, never assumed sent or lost. */
export async function settleStaleClaims(db: Db, now: Date, staleMs = 10 * 60_000) {
  const cutoff = new Date(now.getTime() - staleMs)
  const stale = await db.$queryRaw<{ id: string }[]>`
    UPDATE "Claim" SET status = 'submission_unknown', version = version + 1, "updatedAt" = now()
    WHERE status = 'submitted' AND "updatedAt" < ${cutoff} RETURNING id`
  return { settled: stale.length }
}

export const withinRetryWindow = (submittedAt: Date | null, now: Date) => !!submittedAt && now.getTime() - submittedAt.getTime() < RETRY_WINDOW_MS

export async function runClaimStatus(db: Db, inquiryId: string, deps: EligibilityDeps = {}) {
  const inquiry = await db.claimStatusInquiry.findUnique({ where: { id: inquiryId }, include: { claim: { include: { coverage: { include: { subscriber: { include: { plan: { include: { payer: true } } } } } } } } } })
  if (!inquiry || inquiry.status !== 'queued') return { skipped: true as const }
  const claim = inquiry.claim!
  const payerId = String(((claim.coverage?.subscriber?.plan?.payer?.adapterPayerIds ?? {}) as Record<string, string>).stedi ?? '')
  const adapterKey = ((await db.adapterInstallation.findFirst({ where: { area: 'clearinghouse' }, orderBy: { createdAt: 'asc' } }))?.adapterKey) ?? 'manual'
  const ctx = await adapterContext(db, null, 'sandbox', deps)
  const found = await clearinghouseFor(adapterKey).checkClaimStatus(claim.patientControlNumber, payerId, ctx)
  await runInTransaction(db, async uow => {
    await uow.tx.claimStatusInquiry.update({ where: { id: inquiryId }, data: { status: found.kind === 'unknown' ? 'unknown' : 'responded', responseSummary: found as never, version: { increment: 1 } } })
    if (found.kind === 'found' && claim.status === 'acknowledged') await transition<any>(uow, { model: 'Claim', id: claim.id, from: ['acknowledged'], to: 'pending_payer', actor, eventType: 'claim.payer_has_it' })
    if (found.kind === 'found' && claim.status === 'submission_unknown') await transition<any>(uow, { model: 'Claim', id: claim.id, from: ['submission_unknown'], to: 'acknowledged', actor, eventType: 'claim.status_confirmed_received' })
  })
  return { status: found.kind }
}

/** The leased remittance poll: list 835s since the last poll (overlapping a day), skip any already seen, apply the rest. */
export async function pollRemittances(db: Db, now: Date, deps: EligibilityDeps = {}, options: { minIntervalMs?: number } = {}) {
  const installation = await db.adapterInstallation.findFirst({ where: { area: 'clearinghouse', adapterKey: 'stedi' }, orderBy: { createdAt: 'asc' } })
  if (!installation) return { polled: 0 }
  const config = (installation.config ?? {}) as { lastEraPollAt?: string; transport?: string }
  const minInterval = options.minIntervalMs ?? 15 * 60_000
  if (config.lastEraPollAt && now.getTime() - Date.parse(config.lastEraPollAt) < minInterval) return { polled: 0, skipped: 'not_due' }
  const since = new Date((config.lastEraPollAt ? Date.parse(config.lastEraPollAt) : now.getTime() - 7 * 86_400_000) - 86_400_000)
  const ctx = await adapterContext(db, installation.id, 'sandbox', deps)
  const adapter = clearinghouseFor('stedi')
  const listed = await adapter.listTransactions(since, ctx)
  if (!listed.ok) return { polled: 0, error: listed.message }
  let applied = 0
  for (const item of listed.items.filter(i => i.transactionType === '835')) {
    if (await db.inboundObservation.findFirst({ where: { source: 'stedi', kind: 'era_835', externalId: item.transactionId, appliedAt: { not: null } }, select: { id: true } })) continue
    const fetched = await adapter.fetchTransaction(item.transactionId, '835', ctx)
    if (!fetched.ok) continue
    await importEraBody(db, fetched.body, { externalId: item.transactionId, adapterKey: 'stedi', now })
    applied += 1
  }
  await db.adapterInstallation.update({ where: { id: installation.id }, data: { config: { ...config, lastEraPollAt: now.toISOString() } as never } })
  return { polled: listed.items.length, applied }
}

/** Store the raw report sealed, then apply every remittance in it. Used by the poll and by "Upload a remittance". */
export async function importEraBody(db: Db, body: unknown, options: { externalId: string; adapterKey: string; now?: Date; actor?: any; source?: 'era_835' }) {
  const raw = JSON.stringify(body)
  const hash = sha256(raw)
  return runInTransaction(db, async uow => {
    const { tx } = uow
    let observation = await tx.inboundObservation.findFirst({ where: { source: options.adapterKey, kind: 'era_835', externalId: options.externalId } })
    if (observation?.appliedAt) return { results: [], replay: true }
    if (!observation) {
      const secret = await storeSecret(tx, 'era.835', raw)
      observation = await tx.inboundObservation.create({ data: { source: options.adapterKey, kind: 'era_835', externalId: options.externalId, contentHash: hash, rawSecretId: secret.id, receivedAt: uow.now } })
    }
    const results = []
    for (const era of parseStediEra(body)) results.push(await applyParsedEra(uow, options.actor ?? actor, era, { source: 'era_835', adapterKey: options.adapterKey, observationId: observation.id }))
    await tx.inboundObservation.update({ where: { id: observation.id }, data: { appliedAt: uow.now, applyResult: results as never } })
    return { results, replay: false }
  })
}

