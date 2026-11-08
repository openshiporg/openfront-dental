import { list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { fixedChoice, lifecycle, minor, readOnly, systemText, versionField } from './domainFields'
import { governed } from './listAccess'
import { patientFilter, scopedGoverned } from './scope'
import { trackingFields } from './trackingFields'

/*
 * Treatment planning (SCHEMA §6; DOMAIN I-T1–I-T3; STATE-MACHINES §4) and forms and consents
 * (SCHEMA §15.1–§15.2). A presented plan version is frozen by trigger; acceptances and consent
 * records are append-only.
 */

export const PLAN_STATUSES = ['draft', 'presented', 'partially_accepted', 'accepted', 'declined', 'in_progress', 'completed', 'superseded', 'archived'] as const
export const PLAN_PRIORITIES = ['urgent', 'recommended_necessary', 'recommended', 'elective'] as const
export const FORM_KINDS = ['consent_treatment', 'consent_sedation', 'hipaa_npp_ack', 'financial_policy', 'photo_consent', 'informed_refusal', 'membership_terms', 'payment_plan_terms', 'intake', 'medical_history', 'other'] as const

const PLAN_READ = ['canManageTreatmentPlans', 'canPresentPlans', 'canReadClinical', 'canChart', 'canReadLedger'] as ('canReadClinical' | 'canChart')[]
const planRead = (path: string[] = ['patient']) => scopedGoverned(PLAN_READ, patientFilter(path))

export const TreatmentPlan = list({
  access: planRead(),
  ui: { labelField: 'ref', listView: { initialColumns: ['ref', 'patient', 'title', 'status', 'currentVersion'], initialSort: { field: 'createdAt', direction: 'DESC' } } },
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    ref: systemText({ indexed: 'unique', required: true }),
    title: systemText({ required: true }),
    status: lifecycle(PLAN_STATUSES),
    currentVersion: relationship({ ref: 'TreatmentPlanVersion', ...readOnly }),
    versions: relationship({ ref: 'TreatmentPlanVersion.plan', many: true, ...readOnly }),
    coordinator: relationship({ ref: 'User', ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const TreatmentPlanVersion = list({
  access: planRead(['plan', 'patient']),
  ui: { labelField: 'id', listView: { initialColumns: ['plan', 'number', 'frozenAt', 'contentHash'] } },
  fields: {
    plan: relationship({ ref: 'TreatmentPlan.versions', ...readOnly }),
    number: integer({ defaultValue: 1, ...readOnly }),
    phases: json({ defaultValue: [], ...readOnly }),
    items: relationship({ ref: 'TreatmentPlanItem.planVersion', many: true, ...readOnly }),
    totalsMinor: json({ defaultValue: {}, ...readOnly }),
    contentHash: systemText(),
    frozenAt: timestamp({ ...readOnly }),
    presentedBy: relationship({ ref: 'User', ...readOnly }),
    ...trackingFields,
  },
})

export const TreatmentPlanItem = list({
  access: planRead(['planVersion', 'plan', 'patient']),
  ui: { labelField: 'id', listView: { initialColumns: ['planVersion', 'chartEntry', 'phaseKey', 'priority', 'feeMinor'] } },
  fields: {
    planVersion: relationship({ ref: 'TreatmentPlanVersion.items', ...readOnly }),
    chartEntry: relationship({ ref: 'ChartEntry', ...readOnly }),
    phaseKey: systemText(),
    alternateGroup: systemText(),
    priority: fixedChoice(PLAN_PRIORITIES),
    feeMinor: minor({ required: true }),
    selected: checkbox({ defaultValue: false, ...readOnly }),
    refused: checkbox({ defaultValue: false, ...readOnly }),
    sortOrder: integer({ defaultValue: 0, ...readOnly }),
    ...trackingFields,
  },
})

export const PlanPresentation = list({
  access: planRead(['planVersion', 'plan', 'patient']),
  fields: {
    planVersion: relationship({ ref: 'TreatmentPlanVersion', ...readOnly }),
    presentedBy: relationship({ ref: 'User', ...readOnly }),
    channel: fixedChoice(['chairside', 'portal_api', 'email_link']),
    at: timestamp({ ...readOnly }),
    ...trackingFields,
  },
})

export const PlanAcceptance = list({
  access: planRead(['planVersion', 'plan', 'patient']),
  fields: {
    planVersion: relationship({ ref: 'TreatmentPlanVersion', ...readOnly }),
    versionHash: systemText({ required: true }),
    selectedItems: relationship({ ref: 'TreatmentPlanItem', many: true, ...readOnly }),
    signer: fixedChoice(['patient', 'guardian']),
    signerName: systemText(),
    signatureEvidence: json({ defaultValue: {}, ...readOnly }),
    estimateSnapshot: json({ defaultValue: {}, ...readOnly }),
    financingSelection: json({ defaultValue: {}, ...readOnly }),
    at: timestamp({ ...readOnly }),
    ...trackingFields,
  },
})

export const GoodFaithEstimate = list({
  access: planRead(),
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    planVersion: relationship({ ref: 'TreatmentPlanVersion', ...readOnly }),
    status: lifecycle(['required', 'generated', 'delivered', 'superseded', 'not_required']),
    dueBy: timestamp({ ...readOnly }),
    deliveredVia: systemText(),
    deliveredAt: timestamp({ ...readOnly }),
    itemsSnapshot: json({ defaultValue: [], ...readOnly }),
    totalMinor: minor(),
    version: versionField(),
    ...trackingFields,
  },
})

// ── Forms and consents ───────────────────────────────────────────────────────────────────────────

export const FormTemplate = list({
  access: governed(['canChart', 'canManagePatients', 'canReadClinical', 'canPresentPlans']),
  ui: { labelField: 'key', listView: { initialColumns: ['key', 'kind', 'title'] } },
  fields: {
    key: systemText({ indexed: 'unique', required: true }),
    kind: fixedChoice(FORM_KINDS),
    title: systemText({ required: true }),
    versions: relationship({ ref: 'FormTemplateVersion.template', many: true, ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})

export const FormTemplateVersion = list({
  access: governed(['canChart', 'canManagePatients', 'canReadClinical', 'canPresentPlans']),
  ui: { labelField: 'id', listView: { initialColumns: ['template', 'number', 'status', 'contentHash'] } },
  fields: {
    template: relationship({ ref: 'FormTemplate.versions', ...readOnly }),
    number: integer({ defaultValue: 1, ...readOnly }),
    body: text({ ...readOnly, ui: { ...readOnly.ui, displayMode: 'textarea' } }),
    fields: json({ defaultValue: [], ...readOnly }),
    jurisdictionTags: json({ defaultValue: [], ...readOnly }),
    requiresWitness: checkbox({ defaultValue: false, ...readOnly }),
    contentHash: systemText(),
    status: lifecycle(['draft', 'published', 'retired'], 'published'),
    ...trackingFields,
  },
})

export const FormRequest = list({
  access: scopedGoverned(['canChart', 'canManagePatients', 'canReadClinical'], patientFilter(['patient'])),
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    template: relationship({ ref: 'FormTemplateVersion', ...readOnly }),
    medicalHistoryForm: relationship({ ref: 'MedicalHistoryForm', ...readOnly }),
    channel: fixedChoice(['portal_api', 'tablet', 'email_link', 'sms_link']),
    expiresAt: timestamp({ ...readOnly }),
    status: lifecycle(['requested', 'opened', 'submitted', 'expired']),
    requestedBy: relationship({ ref: 'User', ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const FormSubmission = list({
  access: scopedGoverned(['canChart', 'canReadClinical'], patientFilter(['request', 'patient'])),
  fields: {
    request: relationship({ ref: 'FormRequest', ...readOnly }),
    data: json({ defaultValue: {}, ...readOnly }),
    submittedAt: timestamp({ ...readOnly }),
    submitterRole: fixedChoice(['patient', 'guardian', 'staff']),
    ...trackingFields,
  },
})

export const ConsentRecord = list({
  access: scopedGoverned(['canChart', 'canReadClinical', 'canManagePatients'], patientFilter(['patient'])),
  ui: { labelField: 'id', listView: { initialColumns: ['patient', 'templateVersion', 'signerName', 'signedAt'] } },
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    templateVersion: relationship({ ref: 'FormTemplateVersion', ...readOnly }),
    signerName: systemText(),
    signerRole: fixedChoice(['patient', 'guardian']),
    signatureEvidence: json({ defaultValue: {}, ...readOnly }),
    witness: relationship({ ref: 'User', ...readOnly }),
    signedAt: timestamp({ ...readOnly }),
    scope: json({ defaultValue: {}, ...readOnly }),
    effectiveUntil: calendarDay({ ...readOnly }),
    ...trackingFields,
  },
})

export const ConsentAction = list({
  access: scopedGoverned(['canChart', 'canReadClinical', 'canManagePatients'], patientFilter(['record', 'patient'])),
  fields: {
    record: relationship({ ref: 'ConsentRecord', ...readOnly }),
    kind: fixedChoice(['withdraw', 'expire']),
    at: timestamp({ ...readOnly }),
    by: relationship({ ref: 'User', ...readOnly }),
    reason: systemText(),
    ...trackingFields,
  },
})
