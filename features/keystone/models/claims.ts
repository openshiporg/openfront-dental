import { list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { fixedChoice, lifecycle, minor, readOnly, systemText, versionField } from './domainFields'
import { governed } from './listAccess'
import { MONEY, moneyFilter, remittanceFilter, scopedGoverned, under } from './scope'
import { trackingFields } from './trackingFields'

/*
 * Claims and remittance (SCHEMA §9; STATE-MACHINES §7). Money is BIGINT minor units. Every status moves through a
 * command; the generated create/update operations are closed. The database backs the rules that matter
 * (migration 20261109220000_dental_phase4_claims): a claim past `ready` has a frozen version, a remittance
 * line's conservation flag must be true to the arithmetic, a remittance posts once, a duplicate trace number
 * cannot post, and the frozen versions, scrub results and acknowledgements can't be edited.
 */

export const CLAIM_KINDS = ['original', 'predetermination', 'secondary', 'tertiary'] as const
export const CLAIM_STATUSES = ['draft', 'scrubbed', 'ready', 'released', 'submitted', 'submission_unknown', 'acknowledged', 'rejected', 'pending_payer', 'adjudicated', 'correction_required', 'void_requested', 'voided', 'appealed', 'appeal_decided', 'responded', 'closed'] as const
export const CLAIM_OUTCOMES = ['paid', 'partially_paid', 'denied', 'zero_applied_to_deductible'] as const
export const CLAIM_LINE_STATUSES = ['pending', 'paid', 'partially_paid', 'denied', 'reversed'] as const
export const CLAIM_FREQUENCIES = ['original', 'replacement', 'void'] as const
export const SCRUB_RULE_KINDS = ['attachment_required', 'narrative_required', 'tooth_required', 'surface_required', 'crosswalk_required', 'enrollment_required', 'timely_filing', 'duplicate', 'coverage_active', 'primary_first'] as const
export const SCRUB_SEVERITIES = ['blocking', 'warning'] as const
export const ATTACHMENT_KINDS = ['radiograph', 'perio_chart', 'narrative', 'photo', 'eob_primary', 'other'] as const
export const ATTACHMENT_ROUTES = ['with_claim', 'stedi_attachment', 'nea', 'hipaa_275', 'manual_reference'] as const
export const ATTACHMENT_STATUSES = ['draft', 'uploaded', 'sent', 'acknowledged', 'rejected', 'manual_reference'] as const
export const ACK_SOURCES = ['clearinghouse', 'payer'] as const
export const ACK_OUTCOMES = ['accepted', 'rejected'] as const
export const INQUIRY_STATUSES = ['queued', 'sent', 'responded', 'error', 'unknown'] as const
export const REMITTANCE_SOURCES = ['era_835', 'manual_eob'] as const
export const PAYMENT_METHODS = ['eft', 'check', 'virtual_card', 'none'] as const
export const REMITTANCE_STATUSES = ['received', 'parsed', 'matched', 'posting', 'posted', 'reconciled', 'exception', 'duplicate'] as const
export const POSTED_COMPLETENESS = ['', 'partial', 'complete'] as const
export const POSTING_STATUSES = ['posted', 'reversed'] as const
export const POSTING_KINDS = ['payment', 'takeback'] as const
export const POSTING_LEVELS = ['primary', 'secondary', 'tertiary'] as const
export const DENIAL_CLASSES = ['frequency', 'eligibility', 'attachment', 'coding', 'timely_filing', 'coordination', 'non_covered', 'duplicate', 'other'] as const
export const DENIAL_STATUSES = ['open', 'working', 'appealed', 'corrected', 'written_off', 'billed_to_patient', 'resolved'] as const
export const APPEAL_VIA = ['mail', 'portal', 'fax', 'clearinghouse'] as const
export const APPEAL_OUTCOMES = ['pending', 'overturned', 'upheld'] as const
export const ENROLLMENT_TRANSACTIONS = ['claims', 'era', 'eligibility', 'claim_status', 'attachments'] as const
export const ENROLLMENT_STATUSES = ['draft', 'submitted', 'in_progress', 'provisioning', 'live', 'rejected', 'canceled'] as const

const CLAIM_READ = ['canReadInsurance', 'canManageClaims', 'canSubmitClaims', 'canPostRemittances', 'canReadLedger'] as never
const claimScoped = () => scopedGoverned(CLAIM_READ, moneyFilter(MONEY.claim))
const childScoped = () => scopedGoverned(CLAIM_READ, moneyFilter(under(['claim'], MONEY.claim)))

export const ScrubRule = list({
  access: governed(CLAIM_READ),
  ui: { labelField: 'key', listView: { initialColumns: ['key', 'kind', 'severity', 'isActive', 'rulesetVersion'] } },
  fields: {
    key: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    kind: fixedChoice(SCRUB_RULE_KINDS),
    appliesTo: json({ defaultValue: {}, ...readOnly }),
    severity: fixedChoice(SCRUB_SEVERITIES),
    message: systemText({ required: true }),
    isActive: checkbox({ defaultValue: true, ...readOnly }),
    rulesetVersion: systemText({ required: true }),
    ...trackingFields,
  },
})

export const Claim = list({
  access: claimScoped(),
  ui: { labelField: 'ref', listView: { initialColumns: ['ref', 'kind', 'patient', 'status', 'totalChargeMinor', 'timelyFilingDeadline'], initialSort: { field: 'createdAt', direction: 'DESC' } } },
  fields: {
    ref: text({ isIndexed: 'unique', validation: { isRequired: true }, ...readOnly }),
    kind: fixedChoice(CLAIM_KINDS),
    patient: relationship({ ref: 'Patient', ...readOnly }),
    coverage: relationship({ ref: 'Coverage', ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    billingEntity: relationship({ ref: 'BillingEntity', ...readOnly }),
    renderingProvider: relationship({ ref: 'ProviderProfile', ...readOnly }),
    placeOfServiceCode: systemText(),
    status: lifecycle(CLAIM_STATUSES),
    adjudicationOutcome: systemText(),
    currentVersion: relationship({ ref: 'ClaimVersion', ...readOnly }),
    versions: relationship({ ref: 'ClaimVersion.claim', many: true, ...readOnly }),
    lines: relationship({ ref: 'ClaimLine.claim', many: true, ...readOnly }),
    attachments: relationship({ ref: 'ClaimAttachment.claim', many: true, ...readOnly }),
    scrubResults: relationship({ ref: 'ClaimScrubResult.claim', many: true, ...readOnly }),
    acknowledgements: relationship({ ref: 'ClaimAcknowledgement.claim', many: true, ...readOnly }),
    payerClaimControlNumber: systemText(),
    patientControlNumber: text({ isIndexed: 'unique', validation: { isRequired: true }, ...readOnly }),
    clearinghouseRefs: json({ defaultValue: {}, ...readOnly }),
    totalChargeMinor: minor({ defaultValue: 0n }),
    timelyFilingDeadline: calendarDay({ ...readOnly }),
    submittedAt: timestamp({ ...readOnly }),
    adjudicatedAt: timestamp({ ...readOnly }),
    recouped: checkbox({ defaultValue: false, ...readOnly }),
    primaryClaim: relationship({ ref: 'Claim', ...readOnly }),
    primaryAdjudicationSnapshot: json({ defaultValue: {}, ...readOnly }),
    narrative: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})

export const ClaimVersion = list({
  access: childScoped(),
  ui: { labelField: 'number', listView: { initialColumns: ['claim', 'number', 'frequency', 'releasedAt'] } },
  fields: {
    claim: relationship({ ref: 'Claim.versions', ...readOnly }),
    number: integer({ validation: { isRequired: true }, access: { create: () => false, update: () => false } }),
    frequency: fixedChoice(CLAIM_FREQUENCIES),
    /** Our canonical claim: no member ID, only its last four digits. The full request is sealed. */
    payload: json({ defaultValue: {}, ...readOnly }),
    payloadHash: systemText({ required: true }),
    idempotencyKey: systemText(),
    releasedBy: relationship({ ref: 'User', ...readOnly }),
    releasedAt: timestamp({ ...readOnly }),
    ...trackingFields,
  },
})

export const ClaimLine = list({
  access: childScoped(),
  ui: { labelField: 'lineControlNumber', listView: { initialColumns: ['claim', 'code', 'tooth', 'dateOfService', 'feeMinor', 'paidMinor', 'status'] } },
  fields: {
    claim: relationship({ ref: 'Claim.lines', ...readOnly }),
    chartEntry: relationship({ ref: 'ChartEntry', ...readOnly }),
    code: relationship({ ref: 'ProcedureCode', ...readOnly }),
    localCode: relationship({ ref: 'ProcedureCode', ...readOnly }),
    tooth: systemText(),
    surfaces: systemText(),
    dateOfService: calendarDay({ ...readOnly }),
    units: integer({ defaultValue: 1, validation: { isRequired: true }, access: { create: () => false, update: () => false } }),
    feeMinor: minor({ defaultValue: 0n }),
    allowedMinor: minor({ defaultValue: 0n }),
    paidMinor: minor({ defaultValue: 0n }),
    patientRespMinor: minor({ defaultValue: 0n }),
    lineControlNumber: systemText({ required: true }),
    status: lifecycle(CLAIM_LINE_STATUSES),
    version: versionField(),
    ...trackingFields,
  },
})

export const ClaimAttachment = list({
  access: childScoped(),
  ui: { labelField: 'kind', listView: { initialColumns: ['claim', 'kind', 'route', 'status'] } },
  fields: {
    claim: relationship({ ref: 'Claim.attachments', ...readOnly }),
    kind: fixedChoice(ATTACHMENT_KINDS),
    route: fixedChoice(ATTACHMENT_ROUTES),
    description: systemText(),
    externalAttachmentId: systemText(),
    trackingNumber: systemText(),
    status: lifecycle(ATTACHMENT_STATUSES),
    version: versionField(),
    ...trackingFields,
  },
})

export const ClaimScrubResult = list({
  access: childScoped(),
  ui: { labelField: 'rulesetVersion', listView: { initialColumns: ['claim', 'versionNumber', 'rulesetVersion', 'ranAt'] } },
  fields: {
    claim: relationship({ ref: 'Claim.scrubResults', ...readOnly }),
    versionNumber: integer({ defaultValue: 0, validation: { isRequired: true }, access: { create: () => false, update: () => false } }),
    rulesetVersion: systemText({ required: true }),
    ranAt: timestamp({ ...readOnly }),
    findings: json({ defaultValue: [], ...readOnly }),
    ...trackingFields,
  },
})

export const ClaimAcknowledgement = list({
  access: childScoped(),
  ui: { labelField: 'senderName', listView: { initialColumns: ['claim', 'source', 'senderName', 'outcome', 'at'] } },
  fields: {
    claim: relationship({ ref: 'Claim.acknowledgements', ...readOnly }),
    versionNumber: integer({ defaultValue: 0, validation: { isRequired: true }, access: { create: () => false, update: () => false } }),
    source: fixedChoice(ACK_SOURCES),
    senderName: systemText(),
    outcome: fixedChoice(ACK_OUTCOMES),
    statusCodes: json({ defaultValue: [], ...readOnly }),
    errors: json({ defaultValue: [], ...readOnly }),
    observation: relationship({ ref: 'InboundObservation', ...readOnly }),
    at: timestamp({ ...readOnly }),
    ...trackingFields,
  },
})

export const ClaimStatusInquiry = list({
  access: childScoped(),
  ui: { labelField: 'status', listView: { initialColumns: ['claim', 'status', 'createdAt'] } },
  fields: {
    claim: relationship({ ref: 'Claim', ...readOnly }),
    status: lifecycle(INQUIRY_STATUSES),
    responseSummary: json({ defaultValue: {}, ...readOnly }),
    observation: relationship({ ref: 'InboundObservation', ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const Remittance = list({
  access: scopedGoverned(CLAIM_READ, remittanceFilter()),
  ui: { labelField: 'ref', listView: { initialColumns: ['ref', 'payer', 'traceNumber', 'paymentDate', 'totalPaidMinor', 'status'], initialSort: { field: 'createdAt', direction: 'DESC' } } },
  fields: {
    ref: text({ isIndexed: 'unique', validation: { isRequired: true }, ...readOnly }),
    payer: relationship({ ref: 'Payer', ...readOnly }),
    source: fixedChoice(REMITTANCE_SOURCES),
    adapterKey: systemText(),
    traceNumber: systemText({ required: true }),
    paymentMethod: fixedChoice(PAYMENT_METHODS),
    paymentDate: calendarDay({ ...readOnly }),
    totalPaidMinor: minor({ defaultValue: 0n }),
    status: lifecycle(REMITTANCE_STATUSES),
    postedCompleteness: systemText(),
    exceptionNote: systemText(),
    duplicateOf: relationship({ ref: 'Remittance', ...readOnly }),
    observation: relationship({ ref: 'InboundObservation', ...readOnly }),
    providerAdjustments: json({ defaultValue: [], ...readOnly }),
    claims: relationship({ ref: 'RemittanceClaim.remittance', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const RemittanceClaim = list({
  access: childScoped(),
  ui: { labelField: 'patientControlNumber', listView: { initialColumns: ['remittance', 'patientControlNumber', 'claimStatusCode', 'chargeMinor', 'paidMinor'] } },
  fields: {
    remittance: relationship({ ref: 'Remittance.claims', ...readOnly }),
    claim: relationship({ ref: 'Claim', ...readOnly }),
    patientControlNumber: systemText(),
    payerClaimControlNumber: systemText(),
    claimStatusCode: systemText(),
    chargeMinor: minor({ defaultValue: 0n }),
    paidMinor: minor({ defaultValue: 0n }),
    patientRespMinor: minor({ defaultValue: 0n }),
    crossoverCarrier: json({ defaultValue: {}, ...readOnly }),
    lines: relationship({ ref: 'RemittanceLine.remittanceClaim', many: true, ...readOnly }),
    ...trackingFields,
  },
})

export const RemittanceLine = list({
  access: scopedGoverned(CLAIM_READ, moneyFilter(under(['remittanceClaim', 'claim'], MONEY.claim))),
  ui: { labelField: 'code', listView: { initialColumns: ['remittanceClaim', 'code', 'dateOfService', 'chargeMinor', 'paidMinor', 'conservationOk'] } },
  fields: {
    remittanceClaim: relationship({ ref: 'RemittanceClaim.lines', ...readOnly }),
    claimLine: relationship({ ref: 'ClaimLine', ...readOnly }),
    code: systemText(),
    tooth: systemText(),
    dateOfService: calendarDay({ ...readOnly }),
    lineControlNumber: systemText(),
    chargeMinor: minor({ defaultValue: 0n }),
    allowedMinor: minor({ defaultValue: 0n }),
    paidMinor: minor({ defaultValue: 0n }),
    /** Signed sum of every adjustment on the line (payer-reduces-payment positive). The database checks charge = paid + this. */
    adjustmentsTotalMinor: minor({ defaultValue: 0n }),
    adjustments: json({ defaultValue: [], ...readOnly }),
    rarc: json({ defaultValue: [], ...readOnly }),
    conservationOk: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})

export const PaymentPosting = list({
  access: scopedGoverned(CLAIM_READ, moneyFilter(under(['remittanceClaim', 'claim'], MONEY.claim))),
  ui: { labelField: 'status', listView: { initialColumns: ['remittance', 'status', 'at'] } },
  fields: {
    remittance: relationship({ ref: 'Remittance', ...readOnly }),
    remittanceClaim: relationship({ ref: 'RemittanceClaim', ...readOnly }),
    claim: relationship({ ref: 'Claim', ...readOnly }),
    payer: relationship({ ref: 'Payer', ...readOnly }),
    kind: fixedChoice(POSTING_KINDS, 'payment'),
    coverageLevel: fixedChoice(POSTING_LEVELS, 'primary'),
    paidMinor: minor({ defaultValue: 0n, description: 'What this posting paid, or (for a takeback) what it took back. Always zero or more.' }),
    round: text({ defaultValue: '', ...readOnly, ui: { ...readOnly.ui, description: 'Which adjudication this paid: the claim version sent and how many appeals came before (v1/a0).' } }),
    postedBy: relationship({ ref: 'User', ...readOnly }),
    at: timestamp({ ...readOnly }),
    status: lifecycle(POSTING_STATUSES),
    entries: relationship({ ref: 'LedgerEntry.paymentPosting', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const DenialReasonMap = list({
  access: governed(CLAIM_READ),
  ui: { labelField: 'carc', listView: { initialColumns: ['carc', 'rarc', 'preventableClass', 'suggestedAction'] } },
  fields: {
    carc: systemText({ required: true }),
    rarc: systemText(),
    preventableClass: fixedChoice(DENIAL_CLASSES),
    suggestedAction: systemText(),
    ...trackingFields,
  },
})

export const Denial = list({
  access: childScoped(),
  ui: { labelField: 'carc', listView: { initialColumns: ['claim', 'carc', 'preventableClass', 'status', 'amountMinor', 'createdAt'] } },
  fields: {
    claim: relationship({ ref: 'Claim', ...readOnly }),
    claimLine: relationship({ ref: 'ClaimLine', ...readOnly }),
    remittanceLine: relationship({ ref: 'RemittanceLine', ...readOnly }),
    carc: systemText({ required: true }),
    rarc: json({ defaultValue: [], ...readOnly }),
    preventableClass: fixedChoice(DENIAL_CLASSES),
    status: lifecycle(DENIAL_STATUSES),
    assignedTo: relationship({ ref: 'User', ...readOnly }),
    amountMinor: minor({ defaultValue: 0n }),
    resolutionNote: systemText(),
    appeals: relationship({ ref: 'Appeal.denial', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const Appeal = list({
  access: scopedGoverned(CLAIM_READ, moneyFilter(under(['denial', 'claim'], MONEY.claim))),
  ui: { labelField: 'level', listView: { initialColumns: ['denial', 'level', 'submittedVia', 'outcome', 'submittedAt'] } },
  fields: {
    denial: relationship({ ref: 'Denial.appeals', ...readOnly }),
    level: integer({ defaultValue: 1, validation: { isRequired: true }, access: { create: () => false, update: () => false } }),
    letter: systemText(),
    submittedVia: fixedChoice(APPEAL_VIA),
    submittedAt: timestamp({ ...readOnly }),
    outcome: lifecycle(APPEAL_OUTCOMES),
    decidedAt: timestamp({ ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const PayerEnrollment = list({
  access: governed(CLAIM_READ),
  ui: { labelField: 'transaction', listView: { initialColumns: ['payer', 'transaction', 'status', 'adapterKey'] } },
  fields: {
    billingEntity: relationship({ ref: 'BillingEntity', ...readOnly }),
    provider: relationship({ ref: 'ProviderProfile', ...readOnly }),
    payer: relationship({ ref: 'Payer', ...readOnly }),
    adapterKey: systemText(),
    transaction: fixedChoice(ENROLLMENT_TRANSACTIONS),
    status: lifecycle(ENROLLMENT_STATUSES),
    externalId: systemText(),
    notes: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})
