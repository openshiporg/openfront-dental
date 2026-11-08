import { createHash } from 'node:crypto'
import { requirePermission, systemActor, type Actor } from '../lib/actor'
import { canonicalJson, sha256 } from '../lib/canonical'
import { auditCreate, lockRow, transition } from '../lib/cas'
import { command } from '../lib/command'
import type { Tx } from '../lib/db'
import { Decimal, dec } from '../lib/decimal'
import { DomainError, Codes } from '../lib/errors'
import { categoryOf, groupOf, loadCoverageForEstimate } from '../lib/estimateInputs'
import { estimate, ESTIMATOR_VERSION, type EstimatorLine } from '../lib/estimator'
import { toMinor } from '../lib/money'
import { storeSecret } from '../lib/secretBox'
import { localDate } from '../lib/time'
import { BENEFIT_SOURCES, COB_METHODS, ORDINALS, PAYER_KINDS, PLAN_TYPES, RELATIONSHIPS } from '../models/insurance'
import { dayOf, isoDay, oneOf, requireReason } from './clinicalShared'
import { assertPatientInScope, optionalText, requireText, staff, type Ctx } from './shared'

/*
 * Insurance commands (STATE-MACHINES §5; DOMAIN I-I1–I-I4). Coverage order changes are audited and
 * never silent. A verification collects facts with provenance; anything not returned stays unknown.
 * The clearinghouse call itself is made by the outbox worker (insuranceWorker.ts), never in these
 * transactions.
 */

const WRITE = ['canManageInsurance', 'canVerifyBenefits'] as const
export const REQUIRED_FACTS: { field: string; category?: string }[] = [
  { field: 'coverage_active' }, { field: 'annual_max' }, { field: 'deductible' },
  { field: 'coverage_pct', category: 'preventive' }, { field: 'coverage_pct', category: 'basic' }, { field: 'coverage_pct', category: 'major' },
  { field: 'frequency_limit' }, { field: 'waiting_period' }, { field: 'missing_tooth_clause' }, { field: 'downgrade' }, { field: 'cob_method' },
]
/** What a person must still ask, by plan type (checklist template, R§6.3). */
export const CHECKLIST_BY_PLAN: Record<string, string[]> = {
  ppo: ['frequency_limit', 'waiting_period', 'missing_tooth_clause', 'downgrade', 'cob_method', 'frequency_used'],
  indemnity: ['frequency_limit', 'waiting_period', 'missing_tooth_clause', 'downgrade', 'cob_method', 'frequency_used'],
  dhmo: ['frequency_limit', 'cob_method'],
  medicaid: ['frequency_limit', 'age_limit'],
  ma_dental: ['frequency_limit', 'annual_max', 'waiting_period'],
  discount: ['coverage_pct'],
  other: ['frequency_limit', 'waiting_period', 'cob_method'],
}

const TASK_TITLES: Record<string, string> = {
  frequency_limit: 'Ask the payer for frequency limits', waiting_period: 'Ask about waiting periods', missing_tooth_clause: 'Ask if a missing-tooth clause applies',
  downgrade: 'Ask about downgrade (alternate benefit) rules', cob_method: 'Ask which coordination-of-benefits method applies', frequency_used: 'Ask what frequencies are already used this year',
  history_procedure: 'Ask for procedures done elsewhere', age_limit: 'Ask about age limits', annual_max: 'Ask for the annual maximum', coverage_pct: 'Ask for coverage percentages',
}

const money = (value: unknown, field: string) => {
  const text = String(value ?? '').trim()
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) throw new DomainError(Codes.INVALID_INPUT, 'Enter dollars like 1500 or 1500.00.', { field })
  return toMinor(text, 'USD')
}
const optMoney = (value: unknown, field: string) => (value === undefined || value === null || String(value).trim() === '' ? null : money(value, field))

// ── Payers and plans ─────────────────────────────────────────────────────────────────────────────

export async function savePayer(_root: unknown, args: { payerId?: string | null; name: string; kind: string; stediPayerId?: string | null; phone?: string | null; timelyFilingDays?: number | null; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, 'canManageInsurance')
  const name = requireText(args.name, 'payer name', 120)
  const kind = oneOf(args.kind, PAYER_KINDS, 'payer kind')
  const days = args.timelyFilingDays ?? 365
  if (!Number.isInteger(days) || days < 1 || days > 1500) throw new DomainError(Codes.INVALID_INPUT, 'Timely filing days must be between 1 and 1500.', { field: 'timelyFilingDays' })
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'payer.save', actor, idempotencyKey, params }, async uow => {
    const ids = args.stediPayerId ? { stedi: requireText(args.stediPayerId, 'Stedi payer ID', 40) } : {}
    const data = { name, kind, phone: optionalText(args.phone, 40), timelyFilingDays: days, adapterPayerIds: ids as never }
    if (args.payerId) {
      await uow.tx.payer.update({ where: { id: args.payerId }, data })
      uow.audit({ eventType: 'payer.updated', entityType: 'Payer', entityId: args.payerId, actorUserId: actor.kind === 'user' ? actor.userId : null, after: { name, kind } })
      return { payerId: args.payerId }
    }
    const payer = await uow.tx.payer.create({ data })
    auditCreate(uow, actor, 'Payer', payer.id, 'payer.created', { name, kind })
    return { payerId: payer.id }
  })
  return { replay: result.replay, ...result.value }
}

export async function saveInsurancePlan(_root: unknown, args: { planId?: string | null; payerId: string; groupName: string; groupNumber?: string | null; planType: string; networkStatus: string; feeScheduleId?: string | null; cobMethod?: string | null; annualMax?: string | null; deductible?: string | null; deductibleFamily?: string | null; benefitYearStartMonth?: number | null; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, 'canManageInsurance')
  const month = args.benefitYearStartMonth ?? 1
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new DomainError(Codes.INVALID_INPUT, 'The benefit year starts in a month from 1 to 12.', { field: 'benefitYearStartMonth' })
  const data = {
    payerId: args.payerId, groupName: requireText(args.groupName, 'group name', 120), groupNumber: optionalText(args.groupNumber, 40),
    planType: oneOf(args.planType, PLAN_TYPES, 'plan type'), networkStatus: oneOf(args.networkStatus, ['in_network', 'out_of_network'] as const, 'network status'),
    feeScheduleId: args.feeScheduleId || null, cobMethod: oneOf(args.cobMethod ?? 'unknown', COB_METHODS, 'COB method'), benefitYearStartMonth: month,
    annualMaxMinor: optMoney(args.annualMax, 'annualMax'), deductibleIndividualMinor: optMoney(args.deductible, 'deductible'), deductibleFamilyMinor: optMoney(args.deductibleFamily, 'deductibleFamily'),
  }
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'plan.save_insurance', actor, idempotencyKey, params }, async uow => {
    if (!(await uow.tx.payer.findUnique({ where: { id: args.payerId }, select: { id: true } }))) throw new DomainError(Codes.NOT_FOUND, 'Payer not found.')
    if (args.planId) {
      await uow.tx.insurancePlan.update({ where: { id: args.planId }, data: { ...data, version: { increment: 1 } } })
      uow.audit({ eventType: 'insurance_plan.updated', entityType: 'InsurancePlan', entityId: args.planId, actorUserId: actor.kind === 'user' ? actor.userId : null, after: { groupName: data.groupName, planType: data.planType } })
      return { planId: args.planId }
    }
    const plan = await uow.tx.insurancePlan.create({ data })
    auditCreate(uow, actor, 'InsurancePlan', plan.id, 'insurance_plan.created', { groupName: data.groupName, planType: data.planType })
    return { planId: plan.id }
  })
  return { replay: result.replay, ...result.value }
}

// ── Coverage ─────────────────────────────────────────────────────────────────────────────────────

const last4 = (value: string) => value.replace(/[^A-Za-z0-9]/g, '').slice(-4)

export async function addCoverage(_root: unknown, args: { patientId: string; planId: string; memberId: string; relationship: string; ordinal: string; effectiveFrom: string; subscriberFirstName?: string | null; subscriberLastName?: string | null; subscriberDateOfBirth?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageInsurance')
  const relationship = oneOf(args.relationship, RELATIONSHIPS, 'relationship')
  const ordinal = oneOf(args.ordinal, ORDINALS, 'order')
  const memberId = requireText(args.memberId, 'member ID', 40)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.effectiveFrom ?? '')) throw new DomainError(Codes.INVALID_INPUT, 'Enter the effective date.', { field: 'effectiveFrom' })
  const { idempotencyKey, memberId: _member, ...params } = args
  const result = await command(context.prisma, { name: 'coverage.add', actor, idempotencyKey, params: { ...params, memberIdHash: sha256(memberId) } }, async uow => {
    const patient = await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const plan = await uow.tx.insurancePlan.findUnique({ where: { id: args.planId }, select: { id: true } })
    if (!plan) throw new DomainError(Codes.NOT_FOUND, 'Insurance plan not found.')
    const open = await uow.tx.coverage.findFirst({ where: { patientId: patient.id, ordinal, status: { in: ['pending_verification', 'active'] } } })
    if (open) throw new DomainError(Codes.GUARD_FAILED, `This patient already has a ${ordinal} coverage. Change the order or end that coverage first.`, { field: 'ordinal' })
    const self = relationship === 'self'
    const patientRow = await uow.tx.patient.findUniqueOrThrow({ where: { id: patient.id }, select: { firstName: true, lastName: true, dateOfBirth: true, isSynthetic: true } })
    const secret = await storeSecret(uow.tx, 'subscriber.memberId', memberId)
    const subscriber = await uow.tx.subscriber.create({
      data: {
        patientId: self ? patient.id : null, planId: plan.id, memberIdSecretId: secret.id, memberIdHash: sha256(memberId.toUpperCase()), memberIdLast4: last4(memberId),
        personName: self ? {} : { first: requireText(args.subscriberFirstName, 'subscriber first name', 80), last: requireText(args.subscriberLastName, 'subscriber last name', 80) },
        dateOfBirth: self ? patientRow.dateOfBirth : dayOf(requireText(args.subscriberDateOfBirth, 'subscriber date of birth', 10)),
        effectiveFrom: dayOf(args.effectiveFrom), isSynthetic: patientRow.isSynthetic,
      },
    })
    const coverage = await uow.tx.coverage.create({
      data: { patientId: patient.id, subscriberId: subscriber.id, ordinal, relationship, status: 'pending_verification', verificationLevel: 'unverified', effectiveFrom: dayOf(args.effectiveFrom), isSynthetic: patientRow.isSynthetic },
    })
    auditCreate(uow, actor, 'Coverage', coverage.id, 'coverage.added', { patientId: patient.id, planId: plan.id, ordinal, relationship })
    return { coverageId: coverage.id, subscriberId: subscriber.id }
  })
  return { replay: result.replay, ...result.value }
}

/** Swap or move a coverage's order. Audited; the system never reorders silently (I-I2). */
export async function setCoverageOrder(_root: unknown, args: { coverageId: string; ordinal: string; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageInsurance')
  const ordinal = oneOf(args.ordinal, ORDINALS, 'order')
  const reason = requireReason(args.reason)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'coverage.set_order', actor, idempotencyKey, params }, async uow => {
    const coverage = await lockRow<any>(uow.tx, 'Coverage', args.coverageId)
    await assertPatientInScope(uow.tx, locationIds, coverage.patientId)
    if (!['pending_verification', 'active'].includes(coverage.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'Only a current coverage can be reordered.')
    if (coverage.ordinal === ordinal) return { coverageId: coverage.id, ordinal }
    const other = await uow.tx.coverage.findFirst({ where: { patientId: coverage.patientId, ordinal, status: { in: ['pending_verification', 'active'] } } })
    if (other) {
      // The partial unique index forbids two open rows at one rank, so park the other one out of the index, move, then swap it in.
      await uow.tx.$executeRaw`UPDATE "Coverage" SET "status" = 'invalid' WHERE id = ${other.id}`
      await uow.tx.$executeRaw`UPDATE "Coverage" SET "ordinal" = ${ordinal}, "version" = "version" + 1, "updatedAt" = now() WHERE id = ${coverage.id}`
      await uow.tx.$executeRaw`UPDATE "Coverage" SET "ordinal" = ${coverage.ordinal}, "status" = ${other.status}, "version" = "version" + 1, "updatedAt" = now() WHERE id = ${other.id}`
      auditCreate(uow, actor, 'Coverage', other.id, 'coverage.order_changed', { from: ordinal, to: coverage.ordinal }, { reason })
    } else {
      await uow.tx.$executeRaw`UPDATE "Coverage" SET "ordinal" = ${ordinal}, "version" = "version" + 1, "updatedAt" = now() WHERE id = ${coverage.id}`
    }
    auditCreate(uow, actor, 'Coverage', coverage.id, 'coverage.order_changed', { from: coverage.ordinal, to: ordinal }, { reason })
    return { coverageId: coverage.id, ordinal }
  })
  return { replay: result.replay, ...result.value }
}

export async function terminateCoverage(_root: unknown, args: { coverageId: string; expectedVersion: number; endedOn: string; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageInsurance')
  const reason = requireReason(args.reason)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.endedOn ?? '')) throw new DomainError(Codes.INVALID_INPUT, 'Enter the end date.', { field: 'endedOn' })
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'coverage.terminate', actor, idempotencyKey, params }, async uow => {
    const coverage = await lockRow<any>(uow.tx, 'Coverage', args.coverageId)
    await assertPatientInScope(uow.tx, locationIds, coverage.patientId)
    await transition<any>(uow, { model: 'Coverage', id: coverage.id, from: ['pending_verification', 'active'], to: 'terminated', expectedVersion: args.expectedVersion, actor, eventType: 'coverage.terminated', reason, data: { effectiveTo: dayOf(args.endedOn) } })
    return { coverageId: coverage.id }
  })
  return { replay: result.replay, ...result.value }
}

// ── Verification ─────────────────────────────────────────────────────────────────────────────────

/** Open the checklist tasks for a verification: one per field not covered by 271 data. Deduplicated by the open-task index. */
export async function openChecklist(tx: Tx, verificationId: string, coverageId: string, planType: string, now: Date, isSynthetic: boolean, fields = CHECKLIST_BY_PLAN[planType] ?? CHECKLIST_BY_PLAN.other) {
  for (const field of fields) {
    const exists = await tx.workTask.findFirst({ where: { kind: 'verification_checklist', subjectType: 'Coverage', subjectId: coverageId, taskKey: field, status: { in: ['open', 'in_progress'] } } })
    if (exists) continue
    await tx.workTask.create({ data: { kind: 'verification_checklist', title: TASK_TITLES[field] ?? `Confirm ${field.replaceAll('_', ' ')}`, taskKey: field, subjectType: 'Coverage', subjectId: coverageId, verificationId, dueAt: new Date(now.getTime() + 2 * 86_400_000), checklist: { field }, isSynthetic } })
  }
}

export type VerifyOptions = { trigger: string; viaClearinghouse: boolean }

/** Shared by the staff command, the plan-year job and booking intake. Returns the verification in flight if there already is one. */
export async function openVerification(uow: { tx: Tx; now: Date; emit: (m: any) => void; audit: (e: any) => void }, actor: Actor, coverageId: string, options: VerifyOptions) {
  const { tx } = uow
  const coverage = await tx.coverage.findUnique({ where: { id: coverageId }, include: { subscriber: { include: { plan: { include: { payer: true } } } } } })
  if (!coverage || !coverage.subscriber?.plan) throw new DomainError(Codes.NOT_FOUND, 'Coverage not found.')
  if (['terminated', 'invalid'].includes(coverage.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'This coverage has ended.')
  const flying = await tx.benefitVerification.findFirst({ where: { coverageId, status: { in: ['requested', 'in_progress'] } } })
  if (flying) return { verificationId: flying.id, existing: true, checkId: null as string | null, mode: 'manual' as string }
  const plan = coverage.subscriber.plan
  const verification = await tx.benefitVerification.create({ data: { coverageId, trigger: options.trigger, status: 'in_progress', requestedById: actor.kind === 'user' ? actor.userId : null, isSynthetic: coverage.isSynthetic } })
  const installation = options.viaClearinghouse ? await tx.adapterInstallation.findFirst({ where: { area: 'clearinghouse', adapterKey: 'stedi', status: { not: 'suspended' } } }) : null
  const payerId = (plan.payer?.adapterPayerIds as Record<string, string> | null)?.stedi
  let checkId: string | null = null
  let mode = 'manual'
  if (installation && payerId && installation.mode && installation.mode !== 'live') {
    mode = installation.mode
    const requestHash = sha256(canonicalJson({ coverage: coverage.id, subscriber: coverage.subscriber.memberIdHash, payer: payerId, serviceType: '35' }))
    const check = await tx.eligibilityCheck.create({ data: { verificationId: verification.id, coverageId, adapterKey: 'stedi', mode: installation.mode, requestHash, status: 'queued', isSynthetic: coverage.isSynthetic } })
    checkId = check.id
    uow.emit({ topic: 'eligibility.check', aggregateType: 'EligibilityCheck', aggregateId: check.id, payload: { checkId: check.id, attempt: 1 }, dedupeKey: `eligibility.check:${check.id}:1` })
  } else {
    // No clearinghouse for this payer: everything is a person's task.
    await openChecklist(tx, verification.id, coverageId, plan.planType, uow.now, coverage.isSynthetic, [...new Set(['coverage_pct', 'annual_max', ...(CHECKLIST_BY_PLAN[plan.planType] ?? CHECKLIST_BY_PLAN.other)])])
  }
  auditCreate(uow as never, actor, 'BenefitVerification', verification.id, 'verification.requested', { coverageId, trigger: options.trigger, mode })
  return { verificationId: verification.id, existing: false, checkId, mode }
}

export async function requestVerification(_root: unknown, args: { coverageId: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, ...WRITE)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'verification.request', actor, idempotencyKey, params }, async uow => {
    const coverage = await uow.tx.coverage.findUnique({ where: { id: args.coverageId }, select: { patientId: true } })
    if (!coverage) throw new DomainError(Codes.NOT_FOUND, 'Coverage not found.')
    await assertPatientInScope(uow.tx, locationIds, coverage.patientId!)
    return openVerification(uow, actor, args.coverageId, { trigger: 'staff', viaClearinghouse: true })
  })
  return { replay: result.replay, ...result.value }
}

/** Re-check a check that ended unknown, rejected-and-fixed or retryable. Same row and request hash: never a second check. */
export async function recheckEligibility(_root: unknown, args: { checkId: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, ...WRITE)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'eligibility.recheck', actor, idempotencyKey, params }, async uow => {
    const check = await lockRow<any>(uow.tx, 'EligibilityCheck', args.checkId)
    const coverage = await uow.tx.coverage.findUnique({ where: { id: check.coverageId }, select: { patientId: true } })
    await assertPatientInScope(uow.tx, locationIds, coverage!.patientId!)
    await transition<any>(uow, { model: 'EligibilityCheck', id: check.id, from: ['unknown', 'error_retryable', 'rejected'], to: 'queued', actor, eventType: 'eligibility.requeued', data: { resultNote: '' } })
    uow.emit({ topic: 'eligibility.check', aggregateType: 'EligibilityCheck', aggregateId: check.id, payload: { checkId: check.id, attempt: Number(check.attempts) + 1 }, dedupeKey: `eligibility.check:${check.id}:${Number(check.attempts) + 1}` })
    return { checkId: check.id }
  })
  return { replay: result.replay, ...result.value }
}

const FACT_SHAPES = ['coverage_active', 'annual_max', 'annual_max_used', 'deductible', 'deductible_met', 'coverage_pct', 'frequency_limit', 'waiting_period', 'missing_tooth_clause', 'downgrade', 'cob_method', 'age_limit', 'ortho_max', 'non_covered'] as const
const CATEGORIES = ['preventive', 'basic', 'major', 'orthodontic'] as const

function factValue(args: Record<string, any>): { appliesTo: Record<string, unknown>; value: Record<string, unknown> } {
  const field = String(args.field)
  const category = args.category ? oneOf(args.category, CATEGORIES, 'category') : undefined
  const level = args.level === 'family' ? 'family' : 'individual'
  const needCategory = () => { if (!category) throw new DomainError(Codes.INVALID_INPUT, 'Choose the category this applies to.', { field: 'category' }); return category }
  switch (field) {
    case 'coverage_active': return { appliesTo: {}, value: { active: args.flag === 'yes' } }
    case 'annual_max': case 'ortho_max': return { appliesTo: { level }, value: { amountMinor: money(args.dollars, 'dollars').toString() } }
    case 'annual_max_used': case 'deductible_met': return { appliesTo: { level }, value: { remainingMinor: money(args.dollars, 'dollars').toString() } }
    case 'deductible': return { appliesTo: { level, category: category ?? 'all' }, value: { amountMinor: money(args.dollars, 'dollars').toString() } }
    case 'coverage_pct': {
      const pct = dec(String(args.pct ?? '').trim() || 'x' as never)
      if (!pct.isFinite() || pct.lt(0) || pct.gt(100)) throw new DomainError(Codes.INVALID_INPUT, 'Enter the plan’s percentage from 0 to 100.', { field: 'pct' })
      return { appliesTo: { category: needCategory() }, value: { pct: pct.toFixed(4) } }
    }
    case 'frequency_limit': {
      const count = Number(args.count), months = Number(args.months)
      if (!Number.isInteger(count) || count < 1 || !Number.isInteger(months) || months < 1 || months > 120) throw new DomainError(Codes.INVALID_INPUT, 'Enter how many, and over how many months.', { field: 'count' })
      const group = optionalText(args.group, 40) || 'recall'
      return { appliesTo: { group }, value: { count, months, group } }
    }
    case 'waiting_period': {
      const months = Number(args.months)
      if (!Number.isInteger(months) || months < 0 || months > 60) throw new DomainError(Codes.INVALID_INPUT, 'Enter the waiting period in months.', { field: 'months' })
      return { appliesTo: { category: needCategory() }, value: { months } }
    }
    case 'missing_tooth_clause': case 'downgrade': return { appliesTo: {}, value: { categories: args.flag === 'yes' ? (category ? [category] : ['major']) : [] } }
    case 'cob_method': return { appliesTo: {}, value: { method: oneOf(args.method, COB_METHODS, 'COB method') } }
    case 'age_limit': return { appliesTo: { category: needCategory() }, value: { min: args.ageMin === '' || args.ageMin == null ? null : Number(args.ageMin), max: args.ageMax === '' || args.ageMax == null ? null : Number(args.ageMax) } }
    case 'non_covered': return { appliesTo: { category: needCategory() }, value: { pct: '0.0000' } }
    default: throw new DomainError(Codes.INVALID_INPUT, 'Unknown benefit field.', { field: 'field' })
  }
}

export async function recordBenefitFact(_root: unknown, args: { verificationId: string; field: string; category?: string | null; level?: string | null; dollars?: string | null; pct?: string | null; count?: number | null; months?: number | null; group?: string | null; method?: string | null; flag?: string | null; ageMin?: string | null; ageMax?: string | null; isUnknown?: boolean | null; source: string; note?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, ...WRITE)
  const field = oneOf(args.field, FACT_SHAPES, 'field')
  const source = oneOf(args.source, BENEFIT_SOURCES, 'source')
  if (source === 'eligibility_271') throw new DomainError(Codes.INVALID_INPUT, 'A 271 fact is recorded only from a stored clearinghouse response.', { field: 'source' })
  const unknown = args.isUnknown === true
  const shaped = unknown ? { appliesTo: args.category ? { category: oneOf(args.category, CATEGORIES, 'category') } : {}, value: {} } : factValue({ ...args, field })
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'verification.record_fact', actor, idempotencyKey, params }, async uow => {
    const verification = await lockRow<any>(uow.tx, 'BenefitVerification', args.verificationId)
    const coverage = await uow.tx.coverage.findUniqueOrThrow({ where: { id: verification.coverageId }, select: { patientId: true } })
    await assertPatientInScope(uow.tx, locationIds, coverage.patientId!)
    if (verification.status !== 'in_progress') throw new DomainError(Codes.INVALID_TRANSITION, 'This verification is not open.')
    const value = args.note ? { ...shaped.value, note: optionalText(args.note, 300) } : shaped.value
    const fact = await uow.tx.benefitFact.create({
      data: { verificationId: verification.id, coverageId: verification.coverageId, field, appliesTo: shaped.appliesTo as never, valueJson: (unknown ? {} : value) as never, isUnknown: unknown, source, observedAt: uow.now, observedById: actor.kind === 'user' ? actor.userId : null },
    })
    if (!unknown) await uow.tx.workTask.updateMany({ where: { subjectType: 'Coverage', subjectId: verification.coverageId, taskKey: field, status: { in: ['open', 'in_progress'] } }, data: { status: 'done', result: { factId: fact.id } as never, version: { increment: 1 } } })
    auditCreate(uow, actor, 'BenefitFact', fact.id, 'benefit_fact.recorded', { field, source, isUnknown: unknown })
    return { factId: fact.id }
  })
  return { replay: result.replay, ...result.value }
}

export async function completeVerification(_root: unknown, args: { verificationId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, ...WRITE)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'verification.complete', actor, idempotencyKey, params }, async uow => {
    const verification = await lockRow<any>(uow.tx, 'BenefitVerification', args.verificationId)
    const coverage = await lockRow<any>(uow.tx, 'Coverage', verification.coverageId)
    await assertPatientInScope(uow.tx, locationIds, coverage.patientId)
    const pending = await uow.tx.eligibilityCheck.count({ where: { verificationId: verification.id, status: { in: ['queued', 'sent'] } } })
    if (pending) throw new DomainError(Codes.GUARD_FAILED, 'The eligibility check is still running. Wait for the answer, or complete it by hand after it ends.')
    const facts = await uow.tx.benefitFact.findMany({ where: { coverageId: coverage.id } })
    const known = (field: string, category?: string) => facts.some(f => f.field === field && !f.isUnknown && (!category || (f.appliesTo as any)?.category === category))
    const missing = REQUIRED_FACTS.filter(r => !known(r.field, r.category))
    const complete = missing.length === 0
    const active = facts.filter(f => f.field === 'coverage_active' && !f.isUnknown).sort((a, b) => b.observedAt!.getTime() - a.observedAt!.getTime())[0]
    await transition<any>(uow, { model: 'BenefitVerification', id: verification.id, from: ['in_progress'], to: 'completed', expectedVersion: args.expectedVersion, actor, eventType: 'verification.completed', metadata: { complete, missing: missing.map(m => m.category ? `${m.field}:${m.category}` : m.field) }, data: { completeness: complete ? 'complete' : 'partial', completedById: actor.kind === 'user' ? actor.userId : null, completedAt: uow.now } })
    const level = complete ? 'verified_full' : facts.some(f => !f.isUnknown) ? 'verified_partial' : 'unverified'
    const inactive = active && (active.valueJson as any)?.active === false
    await uow.tx.$executeRaw`UPDATE "Coverage" SET "verificationLevel" = ${level}, "lastVerification" = ${verification.id}, "status" = ${inactive ? 'terminated' : coverage.status === 'pending_verification' && active ? 'active' : coverage.status}, "version" = "version" + 1, "updatedAt" = now() WHERE id = ${coverage.id}`
    await uow.tx.workTask.updateMany({ where: { verificationId: verification.id, status: { in: ['open', 'in_progress'] } }, data: { status: 'cancelled', result: { reason: 'verification completed' } as never, version: { increment: 1 } } })
    await uow.tx.eligibilityCheck.updateMany({ where: { verificationId: verification.id, status: { in: ['unknown', 'queued', 'sent'] } }, data: { status: 'error_retryable', resultNote: 'Closed with the verification.' } })
    return { verificationId: verification.id, completeness: complete ? 'complete' : 'partial', level, missing: missing.length }
  })
  return { replay: result.replay, ...result.value }
}

export async function failVerification(_root: unknown, args: { verificationId: string; expectedVersion: number; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, ...WRITE)
  const reason = requireReason(args.reason)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'verification.fail', actor, idempotencyKey, params }, async uow => {
    const verification = await lockRow<any>(uow.tx, 'BenefitVerification', args.verificationId)
    const coverage = await uow.tx.coverage.findUniqueOrThrow({ where: { id: verification.coverageId }, select: { patientId: true } })
    await assertPatientInScope(uow.tx, locationIds, coverage.patientId!)
    await transition<any>(uow, { model: 'BenefitVerification', id: verification.id, from: ['requested', 'in_progress'], to: 'failed', expectedVersion: args.expectedVersion, actor, eventType: 'verification.failed', reason, data: { failureNote: reason } })
    await uow.tx.workTask.updateMany({ where: { verificationId: verification.id, status: { in: ['open', 'in_progress'] } }, data: { status: 'cancelled', version: { increment: 1 } } })
    await uow.tx.eligibilityCheck.updateMany({ where: { verificationId: verification.id, status: { in: ['unknown', 'queued', 'sent'] } }, data: { status: 'error_retryable', resultNote: 'Closed with the verification.' } })
    return { verificationId: verification.id }
  })
  return { replay: result.replay, ...result.value }
}

export async function addOutsideHistory(_root: unknown, args: { patientId: string; codeId?: string | null; codeText?: string | null; frequencyGroup?: string | null; tooth?: string | null; dateOfService: string; providerName?: string | null; source: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, ...WRITE, 'canManageTreatmentPlans')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.dateOfService ?? '')) throw new DomainError(Codes.INVALID_INPUT, 'Enter the date of service.', { field: 'dateOfService' })
  const source = oneOf(args.source, BENEFIT_SOURCES, 'source')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'history.add', actor, idempotencyKey, params }, async uow => {
    const patient = await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const code = args.codeId ? await uow.tx.procedureCode.findUnique({ where: { id: args.codeId } }) : null
    if (!code && !args.codeText) throw new DomainError(Codes.INVALID_INPUT, 'Choose a procedure or describe it.', { field: 'codeText' })
    const row = await uow.tx.outsideHistory.create({ data: { patientId: patient.id, codeId: code?.id ?? null, codeText: optionalText(args.codeText, 120) || code?.nomenclature || '', frequencyGroup: optionalText(args.frequencyGroup, 40) || (code ? groupOf(code as never) : ''), tooth: optionalText(args.tooth, 10), dateOfService: dayOf(args.dateOfService), providerName: optionalText(args.providerName, 120), source } })
    auditCreate(uow, actor, 'OutsideHistory', row.id, 'outside_history.added', { patientId: patient.id, dateOfService: args.dateOfService })
    return { historyId: row.id }
  })
  return { replay: result.replay, ...result.value }
}

// ── Estimates ────────────────────────────────────────────────────────────────────────────────────

/** Estimate the current version of a plan. Snapshots are immutable; the same inputs add nothing new (I-I3). */
export async function estimateTreatmentPlan(_root: unknown, args: { planId: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageTreatmentPlans', 'canPresentPlans', ...WRITE)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'estimate.plan', actor, idempotencyKey, params }, async uow => {
    const { tx } = uow
    const plan = await tx.treatmentPlan.findUnique({ where: { id: args.planId } })
    if (!plan) throw new DomainError(Codes.NOT_FOUND, 'Plan not found.')
    const patient = await assertPatientInScope(tx, locationIds, plan.patientId!)
    const patientRow = await tx.patient.findUniqueOrThrow({ where: { id: patient.id }, select: { dateOfBirth: true, homeLocationId: true } })
    const coverages = await tx.coverage.findMany({ where: { patientId: patient.id, status: { in: ['pending_verification', 'active'] } }, orderBy: { ordinal: 'asc' } })
    const primary = coverages.find(c => c.ordinal === 'primary')
    if (!primary) return { estimated: 0, noCoverage: true }
    const version = await tx.treatmentPlanVersion.findUnique({ where: { id: plan.currentVersionId! }, include: { items: { orderBy: { sortOrder: 'asc' }, include: { chartEntry: { include: { code: true } } } } } })
    if (!version?.items.length) return { estimated: 0, noCoverage: false }
    const tz = patientRow.homeLocationId ? (await tx.location.findUnique({ where: { id: patientRow.homeLocationId }, select: { timeZone: true } }))?.timeZone : null
    const today = localDate(tz ?? 'America/New_York', uow.now)
    const loaded = await loadCoverageForEstimate(tx, primary.id, today)
    if (!loaded) return { estimated: 0, noCoverage: true }
    const secondaryCoverage = coverages.find(c => c.ordinal === 'secondary')
    const secondary = secondaryCoverage ? await loadCoverageForEstimate(tx, secondaryCoverage.id, today) : null
    const planRow = await tx.coverage.findUniqueOrThrow({ where: { id: primary.id }, include: { subscriber: { include: { plan: true } } } })
    const teeth = version.items.map(i => i.chartEntry?.tooth).filter(Boolean) as string[]
    const missingRows = teeth.length ? await tx.chartEntry.findMany({ where: { patientId: patient.id, kind: 'condition', tooth: { in: teeth }, condition: { code: 'missing' } }, select: { tooth: true } }) : []
    const missingTeeth = new Set(missingRows.map(m => m.tooth))
    const age = patientRow.dateOfBirth ? Math.floor((uow.now.getTime() - patientRow.dateOfBirth.getTime()) / (365.2425 * 86_400_000)) : 40
    const lines: EstimatorLine[] = []
    for (const item of version.items) {
      const code = item.chartEntry?.code
      let allowed: bigint | null = null
      if (loaded.feeScheduleVersionId && code) {
        const fee = await tx.fee.findUnique({ where: { feeVersionId_codeId: { feeVersionId: loaded.feeScheduleVersionId, codeId: code.id } } })
        allowed = fee ? fee.amountMinor : null
      }
      lines.push({ id: item.id, code: String(code?.code ?? ''), category: categoryOf(code as never), date: today, feeMinor: item.feeMinor, allowedMinor: allowed, group: code?.isPreventiveRecallTrigger ? 'recall' : undefined, missingTooth: !!item.chartEntry?.tooth && missingTeeth.has(item.chartEntry.tooth) })
    }
    const out = estimate({
      plan: loaded.plan, usage: loaded.usage, patientAgeYears: age, coverageEffectiveFrom: loaded.effectiveFrom, lines,
      secondary: secondary ? { method: loaded.cobMethod, coveragePct: secondary.coveragePct } : null,
    })
    let created = 0
    for (const line of out.lines) {
      const inputs = {
        estimatorVersion: ESTIMATOR_VERSION, feeScheduleVersionId: loaded.feeScheduleVersionId, factIds: [...loaded.factIds].sort(), secondaryFactIds: secondary ? [...secondary.factIds].sort() : [],
        cobMethod: loaded.cobMethod, planId: planRow.subscriber?.planId, usage: { maxUsedMinor: loaded.usage.maxUsedMinor.toString(), pendingMinor: loaded.usage.pendingMinor.toString(), deductibleMetMinor: loaded.usage.deductibleMetMinor.toString(), history: loaded.usage.history.length }, notes: loaded.usageNotes,
        line: lines.find(l => l.id === line.id)?.date, trace: line.trace,
      }
      const hash = createHash('sha256').update(canonicalJson({ inputs: { ...inputs, trace: undefined }, line: { fee: line.feeMinor, ins: line.insuranceMinor, pat: line.patientMinor, status: line.status, sec: line.secondaryInsuranceMinor } })).digest('hex')
      const last = await tx.estimate.findFirst({ where: { planItemId: line.id }, orderBy: { computedAt: 'desc' } })
      if ((last?.inputs as any)?.hash === hash) continue
      await tx.estimate.create({
        data: {
          patientId: patient.id, subjectKind: 'plan_item', planItemId: line.id, coverageId: primary.id, ordinal: 'primary', inputs: { ...inputs, hash } as never,
          feeMinor: line.feeMinor, allowedMinor: line.allowedMinor, writeOffMinor: line.writeOffMinor, insuranceMinor: line.insuranceMinor, patientMinor: line.patientMinor,
          deductibleAppliedMinor: line.deductibleAppliedMinor, maxAppliedMinor: line.maxAppliedMinor, secondaryInsuranceMinor: line.secondaryInsuranceMinor,
          coverageStatus: line.status, confidence: line.confidence, reasons: line.reasons as never, estimatorVersion: ESTIMATOR_VERSION, computedAt: uow.now,
        },
      })
      created += 1
    }
    uow.audit({ eventType: 'estimate.computed', entityType: 'TreatmentPlan', entityId: plan.id, actorUserId: actor.kind === 'user' ? actor.userId : null, after: { lines: out.lines.length, created, confidence: out.confidence } })
    return { estimated: out.lines.length, created, confidence: out.confidence, insuranceMinor: out.totals.insuranceMinor.toString(), patientMinor: out.totals.patientMinor.toString() }
  })
  return { replay: result.replay, ...result.value }
}

export { systemActor, Decimal, isoDay }
