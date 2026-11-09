import type { Permission, Session } from '../access'
import { hasPermission } from '../access'

/*
 * PHI tiers per field (SCHEMA G9, DOMAIN §7.1). One map drives three things:
 *   1. field-level read access: a field in tier T is readable only with the tier's permission;
 *   2. the GraphQL read-audit plugin: any selected field in this map writes a PhiReadAudit row;
 *   3. the log redaction filter: these field names are masked in anything logged.
 * phiFields.test.ts checks every entry against the live schema, so a renamed field can't silently
 * drop out of the audit.
 */

export const PHI_TIERS = ['dem', 'clin', 'sens', 'ins', 'fin'] as const
export type PhiTier = (typeof PHI_TIERS)[number]

/** The permission a reader needs for each tier. */
export const TIER_PERMISSION: Record<PhiTier, Permission> = {
  dem: 'canReadDemographics',
  clin: 'canReadClinical',
  sens: 'canReadSensitive',
  ins: 'canReadInsurance',
  fin: 'canReadLedger',
}

/** Higher tiers include the right to read lower ones where clinical work needs it. */
const IMPLIES: Partial<Record<Permission, Permission[]>> = {
  canReadDemographics: ['canReadClinical', 'canReadInsurance', 'canReadLedger', 'canManagePatients'],
  canReadClinical: ['canReadSensitive'],
}

export function canReadTier(session: Session | null | undefined, tier: PhiTier) {
  const permission = TIER_PERMISSION[tier]
  if (hasPermission(session, permission)) return true
  return (IMPLIES[permission] ?? []).some(other => hasPermission(session, other))
}

/** Field config fragment: `text({ ...phi('dem'), validation: … })`. Machine principals pass through sudo contexts. */
export const phi = (tier: PhiTier) => ({ access: { read: ({ session }: { session?: Session | null }) => canReadTier(session, tier) } })

/** Merges tier read access into a field config that already declares access for create/update. */
export function withTier<T extends { access?: Record<string, unknown> }>(tier: PhiTier, config: T): T {
  return { ...config, access: { ...(config.access ?? {}), ...phi(tier).access } }
}

/**
 * List key → field → tier. Lists and fields are added here in the same change that adds them to
 * the schema; the test fails otherwise.
 */
export const PHI_FIELDS: Record<string, Record<string, PhiTier>> = {
  // Snapshots and payloads can carry any tier; they are read under the strictest relevant tier.
  AuditEvent: { before: 'clin', after: 'clin', reason: 'clin' },
  OutboxEvent: { payload: 'clin' },
  ApprovalRequest: { payload: 'fin' },
  Proposal: { payload: 'clin', validation: 'clin', execution: 'clin', realised: 'clin' },
  Document: { title: 'clin' },
  BreakGlassEvent: { reason: 'clin' },
  // Phase 1: patients, scheduling, messaging, portal (SCHEMA §3, §4, §15, §16)
  Patient: {
    firstName: 'dem', middleName: 'dem', lastName: 'dem', preferredName: 'dem', suffix: 'dem', dateOfBirth: 'dem', sexAssignedAtBirth: 'dem',
    genderIdentity: 'dem', pronouns: 'dem', preferredLanguage: 'dem', address: 'dem', referredBy: 'dem', dateOfDeath: 'dem',
  },
  PatientIdentifier: { value: 'dem' },
  FamilyGroup: { name: 'dem', primaryAddress: 'dem', notes: 'dem' },
  Guarantor: { personName: 'fin' },
  ContactPoint: { value: 'dem', valueNormalized: 'dem' },
  PatientAlert: { text: 'clin' },
  Referral: { reason: 'clin' },
  MergeCase: { evidence: 'dem', reason: 'dem' },
  Appointment: { note: 'dem', cancelReason: 'dem' },
  AsapEntry: { note: 'dem' },
  ConsentGrant: { evidence: 'dem' },
  Message: { toAddress: 'dem', subject: 'dem', body: 'dem' },
  PublicBookingRequest: { contact: 'dem', intake: 'dem', insuranceCapture: 'ins', reviewNote: 'dem' },
  PortalAccount: { email: 'dem' },
  // Phase 2: clinical record, plans, forms (SCHEMA §5–§7, §15)
  ChartEntry: { tooth: 'clin', surfaces: 'clin', diagnosisCodes: 'clin', deletedReason: 'clin' },
  PerioExam: { signatureHash: 'clin' },
  PerioSiteMeasurement: { tooth: 'clin', probingDepthMm: 'clin', gingivalMarginMm: 'clin', bleeding: 'clin', suppuration: 'clin', plaque: 'clin' },
  PerioToothFinding: { tooth: 'clin', mobility: 'clin', furcation: 'clin' },
  PerioClassification: { suggestedStage: 'clin', suggestedGrade: 'clin', confirmedStage: 'clin', confirmedGrade: 'clin', inputs: 'clin' },
  ClinicalNote: { title: 'clin', body: 'clin', errorReason: 'clin' },
  AnestheticLog: { drug: 'clin', concentration: 'clin', vasoconstrictor: 'clin', carpules: 'clin', injectionSites: 'clin' },
  VitalsReading: { systolic: 'clin', diastolic: 'clin', pulse: 'clin', asaClass: 'clin' },
  MedicalHistoryResponse: { answers: 'sens' },
  MedicalHistoryReview: { changesAcknowledged: 'sens', overrideReason: 'clin' },
  MedicationEntry: { name: 'clin', dose: 'clin', frequency: 'clin' },
  Prescription: { drug: 'clin', strength: 'clin', sig: 'clin', quantity: 'clin', pharmacy: 'clin', cancelReason: 'clin' },
  ImagingStudy: { teeth: 'clin' },
  ExternalFinding: { findingType: 'clin', tooth: 'clin', surfaces: 'clin', dismissReason: 'clin' },
  InformedRefusal: { risksExplained: 'clin', signerName: 'dem', signatureEvidence: 'clin', withdrawnReason: 'clin' },
  TreatmentPlan: { title: 'clin' },
  PlanAcceptance: { signerName: 'dem', signatureEvidence: 'clin', estimateSnapshot: 'fin', financingSelection: 'fin' },
  GoodFaithEstimate: { itemsSnapshot: 'fin', totalMinor: 'fin' },
  FormSubmission: { data: 'sens' },
  ConsentRecord: { signerName: 'dem', signatureEvidence: 'clin', scope: 'clin' },
  ConsentAction: { reason: 'clin' },
  // Phase 3: insurance, benefits, estimates (SCHEMA §8)
  InsurancePlan: { groupNumber: 'ins', annualMaxMinor: 'ins', deductibleIndividualMinor: 'ins', deductibleFamilyMinor: 'ins' },
  Subscriber: { personName: 'ins', dateOfBirth: 'ins', memberIdHash: 'ins', memberIdLast4: 'ins' },
  BenefitFact: { valueJson: 'ins' },
  EligibilityCheck: { rejectionCodes: 'ins', resultNote: 'ins' },
  BenefitVerification: { failureNote: 'ins' },
  OutsideHistory: { codeText: 'clin', tooth: 'clin', surfaces: 'clin', providerName: 'dem' },
  Estimate: { inputs: 'ins', feeMinor: 'ins', allowedMinor: 'ins', writeOffMinor: 'ins', insuranceMinor: 'ins', patientMinor: 'ins', deductibleAppliedMinor: 'ins', maxAppliedMinor: 'ins', secondaryInsuranceMinor: 'ins', reasons: 'ins' },
  BenefitUsage: { maxUsedMinor: 'ins', deductibleUsedMinor: 'ins', pendingMinor: 'ins', frequencyUse: 'ins' },
  LedgerEntry: { amountMinor: 'fin', memo: 'fin' },
  GuarantorAccount: { balanceCache: 'fin' },
  AdjustmentRequest: { amountMinor: 'fin', reason: 'fin' },
  DayClose: { daySheet: 'fin' },
}

/** Every PHI field name, for log redaction (field names only, never values). */
export const PHI_FIELD_NAMES = new Set(Object.values(PHI_FIELDS).flatMap(fields => Object.keys(fields)))

/** Additional identifiers masked in logs wherever they appear, whatever the list. */
export const ALWAYS_REDACT = new Set([
  'firstName', 'lastName', 'middleName', 'preferredName', 'dateOfBirth', 'dob', 'email', 'phone', 'address', 'ssn', 'ssnLast4', 'memberId',
  'subscriberId', 'groupNumber', 'body', 'text', 'note', 'notes', 'answers', 'responses', 'password', 'token', 'secret', 'mfaCode', 'recoveryCode', 'otp', 'cardNumber', 'insuranceCardImage',
])

type FieldFn = (args: any) => any

/**
 * Wraps every tiered field so its read access also requires the tier permission. Applied once to
 * the whole model map, so a list can't forget it. Existing read rules still apply (both must pass).
 */
export function applyPhiTiers<T extends Record<string, any>>(models: T): T {
  for (const [listKey, list] of Object.entries(models)) {
    const tiers = PHI_FIELDS[listKey]
    if (!tiers) continue
    for (const [fieldKey, tier] of Object.entries(tiers)) {
      const original = list.fields?.[fieldKey] as FieldFn | undefined
      if (typeof original !== 'function') throw new Error(`PHI_FIELDS names ${listKey}.${fieldKey}, which does not exist.`)
      list.fields[fieldKey] = (args: any) => {
        const field = original(args)
        const access = field.access
        const baseRead = typeof access === 'function' ? access : access?.read
        const read = async (input: any) => canReadTier(input.session, tier) && (baseRead ? await baseRead(input) : true)
        return {
          ...field,
          access: typeof access === 'function' ? { read, create: access, update: access } : { ...(access ?? {}), read },
        }
      }
    }
  }
  return gateFilterAndOrder(models)
}

/**
 * A field a reader cannot see must not be filterable or sortable by them either: `where: { codeText: { contains } }`
 * or `orderBy` would otherwise reveal the hidden value one guess at a time. Every field whose read access is a role
 * function (PHI tiers, cost, member IDs, secrets) gets that same function as `isFilterable` and `isOrderable`.
 * Fields that are already not filterable stay not filterable. Server code uses Prisma or sudo and is unaffected.
 */
export function gateFilterAndOrder<T extends Record<string, any>>(models: T): T {
  for (const list of Object.values(models)) {
    for (const [fieldKey, original] of Object.entries(list.fields ?? {})) {
      if (typeof original !== 'function' || fieldKey.startsWith('__group')) continue
      list.fields[fieldKey] = (args: any) => {
        const field = (original as FieldFn)(args)
        const read = typeof field.access === 'function' ? field.access : field.access?.read
        if (typeof read !== 'function') return field
        const gate = (base: unknown) => (base === false ? false : async (input: any) => {
          const allowed = await read({ ...input, operation: 'read', item: undefined })
          if (allowed !== true) return false
          return typeof base === 'function' ? (await base(input)) === true : true
        })
        return { ...field, isFilterable: gate(field.isFilterable), isOrderable: gate(field.isOrderable) }
      }
    }
  }
  return models
}
