import { list } from '@keystone-6/core'
import { denyAll } from '@keystone-6/core/access'
import { calendarDay, checkbox, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { fixedChoice, lifecycle, minor, readOnly, systemText, versionField } from './domainFields'
import { governed, managed } from './listAccess'
import { locationFilter, portalAccountWhere, scopedBy, scopedGoverned, scopedManaged, visiblePatient } from './scope'
import { trackingFields } from './trackingFields'

/*
 * Storefront and patient portal data (SCHEMA §16). These lists back the public booking API and the
 * portal API only: the customer-facing pages wait for the owner's design pick (BUILD-PLAN Phase S).
 *
 * Portal accounts are deliberately not dashboard Users. A patient signs in to the portal API with an
 * emailed one-time code and gets a portal token; the generated staff GraphQL API never sees a
 * patient session, so a list rule written for staff can't leak to a patient by accident.
 */

const secretField = { access: { read: denyAll, create: denyAll, update: denyAll }, ui: { createView: { fieldMode: 'hidden' as const }, itemView: { fieldMode: 'hidden' as const }, listView: { fieldMode: 'hidden' as const } } }

export const PORTAL_CAPABILITIES = ['appointments', 'forms', 'plans_accept', 'statements_pay', 'records', 'messages', 'membership', 'preferences'] as const
export type PortalCapability = (typeof PORTAL_CAPABILITIES)[number]
export const PORTAL_RELATIONSHIPS = ['self', 'guarantor', 'guardian', 'personal_representative'] as const

export const StorefrontSite = list({
  access: managed('signedIn', 'canManagePractice'),
  ui: { labelField: 'slug', listView: { initialColumns: ['slug', 'location', 'headline', 'isPublished'] } },
  fields: {
    location: relationship({ ref: 'Location', ui: { description: 'Empty means the whole practice.' } }),
    slug: text({ isIndexed: 'unique', validation: { isRequired: true, match: { regex: /^[a-z0-9-]{2,60}$/, explanation: 'lowercase letters, digits and dashes' } } }),
    headline: text({ validation: { isRequired: true } }),
    about: text({ ui: { displayMode: 'textarea' } }),
    services: json({ defaultValue: [], ui: { description: 'Practice-authored service names and descriptions. Never paste licensed code descriptors here.' } }),
    providersShown: relationship({ ref: 'ProviderProfile', many: true }),
    seo: json({ defaultValue: {} }),
    brand: json({ defaultValue: {} }),
    isPublished: checkbox({ defaultValue: false }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})

export const OnlineBookingPolicy = list({
  access: scopedManaged(['canReadSchedule', 'canManageSchedule', 'canManagePractice'], ['canManagePractice', 'canManageTemplates'], locationFilter()),
  ui: { listView: { initialColumns: ['location', 'newPatientAllowed', 'leadTimeHours', 'horizonDays', 'holdMinutes', 'isActive'] } },
  fields: {
    location: relationship({ ref: 'Location' }),
    appointmentTypes: relationship({ ref: 'AppointmentType', many: true, ui: { description: 'Types the public API may book. Each must also be marked online-bookable.' } }),
    newPatientAllowed: checkbox({ defaultValue: true }),
    leadTimeHours: integer({ defaultValue: 4, validation: { isRequired: true, min: 0, max: 336 } }),
    horizonDays: integer({ defaultValue: 60, validation: { isRequired: true, min: 1, max: 365 } }),
    holdMinutes: integer({ defaultValue: 10, validation: { isRequired: true, min: 2, max: 30 } }),
    requireCardOnFile: checkbox({ defaultValue: false }),
    depositMinor: minor({ defaultValue: 0n, description: 'Optional deposit in cents, collected through the payments adapter (Stripe test mode in the sample practice).' }),
    requireInsuranceCapture: checkbox({ defaultValue: false }),
    rateLimit: json({ defaultValue: { perClientPerHour: 30, perContactPerDay: 5, globalPerMinute: 120 } }),
    isActive: checkbox({ defaultValue: true }),
    ...trackingFields,
  },
})

export const PublicBookingRequest = list({
  access: scopedGoverned(['canManageSchedule', 'canManagePatients'], locationFilter()),
  ui: { listView: { initialColumns: ['createdAt', 'status', 'matchStatus', 'appointment', 'reviewedAt'] } },
  fields: {
    site: relationship({ ref: 'StorefrontSite', ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    publicRef: systemText({ indexed: 'unique', required: true }),
    hold: relationship({ ref: 'BookingHold', ...readOnly }),
    contact: json({ defaultValue: {}, ...readOnly }),
    patientMatch: relationship({ ref: 'Patient', ...readOnly }),
    matchStatus: fixedChoice(['new_patient', 'matched', 'possible_duplicate']),
    matchEvidence: json({ defaultValue: {}, ...readOnly }),
    intake: json({ defaultValue: {}, ...readOnly }),
    insuranceCapture: json({ defaultValue: {}, ...readOnly }),
    appointment: relationship({ ref: 'Appointment', ...readOnly }),
    status: lifecycle(['started', 'submitted', 'booked', 'abandoned', 'rejected_spam'], 'submitted'),
    reviewedAt: timestamp({ ...readOnly }),
    reviewedBy: relationship({ ref: 'User', ...readOnly }),
    reviewNote: systemText(),
    ipHash: text({ ...secretField }),
    userAgentHash: text({ ...secretField }),
    captchaScore: systemText(),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const PortalAccount = list({
  // r2 N3: a portal login is mine when every patient it acts for is visible to me.
  access: scopedGoverned('canManagePatients', scopedBy(portalAccountWhere)),
  ui: { labelField: 'email', listView: { initialColumns: ['email', 'status', 'identityVerifiedAt', 'lastLoginAt'] } },
  fields: {
    email: systemText({ indexed: 'unique', required: true }),
    status: lifecycle(['invited', 'active', 'suspended', 'revoked']),
    verifiedContact: relationship({ ref: 'ContactPoint', ...readOnly }),
    identityVerifiedAt: timestamp({ ...readOnly }),
    invitedBy: relationship({ ref: 'User', ...readOnly }),
    lastLoginAt: timestamp({ ...readOnly }),
    scopes: relationship({ ref: 'PortalScope.account', many: true, ...readOnly }),
    // One-time sign-in code (hashed) and the token generation; bumping authVersion ends every portal session.
    codeHash: text({ ...secretField, db: { isNullable: true } }),
    codeExpiresAt: timestamp({ ...secretField, db: { isNullable: true } }),
    codeFailures: integer({ defaultValue: 0, ...secretField }),
    authVersion: integer({ defaultValue: 1, ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const PortalScope = list({
  access: scopedGoverned('canManagePatients', scopedBy(ids => ({ patient: visiblePatient(ids) }))),
  ui: { listView: { initialColumns: ['account', 'patient', 'relationship', 'status', 'expiresAt'] } },
  fields: {
    account: relationship({ ref: 'PortalAccount.scopes', ...readOnly }),
    patient: relationship({ ref: 'Patient', ...readOnly }),
    relationship: fixedChoice(PORTAL_RELATIONSHIPS),
    capabilities: json({ defaultValue: ['appointments', 'preferences'], ...readOnly }),
    confidentialItemsHidden: checkbox({ defaultValue: false, ...readOnly }),
    status: lifecycle(['active', 'revoked']),
    grantedBy: relationship({ ref: 'User', ...readOnly }),
    expiresAt: timestamp({ ...readOnly }),
    validUntilMajority: checkbox({ defaultValue: false, ...readOnly, ui: { ...readOnly.ui, description: 'Guardian access that ends when the patient reaches the age of majority in the location’s jurisdiction pack.' } }),
    version: versionField(),
    ...trackingFields,
  },
})

export const IntakeSession = list({
  access: scopedGoverned('canManagePatients', scopedBy(ids => ({ OR: [{ portalAccount: portalAccountWhere(ids) }, { publicBookingRequest: { location: { id: { in: ids } } } }] }))),
  ui: { listView: { initialColumns: ['portalAccount', 'publicBookingRequest', 'status', 'expiresAt'] } },
  fields: {
    portalAccount: relationship({ ref: 'PortalAccount', ...readOnly }),
    publicBookingRequest: relationship({ ref: 'PublicBookingRequest', ...readOnly }),
    status: lifecycle(['open', 'completed', 'expired']),
    dueOn: calendarDay({ ...readOnly }),
    expiresAt: timestamp({ ...readOnly }),
    ...trackingFields,
  },
})
