import { list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, timestamp } from '@keystone-6/core/fields'
import { fixedChoice, lifecycle, readOnly, systemText, versionField } from './domainFields'
import { governed } from './listAccess'
import { locationFilter, patientFilter, scopedGoverned } from './scope'
import { trackingFields } from './trackingFields'

/*
 * Phase 6: recall, lab cases, reviews, prescriptions' PDMP evidence, compliance, imports and exports.
 * Every row is written by a command; the generated create/update operations are closed. Nothing here sends anything:
 * recall and review outreach is a list and a message to copy, and exports are downloads.
 */

export const RECALL_STATUSES = ['scheduled_due', 'due', 'overdue', 'scheduled', 'disabled'] as const
export const LAB_CASE_STATUSES = ['draft', 'sent', 'in_production', 'shipped', 'received', 'qc_passed', 'seated', 'remake_requested', 'cancelled'] as const
export const REVIEW_REPLY_STATUSES = ['draft', 'policy_failed', 'policy_passed', 'approved', 'posted', 'failed'] as const
export const TASK_STATUSES = ['open', 'done', 'dismissed'] as const
export const INCIDENT_STATUSES = ['reported', 'assessing', 'notifiable', 'not_notifiable', 'notified', 'closed'] as const
export const RIGHTS_KINDS = ['access', 'amendment', 'accounting', 'restriction', 'confidential_communication'] as const
export const RIGHTS_STATUSES = ['open', 'extended', 'fulfilled', 'denied'] as const
export const DISPOSITION_STATUSES = ['eligible', 'approval_requested', 'approved', 'executed', 'blocked'] as const
export const HOLD_STATUSES = ['active', 'released'] as const
export const IMPORT_BATCH_STATUSES = ['previewed', 'approval_requested', 'applying', 'applied', 'rejected'] as const
export const IMPORT_SOURCES = ['open_dental', 'generic_csv'] as const

const READ_CLINICAL = ['canChart', 'canReadClinical', 'canManageSchedule', 'canMessagePatients', 'canReadSchedule'] as never
const COMPLIANCE = ['canManageCompliance', 'canReviewPrivacy', 'canApproveRetention'] as never
const IMPORTERS = ['canImportData', 'canExportData', 'canApproveImports'] as never
const patientScoped = (path: string[] = ['patient']) => scopedGoverned(READ_CLINICAL, patientFilter(path))

// ── Recall ─────────────────────────────────────────────────────────────────────────────────────

export const RecallType = list({
  access: governed(['canReadSchedule', 'canMessagePatients', 'canManageSchedule']),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'key', 'intervalMonths', 'ageMinYears', 'ageMaxYears', 'isActive'] } },
  fields: {
    key: systemText({ indexed: 'unique', required: true }),
    name: systemText({ required: true }),
    intervalMonths: integer({ validation: { isRequired: true, min: 1, max: 60 }, ...readOnly }),
    ageMinYears: integer({ defaultValue: 0, ...readOnly }),
    ageMaxYears: integer({ ...readOnly }),
    isActive: checkbox({ defaultValue: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const RecallRule = list({
  access: governed(['canReadSchedule', 'canMessagePatients', 'canManageSchedule']),
  ui: { labelField: 'key' },
  fields: {
    key: systemText({ indexed: 'unique', required: true }),
    trigger: fixedChoice(['perio_therapy_completed', 'preventive_completed']),
    fromType: relationship({ ref: 'RecallType', ...readOnly }),
    toType: relationship({ ref: 'RecallType', ...readOnly }),
    isActive: checkbox({ defaultValue: true, ...readOnly }),
    ...trackingFields,
  },
})

export const PatientRecall = list({
  access: patientScoped(),
  ui: { labelField: 'status', listView: { initialColumns: ['patient', 'type', 'dueOn', 'status', 'lastCompletedOn'], initialSort: { field: 'dueOn', direction: 'ASC' } } },
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    type: relationship({ ref: 'RecallType', ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    status: lifecycle(RECALL_STATUSES, 'scheduled_due'),
    dueOn: calendarDay({ ...readOnly, isIndexed: true }),
    lastCompletedOn: calendarDay({ ...readOnly }),
    disabledReason: systemText(),
    lastOutreachPreparedAt: timestamp({ ...readOnly }),
    outreachCount: integer({ defaultValue: 0, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

// ── Lab ────────────────────────────────────────────────────────────────────────────────────────

export const Lab = list({
  access: governed(['canManageLabCases', 'canReadSchedule']),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'turnaroundDays', 'bufferDays', 'isActive'] } },
  fields: {
    name: systemText({ indexed: 'unique', required: true }),
    contactName: systemText(),
    phone: systemText(),
    email: systemText(),
    turnaroundDays: integer({ defaultValue: 10, ...readOnly }),
    bufferDays: integer({ defaultValue: 2, ...readOnly }),
    isActive: checkbox({ defaultValue: true, ...readOnly }),
    ...trackingFields,
  },
})

export const LabCase = list({
  access: scopedGoverned(['canManageLabCases', 'canReadSchedule', 'canChart'] as never, locationFilter()),
  ui: { labelField: 'ref', listView: { initialColumns: ['ref', 'patient', 'lab', 'workType', 'status', 'dueDate'], initialSort: { field: 'createdAt', direction: 'DESC' } } },
  fields: {
    ref: systemText({ indexed: 'unique', required: true }),
    patient: relationship({ ref: 'Patient', ...readOnly }),
    lab: relationship({ ref: 'Lab', ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    seatAppointment: relationship({ ref: 'Appointment', ...readOnly }),
    prescriber: relationship({ ref: 'ProviderProfile', ...readOnly }),
    remakeOf: relationship({ ref: 'LabCase', ...readOnly }),
    workType: systemText({ required: true }),
    tooth: systemText(),
    shade: systemText(),
    instructions: systemText(),
    files: json({ defaultValue: [], ...readOnly }),
    status: lifecycle(LAB_CASE_STATUSES, 'draft'),
    dueDate: calendarDay({ ...readOnly }),
    sentAt: timestamp({ ...readOnly }),
    receivedAt: timestamp({ ...readOnly }),
    lastChasedAt: timestamp({ ...readOnly }),
    qcNote: systemText(),
    cancelReason: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})

// ── Reviews ────────────────────────────────────────────────────────────────────────────────────

export const ReviewRequest = list({
  access: patientScoped(),
  ui: { labelField: 'id', listView: { initialColumns: ['patient', 'channel', 'status', 'createdAt'] } },
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    appointment: relationship({ ref: 'Appointment', ...readOnly }),
    channel: fixedChoice(['sms', 'email', 'link']),
    consentCheckedAt: timestamp({ ...readOnly }),
    consentGrant: relationship({ ref: 'ConsentGrant', ...readOnly }),
    copiedBy: relationship({ ref: 'User', ...readOnly }),
    status: lifecycle(['copied']),
    ...trackingFields,
  },
})

export const ReviewReply = list({
  access: scopedGoverned(['canReplyReviews'] as never, locationFilter()),
  ui: { labelField: 'reviewerName', listView: { initialColumns: ['reviewerName', 'rating', 'status', 'createdAt'] } },
  fields: {
    location: relationship({ ref: 'Location', ...readOnly }),
    platform: fixedChoice(['google', 'facebook', 'yelp', 'other']),
    reviewerName: systemText({ required: true }),
    rating: integer({ ...readOnly }),
    reviewText: systemText(),
    draft: systemText(),
    policyFindings: json({ defaultValue: [], ...readOnly }),
    status: lifecycle(REVIEW_REPLY_STATUSES, 'draft'),
    approvedBy: relationship({ ref: 'User', ...readOnly }),
    postedAt: timestamp({ ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

// ── Prescriptions, imaging ─────────────────────────────────────────────────────────────────────

export const PdmpCheck = list({
  access: patientScoped(['patient']),
  ui: { labelField: 'id' },
  fields: {
    prescription: relationship({ ref: 'Prescription', ...readOnly }),
    patient: relationship({ ref: 'Patient', ...readOnly }),
    checkedAt: timestamp({ ...readOnly }),
    checkedBy: relationship({ ref: 'User', ...readOnly }),
    result: fixedChoice(['reviewed_no_concern', 'reviewed_concern', 'not_required']),
    note: systemText(),
    evidenceDocument: relationship({ ref: 'Document', ...readOnly }),
    ...trackingFields,
  },
})

// ── Compliance ─────────────────────────────────────────────────────────────────────────────────

export const ComplianceTask = list({
  access: governed(COMPLIANCE),
  ui: { labelField: 'title', listView: { initialColumns: ['title', 'category', 'dueOn', 'status'], initialSort: { field: 'dueOn', direction: 'ASC' } } },
  fields: {
    title: systemText({ required: true }),
    category: fixedChoice(['training', 'risk_analysis', 'policy_review', 'credential', 'equipment', 'baa', 'other']),
    dueOn: calendarDay({ ...readOnly, isIndexed: true }),
    repeatMonths: integer({ ...readOnly }),
    owner: relationship({ ref: 'User', ...readOnly }),
    status: lifecycle(TASK_STATUSES),
    completedAt: timestamp({ ...readOnly }),
    completedBy: relationship({ ref: 'User', ...readOnly }),
    note: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})

export const IncidentReport = list({
  access: governed(COMPLIANCE),
  ui: { labelField: 'title', listView: { initialColumns: ['title', 'discoveredAt', 'affectedCount', 'status'] } },
  fields: {
    title: systemText({ required: true }),
    description: systemText(),
    discoveredAt: timestamp({ ...readOnly }),
    affectedCount: integer({ defaultValue: 0, ...readOnly }),
    riskAssessment: systemText(),
    status: lifecycle(INCIDENT_STATUSES),
    notifiedAt: timestamp({ ...readOnly }),
    reportedBy: relationship({ ref: 'User', ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const PatientRightsRequest = list({
  access: governed(COMPLIANCE),
  ui: { labelField: 'ref', listView: { initialColumns: ['ref', 'patient', 'kind', 'receivedOn', 'dueOn', 'status'] } },
  fields: {
    ref: systemText({ indexed: 'unique', required: true }),
    patient: relationship({ ref: 'Patient', ...readOnly }),
    kind: fixedChoice(RIGHTS_KINDS),
    receivedOn: calendarDay({ ...readOnly }),
    dueOn: calendarDay({ ...readOnly }),
    status: lifecycle(RIGHTS_STATUSES),
    extendedOnce: checkbox({ defaultValue: false, ...readOnly }),
    resolution: systemText(),
    resolvedAt: timestamp({ ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const AccountingOfDisclosure = list({
  access: governed(COMPLIANCE),
  ui: { labelField: 'recipient', listView: { initialColumns: ['patient', 'disclosedOn', 'recipient', 'purpose'] } },
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    disclosedOn: calendarDay({ ...readOnly }),
    recipient: systemText({ required: true }),
    purpose: systemText({ required: true }),
    description: systemText(),
    recordedBy: relationship({ ref: 'User', ...readOnly }),
    ...trackingFields,
  },
})

export const RetentionPolicy = list({
  access: governed(COMPLIANCE),
  ui: { labelField: 'recordType' },
  fields: {
    recordType: systemText({ indexed: 'unique', required: true }),
    years: integer({ validation: { isRequired: true, min: 1, max: 100 }, ...readOnly }),
    minorsUntilAge: integer({ ...readOnly }),
    isActive: checkbox({ defaultValue: true, ...readOnly }),
    ...trackingFields,
  },
})

export const RecordHold = list({
  access: governed(COMPLIANCE),
  ui: { labelField: 'reason', listView: { initialColumns: ['patient', 'reason', 'status', 'createdAt'] } },
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    reason: systemText({ required: true }),
    status: lifecycle(HOLD_STATUSES),
    placedBy: relationship({ ref: 'User', ...readOnly }),
    releasedAt: timestamp({ ...readOnly }),
    releaseReason: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})

export const RetentionDisposition = list({
  access: governed(COMPLIANCE),
  ui: { labelField: 'status', listView: { initialColumns: ['patient', 'eligibleOn', 'status', 'createdAt'] } },
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    eligibleOn: calendarDay({ ...readOnly }),
    status: lifecycle(DISPOSITION_STATUSES),
    approval: relationship({ ref: 'ApprovalRequest', ...readOnly }),
    blockedReason: systemText(),
    executedAt: timestamp({ ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

// ── Import and export ──────────────────────────────────────────────────────────────────────────

export const ImportBatch = list({
  access: governed(IMPORTERS),
  ui: { labelField: 'ref', listView: { initialColumns: ['ref', 'source', 'fileName', 'status', 'createdAt'], initialSort: { field: 'createdAt', direction: 'DESC' } } },
  fields: {
    ref: systemText({ indexed: 'unique', required: true }),
    source: fixedChoice(IMPORT_SOURCES),
    fileName: systemText(),
    fileSha256: systemText({ required: true }),
    location: relationship({ ref: 'Location', ...readOnly }),
    rows: json({ defaultValue: {}, ...readOnly }),
    preview: json({ defaultValue: {}, ...readOnly }),
    reconciliation: json({ defaultValue: {}, ...readOnly }),
    cursor: integer({ defaultValue: 0, ...readOnly }),
    status: lifecycle(IMPORT_BATCH_STATUSES),
    approval: relationship({ ref: 'ApprovalRequest', ...readOnly }),
    appliedAt: timestamp({ ...readOnly }),
    createdBy: relationship({ ref: 'User', ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const ImportRecordMap = list({
  access: governed(IMPORTERS),
  ui: { labelField: 'externalId' },
  fields: {
    batch: relationship({ ref: 'ImportBatch', ...readOnly }),
    source: systemText({ required: true }),
    entity: systemText({ required: true }),
    externalId: systemText({ required: true }),
    internalId: systemText({ required: true }),
    ...trackingFields,
  },
})

export const ExportJob = list({
  access: governed(IMPORTERS),
  ui: { labelField: 'ref', listView: { initialColumns: ['ref', 'kind', 'status', 'sha256', 'createdAt'], initialSort: { field: 'createdAt', direction: 'DESC' } } },
  fields: {
    ref: systemText({ indexed: 'unique', required: true }),
    kind: fixedChoice(['ehi_bundle', 'csv_journal', 'recall_list']),
    patient: relationship({ ref: 'Patient', ...readOnly }),
    status: lifecycle(['completed']),
    sha256: systemText(),
    byteCount: integer({ ...readOnly }),
    counts: json({ defaultValue: {}, ...readOnly }),
    requestedBy: relationship({ ref: 'User', ...readOnly }),
    ...trackingFields,
  },
})

export const CallRecord = list({
  access: patientScoped(),
  ui: { labelField: 'id' },
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    direction: fixedChoice(['inbound', 'outbound']),
    startedAt: timestamp({ ...readOnly }),
    durationSeconds: integer({ ...readOnly }),
    summary: systemText(),
    ...trackingFields,
  },
})

