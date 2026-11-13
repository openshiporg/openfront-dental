import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fakeStedi } from '../../../tests/fakes/stedi'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { NEVER_DEFAULT, permissionNames, type Permission } from '../access'
import { verifyAuditChain } from '../lib/audit'
import { runEligibilityCheck } from '../messaging/eligibilityWorker'
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

  it('seeds payers, plans, and verified and unverified coverages, with no clearinghouse pretending to be connected', async () => {
    expect(await prisma.payer.count()).toBe(3)
    expect(await prisma.coverage.count({ where: { verificationLevel: 'unverified' } })).toBeGreaterThan(0)
    expect(await prisma.coverage.count({ where: { verificationLevel: 'verified_full' } })).toBeGreaterThan(0)
    expect(await prisma.adapterInstallation.count({ where: { area: 'clearinghouse' } })).toBe(0)
  })

  it('reads a 271 into sourced facts and opens checklist tasks only for what a 271 cannot say', async () => {
    const coverage = await coverageOf('SUM-4401-A') // the recorded active plan
    const stedi = fakeStedi()
    const started = await run('requestVerification', { coverageId: coverage.id }, owner)
    expect(started.checkId).toBeTruthy()
    // a second request while one is open is a plain refusal, and no second verification is made
    await expect(run('requestVerification', { coverageId: coverage.id }, owner)).rejects.toThrow(/already open for this plan/)
    expect(await prisma.benefitVerification.count({ where: { coverageId: coverage.id, status: { in: ['requested', 'in_progress'] } } })).toBe(1)
    const ran = await runEligibilityCheck(prisma, started.checkId, { fetch: stedi.fetch })
    expect(ran).not.toHaveProperty('skipped')
    expect(stedi.calls).toHaveLength(1)
    const check = await prisma.eligibilityCheck.findUniqueOrThrow({ where: { id: started.checkId } })
    expect(check.status).toBe('responded')
    expect(check.observationId).toBeTruthy()
    const facts = await prisma.benefitFact.findMany({ where: { verificationId: started.verificationId } })
    expect(facts.length).toBeGreaterThan(0)
    expect(facts.every(f => f.source === 'eligibility_271' && f.rawObservationId === check.observationId)).toBe(true)
    const tasks = await prisma.workTask.findMany({ where: { verificationId: started.verificationId, status: 'open' } })
    expect(tasks.map(t => t.taskKey)).toEqual(expect.arrayContaining(['waiting_period', 'missing_tooth_clause', 'cob_method']))
    // this coverage was already fully verified by a person: a 271 never lowers that
    expect((await prisma.coverage.findUniqueOrThrow({ where: { id: coverage.id } })).verificationLevel).toBe('verified_full')
    // delivering the same message again does not call the clearinghouse again
    await runEligibilityCheck(prisma, check.id, { fetch: stedi.fetch })
    expect(stedi.calls).toHaveLength(1)
  })

  it('a payer rejection (AAA 75) is kept as rejected, with no facts, and a person gets the tasks', async () => {
    const coverage = await coverageOf('SUM-4403-C')
    const started = await run('requestVerification', { coverageId: coverage.id }, owner)
    await runEligibilityCheck(prisma, started.checkId, { fetch: fakeStedi().fetch })
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
    await runEligibilityCheck(prisma, started.checkId, { fetch: stedi.fetch })
    const check = await prisma.eligibilityCheck.findUniqueOrThrow({ where: { id: started.checkId } })
    expect(check.status).toBe('unknown')
    expect(await prisma.benefitFact.count({ where: { verificationId: started.verificationId } })).toBe(0)
    expect(await prisma.workTask.count({ where: { verificationId: started.verificationId, status: 'open' } })).toBeGreaterThan(0)
    await run('recheckEligibility', { checkId: check.id }, owner)
    await runEligibilityCheck(prisma, check.id, { fetch: stedi.fetch })
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
    const coverage = await coverageOf('SUM-4404-D')
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
    await expect(prisma.insurancePlan.update({ where: { id: 'seed_plan_harbor_ppo' }, data: { annualMaxMinor: 99999999999999999n } })).rejects.toThrow(/InsurancePlan_annualMaxMinor_bound/)
    await expect(prisma.subscriber.update({ where: { id: coverage.subscriberId! }, data: { memberIdHash: createHash('sha256').update('SUM-4401-A').digest('hex') } })).rejects.toThrow(/Subscriber_member_hash_keyed/)
    const estimate = await prisma.estimate.findFirst()
    if (estimate) await expect(prisma.$executeRaw`UPDATE "Estimate" SET "patientMinor" = 0 WHERE id = ${estimate.id}`).rejects.toThrow(/append|Estimate/i)
    await expect(prisma.workTask.create({ data: { kind: 'verification_checklist', title: 'dup', taskKey: 'cob_method', subjectType: 'Coverage', subjectId: coverage.id } }).then(() => prisma.workTask.create({ data: { kind: 'verification_checklist', title: 'dup', taskKey: 'cob_method', subjectType: 'Coverage', subjectId: coverage.id } }))).rejects.toThrow(/Unique constraint/)
  })

  it('ending a coverage closes its verification, tasks and check, and the database refuses new facts on it', async () => {
    const coverage = await coverageOf('SUM-4406-F')
    const started = await run('requestVerification', { coverageId: coverage.id }, owner)
    expect(await prisma.eligibilityCheck.count({ where: { coverageId: coverage.id, status: 'queued' } })).toBe(1)
    const fresh = await prisma.coverage.findUniqueOrThrow({ where: { id: coverage.id } })
    await run('terminateCoverage', { coverageId: coverage.id, expectedVersion: fresh.version, endedOn: '2026-11-01', reason: 'Patient changed employer.' }, owner)
    expect((await prisma.benefitVerification.findUniqueOrThrow({ where: { id: started.verificationId } })).status).toBe('failed')
    expect(await prisma.eligibilityCheck.count({ where: { coverageId: coverage.id, status: { in: ['queued', 'sent', 'unknown'] } } })).toBe(0)
    expect(await prisma.workTask.count({ where: { subjectType: 'Coverage', subjectId: coverage.id, status: { in: ['open', 'in_progress'] } } })).toBe(0)
    await expect(prisma.benefitFact.create({ data: { coverageId: coverage.id, field: 'coverage_pct', source: 'payer_phone', observedAt: new Date(), valueJson: { pct: 80 }, appliesTo: { category: 'basic' } } })).rejects.toThrow(/coverage has ended/)
  })

  it('the database refuses a second claim of a check, a bad percent, and any edit of outside history', async () => {
    const coverage = await coverageOf('SUM-4401-A')
    const check = await prisma.eligibilityCheck.findFirstOrThrow({ where: { status: 'responded' } })
    await expect(prisma.$executeRaw`UPDATE "EligibilityCheck" SET "status" = 'sent' WHERE id = ${check.id}`).rejects.toThrow(/claimed only from queued/)
    await expect(prisma.benefitFact.create({ data: { coverageId: coverage.id, field: 'coverage_pct', source: 'payer_phone', observedAt: new Date(), valueJson: { pct: 180 }, appliesTo: { category: 'basic' } } })).rejects.toThrow(/BenefitFact_pct_bounds/)
    const row = await prisma.outsideHistory.create({ data: { patientId: coverage.patientId!, codeText: 'Cleaning', dateOfService: new Date('2026-01-10'), source: 'patient_reported' } })
    await expect(prisma.$executeRaw`UPDATE "OutsideHistory" SET "codeText" = 'x' WHERE id = ${row.id}`).rejects.toThrow()
    await expect(prisma.outsideHistory.create({ data: { patientId: coverage.patientId!, codeText: 'Future', dateOfService: new Date('2031-01-10'), source: 'patient_reported' } })).rejects.toThrow(/OutsideHistory_not_future/)
  })

  it('two Verify presses at the same moment: one verification, one plain refusal, never a P2002', async () => {
    const coverage = await coverageOf('SUM-4407-G')
    const results = await Promise.allSettled([1, 2, 3].map(() => run('requestVerification', { coverageId: coverage.id }, owner)))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    for (const r of results.filter(r => r.status === 'rejected') as PromiseRejectedResult[]) {
      expect(String(r.reason?.message)).toMatch(/already open for this plan/)
      expect(String(r.reason?.message)).not.toMatch(/P2002|Unique constraint|prisma/i)
    }
    expect(await prisma.benefitVerification.count({ where: { coverageId: coverage.id, status: { in: ['requested', 'in_progress'] } } })).toBe(1)
  })

  it('the Evergreen secondary gets its own 271 answer, and both plans estimate without a database refusal', async () => {
    const harbor = await coverageOf('SUM-4401-A')
    const evergreen = await prisma.coverage.findUniqueOrThrow({ where: { id: 'seed_cov_evg_1' } })
    expect(evergreen.patientId).toBe(harbor.patientId)
    const started = await run('requestVerification', { coverageId: evergreen.id }, owner)
    await runEligibilityCheck(prisma, started.checkId, { fetch: fakeStedi().fetch })
    const facts = await prisma.benefitFact.findMany({ where: { verificationId: started.verificationId, field: 'coverage_pct' } })
    expect(facts.map(f => [(f.appliesTo as any).category, String((f.valueJson as any).pct)]).sort()).toEqual([['basic', '70.0000'], ['major', '40.0000'], ['preventive', '100.0000']])
    expect((await prisma.coverage.findUniqueOrThrow({ where: { id: evergreen.id } })).verificationLevel).toBe('verified_electronic')

    // The reviewer's case: the primary refuses a cleaning (frequency used up elsewhere) and a crown (waiting period).
    const v = await prisma.benefitVerification.findFirstOrThrow({ where: { coverageId: harbor.id }, orderBy: { createdAt: 'desc' } })
    await prisma.benefitFact.create({ data: { coverageId: harbor.id, verificationId: v.id, field: 'waiting_period', appliesTo: { category: 'major' }, valueJson: { months: 24 }, source: 'payer_phone', observedAt: new Date() } })
    for (const d of ['2026-06-01', '2026-09-01']) await prisma.outsideHistory.create({ data: { patientId: harbor.patientId!, codeText: 'Adult cleaning at a previous dentist', dateOfService: new Date(d), frequencyGroup: 'recall', source: 'patient_reported' } })
    const plan = await prisma.treatmentPlan.findFirst({ where: { patientId: harbor.patientId! } })
    expect(plan).toBeTruthy()
    if (!plan) return
    const result = await run('estimateTreatmentPlan', { planId: plan.id }, owner)
    expect(result.estimated).toBeGreaterThan(0)
    const rows = await prisma.estimate.findMany({ where: { patientId: harbor.patientId!, coverageId: harbor.id }, orderBy: { createdAt: 'desc' }, take: result.estimated })
    for (const row of rows) {
      if (row.coverageStatus !== 'covered') expect(row.secondaryInsuranceMinor + row.insuranceMinor).toBe(0n)
      expect(row.writeOffMinor + row.insuranceMinor + row.secondaryInsuranceMinor + row.patientMinor).toBe(row.feeMinor)
    }
  })

  it('a posterior composite is paid at the amalgam allowance when the plan has a downgrade clause', async () => {
    const coverage = await coverageOf('SUM-4401-A')
    const v = await prisma.benefitVerification.findFirstOrThrow({ where: { coverageId: coverage.id }, orderBy: { createdAt: 'desc' } })
    await prisma.benefitFact.create({ data: { coverageId: coverage.id, verificationId: v.id, field: 'downgrade', appliesTo: {}, valueJson: { categories: ['basic'] }, source: 'payer_phone', observedAt: new Date() } })
    const item = await prisma.treatmentPlanItem.findFirst({ where: { planVersion: { plan: { patientId: coverage.patientId! } }, chartEntry: { code: { code: 'OF-R011' } } }, include: { planVersion: true } })
    expect(item).toBeTruthy()
    if (!item) return
    await run('estimateTreatmentPlan', { planId: item.planVersion!.planId }, owner)
    const row = await prisma.estimate.findFirstOrThrow({ where: { planItemId: item.id }, orderBy: [{ computedAt: 'desc' }, { createdAt: 'desc' }] })
    const amalgam = await prisma.fee.findFirstOrThrow({ where: { code: { code: 'OF-R002' }, feeVersion: { schedule: { id: 'seed_fee_ppo' } } } })
    expect(row.reasons as string[]).toContain('downgraded')
    expect(row.reasons as string[]).not.toContain('downgrade_amount_unknown')
    // basic 80% of the amalgam allowance (deductible may come off first)
    expect(row.insuranceMinor <= (amalgam.amountMinor * 80n) / 100n).toBe(true)
    expect(row.insuranceMinor > 0n).toBe(true)
  })

  it('keeps the audit chain intact', async () => {
    const chain = await verifyAuditChain(prisma)
    expect(chain.ok).toBe(true)
  })
})
