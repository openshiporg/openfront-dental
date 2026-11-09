import { sha256, canonicalJson } from '../lib/canonical'
import type { Db } from '../lib/db'
import { log } from '../lib/log'
import type { ClaimedMessage, OutboxHandlers } from '../lib/outbox'
import { readSecret, storeSecret } from '../lib/secretBox'
import { runInTransaction } from '../lib/unitOfWork'
import { clearinghouseFor, type AdapterCtx, type EligibilityOutcome, type EligibilityRequest } from '../../integrations/clearinghouse'
import { mapBenefits } from '../../integrations/clearinghouse/canonical'
import { recordedFetch } from '../../integrations/clearinghouse/recorded'
import { openChecklist, CHECKLIST_BY_PLAN } from '../mutations/insurance'

/*
 * The eligibility check job (INTEGRATIONS §2). Three steps, never one transaction:
 *   1. claim: queued → sent in a short transaction (a second delivery finds it already sent and skips; a database trigger refuses any other route to `sent`);
 *   2. call the clearinghouse, with no database transaction open;
 *   3. apply the outcome in a second transaction, guarded on status = sent.
 * A timeout leaves the check `unknown`: it may have reached the payer. A re-check reuses the same row and
 * request hash, so there is never a second check for one question, and never a fact invented from silence.
 */

export type EligibilityDeps = { fetch?: typeof fetch; now?: () => Date }

export async function adapterContext(db: Db, installationId: string | null, mode: string, deps: EligibilityDeps): Promise<AdapterCtx> {
  const installation = await db.adapterInstallation.findFirst({ where: { area: 'clearinghouse', adapterKey: 'stedi' }, orderBy: { createdAt: 'asc' } })
  const config = (installation?.config ?? {}) as { transport?: string; baseUrl?: string; timeoutMs?: number }
  const ctx: AdapterCtx = { mode: mode as AdapterCtx['mode'], baseUrl: config.baseUrl, timeoutMs: config.timeoutMs ?? 15_000 }
  if (deps.fetch) ctx.fetch = deps.fetch
  else if (config.transport === 'recorded') ctx.fetch = recordedFetch
  if (installation?.secretId) ctx.apiKey = await readSecret(db as never, installation.secretId)
  else if (config.transport === 'recorded' || deps.fetch) ctx.apiKey = 'recorded-sandbox-key'
  else if (process.env.STEDI_SANDBOX_KEY) ctx.apiKey = process.env.STEDI_SANDBOX_KEY
  void installationId
  return ctx
}

export async function runEligibilityCheck(db: Db, checkId: string, deps: EligibilityDeps = {}) {
  const now = deps.now ?? (() => new Date())
  // 1. claim
  const claimed = await db.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM "EligibilityCheck" WHERE id = ${checkId} FOR UPDATE`
    // Only a queued check is claimed. A `sent` one has already made its call (or is making it): a second delivery must not call again.
    if (!rows[0] || rows[0].status !== 'queued') return false
    await tx.$executeRaw`UPDATE "EligibilityCheck" SET status = 'sent', attempts = attempts + 1, version = version + 1, "updatedAt" = now() WHERE id = ${checkId}`
    return true
  })
  if (!claimed) return { skipped: true as const }

  const check = await db.eligibilityCheck.findUniqueOrThrow({ where: { id: checkId } })
  const coverage = await db.coverage.findUniqueOrThrow({ where: { id: check.coverageId! }, include: { patient: true, subscriber: { include: { plan: { include: { payer: true } }, patient: true } } } })
  const subscriber = coverage.subscriber!
  const payerId = ((subscriber.plan?.payer?.adapterPayerIds ?? {}) as Record<string, string>).stedi
  const entity = await db.billingEntity.findFirst({ orderBy: { createdAt: 'asc' } })
  const memberId = subscriber.memberIdSecretId ? await readSecret(db as never, subscriber.memberIdSecretId) : ''
  const person = subscriber.patient ?? null
  const named = (subscriber.personName ?? {}) as { first?: string; last?: string }
  const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '')
  const request: EligibilityRequest = {
    payerId: payerId ?? '', providerNpi: entity?.npiType2 || '1234567893', providerName: entity?.legalName || 'Practice',
    subscriber: { memberId, firstName: person?.firstName ?? named.first ?? '', lastName: person?.lastName ?? named.last ?? '', dateOfBirth: day(subscriber.dateOfBirth) },
    ...(coverage.relationship !== 'self' && coverage.patient ? { dependent: { firstName: coverage.patient.firstName, lastName: coverage.patient.lastName, dateOfBirth: day(coverage.patient.dateOfBirth) } } : {}),
    serviceTypeCode: '35', controlNumber: sha256(`ctl:${check.id}`).slice(0, 9).replace(/[a-f]/g, c => String(c.charCodeAt(0) % 10)),
  }

  // 2. the call: no transaction open
  let outcome: EligibilityOutcome
  try {
    const ctx = await adapterContext(db, null, check.mode, deps)
    outcome = (await clearinghouseFor(check.adapterKey).checkEligibility(request, ctx)).outcome
  } catch (error) {
    log.error('eligibility call failed', { checkId, error })
    outcome = { kind: 'unknown', message: 'The check could not be completed. It will be re-checked, not repeated.' }
  }

  // 3. apply
  return runInTransaction(db, async uow => {
    const tx = uow.tx
    const rows = await tx.$queryRaw<{ status: string; verificationId: string | null }[]>`SELECT status, verification AS "verificationId" FROM "EligibilityCheck" WHERE id = ${checkId} FOR UPDATE`
    if (rows[0]?.status !== 'sent') return { skipped: true as const }
    const at = now()
    const planType = subscriber.plan?.planType ?? 'other'
    const finish = (status: string, data: Record<string, unknown> = {}) =>
      tx.$executeRaw`UPDATE "EligibilityCheck" SET status = ${status}, "resultNote" = ${String(data.note ?? '')}, "rejectionCodes" = ${JSON.stringify(data.codes ?? [])}::jsonb, "respondedAt" = ${data.respondedAt ?? null}::timestamp, "observation" = ${(data.observationId as string) ?? null}, version = version + 1, "updatedAt" = now() WHERE id = ${checkId}`
    const audit = (eventType: string, after: Record<string, unknown>) => uow.audit({ eventType, entityType: 'EligibilityCheck', entityId: checkId, after, metadata: { actor: 'system:eligibility-worker' } })
    if (outcome.kind === 'responded') {
      const raw = canonicalJson(outcome.raw)
      const secret = await storeSecret(tx, 'eligibility.271', raw)
      const observation = await tx.inboundObservation.create({ data: { source: 'stedi', kind: 'eligibility_271', externalId: checkId, contentHash: sha256(raw), rawSecretId: secret.id, receivedAt: at, appliedAt: at, applyResult: { benefits: outcome.benefits.length } as never, isSynthetic: coverage.isSynthetic } })
      const facts = mapBenefits(outcome.benefits, subscriber.plan?.networkStatus !== 'out_of_network').filter(f => f.field !== 'other')
      if (outcome.planActive !== null && !facts.some(f => f.field === 'coverage_active')) facts.push({ field: 'coverage_active', appliesTo: {}, value: { active: outcome.planActive } })
      for (const fact of facts) {
        await tx.benefitFact.create({ data: { verificationId: check.verificationId, coverageId: coverage.id, field: fact.field, appliesTo: fact.appliesTo as never, valueJson: fact.value as never, isUnknown: false, source: 'eligibility_271', observedAt: at, rawObservationId: observation.id } })
      }
      const have = new Set(facts.map(f => f.field))
      const gaps = [...new Set([...(CHECKLIST_BY_PLAN[planType] ?? CHECKLIST_BY_PLAN.other), 'history_procedure', ...(['annual_max', 'coverage_pct'] as const).filter(f => !have.has(f))])].filter(f => !have.has(f as never) || f === 'history_procedure')
      if (check.verificationId) await openChecklist(tx, check.verificationId, coverage.id, planType, at, coverage.isSynthetic, gaps)
      // Benefits read from the payer raise an unverified coverage to "electronically verified" (a person still finishes the checklist).
      // A level a person set is never lowered; a payer that says the plan is inactive does not raise it.
      if (facts.length && check.verificationId && outcome.planActive !== false) {
        await tx.$executeRaw`UPDATE "Coverage" SET "verificationLevel" = 'verified_electronic', "lastVerification" = ${check.verificationId}, "status" = CASE WHEN "status" = 'pending_verification' AND ${outcome.planActive === true} THEN 'active' ELSE "status" END, "version" = "version" + 1, "updatedAt" = now() WHERE id = ${coverage.id} AND "verificationLevel" = 'unverified' AND "status" IN ('pending_verification','active')`
      }
      await finish('responded', { respondedAt: at, observationId: observation.id, note: `${facts.length} benefits read` })
      audit('eligibility.responded', { facts: facts.length, observationId: observation.id })
      return { status: 'responded' as const, facts: facts.length }
    }
    if (outcome.kind === 'rejected') {
      if (check.verificationId) await openChecklist(tx, check.verificationId, coverage.id, planType, at, coverage.isSynthetic, ['coverage_pct', 'annual_max', ...(CHECKLIST_BY_PLAN[planType] ?? CHECKLIST_BY_PLAN.other)])
      await finish('rejected', { codes: outcome.codes, note: outcome.codes.map(c => c.message).join(' ').slice(0, 300) })
      audit('eligibility.rejected', { codes: outcome.codes.map(c => c.code) })
      return { status: 'rejected' as const }
    }
    if (outcome.kind === 'unknown') {
      if (check.verificationId) await openChecklist(tx, check.verificationId, coverage.id, planType, at, coverage.isSynthetic, ['coverage_pct', 'annual_max'])
      await finish('unknown', { note: outcome.message })
      audit('eligibility.unknown', {})
      return { status: 'unknown' as const }
    }
    await finish('error_retryable', { note: outcome.message })
    audit('eligibility.error_retryable', {})
    return { status: 'error_retryable' as const }
  })
}

export function eligibilityHandlers(db: Db, deps: EligibilityDeps = {}): OutboxHandlers {
  return {
    'eligibility.check': async (message: ClaimedMessage) => {
      const payload = (message.payload ?? {}) as { checkId?: string }
      if (!payload.checkId) return
      await runEligibilityCheck(db, payload.checkId, deps)
    },
  }
}

/**
 * A check left `sent` by a worker that died between claiming and applying may or may not have reached the
 * payer, so it ends `unknown` (never retried silently, never assumed). Staff re-check it from the worklist.
 */
export async function settleStaleChecks(db: Db, now: Date, staleMs = 10 * 60_000) {
  const cutoff = new Date(now.getTime() - staleMs)
  const stale = await db.$queryRaw<{ id: string; verificationId: string | null }[]>`
    UPDATE "EligibilityCheck" SET status = 'unknown', "resultNote" = 'The check was interrupted. It may have reached the payer; check again.', version = version + 1, "updatedAt" = now()
    WHERE status = 'sent' AND "updatedAt" < ${cutoff} RETURNING id, verification AS "verificationId"`
  return { settled: stale.length }
}
