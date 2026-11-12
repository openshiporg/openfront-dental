import { list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { hasPermission } from '../access'
import { fixedChoice, lifecycle, readOnly, systemText, versionField } from './domainFields'
import { governed } from './listAccess'
import { allOfficesOnly, locationFilter, patientFilter, scopedBy, scopedGoverned, visiblePatient } from './scope'
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
/** Compliance rows about one patient follow that patient's offices (r1 B4). */
const compliancePatient = () => scopedGoverned(COMPLIANCE, patientFilter(['patient']))

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
  // Controlled-substance history: prescribers and clinical staff see that a check was done; only a prescriber reads what it found (r1 B3).
  access: scopedGoverned(['canPrescribe', 'canReadClinical'] as never, patientFilter(['patient'])),
  ui: { labelField: 'id' },
  fields: {
    prescription: relationship({ ref: 'Prescription', ...readOnly }),
    patient: relationship({ ref: 'Patient', ...readOnly }),
    checkedAt: timestamp({ ...readOnly }),
    checkedBy: relationship({ ref: 'User', ...readOnly }),
    result: fixedChoice(['reviewed_no_concern', 'reviewed_concern', 'not_required']),
    note: text({
      access: { read: ({ session }) => hasPermission(session, 'canPrescribe'), create: () => false, update: () => false },
      ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } },
    }),
    evidenceDocument: relationship({ ref: 'Document', ...readOnly }),
    ...trackingFields,
  },
})

// ── Compliance ─────────────────────────────────────────────────────────────────────────────────

export const ComplianceTask = list({
  // Practice-wide, with free-text notes that may name a patient: only a reader with every office (r1 B4).
  access: scopedGoverned(COMPLIANCE, allOfficesOnly()),
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
  // An incident can describe any office's patients and names no office of its own: only a reader with every office.
  access: scopedGoverned(COMPLIANCE, allOfficesOnly()),
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
  access: compliancePatient(),
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
  access: compliancePatient(),
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
  access: compliancePatient(),
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
  access: compliancePatient(),
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
  access: scopedGoverned(IMPORTERS, locationFilter()),
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
  access: scopedGoverned(IMPORTERS, locationFilter(['batch', 'location'])),
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
  // A patient's export follows the patient; a practice-wide export (journal, recall list) only a reader with every office.
  access: scopedGoverned(IMPORTERS, scopedBy(ids => ({ patient: visiblePatient(ids) }))),
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

// ── Phase 7: the voice receptionist (behind telephony adapters) ─────────────────────────────────

export const CALL_ADAPTERS = ['manual', 'simulated'] as const
export const CALL_OUTCOMES = [
  'logged', 'answered', 'appointment_requested', 'confirmation_requested', 'message_taken', 'handed_off', 'no_answer', 'voicemail', 'wrong_number', 'declined', 'refused', 'other',
] as const

/** A call is office-scoped twice: its office must be mine, and a caller who is a known patient must be visible to me. A caller nobody identified shows at the office that took the call. */
const callScope = () => scopedBy(ids => ({ location: { id: { in: ids } }, OR: [{ patient: null }, { patient: visiblePatient(ids) }] }))

/**
 * Calls are PHI: the transcript, notes, caller number and recording reference are tiered in security/phiFields.ts and
 * office-scoped here. Every row is written by a command (a staff log or a simulation); the generated create/update/delete are closed.
 */
/** Who reads calls: the people who run the front desk. A call's words are not a clinical record, so a role that only charts does not read them. */
export const CALL_READERS = ['canManageSchedule', 'canMessagePatients'] as const

export const CallRecord = list({
  access: scopedGoverned([...CALL_READERS] as never, callScope()),
  ui: { labelField: 'ref', listView: { initialColumns: ['ref', 'direction', 'adapter', 'outcome', 'startedAt'], initialSort: { field: 'startedAt', direction: 'DESC' } } },
  fields: {
    ref: systemText({ indexed: true }),
    patient: relationship({ ref: 'Patient', ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    direction: fixedChoice(['inbound', 'outbound']),
    adapter: fixedChoice(CALL_ADAPTERS, 'manual'),
    outcome: fixedChoice(CALL_OUTCOMES, 'logged'),
    scenario: systemText(),
    startedAt: timestamp({ ...readOnly }),
    durationSeconds: integer({ ...readOnly }),
    summary: systemText(),
    notes: systemText(),
    callerNumber: systemText(),
    transcript: json({ defaultValue: [], ...readOnly }),
    toolCalls: json({ defaultValue: [], ...readOnly }),
    disclosedAt: timestamp({ ...readOnly }),
    recordingConsent: checkbox({ defaultValue: false, ...readOnly }),
    recordingRef: systemText(),
    recordingBasis: systemText(),
    agentRun: relationship({ ref: 'AgentRun', ...readOnly }),
    handoffReason: systemText(),
    followedUpAt: timestamp({ ...readOnly }),
    followedUpBy: relationship({ ref: 'User', ...readOnly }),
    loggedBy: relationship({ ref: 'User', ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

/** One row per location, written only by the owner's command. No row means voice is off. */
export const VoicePolicy = list({
  access: scopedGoverned([...CALL_READERS, 'canApproveAutonomy'] as never, locationFilter(['location'])),
  ui: { labelField: 'id', listView: { initialColumns: ['location', 'enabled', 'recordCalls', 'changedAt'] } },
  fields: {
    location: relationship({ ref: 'Location', ...readOnly }),
    enabled: checkbox({ defaultValue: false, ...readOnly }),
    recordCalls: checkbox({ defaultValue: false, ...readOnly }),
    changedBy: relationship({ ref: 'User', ...readOnly }),
    changedAt: timestamp({ ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

