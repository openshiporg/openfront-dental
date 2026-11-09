import type { Actor } from '../lib/actor'
import { memberIdHash } from '../lib/canonical'
import { auditCreate } from '../lib/cas'
import { storeSecret } from '../lib/secretBox'
import { localDate } from '../lib/time'
import type { UnitOfWork } from '../lib/unitOfWork'

/* Phase 3 sample data: fictional payers, plans, subscribers and verified benefits. All synthetic. */

const TZ = 'America/New_York'
const day = (d: string) => new Date(`${d}T00:00:00Z`)

const PAYERS = [
  { id: 'seed_payer_harbor', name: 'Harbor Mutual Dental', kind: 'commercial', stedi: 'HRBMD' },
  { id: 'seed_payer_evergreen', name: 'Evergreen Benefit Partners', kind: 'commercial', stedi: 'EVGBP' },
  { id: 'seed_payer_coastal', name: 'Coastal State Medicaid Dental', kind: 'medicaid', stedi: '' },
]

const PLANS = [
  { id: 'seed_plan_harbor_ppo', payer: 'seed_payer_harbor', group: 'Brightwater Marine Supply', number: 'GRP-20418', type: 'ppo', net: 'in_network', fee: 'seed_fee_ppo', cob: 'standard', max: 150000n, ded: 5000n },
  { id: 'seed_plan_evergreen_ppo', payer: 'seed_payer_evergreen', group: 'Lantern Street Bakery', number: 'GRP-77310', type: 'ppo', net: 'in_network', fee: 'seed_fee_ppo', cob: 'non_duplication', max: 100000n, ded: 5000n },
  { id: 'seed_plan_coastal_mcd', payer: 'seed_payer_coastal', group: 'Coastal State Medicaid', number: '', type: 'medicaid', net: 'in_network', fee: null, cob: 'unknown', max: null, ded: null },
]

type FactSeed = [field: string, appliesTo: Record<string, unknown>, value: Record<string, unknown>, source?: string]
const SEED_TASK_TITLES: Record<string, string> = { frequency_limit: 'Ask the payer for frequency limits', waiting_period: 'Ask about waiting periods', cob_method: 'Ask the payer: COB method' }

const FULL_FACTS = (maxLeft: number, dedLeft: number): FactSeed[] => [
  ['coverage_active', {}, { active: true }],
  ['annual_max', { level: 'individual' }, { amountMinor: '150000' }],
  ['annual_max_used', { level: 'individual' }, { remainingMinor: String(maxLeft) }],
  ['deductible', { level: 'individual', category: 'all' }, { amountMinor: '5000' }],
  ['deductible_met', { level: 'individual' }, { remainingMinor: String(dedLeft) }],
  ['coverage_pct', { category: 'preventive' }, { pct: '100.0000' }],
  ['coverage_pct', { category: 'basic' }, { pct: '80.0000' }],
  ['coverage_pct', { category: 'major' }, { pct: '50.0000' }],
  ['frequency_limit', { group: 'recall' }, { count: 2, months: 12, group: 'recall' }, 'payer_phone'],
  ['waiting_period', { category: 'major' }, { months: 0 }, 'payer_phone'],
  ['missing_tooth_clause', {}, { categories: [] }, 'payer_phone'],
  ['downgrade', {}, { categories: [] }, 'payer_phone'],
  ['cob_method', {}, { method: 'standard' }, 'payer_phone'],
]

export async function seedPhase3(uow: UnitOfWork, actor: Actor) {
  const { tx, now } = uow
  const meta = { metadata: { seed: true, synthetic: true } }
  const created: Record<string, number> = { payers: 0, insurancePlans: 0, coverages: 0, benefitFacts: 0, verifications: 0, workTasks: 0 }
  if (await tx.payer.findUnique({ where: { id: PAYERS[0].id } })) return created

  await tx.payer.createMany({ data: PAYERS.map(p => ({ id: p.id, name: p.name, kind: p.kind, adapterPayerIds: (p.stedi ? { stedi: p.stedi } : {}) as never, timelyFilingDays: 365, isSynthetic: true })) })
  created.payers = PAYERS.length
  const feeIds = new Set((await tx.feeSchedule.findMany({ select: { id: true } })).map(f => f.id))
  await tx.insurancePlan.createMany({ data: PLANS.map(p => ({ id: p.id, payerId: p.payer, groupName: p.group, groupNumber: p.number, planType: p.type, networkStatus: p.net, feeScheduleId: p.fee && feeIds.has(p.fee) ? p.fee : null, cobMethod: p.cob, annualMaxMinor: p.max, deductibleIndividualMinor: p.ded, benefitYearStartMonth: 1, isSynthetic: true })) })
  created.insurancePlans = PLANS.length
  auditCreate(uow, actor, 'InsurancePlan', PLANS[0].id, 'insurance_plan.created', { seeded: PLANS.length }, meta)

  // The sandbox clearinghouse: recorded responses, no key, no network.
  if (!(await tx.adapterInstallation.findFirst({ where: { area: 'clearinghouse', adapterKey: 'stedi' } }))) {
    await tx.adapterInstallation.create({ data: { area: 'clearinghouse', adapterKey: 'stedi', displayName: 'Stedi eligibility (recorded sandbox)', mode: 'sandbox', status: 'configured', config: { transport: 'recorded' } as never, handlesPhi: false } })
  }

  const patients = await tx.patient.findMany({ where: { id: { startsWith: 'seed_pt_' } }, orderBy: { id: 'asc' }, take: 8 })
  const members = ['SUM-4401-A', 'SUM-4402-B', 'SUM-4403-C', 'SUM-4404-D', 'SUM-4405-E', 'SUM-4406-F', 'SUM-4407-G', 'SUM-4408-H']
  // [plan, verification state]: full, partial (a 271 only), unknown (never checked), full
  const layout: [string, 'full' | 'partial' | 'none'][] = [['seed_plan_harbor_ppo', 'full'], ['seed_plan_evergreen_ppo', 'partial'], ['seed_plan_harbor_ppo', 'none'], ['seed_plan_evergreen_ppo', 'full'], ['seed_plan_evergreen_ppo', 'none'], ['seed_plan_harbor_ppo', 'partial'], ['seed_plan_harbor_ppo', 'full'], ['seed_plan_coastal_mcd', 'none']]
  const rows = { subscribers: [] as any[], coverages: [] as any[], verifications: [] as any[], facts: [] as any[], tasks: [] as any[], levels: [] as [string, string, string][] }
  const secrets = await Promise.all(members.slice(0, patients.length).map(m => storeSecret(tx, 'subscriber.memberId', m)))
  for (const [index, patient] of patients.entries()) {
    const [planId, state] = layout[index]
    const memberId = members[index]
    const sid = `seed_sub_${index + 1}`, cid = `seed_cov_${index + 1}`, vid = `seed_ver_${index + 1}`
    rows.subscribers.push({ id: sid, patientId: patient.id, planId, memberIdSecretId: secrets[index].id, memberIdHash: memberIdHash(memberId), memberIdLast4: memberId.slice(-4), dateOfBirth: patient.dateOfBirth, effectiveFrom: day('2026-01-01'), isSynthetic: true })
    rows.coverages.push({ id: cid, patientId: patient.id, subscriberId: sid, ordinal: 'primary', relationship: 'self', status: state === 'none' ? 'pending_verification' : 'active', verificationLevel: 'unverified', effectiveFrom: day('2026-01-01'), isSynthetic: true })
    if (state === 'none') continue
    rows.verifications.push({ id: vid, coverageId: cid, trigger: 'staff', status: 'completed', completeness: state === 'full' ? 'complete' : 'partial', completedAt: now, isSynthetic: true })
    const facts = state === 'full' ? FULL_FACTS(150000 - 32000 * (index % 3), index % 2 ? 0 : 5000) : FULL_FACTS(150000, 5000).slice(0, 8)
    for (const [field, appliesTo, value, source] of facts) rows.facts.push({ verificationId: vid, coverageId: cid, field, appliesTo, valueJson: value, source: source ?? 'payer_portal', observedAt: now })
    if (state === 'partial') {
      for (const field of ['frequency_limit', 'waiting_period', 'cob_method']) {
        rows.facts.push({ verificationId: vid, coverageId: cid, field, appliesTo: {}, valueJson: {}, isUnknown: true, source: 'payer_portal', observedAt: now })
        rows.tasks.push({ kind: 'verification_checklist', title: SEED_TASK_TITLES[field] ?? `Ask the payer: ${field.replaceAll('_', ' ')}`, taskKey: field, subjectType: 'Coverage', subjectId: cid, verificationId: vid, dueAt: new Date(now.getTime() + 2 * 86_400_000), checklist: { field }, isSynthetic: true })
      }
    }
    rows.levels.push([cid, vid, state === 'full' ? 'verified_full' : 'verified_partial'])
  }
  await tx.subscriber.createMany({ data: rows.subscribers })
  await tx.coverage.createMany({ data: rows.coverages })
  await tx.benefitVerification.createMany({ data: rows.verifications })
  await tx.benefitFact.createMany({ data: rows.facts })
  await tx.workTask.createMany({ data: rows.tasks })
  for (const [cid, vid, level] of rows.levels) await tx.$executeRaw`UPDATE "Coverage" SET "verificationLevel" = ${level}, "lastVerification" = ${vid} WHERE id = ${cid}`

  // A second plan for the first patient, on Evergreen's own sandbox member (its own recorded answer, not Harbor's).
  if (patients[0]) {
    const evgMember = 'EVG-5501-K'
    const secret = await storeSecret(tx, 'subscriber.memberId', evgMember)
    await tx.subscriber.create({ data: { id: 'seed_sub_evg_1', patientId: patients[0].id, planId: 'seed_plan_evergreen_ppo', memberIdSecretId: secret.id, memberIdHash: memberIdHash(evgMember), memberIdLast4: evgMember.slice(-4), dateOfBirth: patients[0].dateOfBirth, effectiveFrom: day('2026-01-01'), isSynthetic: true } })
    await tx.coverage.create({ data: { id: 'seed_cov_evg_1', patientId: patients[0].id, subscriberId: 'seed_sub_evg_1', ordinal: 'secondary', relationship: 'self', status: 'pending_verification', verificationLevel: 'unverified', effectiveFrom: day('2026-01-01'), isSynthetic: true } })
    created.coverages += 1
  }

  // Downgrade (alternate benefit) rules on the PPO plans: a posterior composite is paid as the amalgam of the same surfaces.
  const amalgam = await tx.procedureCode.findMany({ where: { code: { in: ['OF-R001', 'OF-R002', 'OF-R003'] } }, select: { id: true, code: true } })
  const amalgamId = new Map(amalgam.map(c => [c.code, c.id]))
  const downgrades = [['OF-R010', 'OF-R001'], ['OF-R011', 'OF-R002'], ['OF-R012', 'OF-R003']] as const
  const rules = PLANS.filter(p => p.type === 'ppo').flatMap(p => downgrades.filter(([, to]) => amalgamId.has(to)).map(([from, to]) => ({
    id: `seed_rule_${p.id}_${from.toLowerCase().replace('-', '_')}`, planId: p.id, kind: 'downgrade', appliesTo: { fromCode: from, category: 'basic' }, downgradeToCodeId: amalgamId.get(to)!,
    note: 'Posterior composites are paid at the amalgam allowance (alternate benefit).', source: 'payer_portal', observedAt: now,
  })))
  if (rules.length) await tx.benefitRule.createMany({ data: rules })
  auditCreate(uow, actor, 'Coverage', rows.coverages[0].id, 'coverage.added', { seeded: rows.coverages.length }, meta)
  Object.assign(created, { coverages: rows.coverages.length, verifications: rows.verifications.length, benefitFacts: rows.facts.length, workTasks: rows.tasks.length })
  void localDate; void TZ
  return created
}
