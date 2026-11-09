import { list } from '@keystone-6/core'
import { checkbox, integer, json, relationship, text, timestamp, calendarDay } from '@keystone-6/core/fields'
import { fixedChoice, lifecycle, minor, readOnly, systemText, versionField } from './domainFields'
import { governed } from './listAccess'
import { trackingFields } from './trackingFields'

/*
 * Procedure catalogue, fees and the patient ledger's charge rows (SCHEMA §7, §10.1–§10.2; DOMAIN I-C1,
 * I-L1). The app ships only practice-authored `OF-` codes. CDT arrives through CodeImportBatch under
 * the practice's own licence (INTEGRATIONS §11); licensed text never leaves the database through
 * public or portal APIs.
 */

export const CODE_CATEGORIES = ['diagnostic', 'preventive', 'restorative', 'endodontics', 'periodontics', 'prosth_removable', 'maxillofacial', 'implant', 'prosth_fixed', 'oral_surgery', 'orthodontics', 'adjunctive', 'other'] as const
export const AREA_RULES = ['none', 'tooth', 'tooth_surface', 'quadrant', 'arch', 'mouth', 'sextant'] as const
export const IMPORT_STATUSES = ['uploaded', 'validated', 'attested', 'active', 'superseded', 'rejected'] as const
export const LICENCE_TYPES = ['practice_end_user', 'vendor_licence', 'hosted_licence_adapter'] as const
export const FEE_KINDS = ['office_ucr', 'ppo', 'medicaid', 'membership', 'sliding', 'dhmo_copay'] as const


export const CodeSystem = list({
  access: governed('signedIn'),
  ui: { labelField: 'key', listView: { initialColumns: ['key', 'name', 'isLicensed', 'activeImport'] } },
  fields: {
    key: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    name: systemText({ required: true }),
    isLicensed: checkbox({ defaultValue: false, ...readOnly }),
    activeImport: relationship({ ref: 'CodeImportBatch', ...readOnly }),
    ...trackingFields,
  },
})

export const CodeImportBatch = list({
  access: governed(['canImportCodes', 'canApproveCodeImport']),
  ui: { labelField: 'label', listView: { initialColumns: ['label', 'editionYear', 'rowCount', 'status', 'attestedAt'] } },
  fields: {
    label: systemText({ required: true }),
    codeSystem: relationship({ ref: 'CodeSystem', ...readOnly }),
    editionYear: integer({ ...readOnly }),
    fileName: systemText(),
    fileSha256: systemText(),
    rows: json({ defaultValue: [], ...readOnly, ui: { ...readOnly.ui, description: 'Rows as uploaded, held until the batch is activated. Licensed text stays in the database.' } }),
    columnMap: json({ defaultValue: {}, ...readOnly }),
    rowCount: integer({ defaultValue: 0, ...readOnly }),
    validationReport: json({ defaultValue: {}, ...readOnly }),
    attestation: json({ defaultValue: {}, ...readOnly }),
    attestedBy: relationship({ ref: 'User', ...readOnly }),
    attestedAt: timestamp({ ...readOnly }),
    status: lifecycle(IMPORT_STATUSES),
    approval: relationship({ ref: 'ApprovalRequest', ...readOnly }),
    uploadedBy: relationship({ ref: 'User', ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const ProcedureCode = list({
  access: governed(['canReadClinical', 'canChart', 'canManageFees', 'canImportCodes', 'canManageTreatmentPlans', 'canReadSchedule']),
  ui: { labelField: 'code', listView: { initialColumns: ['code', 'patientFriendlyName', 'category', 'areaRule', 'effectiveFrom'], initialSort: { field: 'code', direction: 'ASC' } } },
  fields: {
    codeSystem: relationship({ ref: 'CodeSystem', ...readOnly }),
    code: systemText({ required: true, indexed: true }),
    nomenclature: systemText(),
    patientFriendlyName: systemText(),
    category: fixedChoice(CODE_CATEGORIES),
    estimatingCategory: systemText(),
    areaRule: fixedChoice(AREA_RULES),
    requiresSurfaces: checkbox({ defaultValue: false, ...readOnly }),
    maxSurfaces: integer({ ...readOnly }),
    isLabMade: checkbox({ defaultValue: false, ...readOnly }),
    isPreventiveRecallTrigger: checkbox({ defaultValue: false, ...readOnly }),
    defaultUnitsMinutes: integer({ ...readOnly }),
    effectiveFrom: calendarDay({ ...readOnly }),
    effectiveTo: calendarDay({ ...readOnly }),
    importBatch: relationship({ ref: 'CodeImportBatch', ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})

export const ProcedureCodeCrosswalk = list({
  access: governed(['canImportCodes', 'canManageFees', 'canChart']),
  fields: {
    localCode: relationship({ ref: 'ProcedureCode', ...readOnly }),
    targetCode: relationship({ ref: 'ProcedureCode', ...readOnly }),
    status: lifecycle(['proposed', 'confirmed', 'rejected']),
    proposedBasis: systemText(),
    createdBy: relationship({ ref: 'User', ...readOnly }),
    confirmedBy: relationship({ ref: 'User', ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const FeeSchedule = list({
  access: governed(['canManageFees', 'canChart', 'canReadSchedule', 'canManageTreatmentPlans']),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'kind', 'isDefault'] } },
  fields: {
    name: systemText({ required: true }),
    kind: fixedChoice(FEE_KINDS),
    isDefault: checkbox({ defaultValue: false, ...readOnly }),
    versions: relationship({ ref: 'FeeScheduleVersion.schedule', many: true, ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})

export const FeeScheduleVersion = list({
  access: governed(['canManageFees', 'canChart', 'canReadSchedule', 'canManageTreatmentPlans']),
  ui: { labelField: 'label', listView: { initialColumns: ['label', 'schedule', 'effectiveFrom', 'status'] } },
  fields: {
    label: systemText({ required: true }),
    schedule: relationship({ ref: 'FeeSchedule.versions', ...readOnly }),
    effectiveFrom: calendarDay({ ...readOnly }),
    effectiveTo: calendarDay({ ...readOnly }),
    status: lifecycle(['draft', 'published', 'retired']),
    publishedBy: relationship({ ref: 'User', ...readOnly }),
    publishedAt: timestamp({ ...readOnly }),
    approval: relationship({ ref: 'ApprovalRequest', ...readOnly }),
    fees: relationship({ ref: 'Fee.feeVersion', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const Fee = list({
  access: governed(['canManageFees', 'canChart', 'canReadSchedule', 'canManageTreatmentPlans']),
  fields: {
    feeVersion: relationship({ ref: 'FeeScheduleVersion.fees', ...readOnly }),
    code: relationship({ ref: 'ProcedureCode', ...readOnly }),
    amountMinor: minor({ required: true }),
    copayMinor: minor(),
    ...trackingFields,
  },
})

export const ExplosionCode = list({
  access: governed(['canManageFees', 'canChart']),
  ui: { labelField: 'name' },
  fields: {
    name: systemText({ required: true }),
    items: json({ defaultValue: [], ...readOnly }),
    isActive: checkbox({ defaultValue: true, ...readOnly }),
    ...trackingFields,
  },
})

// ── Ledger: the charge posted when a procedure is completed (the rest of the ledger is Phase 4) ──

export const LEDGER_KINDS = ['charge', 'insurance_payment', 'insurance_writeoff', 'insurance_adjustment', 'patient_payment', 'patient_adjustment', 'refund', 'transfer_out', 'transfer_in', 'finance_charge', 'reversal'] as const

export const GuarantorAccount = list({
  access: governed(['canReadLedger', 'canManagePatients']),
  ui: { labelField: 'ref', listView: { initialColumns: ['ref', 'guarantor', 'balanceRebuiltAt'] } },
  fields: {
    ref: systemText({ indexed: 'unique', required: true }),
    guarantor: relationship({ ref: 'Guarantor', ...readOnly }),
    balanceCache: json({ defaultValue: {}, ...readOnly }),
    balanceRebuiltAt: timestamp({ ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const LedgerEntry = list({
  access: governed(['canReadLedger']),
  ui: { labelField: 'id', listView: { initialColumns: ['kind', 'patient', 'amountMinor', 'businessDate', 'provider', 'postedAt'], initialSort: { field: 'postedAt', direction: 'DESC' } } },
  fields: {
    account: relationship({ ref: 'GuarantorAccount', ...readOnly }),
    patient: relationship({ ref: 'Patient', ...readOnly }),
    kind: fixedChoice(LEDGER_KINDS),
    amountMinor: minor({ required: true, description: 'Signed: debits are positive, credits negative.' }),
    currencyCode: systemText(),
    businessDate: calendarDay({ ...readOnly }),
    originalBusinessDate: calendarDay({ ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    provider: relationship({ ref: 'ProviderProfile', ...readOnly }),
    chartEntry: relationship({ ref: 'ChartEntry', ...readOnly }),
    reverses: relationship({ ref: 'LedgerEntry', ...readOnly }),
    adjustment: relationship({ ref: 'AdjustmentRequest', ...readOnly }),
    dayClose: relationship({ ref: 'DayClose.entries', ...readOnly }),
    restatement: relationship({ ref: 'Restatement.entries', ...readOnly }),
    memo: systemText(),
    postedBy: relationship({ ref: 'User', ...readOnly }),
    postedAt: timestamp({ ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})
