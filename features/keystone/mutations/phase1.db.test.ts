import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { NEVER_DEFAULT, permissionNames, type Permission } from '../access'
import { verifyAuditChain } from '../lib/audit'
import { addDays, localDate, localTime, weekdayOf, zonedInstant } from '../lib/time'
import { dispatchConfirmation, handleInbound } from '../messaging/dispatch'
import type { MessagingAdapter } from '../messaging/adapters'
import { decideApprovalRequest } from './approvals'
import { registerPatient, proposeMerge, revertMerge, recordConsent, setPatientStatus } from './patients'
import { grantPortalAccess, issuePortalCode, portalAppointments, portalCancel, portalMe, portalSession, signPortalToken, suspendPortalAccount } from './portal'
import { publicAvailability, publicHoldSlot, publicSite, publicSubmitBooking, reviewBookingRequest } from './public'
import {
  bookAppointment, cancelAppointment, completeAppointment, confirmAppointment, expireHolds, findAvailability, holdSlot, markArrived, markBroken,
  markReadyForCheckout, rescheduleAppointment, seatPatient,
} from './scheduling'
import { loadPracticeSetup } from './setup'

/*
 * Phase 1 exit gate (BUILD-PLAN Phase 1) against the seeded sample practice:
 *   - the database itself refuses a double-booking (exclusion constraint), and 50 parallel bookings of
 *     one slot produce exactly one appointment;
 *   - a held slot can't be double-booked and expires;
 *   - the DST week renders correct local times (America/New_York);
 *   - merge + revert round-trips with no orphan rows;
 *   - the public API never returns another patient's name;
 *   - portal scope: self, guardian of a minor, expired scope, suspended account.
 * Plus the appointment state machine, role access and location scope, and confirmation dispatch.
 */

const TZ = 'America/New_York'
const TPA = 'seed_loc_tpa'
const STP = 'seed_loc_stp'
const OP3 = 'seed_op_tpa_op3' // Mon/Wed 13:00–16:00, consults and emergencies, Dr. Okafor, online
const H1 = 'seed_op_tpa_h1'

type Ctx = { session: unknown; prisma: PrismaClient; req?: unknown }
const sessionFor = (id: string, granted: Permission[], locations: string[] = []) => ({
  itemId: id,
  listKey: 'User',
  data: {
    name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null,
    role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) },
    assignments: locations.map(l => ({ location: { id: l }, role: null, startsOn: null, endsOn: null })),
  },
})
const FRONT: Permission[] = ['canAccessDashboard', 'canReadSchedule', 'canReadDemographics', 'canManagePatients', 'canManageSchedule', 'canMessagePatients']

/** The next date (from tomorrow + `after` days) with the given weekday. */
function next(weekday: number, after = 1) {
  let d = addDays(localDate(TZ, new Date()), after)
  while (weekdayOf(d) !== weekday) d = addDays(d, 1)
  return d
}
const iso = (date: string, hhmm: string) => zonedInstant(TZ, date, hhmm).toISOString()
const reqFrom = (ip: string) => ({ headers: { 'user-agent': 'vitest' }, socket: { remoteAddress: ip } })
let ipCounter = 0
const freshIp = () => `10.9.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`

describe.skipIf(!hasTestDatabase)('Phase 1: patients, scheduling, public and portal APIs (database)', () => {
  let prisma: PrismaClient
  let owner: Ctx
  let approver: Ctx
  let desk: Ctx // front office at Tampa only
  let stpDesk: Ctx // front office at St. Petersburg only
  let assistant: Ctx
  let patients: { id: string; chartNumber: string; firstName: string; lastName: string; homeLocationId: string | null }[]

  beforeAll(async () => {
    // Portal tokens and PHI read references are keyed by the session secret; tests use their own.
    process.env.SESSION_SECRET ||= 'dental-vitest-session-secret-0123456789abcdef'
    prisma = testPrisma(4)
    await resetDatabase(prisma)
    const make = (name: string) => prisma.user.create({ data: { name, email: `${uniqueKey(name)}@test.local`, password: 'x'.repeat(60) } })
    const [o, a, d, s, as] = await Promise.all([make('owner'), make('approver'), make('desk'), make('stpdesk'), make('assistant')])
    owner = { session: sessionFor(o.id, permissionNames.filter(p => !NEVER_DEFAULT.includes(p))), prisma }
    approver = { session: sessionFor(a.id, ['canAccessDashboard', 'canApprovePatientMerge', 'canManagePatients', 'canAccessAllLocations']), prisma }
    desk = { session: sessionFor(d.id, FRONT, [TPA]), prisma }
    stpDesk = { session: sessionFor(s.id, FRONT, [STP]), prisma }
    assistant = { session: sessionFor(as.id, ['canAccessDashboard', 'canReadSchedule', 'canReadDemographics', 'canReadClinical', 'canChart'], [TPA]), prisma }
    await loadPracticeSetup(null, { idempotencyKey: uniqueKey('setup') }, owner)
    patients = await prisma.patient.findMany({ where: { status: 'active', homeLocationId: TPA }, orderBy: { chartNumber: 'asc' }, select: { id: true, chartNumber: true, firstName: true, lastName: true, homeLocationId: true } })
  }, 240_000)

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  /** A patient with nothing booked in the coming weeks (so tests don't trip the patient-overlap rule). */
  let cursor = 0
  async function freePatient() {
    for (;;) {
      const p = patients[cursor++ % patients.length]
      const busy = await prisma.appointment.count({ where: { patientId: p.id, status: { in: ['scheduled', 'confirmed', 'arrived', 'seated', 'ready_for_checkout'] }, startsAt: { gt: new Date() } } })
      if (!busy) return p
    }
  }

  /** A free OP3 slot on a Monday or Wednesday afternoon, `weeks` out (after the seeded horizon). */
  async function freeOp3Slot(weeks: number, hhmm = '13:00') {
    const date = next(1, 15 + 7 * weeks)
    return { locationId: TPA, operatoryId: OP3, typeId: 'seed_apt_consult', startsAt: iso(date, hhmm), date }
  }

  it('seeds the sample practice: ~240 people in 70 households, templates, a visible open slot and DB-valid appointments', async () => {
    const [people, families, deceased, templates, blocks, appts, broken] = await Promise.all([
      prisma.patient.count(), prisma.familyGroup.count(), prisma.patient.count({ where: { status: 'deceased' } }), prisma.scheduleTemplate.count({ where: { status: 'active' } }),
      prisma.templateBlock.count(), prisma.appointment.count(), prisma.brokenAppointmentEvent.count(),
    ])
    expect(people).toBeGreaterThanOrEqual(200)
    expect(families).toBe(70)
    expect(deceased).toBe(1)
    expect(templates).toBe(2)
    expect(blocks).toBeGreaterThan(50)
    expect(appts).toBeGreaterThan(500)
    expect(broken).toBe(await prisma.appointment.count({ where: { status: 'broken' } }))
    // No two active seeded appointments overlap in one chair (the exclusion constraint would have refused them anyway).
    const clashes = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM "Appointment" a JOIN "Appointment" b ON a."operatory" = b."operatory" AND a.id < b.id
      WHERE a.status IN ('scheduled','confirmed','arrived','seated','ready_for_checkout') AND b.status IN ('scheduled','confirmed','arrived','seated','ready_for_checkout')
        AND tsrange(a."startsAt", a."endsAt") && tsrange(b."startsAt", b."endsAt")`
    expect(Number(clashes[0].n)).toBe(0)
    expect(await prisma.patient.count({ where: { isSynthetic: false } })).toBe(0)
  })

  // ── Exit gate: the database refuses a double-booking ─────────────────────────────────────────

  it('EXIT GATE: the database refuses a second active appointment in the same chair and time (Appointment_no_operatory_overlap)', async () => {
    const existing = await prisma.appointment.findFirstOrThrow({ where: { status: 'scheduled', operatoryId: { not: null } }, orderBy: { startsAt: 'asc' } })
    const other = await prisma.patient.findFirstOrThrow({ where: { status: 'active', id: { not: existing.patientId! } } })
    // A raw insert bypasses every application check; only the constraint stands in the way.
    const attempt = prisma.$executeRaw`
      INSERT INTO "Appointment" (id, ref, patient, location, operatory, type, "startsAt", "endsAt", status, source, "brokenKind", "productionScheduledMinor")
      VALUES (${`raw_${uniqueKey()}`}, ${`RAW-${uniqueKey()}`}, ${other.id}, ${existing.locationId}, ${existing.operatoryId}, ${existing.typeId}, ${existing.startsAt}, ${existing.endsAt}, 'scheduled', 'staff', '', 0)`
    await expect(attempt).rejects.toThrow(/Appointment_no_operatory_overlap|is held for this time|exclusion constraint/)
    // A cancelled row in the same place is allowed (only active statuses are exclusive).
    const id = `raw_${uniqueKey()}`
    await prisma.$executeRaw`
      INSERT INTO "Appointment" (id, ref, patient, location, operatory, type, "startsAt", "endsAt", status, source, "brokenKind", "productionScheduledMinor")
      VALUES (${id}, ${`RAW-${uniqueKey()}`}, ${other.id}, ${existing.locationId}, ${existing.operatoryId}, ${existing.typeId}, ${existing.startsAt}, ${existing.endsAt}, 'cancelled', 'staff', '', 0)`
    // ...and it can't be revived into the occupied slot.
    await expect(prisma.appointment.update({ where: { id }, data: { status: 'scheduled' } })).rejects.toThrow(/Appointment_no_operatory_overlap|exclusion constraint/)
  })

  it('EXIT GATE: 50 parallel bookings of one slot → exactly one appointment; the rest are SLOT_TAKEN (or PATIENT_UNAVAILABLE)', async () => {
    const slot = await freeOp3Slot(1, '14:00')
    const candidates: string[] = []
    while (candidates.length < 50) candidates.push((await freePatient()).id)
    // Its own pool, as a busy multi-instance deployment would have; every request still goes through the same locks and constraints.
    const racePrisma = testPrisma(8)
    const results = await Promise.allSettled(candidates.map(patientId => bookAppointment(null, { ...slot, patientId, idempotencyKey: uniqueKey('race') }, { ...desk, prisma: racePrisma })))
    await racePrisma.$disconnect()
    const ok = results.filter(r => r.status === 'fulfilled')
    const codes = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map(r => (r.reason as { code?: string }).code ?? String(r.reason))
    expect(ok).toHaveLength(1)
    expect(new Set(codes)).toEqual(new Set(['SLOT_TAKEN']))
    expect(await prisma.appointment.count({ where: { operatoryId: OP3, startsAt: new Date(slot.startsAt), status: 'scheduled' } })).toBe(1)
  }, 180_000)

  it('a held slot cannot be booked by anyone else, the holder books it, and an unbooked hold expires and frees the time', async () => {
    const slot = await freeOp3Slot(2)
    const hold = await holdSlot(null, { ...slot, idempotencyKey: uniqueKey('hold') }, desk)
    const [a, b] = [await freePatient(), await freePatient()]
    // Another desk user can't book over it.
    const other = { ...desk, session: sessionFor('other-desk', FRONT, [TPA]) }
    await prisma.user.create({ data: { id: 'other-desk', name: 'other', email: `${uniqueKey('o')}@test.local`, password: 'x'.repeat(60) } }).catch(() => null)
    await expect(bookAppointment(null, { ...slot, patientId: a.id, idempotencyKey: uniqueKey() }, other)).rejects.toMatchObject({ code: 'SLOT_TAKEN' })
    // Nor at the database: a raw hold over it is refused.
    await expect(prisma.bookingHold.create({ data: { locationId: TPA, operatoryId: OP3, typeId: 'seed_apt_consult', startsAt: new Date(slot.startsAt), endsAt: new Date(new Date(slot.startsAt).getTime() + 30 * 60_000), expiresAt: new Date(Date.now() + 5 * 60_000), status: 'held', holderKind: 'staff', holderRef: 'x' } })).rejects.toThrow(/BookingHold_no_operatory_overlap|exclusion/)
    // The holder books through the hold.
    const booked = await bookAppointment(null, { ...slot, patientId: a.id, holdId: hold.holdId, idempotencyKey: uniqueKey() }, desk)
    expect(booked.status).toBe('scheduled')
    expect((await prisma.bookingHold.findUniqueOrThrow({ where: { id: hold.holdId } })).status).toBe('converted')
    // An unbooked hold expires.
    const slot2 = await freeOp3Slot(2, '15:00')
    const hold2 = await holdSlot(null, { ...slot2, idempotencyKey: uniqueKey('hold') }, desk)
    expect(await expireHolds(prisma, new Date(Date.now() + 31 * 60_000))).toBeGreaterThanOrEqual(1)
    expect((await prisma.bookingHold.findUniqueOrThrow({ where: { id: hold2.holdId } })).status).toBe('expired')
    await expect(bookAppointment(null, { ...slot2, patientId: b.id, holdId: hold2.holdId, idempotencyKey: uniqueKey() }, desk)).rejects.toMatchObject({ code: 'HOLD_EXPIRED' })
    const free = await bookAppointment(null, { ...slot2, patientId: b.id, idempotencyKey: uniqueKey() }, other)
    expect(free.status).toBe('scheduled')
  })

  it('refuses a patient in two chairs at once and a booking outside the template; a manager may override the template with a reason', async () => {
    const slot = await freeOp3Slot(3)
    const p = await freePatient()
    await bookAppointment(null, { ...slot, patientId: p.id, idempotencyKey: uniqueKey() }, desk)
    await expect(bookAppointment(null, { locationId: TPA, operatoryId: 'seed_op_tpa_op1', typeId: 'seed_apt_consult', startsAt: slot.startsAt, patientId: p.id, idempotencyKey: uniqueKey() }, desk)).rejects.toMatchObject({ code: 'PATIENT_UNAVAILABLE' })
    const q = await freePatient()
    const evening = { locationId: TPA, operatoryId: OP3, typeId: 'seed_apt_consult', startsAt: iso(slot.date, '18:00'), patientId: q.id, providerId: 'seed_prov_okafor' }
    await expect(bookAppointment(null, { ...evening, idempotencyKey: uniqueKey() }, desk)).rejects.toMatchObject({ code: 'OUTSIDE_TEMPLATE' })
    await expect(bookAppointment(null, { ...evening, overrideTemplate: true, overrideReason: 'x', idempotencyKey: uniqueKey() }, desk)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    const overridden = await bookAppointment(null, { ...evening, overrideTemplate: true, overrideReason: 'Late consult agreed with Dr. Okafor', idempotencyKey: uniqueKey() }, owner)
    expect(overridden.warnings).toContain('outside_template')
  })

  it('DST: the week the clocks change still offers 08:00 local hygiene slots (America/New_York)', async () => {
    // Next fall-back Monday after today (first Sunday of November + 1), or spring-forward Monday (second Sunday of March + 1).
    const year = Number(localDate(TZ, new Date()).slice(0, 4))
    const firstSunday = (y: number, m: number) => { let d = `${y}-${String(m).padStart(2, '0')}-01`; while (weekdayOf(d) !== 0) d = addDays(d, 1); return d }
    const candidates = [addDays(firstSunday(year, 11), 1), addDays(addDays(firstSunday(year + 1, 3), 7), 1), addDays(firstSunday(year + 1, 11), 1)]
    const today = localDate(TZ, new Date())
    const monday = candidates.find(d => d > addDays(today, 1) && d <= addDays(today, 330))!
    const result = await findAvailability(null, { locationId: TPA, typeId: 'seed_apt_recall', fromDate: monday, days: 1, operatoryIds: [H1], limit: 50 }, desk)
    const times = result.slots.map((s: { startsAt: string }) => localTime(TZ, new Date(s.startsAt)))
    if (result.slots.length) {
      expect(times[0] >= '08:00').toBe(true)
      expect(times.every((t: string) => t >= '08:00' && t < '17:00')).toBe(true)
    }
    // The block itself is 08:00 local whatever the UTC offset that day.
    expect(localTime(TZ, zonedInstant(TZ, monday, '08:00'))).toBe('08:00')
    expect(localTime(TZ, zonedInstant(TZ, addDays(monday, -7), '08:00'))).toBe('08:00')
    expect(zonedInstant(TZ, monday, '08:00').getUTCHours()).not.toBe(zonedInstant(TZ, addDays(monday, -7), '08:00').getUTCHours())
  })

  // ── Appointment state machine (SM§2.1) ───────────────────────────────────────────────────────

  it('walks scheduled → confirmed → arrived → seated → ready → completed; refuses forbidden and stale transitions', async () => {
    const today = localDate(TZ, new Date())
    const p = await freePatient()
    // Today, so it can be checked in; an override books it wherever the template has no room.
    const startsAt = new Date(Math.ceil((Date.now() + 2 * 3_600_000) / 600_000) * 600_000).toISOString()
    const booked = await bookAppointment(null, { locationId: TPA, operatoryId: 'seed_op_tpa_op4', typeId: 'seed_apt_consult', startsAt, patientId: p.id, providerId: 'seed_prov_reyes', overrideTemplate: true, overrideProviderClash: true, overrideReason: 'state machine test', idempotencyKey: uniqueKey() }, owner)
    const id = booked.appointmentId
    let v = (await prisma.appointment.findUniqueOrThrow({ where: { id } })).version
    await expect(seatPatient(null, { appointmentId: id, expectedVersion: v, idempotencyKey: uniqueKey() }, owner)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
    await expect(confirmAppointment(null, { appointmentId: id, expectedVersion: v - 1, method: 'phone', idempotencyKey: uniqueKey() }, desk)).rejects.toMatchObject({ code: 'STALE_STATE' })
    v = (await confirmAppointment(null, { appointmentId: id, expectedVersion: v, method: 'phone', idempotencyKey: uniqueKey() }, desk)).version
    if (localDate(TZ, new Date(startsAt)) === today) {
      v = (await markArrived(null, { appointmentId: id, expectedVersion: v, idempotencyKey: uniqueKey() }, desk)).version
      const alerts = await prisma.patientAlert.count({ where: { patientId: p.id, endedAt: null, severity: { in: ['caution', 'critical'] } } })
      v = (await seatPatient(null, { appointmentId: id, expectedVersion: v, acknowledgeAlerts: alerts > 0, idempotencyKey: uniqueKey() }, owner)).version
      v = (await markReadyForCheckout(null, { appointmentId: id, expectedVersion: v, reason: 'consult done', idempotencyKey: uniqueKey() }, owner)).version
      // An assistant charts but doesn't close the visit.
      await expect(completeAppointment(null, { appointmentId: id, expectedVersion: v, idempotencyKey: uniqueKey() }, assistant)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
      const done = await completeAppointment(null, { appointmentId: id, expectedVersion: v, idempotencyKey: uniqueKey() }, owner)
      expect(done.status).toBe('completed')
      await expect(cancelAppointment(null, { appointmentId: id, expectedVersion: done.version, reason: 'x', idempotencyKey: uniqueKey() }, desk)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
      expect((await prisma.patient.findUniqueOrThrow({ where: { id: p.id } })).lastVisitOn?.toISOString().slice(0, 10)).toBe(today)
    }
  })

  it('a cancel inside the late-cancel window is recorded as broken (late_cancel) with an append-only event; a no-show likewise', async () => {
    const p = await freePatient()
    const soon = new Date(Math.ceil((Date.now() + 5 * 3_600_000) / 600_000) * 600_000).toISOString()
    const booked = await bookAppointment(null, { locationId: TPA, operatoryId: 'seed_op_tpa_op4', typeId: 'seed_apt_emerg', startsAt: soon, patientId: p.id, providerId: 'seed_prov_reyes', overrideTemplate: true, overrideProviderClash: true, overrideReason: 'late cancel test', idempotencyKey: uniqueKey() }, owner)
    const cancelled = await cancelAppointment(null, { appointmentId: booked.appointmentId, expectedVersion: 1, reason: 'Patient called, car trouble', idempotencyKey: uniqueKey() }, desk).catch(async () => {
      const v = (await prisma.appointment.findUniqueOrThrow({ where: { id: booked.appointmentId } })).version
      return cancelAppointment(null, { appointmentId: booked.appointmentId, expectedVersion: v, reason: 'Patient called, car trouble', idempotencyKey: uniqueKey() }, desk)
    })
    expect(cancelled).toMatchObject({ status: 'broken', brokenKind: 'late_cancel' })
    const event = await prisma.brokenAppointmentEvent.findFirstOrThrow({ where: { appointmentId: booked.appointmentId } })
    await expect(prisma.brokenAppointmentEvent.update({ where: { id: event.id }, data: { reason: 'edited' } })).rejects.toThrow(/append-only|not allowed|denied/i)
    // Far-future cancel is a plain cancel.
    const slot = await freeOp3Slot(4)
    const q = await freePatient()
    const far = await bookAppointment(null, { ...slot, patientId: q.id, idempotencyKey: uniqueKey() }, desk)
    const v = (await prisma.appointment.findUniqueOrThrow({ where: { id: far.appointmentId } })).version
    expect((await cancelAppointment(null, { appointmentId: far.appointmentId, expectedVersion: v, reason: 'Moving away', idempotencyKey: uniqueKey() }, desk)).status).toBe('cancelled')
    // The cancelled visit's reminders are stopped.
    expect(await prisma.confirmationAttempt.count({ where: { appointmentId: far.appointmentId, status: 'scheduled' } })).toBe(0)
    await expect(markBroken(null, { appointmentId: far.appointmentId, expectedVersion: v + 1, kind: 'no_show', idempotencyKey: uniqueKey() }, desk)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })

  it('reschedule retires the old visit and books the new one in one step; overlapping its own old time is allowed', async () => {
    const slot = await freeOp3Slot(5)
    const p = await freePatient()
    const first = await bookAppointment(null, { ...slot, patientId: p.id, idempotencyKey: uniqueKey() }, desk)
    const version = (await prisma.appointment.findUniqueOrThrow({ where: { id: first.appointmentId } })).version
    const moved = await rescheduleAppointment(null, { appointmentId: first.appointmentId, expectedVersion: version, ...slot, startsAt: iso(slot.date, '13:10'), idempotencyKey: uniqueKey() }, desk)
    expect(moved.previous).toMatchObject({ status: 'rescheduled' })
    const old = await prisma.appointment.findUniqueOrThrow({ where: { id: first.appointmentId } })
    expect(old.rescheduledToId).toBe(moved.appointmentId)
    expect(await prisma.appointmentSegment.count({ where: { appointmentId: first.appointmentId, isActive: true } })).toBe(0)
  })

  // ── Access and location scope ───────────────────────────────────────────────────────────────

  it('location scope: a St. Petersburg desk cannot book, read or act on Tampa; an assistant cannot book at all', async () => {
    const slot = await freeOp3Slot(6)
    const p = await freePatient()
    await expect(bookAppointment(null, { ...slot, patientId: p.id, idempotencyKey: uniqueKey() }, stpDesk)).rejects.toMatchObject({ code: 'OUTSIDE_LOCATION_SCOPE' })
    await expect(bookAppointment(null, { ...slot, patientId: p.id, idempotencyKey: uniqueKey() }, assistant)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    const tpaVisit = await prisma.appointment.findFirstOrThrow({ where: { locationId: TPA, status: 'scheduled', startsAt: { gt: new Date() } } })
    await expect(confirmAppointment(null, { appointmentId: tpaVisit.id, expectedVersion: tpaVisit.version, method: 'phone', idempotencyKey: uniqueKey() }, stpDesk)).rejects.toMatchObject({ code: 'OUTSIDE_LOCATION_SCOPE' })
    // A Tampa-only patient is invisible (NOT_FOUND, not "forbidden") to the St. Pete desk.
    const tampaOnly = await prisma.patient.findFirstOrThrow({ where: { homeLocationId: TPA, status: 'active', appointments: { none: { locationId: STP } } } })
    await expect(setPatientStatus(null, { patientId: tampaOnly.id, status: 'inactive', expectedVersion: 1, reason: 'x', idempotencyKey: uniqueKey() }, stpDesk)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    // Unsigned callers get nothing.
    await expect(findAvailability(null, { locationId: TPA, typeId: 'seed_apt_consult', fromDate: slot.date }, { prisma, session: null })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
  })

  // ── Patients: duplicates, merge and revert ────────────────────────────────────────────────────

  it('new patient: a likely duplicate is refused with the candidate chart, then registered once the desk confirms a different person', async () => {
    const base = await prisma.patient.findFirstOrThrow({ where: { status: 'active', homeLocationId: TPA }, include: { contactPoints: true } })
    const data = { firstName: base.firstName, lastName: base.lastName, dateOfBirth: base.dateOfBirth.toISOString().slice(0, 10), homeLocationId: TPA, contacts: [] }
    await expect(registerPatient(null, { data, idempotencyKey: uniqueKey() }, desk)).rejects.toMatchObject({ code: 'DUPLICATE_SUSPECTED', details: { problems: [expect.objectContaining({ chartNumber: base.chartNumber })] } })
    const created = await registerPatient(null, { data, acknowledgeDuplicates: true, idempotencyKey: uniqueKey() }, desk)
    expect(created.status).toBe('prospect')
    expect(await prisma.auditEvent.count({ where: { eventType: 'patient.duplicate_acknowledged', entityId: created.patientId } })).toBe(1)
  })

  it('EXIT GATE: merge needs a second person, moves every child row, and a revert restores them with no orphans', async () => {
    const survivor = await prisma.patient.findFirstOrThrow({ where: { status: 'active', homeLocationId: TPA, contactPoints: { some: {} } } })
    const dupe = await registerPatient(null, { data: { firstName: survivor.firstName, lastName: survivor.lastName, dateOfBirth: survivor.dateOfBirth.toISOString().slice(0, 10), homeLocationId: TPA, contacts: [{ kind: 'email', value: `${uniqueKey('dupe')}@example.test`, isPrimary: true }] }, acknowledgeDuplicates: true, idempotencyKey: uniqueKey() }, desk)
    const slot = await freeOp3Slot(7)
    const visit = await bookAppointment(null, { ...slot, patientId: dupe.patientId, idempotencyKey: uniqueKey() }, desk)
    const before = { contacts: await prisma.contactPoint.count({ where: { patientId: dupe.patientId } }), appts: await prisma.appointment.count({ where: { patientId: dupe.patientId } }) }
    const proposed = await proposeMerge(null, { survivorId: `chart:${survivor.chartNumber}`, mergedId: dupe.patientId, reason: 'Same person registered twice', idempotencyKey: uniqueKey() }, desk)
    const request = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: String(proposed.approvalId) } })
    // The proposer can't approve their own merge.
    await expect(decideApprovalRequest(null, { requestId: request.id, decision: 'approve', expectedVersion: request.version, idempotencyKey: uniqueKey() }, { ...desk, session: sessionFor((desk.session as any).itemId, [...FRONT, 'canApprovePatientMerge'], [TPA]) })).rejects.toMatchObject({ code: 'SELF_APPROVAL' })
    const decided = await decideApprovalRequest(null, { requestId: request.id, decision: 'approve', expectedVersion: request.version, idempotencyKey: uniqueKey() }, approver)
    expect(decided.applied).toMatchObject({ status: 'applied' })
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: dupe.patientId } })).status).toBe('merged_into')
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: visit.appointmentId } })).patientId).toBe(survivor.id)
    expect(await prisma.contactPoint.count({ where: { patientId: dupe.patientId } })).toBe(0)
    const mergeCase = await prisma.mergeCase.findUniqueOrThrow({ where: { id: proposed.mergeCaseId } })
    const reverted = await revertMerge(null, { mergeCaseId: mergeCase.id, expectedVersion: mergeCase.version, reason: 'Twins, not the same person', idempotencyKey: uniqueKey() }, approver)
    expect(reverted.status).toBe('reverted')
    const after = { contacts: await prisma.contactPoint.count({ where: { patientId: dupe.patientId } }), appts: await prisma.appointment.count({ where: { patientId: dupe.patientId } }) }
    expect(after).toEqual(before)
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: dupe.patientId } })).status).toBe('prospect')
    // No row is left pointing at a patient that is merged_into, and no MergeMap row points at a missing row.
    const orphans = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM "MergeMap" m WHERE m."mergeCase" = ${mergeCase.id}
        AND NOT EXISTS (SELECT 1 FROM "ContactPoint" c WHERE c.id = m."rowId") AND NOT EXISTS (SELECT 1 FROM "Appointment" a WHERE a.id = m."rowId")
        AND NOT EXISTS (SELECT 1 FROM "ConsentGrant" g WHERE g.id = m."rowId") AND NOT EXISTS (SELECT 1 FROM "PatientAlert" p WHERE p.id = m."rowId")
        AND NOT EXISTS (SELECT 1 FROM "GuarantorLink" l WHERE l.id = m."rowId") AND NOT EXISTS (SELECT 1 FROM "AsapEntry" e WHERE e.id = m."rowId")`
    expect(Number(orphans[0].n)).toBe(0)
    expect(await prisma.appointment.count({ where: { patient: { status: 'merged_into' }, status: { in: ['scheduled', 'confirmed'] } } })).toBe(0)
  })

  it('deceased: future visits are withdrawn (not counted as broken) and the record gets a statement hold', async () => {
    const p = await freePatient()
    const slot = await freeOp3Slot(8)
    const visit = await bookAppointment(null, { ...slot, patientId: p.id, idempotencyKey: uniqueKey() }, desk)
    const v = (await prisma.patient.findUniqueOrThrow({ where: { id: p.id } })).version
    await setPatientStatus(null, { patientId: p.id, status: 'deceased', dateOfDeath: localDate(TZ, new Date()), expectedVersion: v, reason: 'Family informed the office', idempotencyKey: uniqueKey() }, owner)
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: visit.appointmentId } })
    expect(appt.status).toBe('cancelled')
    expect(await prisma.brokenAppointmentEvent.count({ where: { appointmentId: appt.id } })).toBe(0)
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: p.id } })).statementHold).toBe(true)
    await expect(bookAppointment(null, { ...(await freeOp3Slot(9)), patientId: p.id, idempotencyKey: uniqueKey() }, desk)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
  })

  // ── Public booking API ───────────────────────────────────────────────────────────────────────

  it('EXIT GATE: the public API books by token, answers a matched and a new person identically, and never returns a patient name', async () => {
    const site = await publicSite(null, { slug: 'bayview' }, { prisma, session: null, req: reqFrom(freshIp()) })
    expect(JSON.stringify(site)).not.toMatch(/PT-SEED|chartNumber/)
    const date = next(1, 22)
    const avail = await publicAvailability(null, { slug: 'bayview', locationId: TPA, typeId: 'seed_apt_consult', fromDate: date, days: 3 }, { prisma, session: null, req: reqFrom(freshIp()) })
    expect(avail.slots.length).toBeGreaterThan(1)
    // Words the practice publishes itself (provider and location names) are not patient data.
    const published = JSON.stringify(site)
    const names = [...new Set((await prisma.patient.findMany({ select: { firstName: true, lastName: true } })).flatMap(p => [p.firstName, p.lastName]))].filter(n => n.length > 3 && !published.includes(n))
    const book = async (contact: Record<string, unknown>, slot: { operatoryId: string; startsAt: string }) => {
      const req = reqFrom(freshIp())
      const hold = await publicHoldSlot(null, { slug: 'bayview', locationId: TPA, typeId: 'seed_apt_consult', operatoryId: slot.operatoryId, startsAt: slot.startsAt, idempotencyKey: uniqueKey() }, { prisma, session: null, req })
      // A stolen hold id without the token gets nothing.
      await expect(publicSubmitBooking(null, { slug: 'bayview', holdId: hold.holdId, holdToken: 'guess', contact: contact as never, idempotencyKey: uniqueKey() }, { prisma, session: null, req })).rejects.toMatchObject({ code: 'HOLD_EXPIRED' })
      return publicSubmitBooking(null, { slug: 'bayview', holdId: hold.holdId, holdToken: hold.holdToken!, contact: contact as never, idempotencyKey: uniqueKey() }, { prisma, session: null, req })
    }
    const existing = await prisma.patient.findFirstOrThrow({ where: { status: 'active', homeLocationId: TPA, contactPoints: { some: { kind: 'email', isActive: true } } }, include: { contactPoints: true } })
    const email = existing.contactPoints.find(c => c.kind === 'email')!.valueNormalized
    const matched = await book({ firstName: existing.firstName, lastName: existing.lastName, dateOfBirth: existing.dateOfBirth.toISOString().slice(0, 10), email }, avail.slots[0])
    const fresh = await book({ firstName: 'Quillon', lastName: 'Ashgrove', dateOfBirth: '1990-04-12', email: `${uniqueKey('new')}@example.test`, smsConsent: false }, avail.slots[avail.slots.length - 1])
    expect(Object.keys(matched).sort()).toEqual(Object.keys(fresh).sort())
    for (const response of [site, avail, matched, fresh]) {
      const text = JSON.stringify(response)
      for (const n of names) expect(text.includes(n)).toBe(false)
      expect(text).not.toMatch(/patientId|chartNumber|PT-SEED/)
    }
    const requests = await prisma.publicBookingRequest.findMany({ where: { publicRef: { in: [matched.publicRef, fresh.publicRef] } } })
    expect(requests.map(r => r.matchStatus).sort()).toEqual(['matched', 'new_patient'])
  }, 120_000)

  it('booking inbox: reject as spam withdraws the visit and archives the prospect; link proposes a merge for a second person', async () => {
    const date = next(3, 22)
    const avail = await publicAvailability(null, { slug: 'bayview', locationId: TPA, typeId: 'seed_apt_consult', fromDate: date, days: 3 }, { prisma, session: null, req: reqFrom(freshIp()) })
    const bookOne = async (contact: Record<string, unknown>, slot: { operatoryId: string; startsAt: string }) => {
      const req = reqFrom(freshIp())
      const hold = await publicHoldSlot(null, { slug: 'bayview', locationId: TPA, typeId: 'seed_apt_consult', operatoryId: slot.operatoryId, startsAt: slot.startsAt, idempotencyKey: uniqueKey() }, { prisma, session: null, req })
      const r = await publicSubmitBooking(null, { slug: 'bayview', holdId: hold.holdId, holdToken: hold.holdToken!, contact: contact as never, idempotencyKey: uniqueKey() }, { prisma, session: null, req })
      return prisma.publicBookingRequest.findUniqueOrThrow({ where: { publicRef: r.publicRef } })
    }
    const spam = await bookOne({ firstName: 'Buy', lastName: 'Followers', dateOfBirth: '2000-01-01', email: `${uniqueKey('spam')}@example.test` }, avail.slots[0])
    const reviewed = await reviewBookingRequest(null, { requestId: spam.id, decision: 'reject_spam', expectedVersion: spam.version, note: 'Obvious spam', idempotencyKey: uniqueKey() }, desk)
    expect(reviewed.status).toBe('rejected_spam')
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: spam.appointmentId! } })).status).toBe('cancelled')
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: spam.patientMatchId! } })).status).toBe('archived')
    await expect(reviewBookingRequest(null, { requestId: spam.id, decision: 'accept', expectedVersion: reviewed.version, idempotencyKey: uniqueKey() }, desk)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
    // Same person, different email: booked as a possible duplicate; "link" proposes a merge.
    const existing = await prisma.patient.findFirstOrThrow({ where: { status: 'active', homeLocationId: TPA, mergedInto: null } })
    const dupe = await bookOne({ firstName: existing.firstName, lastName: existing.lastName, dateOfBirth: existing.dateOfBirth.toISOString().slice(0, 10), email: `${uniqueKey('alt')}@example.test` }, avail.slots[avail.slots.length - 1])
    expect(dupe.matchStatus).toBe('possible_duplicate')
    const linked = await reviewBookingRequest(null, { requestId: dupe.id, decision: 'link', existingPatientId: `chart:${existing.chartNumber}`, expectedVersion: dupe.version, idempotencyKey: uniqueKey() }, desk)
    expect(linked.mergeCaseId).toBeTruthy()
    expect((await prisma.mergeCase.findUniqueOrThrow({ where: { id: String(linked.mergeCaseId) } })).status).toBe('proposed')
  }, 120_000)

  it('the public API is rate limited per client', async () => {
    const req = reqFrom(freshIp())
    const policy = await prisma.onlineBookingPolicy.findFirstOrThrow({ where: { locationId: TPA } })
    await prisma.onlineBookingPolicy.update({ where: { id: policy.id }, data: { rateLimit: { perClientPerHour: 3, perContactPerDay: 5, globalPerMinute: 1000 } as never } })
    try {
      const ask = () => publicAvailability(null, { slug: 'bayview', locationId: TPA, typeId: 'seed_apt_consult', fromDate: next(1, 22), days: 1 }, { prisma, session: null, req })
      await ask(); await ask(); await ask()
      await expect(ask()).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    } finally {
      await prisma.onlineBookingPolicy.update({ where: { id: policy.id }, data: { rateLimit: policy.rateLimit as never } })
    }
  })

  // ── Portal API ──────────────────────────────────────────────────────────────────────────────

  it('EXIT GATE: portal scope: self and guardian of a minor see their people; others, an expired scope and a suspended account see nothing', async () => {
    const account = await prisma.portalAccount.findUniqueOrThrow({ where: { id: 'seed_portal_1' } })
    const issued = await issuePortalCode(prisma, account.email)
    expect(issued).not.toBeNull()
    await expect(portalSession(null, { email: account.email, code: '000000' === issued!.code ? '111111' : '000000' }, { prisma, session: null, req: reqFrom(freshIp()) })).rejects.toMatchObject({ code: 'PORTAL_SESSION_INVALID' })
    const { token } = await portalSession(null, { email: account.email, code: issued!.code }, { prisma, session: null, req: reqFrom(freshIp()) })
    const ctx = { prisma, session: null, req: { headers: { 'x-portal-token': token } } }
    const me = await portalMe(null, {}, ctx)
    const scopes = await prisma.portalScope.findMany({ where: { accountId: account.id, status: 'active' }, include: { patient: true } })
    const child = scopes.find(s => s.relationship === 'guardian')!
    const self = scopes.find(s => s.relationship === 'self')!
    const ageOfChild = (Date.now() - child.patient!.dateOfBirth.getTime()) / (365.25 * 86_400_000)
    expect(me.people.map(p => p.patientId)).toContain(self.patientId)
    if (ageOfChild < 18) expect(me.people.map(p => p.patientId)).toContain(child.patientId)
    else expect(me.people.map(p => p.patientId)).not.toContain(child.patientId)
    await portalAppointments(null, { patientId: self.patientId! }, ctx)
    expect(await prisma.phiReadAudit.count({ where: { operationName: 'portalAppointments', purpose: 'patient_request' } })).toBeGreaterThan(0)
    // Someone else's patient: refused.
    const stranger = await prisma.patient.findFirstOrThrow({ where: { id: { notIn: scopes.map(s => s.patientId!) } } })
    await expect(portalAppointments(null, { patientId: stranger.id }, ctx)).rejects.toMatchObject({ code: 'PORTAL_SCOPE_DENIED' })
    // A guardian scope for an adult (majority passed) is ignored.
    const adult = await prisma.patient.findFirstOrThrow({ where: { status: 'active', dateOfBirth: { lt: new Date('1990-01-01') }, id: { notIn: scopes.map(s => s.patientId!) } } })
    await prisma.portalScope.create({ data: { accountId: account.id, patientId: adult.id, relationship: 'guardian', capabilities: ['appointments'] as never, status: 'active', validUntilMajority: true } })
    await expect(portalAppointments(null, { patientId: adult.id }, ctx)).rejects.toMatchObject({ code: 'PORTAL_SCOPE_DENIED' })
    // An expired scope is ignored.
    const other = await prisma.patient.findFirstOrThrow({ where: { status: 'active', id: { notIn: [...scopes.map(s => s.patientId!), adult.id] } } })
    await prisma.portalScope.create({ data: { accountId: account.id, patientId: other.id, relationship: 'personal_representative', capabilities: ['appointments'] as never, status: 'active', expiresAt: new Date(Date.now() - 60_000) } })
    await expect(portalAppointments(null, { patientId: other.id }, ctx)).rejects.toMatchObject({ code: 'PORTAL_SCOPE_DENIED' })
    // A forged token, an old token after suspension: refused.
    await expect(portalMe(null, {}, { prisma, session: null, req: { headers: { 'x-portal-token': `${token.slice(0, -2)}xx` } } })).rejects.toMatchObject({ code: 'PORTAL_SESSION_INVALID' })
    await suspendPortalAccount(null, { portalAccountId: account.id, reason: 'Lost phone', idempotencyKey: uniqueKey() }, owner)
    await expect(portalMe(null, {}, ctx)).rejects.toMatchObject({ code: 'PORTAL_SESSION_INVALID' })
    await expect(portalMe(null, {}, { prisma, session: null, req: { headers: { 'x-portal-token': signPortalToken({ accountId: account.id, authVersion: Number(account.authVersion ?? 1) }) } } })).rejects.toMatchObject({ code: 'PORTAL_SESSION_INVALID' })
  })

  it('portal actions run the same rules as staff: cancel inside the window is a late cancel; a staff grant creates a scoped account', async () => {
    const p = await freePatient()
    const email = `${uniqueKey('portal')}@example.test`
    await grantPortalAccess(null, { patientId: p.id, email, relationship: 'self', idempotencyKey: uniqueKey() }, desk)
    const issued = await issuePortalCode(prisma, email)
    const { token } = await portalSession(null, { email, code: issued!.code }, { prisma, session: null, req: reqFrom(freshIp()) })
    const ctx = { prisma, session: null, req: { headers: { 'x-portal-token': token } } }
    const slot = await freeOp3Slot(10)
    const visit = await bookAppointment(null, { ...slot, patientId: p.id, idempotencyKey: uniqueKey() }, desk)
    const list = await portalAppointments(null, { patientId: p.id }, ctx)
    expect(list.appointments.find((a: { id: string; canChange: boolean }) => a.id === visit.appointmentId)?.canChange).toBe(true)
    const cancelled = await portalCancel(null, { appointmentId: visit.appointmentId, reason: 'Schedule conflict', idempotencyKey: uniqueKey() }, ctx)
    expect(cancelled.status).toBe('cancelled')
    expect(await prisma.auditEvent.count({ where: { entityId: visit.appointmentId, eventType: 'appointment.cancelled' } })).toBe(1)
  })

  // ── Confirmations: consent and quiet hours at dispatch; replies ─────────────────────────────

  it('a reminder goes only with consent and outside quiet hours; synthetic data goes to the manual queue; "C" confirms and STOP revokes', async () => {
    const p = await prisma.patient.findFirstOrThrow({ where: { status: 'active', homeLocationId: TPA, contactPoints: { some: { kind: 'mobile', isPrimary: true, isActive: true, consentGrants: { some: { status: 'granted', channel: 'sms' } } } }, appointments: { none: { status: { in: ['scheduled', 'confirmed'] }, startsAt: { gt: new Date() } } } }, include: { contactPoints: true } })
    const slot = await freeOp3Slot(11)
    const visit = await bookAppointment(null, { ...slot, patientId: p.id, idempotencyKey: uniqueKey() }, desk)
    const attempts = await prisma.confirmationAttempt.findMany({ where: { appointmentId: visit.appointmentId }, orderBy: { scheduledFor: 'asc' } })
    const sms = attempts.find(a => a.channel === 'sms')!
    expect(sms).toBeTruthy()
    const sent: unknown[] = []
    const spy = (): MessagingAdapter => ({ key: 'spy', mode: 'manual_export', channels: ['sms', 'email'], send: async m => { sent.push(m); return { status: 'queued_manual', providerMessageId: 'spy-1', adapterKey: 'spy', adapterMode: 'manual_export' } } })
    // 22:30 local: quiet hours, deferred (nothing sent, still scheduled).
    const night = () => zonedInstant(TZ, addDays(slot.date, -2), '22:30')
    await expect(dispatchConfirmation(prisma, sms.id, { now: night, adapter: spy })).rejects.toThrow(/quiet hours/)
    expect(sent).toHaveLength(0)
    expect((await prisma.confirmationAttempt.findUniqueOrThrow({ where: { id: sms.id } })).status).toBe('scheduled')
    // 10:00 local: sent through the adapter (synthetic → manual queue by default).
    const morning = () => zonedInstant(TZ, addDays(slot.date, -2), '10:00')
    const result = await dispatchConfirmation(prisma, sms.id, { now: morning })
    expect(result).toMatchObject({ adapterKey: 'manual', adapterMode: 'manual_export' })
    expect((await prisma.confirmationAttempt.findUniqueOrThrow({ where: { id: sms.id } })).status).toBe('sent')
    const phone = p.contactPoints.find(c => c.kind === 'mobile' && c.isPrimary)!.valueNormalized
    // Free text never cancels; it becomes a staff task.
    expect((await handleInbound(prisma, { channel: 'sms', from: phone, body: 'can I come later?', providerMessageId: uniqueKey('in') })).value).toMatchObject({ handled: 'task' })
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: visit.appointmentId } })).status).toBe('scheduled')
    // Reset the attempt to sent and reply C → confirmed.
    await prisma.confirmationAttempt.update({ where: { id: sms.id }, data: { status: 'sent' } })
    expect((await handleInbound(prisma, { channel: 'sms', from: phone, body: 'C', providerMessageId: uniqueKey('in') })).value).toMatchObject({ handled: 'confirm' })
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: visit.appointmentId } })).status).toBe('confirmed')
    // STOP revokes SMS consent; a later reminder is suppressed for no consent.
    await handleInbound(prisma, { channel: 'sms', from: phone, body: 'STOP', providerMessageId: uniqueKey('in') })
    expect(await prisma.consentGrant.count({ where: { contactPoint: { valueNormalized: phone }, channel: 'sms', status: 'granted' } })).toBe(0)
    const slot2 = await freeOp3Slot(12)
    const visit2 = await bookAppointment(null, { ...slot2, patientId: p.id, idempotencyKey: uniqueKey() }, desk)
    const sms2 = (await prisma.confirmationAttempt.findMany({ where: { appointmentId: visit2.appointmentId, channel: 'sms' } }))[0]
    expect(await dispatchConfirmation(prisma, sms2.id, { now: () => zonedInstant(TZ, addDays(slot2.date, -2), '10:00'), adapter: spy })).toMatchObject({ status: 'suppressed', reason: 'no_consent' })
    expect(sent).toHaveLength(0)
    // Staff can record a verbal consent only with a note.
    const contact = p.contactPoints.find(c => c.kind === 'mobile' && c.isPrimary)!
    await expect(recordConsent(null, { contactPointId: contact.id, channel: 'sms', purpose: 'appointment_reminders', granted: true, source: 'verbal_staff', idempotencyKey: uniqueKey() }, desk)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await recordConsent(null, { contactPointId: contact.id, channel: 'sms', purpose: 'appointment_reminders', granted: true, source: 'verbal_staff', reason: 'Patient asked at the desk on the phone to get texts again', idempotencyKey: uniqueKey() }, desk)
    expect(await prisma.consentGrant.count({ where: { contactPointId: contact.id, channel: 'sms', status: 'granted' } })).toBe(1)
  })

  it('the audit chain is intact after everything above', async () => {
    expect((await verifyAuditChain(prisma)).ok).toBe(true)
  })
})
