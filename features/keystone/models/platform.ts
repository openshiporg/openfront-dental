import { list } from '@keystone-6/core'
import { denyAll } from '@keystone-6/core/access'
import { calendarDay, checkbox, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { anyOf, isSignedIn, permissions, sys } from '../access'
import { choice, fixedChoice, lifecycle, minor, readOnly, systemText, versionField } from './domainFields'
import { governed, immutable, managed, serverOnly } from './listAccess'
import { allOfficesOnly, approvalFilter, ownActionsOnly, scopedBy, scopedGoverned } from './scope'
import { trackingFields } from './trackingFields'

/*
 * Practice, access and platform spine (SCHEMA §1, §17, §18).
 * adapted from openfront-hedge-fund@48199d9 features/keystone/models/platform.ts
 */

// ── §1 Practice & access ──────────────────────────────────────────────────────────────────────────

export const PracticeSettings = list({
  isSingleton: true,
  graphql: { plural: 'PracticeSettingsItems' },
  access: { operation: { query: isSignedIn, create: permissions.canManagePractice, update: permissions.canManagePractice, delete: sys } },
  fields: {
    legalName: text({ validation: { isRequired: true }, defaultValue: 'Openfront Dental' }),
    displayName: text({ validation: { isRequired: true }, defaultValue: 'Openfront Dental' }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly, ui: { ...readOnly.ui, description: 'Sample practice: synthetic data. Synthetic records can never reach a live adapter.' } }),
    defaultTimeZone: text({ defaultValue: 'America/New_York', validation: { isRequired: true } }),
    currencyCode: text({ defaultValue: 'USD', validation: { isRequired: true, match: { regex: /^[A-Z]{3}$/ } } }),
    toothNumbering: choice(['universal', 'fdi', 'palmer'], 'universal'),
    scheduleUnitMinutes: integer({ defaultValue: 10, validation: { isRequired: true, min: 5, max: 15 } }),
    lateCancelHours: integer({ defaultValue: 24, validation: { min: 0, max: 168 } }),
    noShowAfterMinutes: integer({ defaultValue: 15, validation: { min: 1, max: 240 } }),
    inactiveAfterMonths: integer({ defaultValue: 18, validation: { min: 1, max: 120 } }),
    backdateDays: integer({ defaultValue: 3, validation: { min: 0, max: 60 } }),
    noteSignHours: integer({ defaultValue: 24, validation: { min: 1, max: 720 } }),
    mergeRevertDays: integer({ defaultValue: 30, validation: { min: 0, max: 365 } }),
    eligibilityCacheMinutes: integer({ defaultValue: 60, validation: { min: 0, max: 10_080 } }),
    creditReviewDays: integer({ defaultValue: 60, validation: { min: 1, max: 730 } }),
    minStatementMinor: minor({ defaultValue: 500n }),
    recallLeadDays: integer({ defaultValue: 30, validation: { min: 0, max: 180 } }),
    sessionHours: integer({ defaultValue: 12, validation: { min: 1, max: 24 }, ui: { description: 'Staff sessions end after this many hours; signing and money actions re-check the second factor.' } }),
    // Controls below change only through the maker-checker mutation requestPracticeControls.
    breakGlassMinutes: integer({ ...readOnly, defaultValue: 60 }),
    strictAgentOwnerSoD: checkbox({ ...readOnly, defaultValue: true }),
    aiAutonomyAllowed: checkbox({ ...readOnly, defaultValue: false }),
    requireStaffMfa: checkbox({ ...readOnly, defaultValue: true }),
    version: versionField(),
    ...trackingFields,
  },
})

export const Location = list({
  access: { operation: { query: isSignedIn, create: permissions.canManagePractice, update: permissions.canManagePractice, delete: sys } },
  ui: { labelField: 'name', listView: { initialColumns: ['code', 'name', 'timeZone', 'jurisdiction', 'isActive'] } },
  fields: {
    name: text({ validation: { isRequired: true } }),
    code: text({ isIndexed: 'unique', validation: { isRequired: true, match: { regex: /^[A-Z0-9]{2,8}$/, explanation: '2-8 capital letters or digits' } } }),
    address: json({ defaultValue: {} }),
    phone: text(),
    email: text(),
    timeZone: text({ defaultValue: 'America/New_York', validation: { isRequired: true } }),
    jurisdiction: relationship({ ref: 'JurisdictionPack.locations' }),
    npiType2: text({ ui: { description: 'Organisation NPI (10 digits, Luhn check with the 80840 prefix).' } }),
    taxonomyCode: text(),
    placeOfServiceCode: text({ defaultValue: '11' }),
    stateFacilityPermit: text(),
    hours: json({ defaultValue: {}, ui: { description: 'Weekday (0-6) → [["08:00","17:00"], …] local time.' } }),
    billingEntity: relationship({ ref: 'BillingEntity.locations' }),
    staff: relationship({ ref: 'StaffAssignment.location', many: true, ui: { itemView: { fieldMode: 'read' } } }),
    isActive: checkbox({ defaultValue: true }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})

export const BillingEntity = list({
  access: managed(['canManagePractice', 'canReadLedger'], 'canManagePractice'),
  ui: { labelField: 'legalName' },
  fields: {
    legalName: text({ validation: { isRequired: true } }),
    tinLast4: text({ validation: { match: { regex: /^(\d{4})?$/, explanation: 'Last four digits only' } } }),
    tinSecretId: text({ access: { read: denyAll, create: sys, update: sys }, ui: { itemView: { fieldMode: 'hidden' } } }),
    npiType2: text(),
    address: json({ defaultValue: {} }),
    payToAddress: json({ defaultValue: {} }),
    clearinghouseSubmitterIds: json({ defaultValue: {} }),
    locations: relationship({ ref: 'Location.billingEntity', many: true }),
    ...trackingFields,
  },
})

export const StaffAssignment = list({
  access: { operation: { query: isSignedIn, create: permissions.canManagePeople, update: permissions.canManagePeople, delete: sys } },
  ui: { listView: { initialColumns: ['user', 'location', 'role', 'startsOn', 'endsOn'] } },
  fields: {
    user: relationship({ ref: 'User.assignments' }),
    location: relationship({ ref: 'Location.staff' }),
    role: relationship({ ref: 'Role', ui: { description: 'Overrides the person’s default role at this location.' } }),
    startsOn: calendarDay({ validation: { isRequired: true } }),
    endsOn: calendarDay(),
    ...trackingFields,
  },
})

export const ProviderProfile = list({
  access: { operation: { query: isSignedIn, create: permissions.canManagePeople, update: permissions.canManagePeople, delete: sys } },
  ui: { labelField: 'displayName', listView: { initialColumns: ['displayName', 'providerType', 'specialty', 'npiType1', 'isActive'] } },
  fields: {
    user: relationship({ ref: 'User.providerProfile' }),
    displayName: text({ validation: { isRequired: true } }),
    abbreviation: text({ validation: { isRequired: true, match: { regex: /^[A-Z0-9]{2,6}$/, explanation: '2-6 capital letters' } }, isIndexed: 'unique' }),
    providerType: choice(['dentist', 'hygienist', 'assistant', 'specialist', 'other'], 'dentist'),
    specialty: choice(['general', 'pediatric', 'ortho', 'perio', 'endo', 'oral_surgery', 'prostho', 'other'], 'general'),
    npiType1: text({ isIndexed: 'unique', db: { isNullable: true }, validation: { isRequired: false } }),
    taxonomyCode: text(),
    credentials: relationship({ ref: 'Credential.holder', many: true }),
    payerProviderIds: json({ defaultValue: {} }),
    supervisionClass: text({ ui: { description: 'Jurisdiction pack vocabulary, e.g. dentist, rdh_general, eda_radiography.' } }),
    colour: text({ defaultValue: '#2563eb', validation: { match: { regex: /^#[0-9a-fA-F]{6}$/ } } }),
    productionCreditMode: choice(['rendering', 'primary_provider'], 'rendering'),
    isActive: checkbox({ defaultValue: true }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})

export const Credential = list({
  access: managed(['canManagePeople', 'canManageCompliance'], ['canManagePeople', 'canManageCompliance']),
  ui: { labelField: 'kind', listView: { initialColumns: ['holder', 'kind', 'jurisdiction', 'expiresOn', 'status'] } },
  fields: {
    holder: relationship({ ref: 'ProviderProfile.credentials' }),
    staffUser: relationship({ ref: 'User', ui: { description: 'For staff certificates without a provider profile.' } }),
    kind: choice(['dental_licence', 'hygiene_licence', 'da_radiography', 'dea', 'state_controlled_substance', 'cpr_bls', 'sedation_permit', 'other'], 'dental_licence'),
    jurisdiction: text({ defaultValue: 'US-FL' }),
    numberLast4: text({ ui: { description: 'Shown to staff. DEA numbers are stored sealed; this is the last four only.' } }),
    numberSecretId: text({ access: { read: denyAll, create: sys, update: sys }, ui: { itemView: { fieldMode: 'hidden' } } }),
    issuedOn: calendarDay(),
    expiresOn: calendarDay(),
    status: choice(['active', 'expired', 'suspended'], 'active'),
    evidence: relationship({ ref: 'Document' }),
    ...trackingFields,
  },
})

export const MachineCredential = list({
  access: governed('canManageAgents'),
  ui: { labelField: 'name' },
  fields: {
    name: systemText({ required: true }),
    agent: relationship({ ref: 'AgentIdentity', ...readOnly }),
    tokenDigest: text({ isIndexed: 'unique', validation: { isRequired: true }, access: { read: denyAll, create: sys, update: sys }, ui: { itemView: { fieldMode: 'hidden' } } }),
    tokenPrefix: systemText(),
    status: lifecycle(['active', 'revoked']),
    expiresAt: timestamp({ ...readOnly }),
    lastUsedAt: timestamp({ ...readOnly }),
    ...trackingFields,
  },
})

export const BreakGlassEvent = list({
  access: scopedGoverned(['canReviewPrivacy', 'canBreakGlass', 'canBreakGlassRecords'], scopedBy(ids => ({ location: { id: { in: ids } } }))),
  ui: { labelField: 'reason', listView: { initialColumns: ['user', 'subjectType', 'status', 'openedAt', 'expiresAt'] } },
  fields: {
    user: relationship({ ref: 'User', ...readOnly }),
    kind: fixedChoice(['location_scope', 'records_override']),
    subjectType: systemText({ required: true }),
    subjectId: systemText({ indexed: true, required: true }),
    location: relationship({ ref: 'Location', ...readOnly }),
    reason: systemText({ required: true }),
    openedAt: timestamp({ defaultValue: { kind: 'now' }, ...readOnly }),
    expiresAt: timestamp({ ...readOnly }),
    endedAt: timestamp({ ...readOnly }),
    status: lifecycle(['active', 'ended', 'reviewed_ok', 'reviewed_violation']),
    reviewedBy: relationship({ ref: 'User', ...readOnly }),
    reviewNote: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})

// ── §18 Platform ─────────────────────────────────────────────────────────────────────────────────

export const AuditEvent = list({
  // r2 N3: audit rows name any patient in any office (entityId, before/after). A reader limited to some offices sees only their own actions.
  access: scopedGoverned('canReadAudit', ownActionsOnly()),
  ui: { labelField: 'eventType', listView: { initialColumns: ['seq', 'at', 'eventType', 'entityType', 'entityId', 'actorUser'], initialSort: { field: 'seq', direction: 'DESC' } } },
  fields: {
    seq: integer({ isIndexed: 'unique', validation: { isRequired: true }, ...readOnly }),
    eventKey: systemText({ indexed: 'unique', required: true }),
    eventType: systemText({ indexed: true, required: true }),
    entityType: systemText({ indexed: true, required: true }),
    entityId: systemText({ indexed: true, required: true }),
    actorUser: relationship({ ref: 'User', ...readOnly }),
    actorAgent: relationship({ ref: 'AgentIdentity', ...readOnly }),
    approver: relationship({ ref: 'User', ...readOnly }),
    reason: systemText(),
    before: json({ ...readOnly }),
    after: json({ ...readOnly }),
    metadata: json({ ...readOnly }),
    requestId: systemText(),
    prevHash: systemText({ required: true }),
    hash: systemText({ indexed: 'unique', required: true }),
    at: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' }, ...readOnly }),
  },
})

export const CommandReceipt = list({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    command: text({ validation: { isRequired: true } }),
    principalKey: text({ validation: { isRequired: true } }),
    requestHash: text({ validation: { isRequired: true } }),
    requestParams: json(),
    responseCode: text(),
    responseBody: json(),
    recoveryPoint: text({ defaultValue: 'completed' }),
    completedAt: timestamp({ defaultValue: { kind: 'now' } }),
    ...trackingFields,
  },
})

export const OUTBOX_TOPICS = [
  'claim.submit', 'claim.status', 'eligibility.check', 'era.fetch', 'attachment.upload', 'message.send', 'payment.create', 'payment.refund',
  'erx.send', 'lab.send', 'review.reply', 'inference.call', 'webhook.out', 'audit.anchor', 'notify.approval', 'notify.staff', 'confirmation.dispatch',
] as const

export const InboundObservation = list({
  access: scopedGoverned('canManageAdapters', allOfficesOnly()),
  ui: { listView: { initialColumns: ['source', 'kind', 'externalId', 'receivedAt', 'appliedAt'] } },
  fields: {
    source: systemText({ indexed: true, required: true }),
    kind: fixedChoice(['webhook', 'poll', 'file', 'response']),
    externalId: systemText(),
    contentHash: systemText({ required: true }),
    raw: relationship({ ref: 'Document', ...readOnly }),
    rawSecretId: text({ access: { read: denyAll, create: sys, update: sys }, ui: { itemView: { fieldMode: 'hidden' } } }),
    receivedAt: timestamp({ defaultValue: { kind: 'now' }, ...readOnly }),
    appliedAt: timestamp({ ...readOnly }),
    applyResult: json({ ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})

export const Lease = list({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    key: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    owner: text({ validation: { isRequired: true } }),
    fencingToken: integer({ defaultValue: 1, validation: { isRequired: true } }),
    expiresAt: timestamp({ validation: { isRequired: true } }),
    ...trackingFields,
  },
})

/** Fixed-window counters for authentication attempts (security/rateLimit). Server only. */
export const RateLimitBucket = list({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    key: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    windowStart: timestamp({ validation: { isRequired: true } }),
    count: integer({ defaultValue: 0, validation: { isRequired: true } }),
    ...trackingFields,
  },
})

export const Job = list({
  access: governed(['canManagePractice', 'canManageAdapters']),
  fields: {
    kind: systemText({ indexed: 'unique', required: true }),
    intervalSeconds: integer({ ...readOnly }),
    nextRunAt: timestamp({ ...readOnly }),
    lastRunAt: timestamp({ ...readOnly }),
    status: lifecycle(['idle', 'running', 'failed', 'disabled'], 'idle'),
    leaseKey: systemText(),
    lastError: systemText(),
    ...trackingFields,
  },
})

export const Sequence = list({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    key: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    nextValue: integer({ defaultValue: 1, validation: { isRequired: true } }),
  },
})

export const Notification = list({
  access: {
    operation: { query: permissions.canAccessDashboard, create: sys, update: permissions.canAccessDashboard, delete: sys },
    filter: {
      query: ({ session }) => (session ? { recipient: { id: { equals: session.itemId } } } : false),
      update: ({ session }) => (session ? { recipient: { id: { equals: session.itemId } } } : false),
    },
  },
  fields: {
    recipient: relationship({ ref: 'User', ...readOnly }),
    channel: choice(['in_app', 'email'], 'in_app'),
    template: systemText({ required: true }),
    payload: json({ ...readOnly }),
    status: lifecycle(['pending', 'sent', 'failed']),
    sentAt: timestamp({ ...readOnly }),
    readAt: timestamp(),
    ...trackingFields,
  },
})

const approvalScope = (prefix: string[] = []) => approvalFilter(prefix)

export const ApprovalPolicy = list({
  access: { operation: { query: permissions.canAccessDashboard, create: permissions.canManagePractice, update: sys, delete: sys } },
  ui: { labelField: 'action' },
  fields: {
    action: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    description: text(),
    requiredPermission: text({ validation: { isRequired: true } }),
    minApprovals: integer({ defaultValue: 1, validation: { min: 1 } }),
    thresholdMinor: minor(),
    expiresAfterMinutes: integer({ defaultValue: 1440 }),
    ...trackingFields,
  },
})

export const ApprovalRequest = list({
  // Phase 4 r2 N4: an approval is about one office's money or one patient's record. A reader limited to some offices sees only the
  // requests whose office is theirs and whose patients and family account they can see; a practice-wide request (fee schedule, code
  // import, practice controls) names no office and is seen only by a reader with every office.
  access: scopedGoverned('canAccessDashboard', approvalScope()),
  ui: { labelField: 'action', listView: { initialColumns: ['action', 'status', 'targetList', 'requestedBy', 'createdAt', 'expiresAt'] } },
  fields: {
    action: systemText({ indexed: true, required: true }),
    summary: systemText(),
    targetList: systemText({ required: true }),
    targetId: systemText({ indexed: true, required: true }),
    payload: json({ ...readOnly }),
    payloadHash: systemText({ required: true }),
    requiredPermission: systemText({ required: true }),
    requestedBy: relationship({ ref: 'User', ...readOnly }),
    requestedByAgent: relationship({ ref: 'AgentIdentity', ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    patient: relationship({ ref: 'Patient', ...readOnly }),
    otherPatient: relationship({ ref: 'Patient', ...readOnly }),
    account: relationship({ ref: 'GuarantorAccount', ...readOnly }),
    status: lifecycle(['pending', 'approved', 'rejected', 'expired', 'cancelled']),
    expiresAt: timestamp({ ...readOnly }),
    consumedAt: timestamp({ ...readOnly, ui: { ...readOnly.ui, description: 'When the approved action was carried out. An approval is used once.' } }),
    decisions: relationship({ ref: 'ApprovalDecision.request', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const ApprovalDecision = list({
  access: scopedGoverned('canAccessDashboard', approvalScope(['request'])),
  fields: {
    request: relationship({ ref: 'ApprovalRequest.decisions', ...readOnly }),
    decidedBy: relationship({ ref: 'User', ...readOnly }),
    decision: select({ type: 'string', options: ['approve', 'reject'].map(value => ({ label: value, value })), validation: { isRequired: true }, ...readOnly }),
    reason: systemText(),
    at: timestamp({ defaultValue: { kind: 'now' }, ...readOnly }),
  },
})

export const Document = list({
  // r2 N3: a stored file (an EOB, a raw clearinghouse payload, a letter) can hold any office's PHI; only a reader with every office lists them.
  access: scopedGoverned('canAccessDashboard', allOfficesOnly()),
  fields: {
    title: text({ validation: { isRequired: true } }),
    kind: choice(['radiograph', 'photo', 'clinical_attachment', 'eob', 'era', 'claim_attachment', 'consent', 'form', 'id_card', 'insurance_card', 'statement', 'baa', 'credential', 'policy', 'export', 'import', 'transcript', 'recording', 'other'], 'other'),
    phiTier: choice(['none', 'dem', 'clin', 'sens', 'ins', 'fin'], 'none'),
    storageKey: systemText(),
    sha256: systemText(),
    mimeType: systemText(),
    sizeBytes: integer({ ...readOnly }),
    documentVersion: integer({ defaultValue: 1, ...readOnly }),
    supersedes: relationship({ ref: 'Document', ...readOnly }),
    uploadedBy: relationship({ ref: 'User', ...readOnly }),
    retentionUntil: calendarDay(),
    signedAt: timestamp({ ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})

export const SecretBox = list({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    purpose: text({ validation: { isRequired: true } }),
    ciphertext: text({ validation: { isRequired: true } }),
    iv: text({ validation: { isRequired: true } }),
    authTag: text({ validation: { isRequired: true } }),
    keyVersion: integer({ defaultValue: 1 }),
    ...trackingFields,
  },
})

export const ADAPTER_AREAS = [
  'clearinghouse', 'benefits', 'attachments', 'payments', 'financing', 'messaging', 'voice', 'inference', 'erx', 'imaging', 'radiograph_ai', 'lab', 'reviews', 'accounting', 'calendar', 'code_licence', 'import',
] as const

export const AdapterInstallation = list({
  access: governed(['canManageAdapters', 'canApproveAdapters', 'canManagePractice']),
  ui: { labelField: 'adapterKey', listView: { initialColumns: ['area', 'adapterKey', 'mode', 'status', 'lastVerifiedAt'] } },
  fields: {
    area: fixedChoice(ADAPTER_AREAS),
    adapterKey: systemText({ required: true }),
    displayName: systemText(),
    mode: select({ type: 'string', options: ['manual_export', 'sandbox', 'live'].map(value => ({ label: value.replace('_', ' '), value })), defaultValue: 'manual_export', ...readOnly }),
    status: lifecycle(['configured', 'sandbox_verified', 'live', 'suspended']),
    secret: relationship({ ref: 'SecretBox', access: { read: denyAll, create: sys, update: sys }, ui: { itemView: { fieldMode: 'hidden' } } }),
    config: json({ ...readOnly }),
    handlesPhi: checkbox({ defaultValue: true, ...readOnly }),
    baa: relationship({ ref: 'BusinessAssociate.adapterInstallations', ...readOnly }),
    lastVerifiedAt: timestamp({ ...readOnly }),
    verificationReceipt: json({ ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const BusinessAssociate = list({
  access: managed(['canManageCompliance', 'canManageAdapters', 'canManagePractice'], ['canManageCompliance', 'canManagePractice']),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'service', 'status', 'baaSignedOn', 'expiresOn'] } },
  fields: {
    name: text({ validation: { isRequired: true } }),
    service: choice(['clearinghouse', 'messaging', 'voice', 'inference', 'storage', 'payments', 'erx', 'imaging', 'hosting', 'other'], 'other'),
    baaSignedOn: calendarDay(),
    expiresOn: calendarDay(),
    baaDocument: relationship({ ref: 'Document' }),
    status: choice(['pending', 'active', 'expired', 'terminated'], 'pending'),
    adapterInstallations: relationship({ ref: 'AdapterInstallation.baa', many: true, ui: { itemView: { fieldMode: 'read' } } }),
    ...trackingFields,
  },
})

export const JurisdictionPack = list({
  access: { operation: { query: isSignedIn, create: sys, update: sys, delete: sys } },
  ui: { labelField: 'label', listView: { initialColumns: ['key', 'version', 'name', 'status', 'verifiedAt'] } },
  fields: {
    label: systemText({ indexed: 'unique', required: true }),
    key: systemText({ indexed: true, required: true }),
    version: systemText({ required: true }),
    name: systemText({ required: true }),
    rules: json({ ...readOnly }),
    sources: json({ ...readOnly }),
    verifiedBy: relationship({ ref: 'User', ...readOnly }),
    verifiedAt: timestamp({ ...readOnly }),
    status: lifecycle(['draft', 'active', 'superseded'], 'active'),
    locations: relationship({ ref: 'Location.jurisdiction', many: true, ...readOnly }),
    ...trackingFields,
  },
})

export const PhiReadAudit = list({
  access: scopedGoverned('canReadPhiAudit', ownActionsOnly()),
  ui: { labelField: 'operationName', listView: { initialColumns: ['at', 'actorUser', 'purpose', 'listKeys', 'recordCount', 'operationName'], initialSort: { field: 'at', direction: 'DESC' } } },
  fields: {
    actorUser: relationship({ ref: 'User', ...readOnly }),
    actorAgent: relationship({ ref: 'AgentIdentity', ...readOnly }),
    actorReference: systemText({ required: true }),
    purpose: select({ type: 'string', options: ['treatment', 'payment', 'operations', 'patient_request', 'break_glass', 'system'].map(value => ({ label: value.replace('_', ' '), value })), defaultValue: 'operations', ...readOnly }),
    operationType: systemText({ required: true }),
    operationName: systemText({ required: true }),
    listKeys: json({ ...readOnly }),
    tiers: json({ ...readOnly }),
    fields: json({ ...readOnly }),
    fieldSetDigest: systemText({ required: true }),
    recordCount: integer({ defaultValue: 0, ...readOnly }),
    recordIdsDigest: systemText(),
    resourceReferences: json({ ...readOnly, ui: { ...readOnly.ui, description: 'HMAC reference tokens, never ids or values.' } }),
    breakGlass: relationship({ ref: 'BreakGlassEvent', ...readOnly }),
    success: checkbox({ defaultValue: true, ...readOnly }),
    correlationReference: systemText(),
    at: timestamp({ defaultValue: { kind: 'now' }, validation: { isRequired: true }, ...readOnly }),
  },
})

export const InferenceProvider = list({
  access: governed(['canManageAgents', 'canManageAdapters']),
  ui: { labelField: 'key', listView: { initialColumns: ['key', 'kind', 'model', 'isActive', 'retainsPrompts'] } },
  fields: {
    key: systemText({ indexed: 'unique', required: true }),
    kind: fixedChoice(['self_hosted', 'baa_hosted', 'no_phi']),
    endpoint: systemText(),
    model: systemText(),
    secret: relationship({ ref: 'SecretBox', access: { read: denyAll, create: sys, update: sys }, ui: { itemView: { fieldMode: 'hidden' } } }),
    baa: relationship({ ref: 'BusinessAssociate', ...readOnly }),
    retainsPrompts: checkbox({ defaultValue: false, ...readOnly }),
    isActive: checkbox({ defaultValue: true, ...readOnly }),
    ...trackingFields,
  },
})
