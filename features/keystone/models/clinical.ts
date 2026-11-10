import { list } from '@keystone-6/core'
import { calendarDay, checkbox, decimal, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { fixedChoice, lifecycle, minor, readOnly, systemText, versionField } from './domainFields'
import { filterableWithEveryOffice, scopedGoverned, patientFilter } from './scope'
import { governed } from './listAccess'
import { trackingFields } from './trackingFields'

/*
 * Clinical record (SCHEMA §5; DOMAIN I-C1–I-C8; STATE-MACHINES §3). Every write goes through a command
 * in mutations/clinical.ts. Signed note content, completed perio exams and posted charges are guarded
 * again by database triggers (migration dental_phase2).
 */

export const CHART_READ = ['canReadClinical', 'canChart', 'canManagePerio', 'canSignClinicalNotes', 'canPrescribe', 'canCompleteProcedures'] as ('canReadClinical' | 'canChart')[]
const chartRead = (path: string[] = ['patient']) => scopedGoverned(CHART_READ, patientFilter(path))

export const CHART_KINDS = ['procedure', 'condition'] as const
export const AREAS = ['tooth', 'surface', 'quadrant', 'sextant', 'arch', 'mouth'] as const
export const CHART_STATUSES = ['diagnosed', 'planned', 'accepted', 'scheduled', 'completed', 'posted', 'existing_current', 'existing_other', 'referred_out', 'refused', 'deleted_in_error', 'corrected'] as const
export const CONDITION_STATUSES = ['active', 'watch', 'resolved', 'entered_in_error'] as const
export const PERIO_SITES = ['MB', 'B', 'DB', 'ML', 'L', 'DL'] as const

export const ConditionType = list({
  access: governed('signedIn'),
  ui: { labelField: 'label', listView: { initialColumns: ['code', 'label', 'areaRule', 'chartSymbol'] } },
  fields: {
    code: systemText({ indexed: 'unique', required: true }),
    label: systemText({ required: true }),
    chartSymbol: systemText(),
    areaRule: fixedChoice(['tooth', 'tooth_surface', 'quadrant', 'arch', 'mouth']),
    isActive: checkbox({ defaultValue: true, ...readOnly }),
    ...trackingFields,
  },
})

export const ChartEntry = list({
  access: chartRead(),
  ui: { labelField: 'id', listView: { initialColumns: ['patient', 'kind', 'code', 'tooth', 'surfaces', 'status', 'dateOfService'], initialSort: { field: 'createdAt', direction: 'DESC' } } },
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    kind: fixedChoice(CHART_KINDS),
    code: relationship({ ref: 'ProcedureCode', ...readOnly }),
    condition: relationship({ ref: 'ConditionType', ...readOnly }),
    tooth: systemText(),
    surfaces: systemText(),
    area: fixedChoice(AREAS),
    quadrant: systemText(),
    sextant: integer({ ...readOnly }),
    arch: systemText(),
    status: lifecycle(CHART_STATUSES, 'diagnosed'),
    conditionStatus: systemText(),
    dateOfService: calendarDay({ ...readOnly }),
    originalServiceDate: calendarDay({ ...readOnly }),
    provider: relationship({ ref: 'ProviderProfile', ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    appointment: relationship({ ref: 'Appointment', ...readOnly }),
    feeMinor: minor(),
    feeScheduleVersion: relationship({ ref: 'FeeScheduleVersion', ...readOnly }),
    units: integer({ defaultValue: 1, ...readOnly }),
    // R3-2: the chart follows the patient, the ledger row its office; a filter on it would confirm other offices' rows.
    ledgerEntry: relationship({ ref: 'LedgerEntry', ...readOnly, isFilterable: filterableWithEveryOffice }),
    correctedBy: relationship({ ref: 'ChartEntry', ...readOnly }),
    corrects: relationship({ ref: 'ChartEntry', ...readOnly }),
    diagnosisCodes: json({ defaultValue: [], ...readOnly }),
    note: relationship({ ref: 'ClinicalNote', ...readOnly }),
    externalFinding: relationship({ ref: 'ExternalFinding', ...readOnly }),
    source: fixedChoice(['staff', 'import', 'proposal']),
    acceptedVia: systemText(),
    deletedReason: systemText(),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

// ── Perio ────────────────────────────────────────────────────────────────────────────────────────

export const PerioExam = list({
  access: chartRead(),
  ui: { labelField: 'id', listView: { initialColumns: ['patient', 'examDate', 'examiner', 'revision', 'status'], initialSort: { field: 'examDate', direction: 'DESC' } } },
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    examDate: calendarDay({ ...readOnly }),
    examiner: relationship({ ref: 'ProviderProfile', ...readOnly }),
    revision: integer({ defaultValue: 1, ...readOnly }),
    revisionOf: relationship({ ref: 'PerioExam', ...readOnly }),
    status: lifecycle(['in_progress', 'completed', 'revised']),
    location: relationship({ ref: 'Location', ...readOnly }),
    signedAt: timestamp({ ...readOnly }),
    signedBy: relationship({ ref: 'User', ...readOnly }),
    signatureHash: systemText(),
    measurements: relationship({ ref: 'PerioSiteMeasurement.exam', many: true, ...readOnly }),
    findings: relationship({ ref: 'PerioToothFinding.exam', many: true, ...readOnly }),
    classifications: relationship({ ref: 'PerioClassification.exam', many: true, ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const PerioSiteMeasurement = list({
  access: chartRead(['exam', 'patient']),
  ui: { listView: { initialColumns: ['exam', 'tooth', 'site', 'probingDepthMm', 'gingivalMarginMm', 'bleeding'] } },
  fields: {
    exam: relationship({ ref: 'PerioExam.measurements', ...readOnly }),
    tooth: systemText({ required: true }),
    site: fixedChoice(PERIO_SITES),
    probingDepthMm: integer({ ...readOnly }),
    gingivalMarginMm: integer({ ...readOnly }),
    bleeding: checkbox({ defaultValue: false, ...readOnly }),
    suppuration: checkbox({ defaultValue: false, ...readOnly }),
    plaque: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})

export const PerioToothFinding = list({
  access: chartRead(['exam', 'patient']),
  fields: {
    exam: relationship({ ref: 'PerioExam.findings', ...readOnly }),
    tooth: systemText({ required: true }),
    mobility: integer({ ...readOnly }),
    furcation: json({ defaultValue: {}, ...readOnly }),
    missing: checkbox({ defaultValue: false, ...readOnly }),
    implant: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})

export const PerioClassification = list({
  access: chartRead(['exam', 'patient']),
  fields: {
    exam: relationship({ ref: 'PerioExam.classifications', ...readOnly }),
    suggestedStage: systemText(),
    suggestedGrade: systemText(),
    extent: systemText(),
    inputs: json({ defaultValue: {}, ...readOnly }),
    confirmedStage: systemText(),
    confirmedGrade: systemText(),
    status: lifecycle(['suggested', 'confirmed', 'overridden']),
    signedBy: relationship({ ref: 'User', ...readOnly }),
    signedAt: timestamp({ ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

// ── Notes ────────────────────────────────────────────────────────────────────────────────────────

export const NoteTemplate = list({
  access: governed(['canChart', 'canSignClinicalNotes', 'canReadClinical']),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'status', 'currentVersion'] } },
  fields: {
    name: systemText({ required: true }),
    appliesToCategories: json({ defaultValue: [], ...readOnly }),
    status: lifecycle(['draft', 'published', 'retired'], 'published'),
    versions: relationship({ ref: 'NoteTemplateVersion.template', many: true, ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const NoteTemplateVersion = list({
  access: governed(['canChart', 'canSignClinicalNotes', 'canReadClinical']),
  ui: { labelField: 'id' },
  fields: {
    template: relationship({ ref: 'NoteTemplate.versions', ...readOnly }),
    number: integer({ defaultValue: 1, ...readOnly }),
    body: text({ ...readOnly, ui: { displayMode: 'textarea' } }),
    prompts: json({ defaultValue: [], ...readOnly }),
    status: lifecycle(['draft', 'published', 'retired'], 'published'),
    ...trackingFields,
  },
})

export const ClinicalNote = list({
  access: chartRead(),
  ui: { labelField: 'id', listView: { initialColumns: ['patient', 'author', 'status', 'signedAt', 'createdAt'], initialSort: { field: 'createdAt', direction: 'DESC' } } },
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    appointment: relationship({ ref: 'Appointment', ...readOnly }),
    author: relationship({ ref: 'User', ...readOnly }),
    provider: relationship({ ref: 'ProviderProfile', ...readOnly }),
    template: relationship({ ref: 'NoteTemplateVersion', ...readOnly }),
    title: systemText(),
    body: text({ ...readOnly, ui: { ...readOnly.ui, displayMode: 'textarea' } }),
    bodyHash: systemText(),
    status: lifecycle(['draft', 'signed', 'entered_in_error']),
    amends: relationship({ ref: 'ClinicalNote', ...readOnly }),
    isLateEntry: checkbox({ defaultValue: false, ...readOnly }),
    refersToAt: timestamp({ ...readOnly }),
    signedAt: timestamp({ ...readOnly }),
    signatureMethod: systemText(),
    errorReason: systemText(),
    draftedByProposal: relationship({ ref: 'Proposal', ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const AnestheticLog = list({
  access: chartRead(),
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    appointment: relationship({ ref: 'Appointment', ...readOnly }),
    drug: systemText({ required: true }),
    concentration: systemText(),
    vasoconstrictor: systemText(),
    carpules: decimal({ precision: 6, scale: 2, ...readOnly }),
    injectionSites: json({ defaultValue: [], ...readOnly }),
    administeredBy: relationship({ ref: 'User', ...readOnly }),
    at: timestamp({ ...readOnly }),
    ...trackingFields,
  },
})

export const VitalsReading = list({
  access: chartRead(),
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    appointment: relationship({ ref: 'Appointment', ...readOnly }),
    systolic: integer({ ...readOnly }),
    diastolic: integer({ ...readOnly }),
    pulse: integer({ ...readOnly }),
    asaClass: systemText(),
    takenBy: relationship({ ref: 'User', ...readOnly }),
    at: timestamp({ ...readOnly }),
    ...trackingFields,
  },
})

// ── Medical history ──────────────────────────────────────────────────────────────────────────────

export const MedicalHistoryForm = list({
  access: governed(['canChart', 'canReadClinical', 'canManagePatients']),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'formVersion', 'status'] } },
  fields: {
    name: systemText({ required: true }),
    formVersion: integer({ defaultValue: 1, ...readOnly }),
    questions: json({ defaultValue: [], ...readOnly }),
    jurisdictionTags: json({ defaultValue: [], ...readOnly }),
    status: lifecycle(['draft', 'published', 'retired'], 'published'),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})

export const MedicalHistoryResponse = list({
  access: chartRead(),
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    form: relationship({ ref: 'MedicalHistoryForm', ...readOnly }),
    answers: json({ defaultValue: {}, ...readOnly }),
    submittedVia: fixedChoice(['portal_api', 'tablet', 'staff', 'import']),
    submittedAt: timestamp({ ...readOnly }),
    status: lifecycle(['submitted', 'reviewed', 'superseded']),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const MedicalHistoryReview = list({
  access: chartRead(['response', 'patient']),
  fields: {
    response: relationship({ ref: 'MedicalHistoryResponse', ...readOnly }),
    patient: relationship({ ref: 'Patient', ...readOnly }),
    reviewedBy: relationship({ ref: 'User', ...readOnly }),
    reviewedAt: timestamp({ ...readOnly }),
    changesAcknowledged: json({ defaultValue: [], ...readOnly }),
    alertsCreated: json({ defaultValue: [], ...readOnly }),
    signatureHash: systemText(),
    overrideReason: systemText(),
    ...trackingFields,
  },
})

export const MedicationEntry = list({
  access: chartRead(),
  ui: { labelField: 'name' },
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    name: systemText({ required: true }),
    dose: systemText(),
    frequency: systemText(),
    source: fixedChoice(['history', 'staff', 'import', 'prescription']),
    activeFrom: calendarDay({ ...readOnly }),
    endedAt: calendarDay({ ...readOnly }),
    ...trackingFields,
  },
})

export const Prescription = list({
  access: chartRead(),
  ui: { labelField: 'drug', listView: { initialColumns: ['patient', 'drug', 'sig', 'mode', 'status'] } },
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    prescriber: relationship({ ref: 'ProviderProfile', ...readOnly }),
    drug: systemText({ required: true }),
    strength: systemText(),
    form: systemText(),
    sig: systemText(),
    quantity: decimal({ precision: 10, scale: 3, ...readOnly }),
    refills: integer({ defaultValue: 0, ...readOnly }),
    isControlled: checkbox({ defaultValue: false, ...readOnly }),
    schedule: fixedChoice(['none', 'II', 'III', 'IV', 'V']),
    pharmacy: json({ defaultValue: {}, ...readOnly }),
    mode: fixedChoice(['print', 'erx']),
    status: lifecycle(['draft', 'signed', 'printed', 'transmitted_pending', 'transmitted', 'transmit_failed', 'transmit_unknown', 'cancelled']),
    signedAt: timestamp({ ...readOnly }),
    cancelReason: systemText(),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

// ── Imaging and informed refusal ─────────────────────────────────────────────────────────────────

export const ImagingStudy = list({
  access: chartRead(),
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    modality: fixedChoice(['bitewing', 'periapical', 'fmx', 'panoramic', 'ceph', 'cbct', 'intraoral_photo', 'extraoral_photo', 'scan_stl']),
    teeth: json({ defaultValue: [], ...readOnly }),
    acquiredAt: timestamp({ ...readOnly }),
    source: fixedChoice(['bridge', 'upload', 'import']),
    bridgeRef: systemText(),
    status: lifecycle(['requested', 'acquired', 'entered_in_error']),
    version: versionField(),
    ...trackingFields,
  },
})

export const ExternalFinding = list({
  access: chartRead(),
  fields: {
    study: relationship({ ref: 'ImagingStudy', ...readOnly }),
    patient: relationship({ ref: 'Patient', ...readOnly }),
    vendor: systemText(),
    device: systemText({ required: true }),
    modelVersion: systemText({ required: true }),
    clearanceRef: systemText(),
    findingType: systemText(),
    tooth: systemText(),
    surfaces: systemText(),
    confidence: decimal({ precision: 9, scale: 4, ...readOnly }),
    status: lifecycle(['received', 'shown', 'accepted', 'dismissed']),
    decidedBy: relationship({ ref: 'User', ...readOnly }),
    dismissReason: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})

export const InformedRefusal = list({
  access: chartRead(),
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    planVersion: relationship({ ref: 'TreatmentPlanVersion', ...readOnly }),
    items: relationship({ ref: 'TreatmentPlanItem', many: true, ...readOnly }),
    risksExplained: text({ ...readOnly, ui: { ...readOnly.ui, displayMode: 'textarea' } }),
    signedBy: fixedChoice(['patient', 'guardian']),
    signerName: systemText(),
    signatureEvidence: json({ defaultValue: {}, ...readOnly }),
    witness: relationship({ ref: 'User', ...readOnly }),
    signedAt: timestamp({ ...readOnly }),
    status: lifecycle(['draft', 'signed', 'withdrawn']),
    withdrawnReason: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})
