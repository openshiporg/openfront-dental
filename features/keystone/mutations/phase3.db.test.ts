import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fakeStedi } from '../../../tests/fakes/stedi'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { NEVER_DEFAULT, permissionNames, type Permission } from '../access'
import { verifyAuditChain } from '../lib/audit'
import { drainOutbox } from '../lib/outbox'
import { eligibilityHandlers, runEligibilityCheck } from '../messaging/eligibilityWorker'
import { PHASE2_OPS } from './phase2Ops'
import { loadPracticeSetup } from './setup'

/*
 * Phase 3 exit gate against the seeded practice (fictional data only):
 *   - the clearinghouse path: request → outbox → Stedi sandbox (recorded) → 271 → facts + checklist tasks;
 *   - a timeout leaves the check `unknown` and a re-check never makes a second check or a second call;
 *   - unknown benefits never render as covered (estimate rows);
 *   - the database refuses what the commands would also refuse.
 */

const sessionFor = (id: string, granted: Permission[]) => ({
  itemId: id, listKey: 'User',
  data: { name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null, role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) }, assignments: [] },
})
const run = (name: string, args: Record<string, unknown>, ctx: unknown) => PHASE2_OPS[name].fn(null, { ...args, idempotencyKey: uniqueKey(name) }, ctx) as Promise<any>

describe.skipIf(!hasTestDatabase)('Phase 3: insurance, benefits and eligibility (database)', () => {
  let prisma: PrismaClient
  let owner: any

  const coverageOf = async (memberId: string) => {
    const sub = await prisma.subscriber.findFirstOrThrow({ where: { memberIdLast4: memberId.slice(-4) } })
    return prisma.coverage.findFirstOrThrow({ where: { subscriberId: sub.id } })
  }

  beforeAll(async () => {
    process.env.SESSION_SECRET ||= 'dental-vitest-session-secret-0123456789abcdef'
    process.env.DENTAL_SECRET_KEY ||= Buffer.alloc(32, 7).toString('base64')
    prisma = testPrisma(4)
    await resetDatabase(prisma)
    const u = await prisma.user.create({ data: { name: 'owner', email: `${uniqueKey('o')}@test.local`, password: 'x'.repeat(60) } })
    owner = { session: sessionFor(u.id, permissionNames.filter(p => !NEVER_DEFAULT.includes(p))), prisma, graphql: {} }
    await loadPracticeSetup(null, { idempotencyKey: uniqueKey('setup') }, owner)
  }, 240_000)

  afterAll(async () => { await prisma?.$disconnect() })

  it('seeds payers, plans, verified and unverified coverages, and the recorded sandbox', async () => {
    expect(await prisma.payer.count()).toBe(3)
    expect(await prisma.coverage.count({ where: { verificationLevel: 'unverified' } })).toBeGreaterThan(0)
    expect(await prisma.coverage.count({ where: { verificationLevel: 'verified_full' } })).toBeGreaterThan(0)
    expect((await prisma.adapterInstallation.findFirstOrThrow({ where: { area: 'clearinghouse' } })).mode).toBe('sandbox')
  })

  it('reads a 271 into sourced facts and opens checklist tasks only for what a 271 cannot say', async () => {
    const coverage = await coverageOf('SUM-4401-A') // the recorded active plan
    const stedi = fakeStedi()
    const started = await run('requestVerification', { coverageId: coverage.id }, owner)
    expect(started.checkId).toBeTruthy()
    // a second request while one is in flight returns the same verification
    const again = await run('requestVerification', { coverageId: coverage.id }, owner)
    expect(again.verificationId).toBe(started.verificationId)
    const drained = await drainOutbox(prisma, { workerId: 'w1', handlers: eligibilityHandlers(prisma, { fetch: stedi.fetch }), topics: ['eligibility.check'] })
    expect(drained.delivered).toBe(1)
    expect(stedi.calls).toHaveLength(1)
    const check = await prisma.eligibilityCheck.findUniqueOrThrow({ where: { id: started.checkId } })
    expect(check.status).toBe('responded')
    expect(check.observationId).toBeTruthy()
    const facts = await prisma.benefitFact.findMany({ where: { verificationId: started.verificationId } })
    expect(facts.length).toBeGreaterThan(0)
    expect(facts.every(f => f.source === 'eligibility_271' && f.rawObservationId === check.observationId)).toBe(true)
    const tasks = await prisma.workTask.findMany({ where: { verificationId: started.verificationId, status: 'open' } })
    expect(tasks.map(t => t.taskKey)).toEqual(expect.arrayContaining(['waiting_period', 'missing_tooth_clause', 'cob_method']))
    // delivering the same message again does not call the clearinghouse again
    await runEligibilityCheck(prisma, check.id, { fetch: stedi.fetch })
    expect(stedi.calls).toHaveLength(1)
  })

  it('a payer rejection (AAA 75) is kept as rejected, with no facts, and a person gets the tasks', async () => {
    const coverage = await coverageOf('SUM-4403-C')
    const started = await run('requestVerification', { coverageId: coverage.id }, owner)
    await drainOutbox(prisma, { workerId: 'w3', handlers: eligibilityHandlers(prisma, { fetch: fakeStedi().fetch }), topics: ['eligibility.check'] })
    const check = await prisma.eligibilityCheck.findUniqueOrThrow({ where: { id: started.checkId } })
    expect(check.status).toBe('rejected')
    expect(await prisma.benefitFact.count({ where: { verificationId: started.verificationId } })).toBe(0)
    expect(await prisma.workTask.count({ where: { verificationId: started.verificationId, status: 'open' } })).toBeGreaterThan(0)
  })

  it('a timeout leaves the check unknown, records no fact, and a re-check reuses the same check', async () => {
    const coverage = await coverageOf('SUM-4405-E') // the recorded payer that never answers
    const stedi = fakeStedi()
    const started = await run('requestVerification', { coverageId: coverage.id }, owner)
    expect(started.checkId).toBeTruthy()
    await drainOutbox(prisma, { workerId: 'w2', handlers: eligibilityHandlers(prisma, { fetch: stedi.fetch }), topics: ['eligibility.check'] })
    const check = await prisma.eligibilityCheck.findUniqueOrThrow({ where: { id: started.checkId } })
    expect(check.status).toBe('unknown')
    expect(await prisma.benefitFact.count({ where: { verificationId: started.verificationId } })).toBe(0)
    expect(await prisma.workTask.count({ where: { verificationId: started.verificationId, status: 'open' } })).toBeGreaterThan(0)
    await run('recheckEligibility', { checkId: check.id }, owner)
    await drainOutbox(prisma, { workerId: 'w2', handlers: eligibilityHandlers(prisma, { fetch: stedi.fetch }), topics: ['eligibility.check'] })
    expect(await prisma.eligibilityCheck.count({ where: { coverageId: coverage.id } })).toBe(1)
    expect((await prisma.eligibilityCheck.findUniqueOrThrow({ where: { id: check.id } })).attempts).toBe(2)
  })

  it('estimates: a coverage with no verified benefit never shows insurance paying', async () => {
    const coverage = await coverageOf('SUM-4408-H') // seeded unverified
    const plan = await prisma.treatmentPlan.findFirstOrThrow({ where: { patientId: coverage.patientId! } }).catch(() => null)
    if (!plan) return
    const result = await run('estimateTreatmentPlan', { planId: plan.id }, owner)
    expect(result.estimated).toBeGreaterThan(0)
    const rows = await prisma.estimate.findMany({ where: { coverageId: coverage.id } })
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.insuranceMinor).toBe(0n)
      expect(row.coverageStatus).not.toBe('covered')
      expect(row.confidence).toBe('assumed')
    }
    // the same inputs add no new snapshot
    const before = await prisma.estimate.count()
    await run('estimateTreatmentPlan', { planId: plan.id }, owner)
    expect(await prisma.estimate.count()).toBe(before)
  })

  it('one open coverage per patient and order; reordering is audited', async () => {
    const coverage = await coverageOf('SUM-4401-A')
    const plan = await prisma.insurancePlan.findFirstOrThrow({ where: { id: 'seed_plan_evergreen_ppo' } })
    await expect(run('addCoverage', { patientId: coverage.patientId, planId: plan.id, memberId: 'ZZ-0001-Q', relationship: 'self', ordinal: 'primary', effectiveFrom: '2026-01-01' }, owner)).rejects.toThrow(/already has a primary/)
    const second = await run('addCoverage', { patientId: coverage.patientId, planId: plan.id, memberId: 'ZZ-0002-Q', relationship: 'self', ordinal: 'secondary', effectiveFrom: '2026-01-01' }, owner)
    await run('setCoverageOrder', { coverageId: second.coverageId, ordinal: 'primary', reason: 'Patient confirmed the bakery plan is primary.' }, owner)
    const rows = await prisma.coverage.findMany({ where: { patientId: coverage.patientId!, status: { in: ['pending_verification', 'active'] } } })
    expect(rows.find(r => r.id === second.coverageId)?.ordinal).toBe('primary')
    expect(rows.find(r => r.id === coverage.id)?.ordinal).toBe('secondary')
    expect(await prisma.auditEvent.count({ where: { eventType: 'coverage.order_changed' } })).toBeGreaterThanOrEqual(2)
  })

  it('the database enforces the benefit and money invariants', async () => {
    const coverage = await coverageOf('SUM-4401-A')
    const fact = await prisma.benefitFact.findFirstOrThrow({ where: { coverageId: coverage.id } })
    await expect(prisma.$executeRaw`UPDATE "BenefitFact" SET "isUnknown" = true WHERE id = ${fact.id}`).rejects.toThrow(/append|BenefitFact/i)
    await expect(prisma.benefitFact.create({ data: { coverageId: coverage.id, field: 'annual_max', source: 'eligibility_271', observedAt: new Date(), valueJson: { amountMinor: '1' } } })).rejects.toThrow(/BenefitFact_271_has_observation/)
    await expect(prisma.benefitFact.create({ data: { coverageId: coverage.id, field: 'annual_max', source: 'payer_phone', observedAt: new Date(), isUnknown: true, valueJson: { amountMinor: '1' } } })).rejects.toThrow(/BenefitFact_unknown_has_no_value/)
    await expect(prisma.insurancePlan.update({ where: { id: 'seed_plan_harbor_ppo' }, data: { annualMaxMinor: -1n } })).rejects.toThrow(/InsurancePlan_money_nonneg/)
    await expect(prisma.insurancePlan.update({ where: { id: 'seed_plan_harbor_ppo' }, data: { benefitYearStartMonth: 13 } })).rejects.toThrow(/InsurancePlan_benefit_year_month/)
    const estimate = await prisma.estimate.findFirst()
    if (estimate) await expect(prisma.$executeRaw`UPDATE "Estimate" SET "patientMinor" = 0 WHERE id = ${estimate.id}`).rejects.toThrow(/append|Estimate/i)
    await expect(prisma.workTask.create({ data: { kind: 'verification_checklist', title: 'dup', taskKey: 'cob_method', subjectType: 'Coverage', subjectId: coverage.id } }).then(() => prisma.workTask.create({ data: { kind: 'verification_checklist', title: 'dup', taskKey: 'cob_method', subjectType: 'Coverage', subjectId: coverage.id } }))).rejects.toThrow(/Unique constraint/)
  })

  it('keeps the audit chain intact', async () => {
    const chain = await verifyAuditChain(prisma)
    expect(chain.ok).toBe(true)
  })
})
