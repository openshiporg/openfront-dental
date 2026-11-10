import { list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { choice, fixedChoice, lifecycle, minor, readOnly, systemText, versionField } from './domainFields'
import { immutable, managed } from './listAccess'
import { locationFilter, peopleFilter, scopedGoverned, scopedManaged } from './scope'
import { trackingFields } from './trackingFields'

/*
 * Places, schedule templates and appointments (SCHEMA §2, §4; DOMAIN I-S1–I-S8; SM§2).
 * Operatories, appointment types and closures are reference data staff edit directly; templates
 * publish through a command. Appointments, segments and holds change only through the scheduling
 * commands (mutations/scheduling.ts), and the database refuses overlapping active appointments and
 * holds per operatory and per patient with exclusion constraints (migration dental_phase1).
 */

export const OPERATORY_KINDS = ['doctor', 'hygiene', 'flex', 'consult', 'surgery'] as const
export const APPOINTMENT_CATEGORIES = [
  'new_patient', 'recall_hygiene', 'perio_maintenance', 'restorative', 'crown_prep', 'crown_seat', 'endo', 'extraction', 'emergency', 'consult', 'ortho', 'other',
] as const
export const SEGMENT_ROLES = ['provider', 'assistant', 'hygienist', 'exam'] as const
export const APPOINTMENT_STATUSES = ['planned', 'scheduled', 'confirmed', 'arrived', 'seated', 'ready_for_checkout', 'completed', 'cancelled', 'broken', 'rescheduled'] as const
/** Statuses that occupy a chair, a patient and a provider (I-S1–I-S3). Mirrored in the exclusion constraints. */
export const ACTIVE_APPOINTMENT_STATUSES = ['scheduled', 'confirmed', 'arrived', 'seated', 'ready_for_checkout'] as const
export const CONFIRMATION_METHODS = ['sms_reply', 'email_link', 'phone', 'in_person', 'portal_api'] as const
export const APPOINTMENT_SOURCES = ['staff', 'online_booking', 'agent_proposal', 'import', 'recall_auto'] as const

const SCHEDULE_READERS = ['canReadSchedule', 'canManageSchedule'] as const
const scheduleRead = [...SCHEDULE_READERS] as ('canReadSchedule' | 'canManageSchedule')[]

export const Operatory = list({
  access: scopedManaged(scheduleRead, ['canManageTemplates', 'canManagePractice'], locationFilter()),
  ui: { labelField: 'name', listView: { initialColumns: ['location', 'code', 'name', 'kind', 'sortOrder', 'isActive'] } },
  fields: {
    location: relationship({ ref: 'Location' }),
    code: text({ validation: { isRequired: true, match: { regex: /^[A-Z0-9-]{1,8}$/, explanation: 'Up to 8 capital letters, digits or dashes (OP3, H1)' } } }),
    name: text({ validation: { isRequired: true } }),
    kind: choice(OPERATORY_KINDS, 'doctor'),
    equipmentTags: json({ defaultValue: [] }),
    sortOrder: integer({ defaultValue: 0 }),
    isActive: checkbox({ defaultValue: true }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})

export const AppointmentType = list({
  access: managed('signedIn', 'canManageTemplates'),
  ui: { labelField: 'name', listView: { initialColumns: ['code', 'name', 'category', 'defaultDurationUnits', 'onlineBookable', 'isActive'] } },
  fields: {
    name: text({ validation: { isRequired: true } }),
    code: text({ isIndexed: 'unique', validation: { isRequired: true, match: { regex: /^[A-Z0-9_]{2,24}$/, explanation: '2-24 capital letters, digits or underscores' } } }),
    category: choice(APPOINTMENT_CATEGORIES, 'other'),
    defaultPattern: json({
      defaultValue: [{ role: 'provider', units: 6 }],
      ui: { description: 'Units in order, e.g. [{"role":"assistant","units":1},{"role":"provider","units":4},{"role":"assistant","units":1}]. One unit is the practice schedule unit (10 minutes by default).' },
    }),
    defaultDurationUnits: integer({ defaultValue: 6, validation: { isRequired: true, min: 1, max: 96 } }),
    onlineBookable: checkbox({ defaultValue: false }),
    newPatientOnly: checkbox({ defaultValue: false }),
    requiresDentistOnSite: checkbox({ defaultValue: false, ui: { description: 'Hygiene visits that need a dentist in the building (I-S5). The jurisdiction pack decides whether it is a hard stop or a warning.' } }),
    requiresMedicalHistoryReview: checkbox({ defaultValue: true }),
    defaultProductionMinor: minor({ defaultValue: 0n, description: 'Practice estimate of production for this visit in cents, used for scheduled production until planned procedures with fees are attached.' }),
    publicName: text({ ui: { description: 'Practice-authored name shown by the online booking API.' } }),
    colour: text({ defaultValue: '#64748b', validation: { match: { regex: /^#[0-9a-fA-F]{6}$/ } } }),
    isActive: checkbox({ defaultValue: true }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})

export const ScheduleTemplate = list({
  access: scopedManaged(scheduleRead, 'canManageTemplates', locationFilter()),
  ui: { labelField: 'name', listView: { initialColumns: ['location', 'name', 'status', 'effectiveFrom', 'effectiveTo'] } },
  fields: {
    location: relationship({ ref: 'Location' }),
    name: text({ validation: { isRequired: true } }),
    effectiveFrom: calendarDay({ validation: { isRequired: true } }),
    effectiveTo: calendarDay(),
    status: lifecycle(['draft', 'active', 'retired']),
    blocks: relationship({ ref: 'TemplateBlock.template', many: true }),
    publishedAt: timestamp({ ...readOnly }),
    publishedBy: relationship({ ref: 'User', ...readOnly }),
    version: versionField(),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    ...trackingFields,
  },
})

export const TemplateBlock = list({
  access: scopedManaged(scheduleRead, 'canManageTemplates', locationFilter(['template', 'location'])),
  ui: { labelField: 'label', listView: { initialColumns: ['template', 'weekday', 'operatory', 'provider', 'startLocal', 'endLocal', 'onlineBookable'] } },
  fields: {
    template: relationship({ ref: 'ScheduleTemplate.blocks' }),
    weekday: integer({ validation: { isRequired: true, min: 0, max: 6 }, ui: { description: '0 = Sunday … 6 = Saturday' } }),
    operatory: relationship({ ref: 'Operatory' }),
    provider: relationship({ ref: 'ProviderProfile' }),
    startLocal: text({ validation: { isRequired: true, match: { regex: /^([01]\d|2[0-3]):[0-5]\d$/, explanation: 'HH:mm' } } }),
    endLocal: text({ validation: { isRequired: true, match: { regex: /^([01]\d|2[0-3]):[0-5]\d$/, explanation: 'HH:mm' } } }),
    allowedTypes: relationship({ ref: 'AppointmentType', many: true, ui: { description: 'Empty means any type.' } }),
    label: text(),
    onlineBookable: checkbox({ defaultValue: false }),
    ...trackingFields,
  },
})

export const ProductionGoal = list({
  access: scopedManaged(scheduleRead, ['canManageTemplates', 'canManagePractice'], locationFilter()),
  ui: { listView: { initialColumns: ['provider', 'location', 'weekday', 'date', 'goalMinor'] } },
  fields: {
    provider: relationship({ ref: 'ProviderProfile' }),
    location: relationship({ ref: 'Location' }),
    weekday: integer({ validation: { min: 0, max: 6 }, ui: { description: 'A standing goal for this weekday, or leave empty and set a date.' } }),
    date: calendarDay(),
    goalMinor: minor({ required: true, description: 'Scheduled production goal in cents.' }),
    ...trackingFields,
  },
})

export const ClosureDay = list({
  access: scopedManaged(scheduleRead, ['canManageTemplates', 'canManagePractice'], ({ session }: any) => {
    const filter = locationFilter()({ session })
    return filter === true || filter === false ? filter : { OR: [filter, { location: null }] }
  }),
  ui: { labelField: 'reason', listView: { initialColumns: ['location', 'date', 'reason', 'isHalfDay'] } },
  fields: {
    location: relationship({ ref: 'Location', ui: { description: 'Empty closes every location.' } }),
    date: calendarDay({ validation: { isRequired: true } }),
    reason: text({ validation: { isRequired: true } }),
    isHalfDay: checkbox({ defaultValue: false }),
    startLocal: text({ validation: { match: { regex: /^(([01]\d|2[0-3]):[0-5]\d)?$/, explanation: 'HH:mm' } } }),
    endLocal: text({ validation: { match: { regex: /^(([01]\d|2[0-3]):[0-5]\d)?$/, explanation: 'HH:mm' } } }),
    ...trackingFields,
  },
})

export const Appointment = list({
  access: scopedGoverned(scheduleRead, locationFilter()),
  ui: {
    labelField: 'ref',
    listView: { initialColumns: ['ref', 'startsAt', 'patient', 'operatory', 'type', 'status'], initialSort: { field: 'startsAt', direction: 'DESC' } },
  },
  fields: {
    ref: systemText({ indexed: 'unique', required: true }),
    patient: relationship({ ref: 'Patient.appointments', ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    operatory: relationship({ ref: 'Operatory', ...readOnly }),
    type: relationship({ ref: 'AppointmentType', ...readOnly }),
    startsAt: timestamp({ ...readOnly, validation: { isRequired: true } }),
    endsAt: timestamp({ ...readOnly, validation: { isRequired: true } }),
    localDate: calendarDay({ ...readOnly, isIndexed: true }),
    bufferAfterMinutes: integer({ defaultValue: 0, ...readOnly }),
    status: lifecycle(APPOINTMENT_STATUSES, 'scheduled'),
    confirmedAt: timestamp({ ...readOnly }),
    confirmationMethod: systemText(),
    arrivedAt: timestamp({ ...readOnly }),
    seatedAt: timestamp({ ...readOnly }),
    readyAt: timestamp({ ...readOnly }),
    completedAt: timestamp({ ...readOnly }),
    cancelledAt: timestamp({ ...readOnly }),
    cancelReason: systemText(),
    brokenKind: systemText(),
    rescheduledTo: relationship({ ref: 'Appointment', ...readOnly }),
    primaryProvider: relationship({ ref: 'ProviderProfile', ...readOnly }),
    supervisingDentist: relationship({ ref: 'ProviderProfile', ...readOnly }),
    segments: relationship({ ref: 'AppointmentSegment.appointment', many: true, ...readOnly }),
    confirmations: relationship({ ref: 'ConfirmationAttempt.appointment', many: true, ...readOnly }),
    alertAckBy: relationship({ ref: 'User', ...readOnly }),
    alertAckAt: timestamp({ ...readOnly }),
    note: systemText(),
    warnings: json({ defaultValue: [], ...readOnly, ui: { ...readOnly.ui, description: 'Booking warnings accepted when the appointment was made (supervision, template).' } }),
    source: fixedChoice(APPOINTMENT_SOURCES),
    bookedViaHold: relationship({ ref: 'BookingHold', ...readOnly }),
    proposal: relationship({ ref: 'Proposal', ...readOnly }),
    bookedBy: relationship({ ref: 'User', ...readOnly }),
    productionScheduledMinor: minor({ defaultValue: 0n }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const AppointmentSegment = list({
  access: scopedGoverned(scheduleRead, locationFilter(['appointment', 'location'])),
  ui: { listView: { initialColumns: ['appointment', 'role', 'provider', 'startsAt', 'endsAt', 'concurrencyKind'] } },
  fields: {
    appointment: relationship({ ref: 'Appointment.segments', ...readOnly }),
    role: fixedChoice(SEGMENT_ROLES),
    provider: relationship({ ref: 'ProviderProfile', ...readOnly }),
    startsAt: timestamp({ ...readOnly, validation: { isRequired: true } }),
    endsAt: timestamp({ ...readOnly, validation: { isRequired: true } }),
    concurrencyKind: fixedChoice(['none', 'hygiene_exam_float', 'approved_override']),
    overrideReason: systemText(),
    isActive: checkbox({ defaultValue: true, ...readOnly, ui: { ...readOnly.ui, description: 'False once the appointment is cancelled, broken or rescheduled: the time is free again.' } }),
    ...trackingFields,
  },
})

export const BookingHold = list({
  access: scopedGoverned(scheduleRead, locationFilter()),
  ui: { listView: { initialColumns: ['location', 'operatory', 'startsAt', 'endsAt', 'holderKind', 'status', 'expiresAt'] } },
  fields: {
    location: relationship({ ref: 'Location', ...readOnly }),
    operatory: relationship({ ref: 'Operatory', ...readOnly }),
    provider: relationship({ ref: 'ProviderProfile', ...readOnly }),
    type: relationship({ ref: 'AppointmentType', ...readOnly }),
    startsAt: timestamp({ ...readOnly, validation: { isRequired: true } }),
    endsAt: timestamp({ ...readOnly, validation: { isRequired: true } }),
    segments: json({ defaultValue: [], ...readOnly }),
    holderKind: fixedChoice(['staff', 'public_api', 'agent_offer']),
    holderRef: systemText({ indexed: true, required: true }),
    patient: relationship({ ref: 'Patient', ...readOnly }),
    asapEntry: relationship({ ref: 'AsapEntry', ...readOnly }),
    status: lifecycle(['held', 'converted', 'expired', 'released']),
    expiresAt: timestamp({ ...readOnly, isIndexed: true, validation: { isRequired: true } }),
    convertedTo: relationship({ ref: 'Appointment', ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const AsapEntry = list({
  access: scopedGoverned(scheduleRead, locationFilter()),
  ui: { listView: { initialColumns: ['patient', 'location', 'appointmentType', 'provider', 'earliestDate', 'status', 'priority'] } },
  fields: {
    patient: relationship({ ref: 'Patient.asapEntries', ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    appointmentType: relationship({ ref: 'AppointmentType', ...readOnly }),
    provider: relationship({ ref: 'ProviderProfile', ...readOnly }),
    preferredWindows: json({ defaultValue: [], ...readOnly, ui: { ...readOnly.ui, description: '[{ "weekday": 2, "from": "07:30", "to": "12:00" }, …] local time.' } }),
    earliestDate: calendarDay({ ...readOnly }),
    note: systemText(),
    status: lifecycle(['active', 'offered', 'booked', 'declined', 'expired']),
    priority: integer({ defaultValue: 0, ...readOnly }),
    bookedAppointment: relationship({ ref: 'Appointment', ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const ConfirmationAttempt = list({
  access: scopedGoverned(scheduleRead, locationFilter(['appointment', 'location'])),
  ui: { listView: { initialColumns: ['appointment', 'channel', 'scheduledFor', 'status', 'suppressedReason'] } },
  fields: {
    appointment: relationship({ ref: 'Appointment.confirmations', ...readOnly }),
    channel: fixedChoice(['email', 'sms', 'voice', 'portal', 'manual']),
    scheduledFor: timestamp({ ...readOnly, isIndexed: true, validation: { isRequired: true } }),
    contactPoint: relationship({ ref: 'ContactPoint', ...readOnly }),
    message: relationship({ ref: 'Message', ...readOnly }),
    status: lifecycle(['scheduled', 'sent', 'replied_confirm', 'replied_cancel', 'replied_other', 'no_reply', 'suppressed']),
    suppressedReason: systemText(),
    attemptedAt: timestamp({ ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const BrokenAppointmentEvent = list({
  // r2 N3: the appointment's office is mine and the patient is visible to me.
  access: scopedGoverned(scheduleRead, peopleFilter({ location: ['appointment', 'location'], patients: [['patient']] })),
  ui: { listView: { initialColumns: ['appointment', 'patient', 'kind', 'at'] } },
  fields: {
    appointment: relationship({ ref: 'Appointment', ...readOnly }),
    patient: relationship({ ref: 'Patient', ...readOnly }),
    kind: fixedChoice(['no_show', 'late_cancel']),
    at: timestamp({ ...readOnly, validation: { isRequired: true } }),
    recordedBy: relationship({ ref: 'User', ...readOnly }),
    reason: systemText(),
    ...trackingFields,
  },
})
