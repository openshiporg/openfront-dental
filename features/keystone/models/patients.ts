import { list, graphql } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, text, timestamp, virtual } from '@keystone-6/core/fields'
import { choice, fixedChoice, lifecycle, readOnly, systemText, versionField } from './domainFields'
import { governed, immutable, managed } from './listAccess'
import { moneyFilter, patientFilter, peopleFilter, scopedGoverned, scopedManaged } from './scope'
import { trackingFields } from './trackingFields'

/*
 * Patients and families (SCHEMA §3, DOMAIN §2, SM§1). Demographics are PHI tier `dem`, alert detail
 * `clin`, guarantor identity `fin` (security/phiFields.ts). Every write that changes who a patient is
 * or how they are reached goes through a command (mutations/patients.ts) so it is audited; staff can't
 * edit these rows through the generated API.
 */

/** Anyone whose work needs to know who the patient is. Field tiers narrow what each of them sees. */
export const PATIENT_READERS = ['canReadDemographics', 'canManagePatients', 'canReadClinical', 'canReadInsurance', 'canReadLedger', 'canReadSchedule'] as const

export const PATIENT_STATUSES = ['prospect', 'active', 'inactive', 'archived', 'deceased', 'merged_into'] as const
export const SEX_AT_BIRTH = ['female', 'male', 'unknown', 'other'] as const
export const ALERT_KINDS = ['premedication', 'anticoagulant', 'antiresorptive', 'allergy', 'latex', 'pregnancy', 'diabetes', 'hypertension', 'cardiac', 'sedation_history', 'behavioural', 'financial', 'other'] as const
export const CONTACT_KINDS = ['mobile', 'home', 'work', 'email'] as const
export const GUARANTOR_RELATIONSHIPS = ['self', 'parent', 'spouse', 'guardian', 'other'] as const
export const IDENTIFIER_SYSTEMS = ['incumbent_dentrix', 'incumbent_eaglesoft', 'incumbent_opendental', 'incumbent_other', 'mrn_external', 'state_medicaid'] as const

/** Age in whole years on a calendar day (both YYYY-MM-DD). */
export function ageOn(dateOfBirth: string, on: string) {
  const [by, bm, bd] = dateOfBirth.split('-').map(Number)
  const [y, m, d] = on.split('-').map(Number)
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}

export const Patient = list({
  access: scopedGoverned([...PATIENT_READERS], patientFilter()),
  ui: {
    labelField: 'chartNumber',
    listView: { initialColumns: ['chartNumber', 'lastName', 'firstName', 'dateOfBirth', 'status', 'homeLocation'], initialSort: { field: 'lastName', direction: 'ASC' } },
  },
  fields: {
    chartNumber: systemText({ indexed: 'unique', required: true }),
    status: lifecycle(PATIENT_STATUSES),
    mergedInto: relationship({ ref: 'Patient', ...readOnly }),
    firstName: text({ validation: { isRequired: true }, ...readOnly }),
    middleName: text({ ...readOnly }),
    lastName: text({ validation: { isRequired: true }, ...readOnly }),
    preferredName: text({ ...readOnly }),
    suffix: text({ ...readOnly }),
    dateOfBirth: calendarDay({ validation: { isRequired: true }, ...readOnly }),
    sexAssignedAtBirth: fixedChoice(SEX_AT_BIRTH),
    genderIdentity: text({ ...readOnly }),
    pronouns: text({ ...readOnly }),
    preferredLanguage: text({ defaultValue: 'en', ...readOnly }),
    address: json({ defaultValue: {}, ...readOnly }),
    contactPoints: relationship({ ref: 'ContactPoint.patient', many: true, ...readOnly }),
    identifiers: relationship({ ref: 'PatientIdentifier.patient', many: true, ...readOnly }),
    family: relationship({ ref: 'FamilyGroup.members', ...readOnly }),
    guarantorLinks: relationship({ ref: 'GuarantorLink.patient', many: true, ...readOnly }),
    primaryProvider: relationship({ ref: 'ProviderProfile', ...readOnly }),
    primaryHygienist: relationship({ ref: 'ProviderProfile', ...readOnly }),
    homeLocation: relationship({ ref: 'Location', ...readOnly }),
    referralSource: relationship({ ref: 'ReferralSource', ...readOnly }),
    referredBy: text({ ...readOnly }),
    isMinor: virtual({
      field: graphql.field({
        type: graphql.Boolean,
        async resolve(item: any, _args, context) {
          if (!item.dateOfBirth) return null
          const dob = item.dateOfBirth instanceof Date ? item.dateOfBirth.toISOString().slice(0, 10) : String(item.dateOfBirth).slice(0, 10)
          let majority = 18
          if (item.homeLocationId) {
            const location = await context.sudo().prisma.location.findUnique({ where: { id: item.homeLocationId }, select: { jurisdiction: { select: { rules: true } } } })
            const age = (location?.jurisdiction?.rules as any)?.retention?.value?.majorityAge
            if (Number.isInteger(age)) majority = age
          }
          return ageOn(dob, new Date().toISOString().slice(0, 10)) < majority
        },
      }),
      ui: { itemView: { fieldMode: 'read' }, listView: { fieldMode: 'hidden' } },
    }),
    firstVisitOn: calendarDay({ ...readOnly }),
    lastVisitOn: calendarDay({ ...readOnly }),
    dateOfDeath: calendarDay({ ...readOnly }),
    alerts: relationship({ ref: 'PatientAlert.patient', many: true, ...readOnly }),
    appointments: relationship({ ref: 'Appointment.patient', many: true, ...readOnly }),
    asapEntries: relationship({ ref: 'AsapEntry.patient', many: true, ...readOnly }),
    statementHold: checkbox({ defaultValue: false, ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const PatientIdentifier = list({
  access: scopedGoverned(['canReadDemographics', 'canManagePatients'], patientFilter(['patient'])),
  ui: { labelField: 'value', listView: { initialColumns: ['patient', 'system', 'value'] } },
  fields: {
    patient: relationship({ ref: 'Patient.identifiers', ...readOnly }),
    system: fixedChoice(IDENTIFIER_SYSTEMS),
    value: systemText({ required: true }),
    ...trackingFields,
  },
})

export const FamilyGroup = list({
  // r2 N3: a family is mine when every member is visible to me (and it has one), like a family account.
  access: scopedManaged(['canReadDemographics', 'canManagePatients'], 'canManagePatients', peopleFilter({ members: ['members'] })),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'members'] } },
  fields: {
    name: text({ validation: { isRequired: true } }),
    members: relationship({ ref: 'Patient.family', many: true, ...readOnly }),
    primaryAddress: json({ defaultValue: {} }),
    notes: text({ ui: { displayMode: 'textarea' } }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})

export const Guarantor = list({
  access: scopedGoverned(['canReadLedger', 'canManagePatients', 'canReadDemographics'], moneyFilter({ guarantor: [] })),
  ui: { listView: { initialColumns: ['patient', 'links'] } },
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly, ui: { ...readOnly.ui, description: 'Set when the guarantor is also a patient.' } }),
    personName: json({ defaultValue: {}, ...readOnly, ui: { ...readOnly.ui, description: 'Name of a guarantor who is not a patient.' } }),
    contactPoints: relationship({ ref: 'ContactPoint.guarantor', many: true, ...readOnly }),
    links: relationship({ ref: 'GuarantorLink.guarantor', many: true, ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})

export const GuarantorLink = list({
  access: scopedGoverned(['canReadLedger', 'canManagePatients', 'canReadDemographics'], moneyFilter({ guarantor: ['guarantor'] })),
  ui: { listView: { initialColumns: ['patient', 'guarantor', 'relationship', 'status', 'startsOn'] } },
  fields: {
    patient: relationship({ ref: 'Patient.guarantorLinks', ...readOnly }),
    guarantor: relationship({ ref: 'Guarantor.links', ...readOnly }),
    relationship: fixedChoice(GUARANTOR_RELATIONSHIPS),
    status: lifecycle(['active', 'ended']),
    startsOn: calendarDay({ ...readOnly }),
    endsOn: calendarDay({ ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const ContactPoint = list({
  // r2 N3: a phone or email is read only by staff who can see the patient (or every patient of the guarantor) it belongs to.
  access: scopedGoverned(['canReadDemographics', 'canManagePatients', 'canMessagePatients'], peopleFilter({ patients: [['patient']], guarantors: [['guarantor']] })),
  ui: { labelField: 'kind', listView: { initialColumns: ['patient', 'kind', 'value', 'isPrimary', 'isActive'] } },
  fields: {
    patient: relationship({ ref: 'Patient.contactPoints', ...readOnly }),
    guarantor: relationship({ ref: 'Guarantor.contactPoints', ...readOnly }),
    kind: fixedChoice(CONTACT_KINDS),
    value: systemText({ required: true }),
    valueNormalized: systemText({ indexed: true, required: true }),
    isPrimary: checkbox({ defaultValue: false, ...readOnly }),
    isActive: checkbox({ defaultValue: true, ...readOnly }),
    verifiedAt: timestamp({ ...readOnly }),
    consentGrants: relationship({ ref: 'ConsentGrant.contactPoint', many: true, ...readOnly }),
    ...trackingFields,
  },
})

export const PatientAlert = list({
  access: scopedGoverned([...PATIENT_READERS], patientFilter(['patient'])),
  ui: { labelField: 'kind', listView: { initialColumns: ['patient', 'kind', 'severity', 'activeFrom', 'endedAt'] } },
  fields: {
    patient: relationship({ ref: 'Patient.alerts', ...readOnly }),
    kind: fixedChoice(ALERT_KINDS),
    severity: fixedChoice(['info', 'caution', 'critical']),
    text: systemText({ required: true }),
    source: fixedChoice(['manual', 'history_answer']),
    activeFrom: timestamp({ defaultValue: { kind: 'now' }, ...readOnly }),
    endedAt: timestamp({ ...readOnly }),
    recordedBy: relationship({ ref: 'User', ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const ReferralSource = list({
  access: managed(['canReadDemographics', 'canManagePatients'], 'canManagePatients'),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'kind', 'isActive'] } },
  fields: {
    name: text({ validation: { isRequired: true }, isIndexed: 'unique' }),
    kind: choice(['marketing', 'patient', 'provider', 'insurance_directory', 'other'], 'marketing'),
    providerContact: json({ defaultValue: {} }),
    isActive: checkbox({ defaultValue: true }),
    ...trackingFields,
  },
})

export const Referral = list({
  access: scopedManaged(['canReadDemographics', 'canManagePatients', 'canReadClinical'], ['canManagePatients', 'canChart'], patientFilter(['patient'])),
  ui: { listView: { initialColumns: ['patient', 'direction', 'toFrom', 'status', 'createdAt'] } },
  fields: {
    patient: relationship({ ref: 'Patient' }),
    direction: choice(['in', 'out'], 'out'),
    toFrom: relationship({ ref: 'ReferralSource' }),
    reason: text({ ui: { displayMode: 'textarea' } }),
    status: choice(['draft', 'sent', 'scheduled_elsewhere', 'report_received', 'closed'], 'draft'),
    letter: relationship({ ref: 'Document' }),
    ...trackingFields,
  },
})

export const MergeCase = list({
  access: scopedGoverned(['canManagePatients', 'canApprovePatientMerge'], peopleFilter({ patients: [['survivor'], ['merged']] })),
  ui: { listView: { initialColumns: ['survivor', 'merged', 'status', 'createdAt', 'revertibleUntil'] } },
  fields: {
    survivor: relationship({ ref: 'Patient', ...readOnly }),
    merged: relationship({ ref: 'Patient', ...readOnly }),
    evidence: json({ defaultValue: {}, ...readOnly }),
    reason: systemText(),
    status: lifecycle(['proposed', 'approved', 'applied', 'reverted', 'rejected']),
    approval: relationship({ ref: 'ApprovalRequest', ...readOnly }),
    proposedBy: relationship({ ref: 'User', ...readOnly }),
    appliedAt: timestamp({ ...readOnly }),
    revertibleUntil: timestamp({ ...readOnly }),
    revertedAt: timestamp({ ...readOnly }),
    mergedStatusBefore: systemText(),
    entries: relationship({ ref: 'MergeMap.mergeCase', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const MergeMap = list({
  access: scopedGoverned(['canManagePatients', 'canApprovePatientMerge'], peopleFilter({ patients: [['mergeCase', 'survivor'], ['mergeCase', 'merged']] })),
  ui: { listView: { initialColumns: ['mergeCase', 'listKey', 'rowId', 'field'] } },
  fields: {
    mergeCase: relationship({ ref: 'MergeCase.entries', ...readOnly }),
    listKey: systemText({ required: true }),
    rowId: systemText({ required: true }),
    field: systemText({ required: true }),
    fromId: systemText({ required: true }),
    toId: systemText({ required: true }),
    seq: integer({ ...readOnly, defaultValue: 0 }),
    ...trackingFields,
  },
})
