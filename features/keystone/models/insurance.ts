import { list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAll } from '@keystone-6/core/access'
import { sys } from '../access'
import { ccy, fixedChoice, lifecycle, minor, pct, readOnly, systemText, versionField } from './domainFields'
import { governed } from './listAccess'
import { patientFilter, scopedBy, scopedGoverned, visiblePatient } from './scope'
import { trackingFields } from './trackingFields'

/*
 * Insurance, benefits and estimates (SCHEMA §8; DOMAIN I-I1–I-I4; STATE-MACHINES §5). Benefit rules,
 * facts and estimates are immutable rows (a change is a new row); coverage, verification and
 * eligibility-check status move only through commands. DB CHECKs, partial unique indexes and
 * append-only triggers back each rule in the phase3 migration.
 */

export const PAYER_KINDS = ['commercial', 'medicaid', 'chip', 'medicare_advantage', 'tricare', 'other'] as const
export const PLAN_TYPES = ['ppo', 'indemnity', 'dhmo', 'medicaid', 'ma_dental', 'discount', 'other'] as const
export const COB_METHODS = ['standard', 'non_duplication', 'carve_out', 'maintenance_of_benefits', 'unknown'] as const
export const ORDINALS = ['primary', 'secondary', 'tertiary'] as const
export const RELATIONSHIPS = ['self', 'spouse', 'child', 'other'] as const
export const COVERAGE_STATUSES = ['pending_verification', 'active', 'terminated', 'invalid'] as const
/** `verified_electronic`: a 271 answered with benefits; a person has not finished the checklist yet. */
export const VERIFICATION_LEVELS = ['unverified', 'verified_electronic', 'verified_partial', 'verified_full'] as const
export const VERIFICATION_STATUSES = ['requested', 'in_progress', 'completed', 'failed'] as const
export const CHECK_STATUSES = ['queued', 'sent', 'responded', 'rejected', 'error_retryable', 'unknown'] as const
export const RULE_KINDS = ['coverage_pct', 'deductible_applies', 'frequency', 'age_limit', 'waiting_period', 'missing_tooth', 'downgrade', 'not_covered', 'requires_preauth', 'requires_attachment'] as const
export const BENEFIT_SOURCES = ['eligibility_271', 'payer_portal', 'payer_phone', 'fax_breakdown', 'prior_eob', 'patient_reported', 'practice_default'] as const
export const FACT_FIELDS = ['coverage_active', 'annual_max', 'annual_max_used', 'deductible', 'deductible_met', 'coverage_pct', 'frequency_limit', 'frequency_used', 'history_procedure', 'waiting_period', 'missing_tooth_clause', 'downgrade', 'cob_method', 'ortho_max', 'ortho_used', 'non_covered', 'age_limit', 'other'] as const
export const TASK_KINDS = ['verification_checklist', 'note_sign', 'unsigned_plan_follow_up', 'lab_follow_up', 'rejection_fix', 'credit_review', 'other'] as const
export const ESTIMATE_CONFIDENCE = ['verified', 'partially_verified', 'assumed'] as const

const INS_READ = ['canReadInsurance', 'canVerifyBenefits', 'canManageInsurance'] as ('canReadInsurance' | 'canVerifyBenefits' | 'canManageInsurance')[]
const PLAN_READ = [...INS_READ, 'canManageTreatmentPlans', 'canPresentPlans', 'canReadLedger'] as never
const insRead = (path: string[] = ['patient']) => scopedGoverned(INS_READ, patientFilter(path))

export const Payer = list({
  access: governed([...INS_READ, 'canManageClaims', 'canManageAdapters'] as never),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'kind', 'phone', 'timelyFilingDays'] } },
  fields: {
    name: systemText({ required: true }),
    kind: fixedChoice(PAYER_KINDS),
    adapterPayerIds: json({ defaultValue: {}, ...readOnly }),
    phone: systemText(),
    portalUrl: systemText(),
    timelyFilingDays: integer({ defaultValue: 365, ...readOnly }),
    attachmentNetwork: systemText(),
    notes: systemText(),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})

export const Employer = list({
  access: governed(INS_READ),
  ui: { labelField: 'name' },
  fields: {
    name: systemText({ required: true }),
    address: json({ defaultValue: {}, ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})

export const InsurancePlan = list({
  access: governed(PLAN_READ),
  ui: { labelField: 'groupName', listView: { initialColumns: ['groupName', 'payer', 'planType', 'networkStatus', 'cobMethod'] } },
  fields: {
    payer: relationship({ ref: 'Payer', ...readOnly }),
    employer: relationship({ ref: 'Employer', ...readOnly }),
    groupName: systemText({ required: true }),
    groupNumber: systemText({ indexed: true }),
    planType: fixedChoice(PLAN_TYPES),
    networkStatus: fixedChoice(['in_network', 'out_of_network']),
    feeSchedule: relationship({ ref: 'FeeSchedule', ...readOnly }),
    ucrSchedule: relationship({ ref: 'FeeSchedule', ...readOnly }),
    benefitYearStartMonth: integer({ defaultValue: 1, validation: { isRequired: true }, ...readOnly }),
    annualMaxMinor: minor(),
    orthoLifetimeMaxMinor: minor(),
    deductibleIndividualMinor: minor(),
    deductibleFamilyMinor: minor(),
    currencyCode: ccy(),
    cobMethod: fixedChoice(COB_METHODS),
    benefitRules: relationship({ ref: 'BenefitRule.plan', many: true, ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

/** Immutable plan-level rule with provenance. A change adds a row and sets `supersededBy` on the old one. */
export const BenefitRule = list({
  access: governed(PLAN_READ),
  ui: { labelField: 'kind', listView: { initialColumns: ['plan', 'kind', 'appliesTo', 'pct', 'source', 'observedAt'] } },
  fields: {
    plan: relationship({ ref: 'InsurancePlan.benefitRules', ...readOnly }),
    kind: fixedChoice(RULE_KINDS),
    appliesTo: json({ defaultValue: {}, ...readOnly }),
    pct: pct(),
    frequency: json({ ...readOnly }),
    ageMin: integer({ ...readOnly }),
    ageMax: integer({ ...readOnly }),
    waitingMonths: integer({ ...readOnly }),
    downgradeToCode: relationship({ ref: 'ProcedureCode', ...readOnly }),
    note: systemText(),
    source: fixedChoice(BENEFIT_SOURCES),
    observedAt: timestamp({ ...readOnly }),
    observedBy: relationship({ ref: 'User', ...readOnly }),
    evidence: relationship({ ref: 'Document', ...readOnly }),
    supersededBy: relationship({ ref: 'BenefitRule', ...readOnly }),
    ...trackingFields,
  },
})

/** A subscriber is visible where the patient is, or where a patient they cover is (a spouse's plan covers the child). Nobody else's. */
const subscriberScope = ({ session }: { session?: any }) => {
  const where = patientFilter(['patient'])({ session })
  if (where === false || where === true) return where
  return { OR: [where, { coverages: { some: where } }] }
}

export const Subscriber = list({
  access: scopedGoverned(INS_READ, subscriberScope),
  ui: { labelField: 'memberIdLast4', listView: { initialColumns: ['plan', 'memberIdLast4', 'effectiveFrom', 'effectiveTo'] } },
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    personName: json({ defaultValue: {}, ...readOnly }),
    dateOfBirth: calendarDay({ ...readOnly }),
    plan: relationship({ ref: 'InsurancePlan', ...readOnly }),
    memberIdSecret: relationship({ ref: 'SecretBox', access: { read: denyAll, create: sys, update: sys }, ui: { itemView: { fieldMode: 'hidden' } } }),
    // The keyed hash (HMAC under the server key) is for matching in server code only: no role reads, filters or sorts it.
    memberIdHash: text({ isIndexed: true, access: { read: denyAll, create: denyAll, update: denyAll }, isFilterable: false, isOrderable: false, ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'hidden' } } }),
    // The last four are shown, but never searched on: a filter on them is a guessing oracle for the rest.
    memberIdLast4: text({ isFilterable: false, isOrderable: false, access: { create: () => false, update: () => false }, ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } } }),
    coverages: relationship({ ref: 'Coverage.subscriber', many: true, ...readOnly }),
    employer: relationship({ ref: 'Employer', ...readOnly }),
    effectiveFrom: calendarDay({ ...readOnly }),
    effectiveTo: calendarDay({ ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})

export const Coverage = list({
  access: insRead(),
  ui: { labelField: 'id', listView: { initialColumns: ['patient', 'ordinal', 'status', 'verificationLevel', 'effectiveFrom'] } },
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    subscriber: relationship({ ref: 'Subscriber.coverages', ...readOnly }),
    ordinal: fixedChoice(ORDINALS),
    relationship: fixedChoice(RELATIONSHIPS),
    status: lifecycle(COVERAGE_STATUSES),
    verificationLevel: lifecycle(VERIFICATION_LEVELS),
    effectiveFrom: calendarDay({ ...readOnly }),
    effectiveTo: calendarDay({ ...readOnly }),
    lastVerification: relationship({ ref: 'BenefitVerification', ...readOnly }),
    verifications: relationship({ ref: 'BenefitVerification.coverage', many: true, ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const BenefitVerification = list({
  access: insRead(['coverage', 'patient']),
  ui: { labelField: 'status', listView: { initialColumns: ['coverage', 'trigger', 'status', 'completeness', 'completedAt'] } },
  fields: {
    coverage: relationship({ ref: 'Coverage.verifications', ...readOnly }),
    trigger: fixedChoice(['signal', 'proposal', 'staff', 'online_booking', 'plan_year']),
    status: lifecycle(VERIFICATION_STATUSES),
    completeness: select2(['complete', 'partial']),
    eligibilityChecks: relationship({ ref: 'EligibilityCheck.verification', many: true, ...readOnly }),
    facts: relationship({ ref: 'BenefitFact.verification', many: true, ...readOnly }),
    tasks: relationship({ ref: 'WorkTask.verification', many: true, ...readOnly }),
    failureNote: systemText(),
    requestedBy: relationship({ ref: 'User', ...readOnly }),
    completedBy: relationship({ ref: 'User', ...readOnly }),
    completedAt: timestamp({ ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

/** A choice set only by server code, empty until the verification finishes. */
function select2(values: readonly string[]) {
  return select({ type: 'string', options: values.map(value => ({ label: value.replaceAll('_', ' '), value })), ...readOnly })
}

/** Immutable field-by-field verification result, with provenance (I-I1). */
export const BenefitFact = list({
  access: insRead(['coverage', 'patient']),
  ui: { labelField: 'field', listView: { initialColumns: ['coverage', 'field', 'appliesTo', 'isUnknown', 'source', 'observedAt'] } },
  fields: {
    verification: relationship({ ref: 'BenefitVerification.facts', ...readOnly }),
    coverage: relationship({ ref: 'Coverage', ...readOnly }),
    field: fixedChoice(FACT_FIELDS),
    appliesTo: json({ defaultValue: {}, ...readOnly }),
    valueJson: json({ defaultValue: {}, ...readOnly }),
    isUnknown: checkbox({ defaultValue: false, ...readOnly }),
    source: fixedChoice(BENEFIT_SOURCES),
    observedAt: timestamp({ ...readOnly }),
    observedBy: relationship({ ref: 'User', ...readOnly }),
    evidence: relationship({ ref: 'Document', ...readOnly }),
    rawObservation: relationship({ ref: 'InboundObservation', ...readOnly }),
    ...trackingFields,
  },
})

export const EligibilityCheck = list({
  access: insRead(['coverage', 'patient']),
  ui: { labelField: 'status', listView: { initialColumns: ['coverage', 'adapterKey', 'mode', 'status', 'respondedAt'] } },
  fields: {
    verification: relationship({ ref: 'BenefitVerification.eligibilityChecks', ...readOnly }),
    coverage: relationship({ ref: 'Coverage', ...readOnly }),
    adapterKey: systemText({ required: true }),
    mode: fixedChoice(['manual_export', 'live']),
    requestHash: systemText({ indexed: true, required: true }),
    status: lifecycle(CHECK_STATUSES),
    rejectionCodes: json({ defaultValue: [], ...readOnly }),
    resultNote: systemText(),
    attempts: integer({ defaultValue: 0, validation: { isRequired: true }, ...readOnly }),
    observation: relationship({ ref: 'InboundObservation', ...readOnly }),
    respondedAt: timestamp({ ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const OutsideHistory = list({
  access: scopedGoverned([...INS_READ, 'canReadClinical'] as never, patientFilter(['patient'])),
  ui: { labelField: 'codeText', listView: { initialColumns: ['patient', 'codeText', 'tooth', 'dateOfService', 'source'] } },
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    code: relationship({ ref: 'ProcedureCode', ...readOnly }),
    codeText: systemText(),
    frequencyGroup: systemText(),
    tooth: systemText(),
    surfaces: systemText(),
    dateOfService: calendarDay({ ...readOnly }),
    providerName: systemText(),
    source: fixedChoice(BENEFIT_SOURCES),
    evidence: relationship({ ref: 'Document', ...readOnly }),
    ...trackingFields,
  },
})

/** Immutable estimate snapshot (I-I3). Re-running with the same inputs gives the same row values. */
export const Estimate = list({
  access: scopedGoverned(PLAN_READ, patientFilter(['patient'])),
  ui: { labelField: 'subjectKind', listView: { initialColumns: ['patient', 'subjectKind', 'ordinal', 'insuranceMinor', 'patientMinor', 'confidence', 'computedAt'] } },
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    subjectKind: fixedChoice(['plan_item', 'appointment', 'claim_line']),
    planItem: relationship({ ref: 'TreatmentPlanItem', ...readOnly }),
    appointment: relationship({ ref: 'Appointment', ...readOnly }),
    coverage: relationship({ ref: 'Coverage', ...readOnly }),
    ordinal: fixedChoice(ORDINALS),
    inputs: json({ defaultValue: {}, ...readOnly }),
    feeMinor: minor({ required: true }),
    allowedMinor: minor({ required: true }),
    writeOffMinor: minor({ required: true }),
    insuranceMinor: minor({ required: true }),
    patientMinor: minor({ required: true }),
    deductibleAppliedMinor: minor({ required: true }),
    maxAppliedMinor: minor({ required: true }),
    secondaryInsuranceMinor: minor({ required: true }),
    coverageStatus: fixedChoice(['covered', 'not_covered', 'unknown']),
    confidence: fixedChoice(ESTIMATE_CONFIDENCE),
    reasons: json({ defaultValue: [], ...readOnly }),
    estimatorVersion: systemText({ required: true }),
    computedAt: timestamp({ defaultValue: { kind: 'now' }, ...readOnly }),
    ...trackingFields,
  },
})

/** Derived cache, rebuildable from claims, outside history and verified usage (I-I4). Never typed in. */
export const BenefitUsage = list({
  access: insRead(['coverage', 'patient']),
  ui: { labelField: 'benefitYear', listView: { initialColumns: ['coverage', 'benefitYear', 'maxUsedMinor', 'deductibleUsedMinor', 'rebuiltAt'] } },
  fields: {
    coverage: relationship({ ref: 'Coverage', ...readOnly }),
    benefitYear: systemText({ required: true }),
    maxUsedMinor: minor({ defaultValue: 0n }),
    deductibleUsedMinor: minor({ defaultValue: 0n }),
    pendingMinor: minor({ defaultValue: 0n }),
    frequencyUse: json({ defaultValue: [], ...readOnly }),
    rebuiltAt: timestamp({ ...readOnly }),
    sourceHash: systemText(),
    ...trackingFields,
  },
})

export const WorkTask = list({
  // r2 N3: a work task is about a coverage (a patient); readers limited to some offices see tasks for patients visible to them.
  access: scopedGoverned('canAccessDashboard', scopedBy(ids => ({ verification: { coverage: { patient: visiblePatient(ids) } } }))),
  ui: { labelField: 'title', listView: { initialColumns: ['title', 'kind', 'status', 'dueAt', 'assignee'] } },
  fields: {
    kind: fixedChoice(TASK_KINDS),
    title: systemText({ required: true }),
    /** Dedupes open tasks: one open task per (kind, subject, key). */
    taskKey: systemText({ required: true }),
    subjectType: systemText({ required: true }),
    subjectId: systemText({ required: true, indexed: true }),
    verification: relationship({ ref: 'BenefitVerification.tasks', ...readOnly }),
    assignee: relationship({ ref: 'User', ...readOnly }),
    dueAt: timestamp({ ...readOnly }),
    status: lifecycle(['open', 'in_progress', 'done', 'cancelled']),
    checklist: json({ defaultValue: {}, ...readOnly }),
    result: json({ defaultValue: {}, ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})
