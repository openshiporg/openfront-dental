import { can, requirePermission, type Actor } from '../lib/actor'
import { auditCreate, transition } from '../lib/cas'
import { command } from '../lib/command'
import type { Tx } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import { nextReference } from '../lib/sequence'
import { addDays, localDate, zonedInstant } from '../lib/time'
import type { UnitOfWork } from '../lib/unitOfWork'
import { ACTIVE_APPOINTMENT_STATUSES, CONFIRMATION_METHODS } from '../models/scheduling'
import { findSlots, parsePattern, patternUnits, type PlannedSegment } from '../scheduling/engine'
import {
  asSlotTaken, checkSlot, expireStaleHolds, labGate, loadChairBusy, loadLocationDay, loadProviderBusy, lockResources, preflight,
} from '../scheduling/service'
import { assertBookablePatient, assertLocation, assertPatientInScope, optionalText, requireText, staff, toDate, type Ctx, resolvePatientRef } from './shared'

/*
 * Scheduling commands (SM§2; DOMAIN I-S1–I-S8). Each is one idempotent transaction:
 *   ordered advisory locks → rule checks on a stable view → writes → audit + outbox → receipt.
 * The exclusion constraints in migration dental_phase1 are the backstop; a race that slips past the
 * locks (it can't, but code changes) surfaces as SLOT_TAKEN, never as a double booking.
 */

const ACTIVE = [...ACTIVE_APPOINTMENT_STATUSES]
const STAFF_HOLD_MINUTES = 5
const MAX_SEARCH_DAYS = 31

type SlotArgs = { locationId: string; operatoryId: string; typeId: string; startsAt: string; providerId?: string | null }

// ── Availability (read) ─────────────────────────────────────────────────────────────────────────

/** Open slots for a type at a location over a date range (staff view; holds and buffers respected). */
export async function findAvailability(_root: unknown, args: { locationId: string; typeId: string; fromDate: string; days?: number | null; providerId?: string | null; operatoryIds?: string[] | null; patientId?: string | null; limit?: number | null }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canReadSchedule', 'canManageSchedule')
  assertLocation(locationIds, args.locationId)
  if (args.patientId) await assertPatientInScope(context.prisma, locationIds, args.patientId)
  return availability(context.prisma, { ...args, onlineOnly: false, leadMinutes: 0 })
}

export async function availability(db: any, args: { locationId: string; typeId: string; fromDate: string; days?: number | null; providerId?: string | null; operatoryIds?: string[] | null; patientId?: string | null; limit?: number | null; onlineOnly: boolean; leadMinutes: number; horizonDays?: number }) {
  const days = Math.min(Math.max(1, Number(args.days ?? 7)), args.horizonDays ?? MAX_SEARCH_DAYS)
  const type = await db.appointmentType.findUnique({ where: { id: args.typeId } })
  if (!type || !type.isActive || (args.onlineOnly && !type.onlineBookable)) throw new DomainError(Codes.INVALID_INPUT, 'That appointment type is not available.', { field: 'typeId' })
  const pattern = parsePattern(type.defaultPattern)
  const practice = await db.practiceSettings.findUnique({ where: { id: 1 }, select: { scheduleUnitMinutes: true } })
  const unitMinutes = practice?.scheduleUnitMinutes ?? 10
  const now = new Date()
  const limit = Math.min(Math.max(1, Number(args.limit ?? 50)), 200)
  const slots: { operatoryId: string; providerId: string | null; startsAt: string; endsAt: string; localDate: string }[] = []
  for (let i = 0; i < days && slots.length < limit; i += 1) {
    const date = addDays(args.fromDate, i)
    const day = await loadLocationDay(db, args.locationId, date)
    if (!day.windows.length) continue
    const from = Math.min(...day.windows.map(w => w.startMs))
    const to = Math.max(...day.windows.map(w => w.endMs))
    const operatoryIds = [...new Set(day.windows.map(w => w.operatoryId))]
    const [chairBusy, providerBusy, patientBusy] = await Promise.all([
      loadChairBusy(db, operatoryIds, from, to, now),
      loadProviderBusy(db, from, to, now),
      args.patientId ? db.appointment.findMany({ where: { patientId: args.patientId, status: { in: ACTIVE }, startsAt: { lt: new Date(to) }, endsAt: { gt: new Date(from) } }, select: { startsAt: true, endsAt: true } }) : Promise.resolve([]),
    ])
    const found = findSlots({
      windows: day.windows, typeId: type.id, durationMinutes: patternUnits(pattern) * unitMinutes, unitMinutes, bufferAfterMinutes: 0,
      chairBusy, providerBusy, patientBusy: patientBusy.map((b: any) => ({ startMs: b.startsAt.getTime(), endMs: b.endsAt.getTime() })),
      pattern, nowMs: now.getTime(), leadMinutes: args.leadMinutes, onlineOnly: args.onlineOnly, operatoryIds: args.operatoryIds ?? undefined,
      providerId: args.providerId ?? null, limit: limit - slots.length,
    })
    // Supervision is a booking-time rule; drop slots a hard pack would refuse.
    const usable = type.requiresDentistOnSite && (day.supervision.enforcement === 'hard' || args.onlineOnly) && !day.supervision.hygieneGeneralAllowed
      ? found.filter(s => day.windows.some(w => w.providerType === 'dentist' && w.startMs <= s.startMs && s.endMs <= w.endMs))
      : found
    for (const s of usable) slots.push({ operatoryId: s.operatoryId, providerId: s.providerId, startsAt: new Date(s.startMs).toISOString(), endsAt: new Date(s.endMs).toISOString(), localDate: date })
  }
  return { typeId: type.id, unitMinutes, durationMinutes: patternUnits(pattern) * unitMinutes, slots }
}

// ── Holds ───────────────────────────────────────────────────────────────────────────────────────

export async function placeHold(uow: UnitOfWork, actor: Actor, input: SlotArgs & { patientId?: string | null; holderKind: 'staff' | 'public_api' | 'agent_offer'; holderRef: string; minutes: number; onlineOnly?: boolean; asapEntryId?: string | null; isSynthetic?: boolean }) {
  const startsAt = toDate(input.startsAt, 'startsAt')
  const pre = await preflight(uow.tx, { ...input, startsAt })
  await lockResources(uow.tx, { operatoryIds: [input.operatoryId], providerIds: pre.providerIds, patientIds: [input.patientId] })
  await expireStaleHolds(uow.tx, [input.operatoryId], uow.now)
  const check = await checkSlot(uow.tx, uow.now, { locationId: input.locationId, operatoryId: input.operatoryId, typeId: input.typeId, startsAt, providerId: input.providerId, patientId: input.patientId, onlineOnly: input.onlineOnly })
  const expiresAt = new Date(uow.now.getTime() + input.minutes * 60_000)
  const hold = await uow.tx.bookingHold.create({
    data: {
      locationId: input.locationId, operatoryId: input.operatoryId, providerId: check.providerId, typeId: input.typeId,
      startsAt: check.startsAt, endsAt: check.endsAt, segments: check.segments.map(serializeSegment) as never,
      holderKind: input.holderKind, holderRef: input.holderRef, patientId: input.patientId ?? null, asapEntryId: input.asapEntryId ?? null,
      status: 'held', expiresAt, isSynthetic: input.isSynthetic ?? false, createdAt: uow.now,
    },
  }).catch(asSlotTaken)
  auditCreate(uow, actor, 'BookingHold', hold.id, 'hold.placed', { operatoryId: hold.operatoryId, startsAt: hold.startsAt, endsAt: hold.endsAt, holderKind: hold.holderKind, expiresAt })
  return { hold, check }
}

const serializeSegment = (s: PlannedSegment) => ({ role: s.role, providerId: s.providerId, startMs: s.startMs, endMs: s.endMs, concurrencyKind: s.concurrencyKind })

export async function holdSlot(_root: unknown, args: SlotArgs & { patientId?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule')
  assertLocation(locationIds, args.locationId)
  const result = await command(context.prisma, { name: 'schedule.hold', actor, idempotencyKey: args.idempotencyKey, params: { ...args, idempotencyKey: undefined } }, async uow => {
    if (args.patientId) await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const { hold } = await placeHold(uow, actor, { ...args, holderKind: 'staff', holderRef: actor.kind === 'user' ? `user:${actor.userId}` : 'system', minutes: STAFF_HOLD_MINUTES })
    return { holdId: hold.id, expiresAt: hold.expiresAt.toISOString(), startsAt: hold.startsAt.toISOString(), endsAt: hold.endsAt.toISOString() }
  })
  return { replay: result.replay, ...result.value }
}

export async function releaseHold(_root: unknown, args: { holdId: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule')
  const result = await command(context.prisma, { name: 'schedule.release_hold', actor, idempotencyKey: args.idempotencyKey, params: { holdId: args.holdId } }, async uow => {
    const hold = await uow.tx.bookingHold.findUnique({ where: { id: args.holdId } })
    if (!hold) throw new DomainError(Codes.NOT_FOUND, 'Hold not found.')
    assertLocation(locationIds, hold.locationId)
    const updated = await transition(uow, { model: 'BookingHold', id: args.holdId, from: ['held'], to: 'released', actor, eventType: 'hold.released' })
    return { holdId: updated.id, status: updated.status }
  })
  return { replay: result.replay, ...result.value }
}

/** Expiry job (SM§2.1): held holds past their TTL become expired, in batches. */
export async function expireHolds(db: any, now = new Date(), batch = 200) {
  const due = await db.bookingHold.findMany({ where: { status: 'held', expiresAt: { lte: now } }, select: { id: true }, take: batch })
  if (!due.length) return 0
  const result = await db.bookingHold.updateMany({ where: { id: { in: due.map((d: any) => d.id) }, status: 'held', expiresAt: { lte: now } }, data: { status: 'expired', version: { increment: 1 } } })
  return result.count
}

// ── Booking ─────────────────────────────────────────────────────────────────────────────────────

export type BookInput = SlotArgs & {
  patientId: string
  holdId?: string | null
  note?: string | null
  overrideTemplate?: boolean | null
  overrideProviderClash?: boolean | null
  overrideReason?: string | null
  source?: 'staff' | 'online_booking' | 'agent_proposal' | 'import' | 'recall_auto'
  proposalId?: string | null
  /** For holds placed by the public API or an agent offer: the holder must match. */
  holderRef?: string | null
  isSynthetic?: boolean
}

/**
 * Create an appointment (SM§2.1 planned → scheduled). With a hold, the hold must be the caller's own
 * and unexpired, and its resources carry over; without one, the slot is checked under the locks.
 */
export async function createAppointment(uow: UnitOfWork, actor: Actor, input: BookInput) {
  const startsAt = toDate(input.startsAt, 'startsAt')
  const pre = await preflight(uow.tx, { ...input, startsAt })
  await lockResources(uow.tx, { operatoryIds: [input.operatoryId], providerIds: pre.providerIds, patientIds: [input.patientId] })
  const patient = await uow.tx.patient.findUnique({ where: { id: input.patientId }, select: { id: true, status: true, homeLocationId: true, isSynthetic: true } })
  if (!patient) throw new DomainError(Codes.NOT_FOUND, 'Patient not found.')
  assertBookablePatient(patient)

  let hold: any = null
  if (input.holdId) {
    hold = await uow.tx.bookingHold.findUnique({ where: { id: input.holdId } })
    if (!hold) throw new DomainError(Codes.NOT_FOUND, 'Hold not found.')
    const expectedHolder = input.holderRef ?? (actor.kind === 'user' ? `user:${actor.userId}` : null)
    if (hold.holderRef !== expectedHolder) throw new DomainError(Codes.NOT_AUTHORIZED, 'That hold belongs to someone else.')
    if (hold.status !== 'held' || hold.expiresAt.getTime() <= uow.now.getTime()) {
      if (hold.status === 'held') await uow.tx.bookingHold.updateMany({ where: { id: hold.id, status: 'held' }, data: { status: 'expired', version: { increment: 1 } } })
      throw new DomainError(Codes.HOLD_EXPIRED, 'The hold on this time has expired. Pick the time again.')
    }
    if (hold.operatoryId !== input.operatoryId || hold.startsAt.getTime() !== startsAt.getTime() || hold.typeId !== input.typeId) {
      throw new DomainError(Codes.INVALID_INPUT, 'The booking does not match the held time.')
    }
    if (hold.patientId && hold.patientId !== input.patientId) throw new DomainError(Codes.INVALID_INPUT, 'The hold was placed for a different patient.')
  }
  await expireStaleHolds(uow.tx, [input.operatoryId], uow.now)

  const overrideTemplate = !!input.overrideTemplate
  const overrideProviderClash = !!input.overrideProviderClash
  if (overrideTemplate) requirePermission(actor, 'canOverrideTemplate')
  if (overrideProviderClash) requirePermission(actor, 'canOverrideSchedule')
  const overrideReason = overrideTemplate || overrideProviderClash ? requireText(input.overrideReason, 'override reason') : ''

  const check = await checkSlot(uow.tx, uow.now, {
    locationId: input.locationId, operatoryId: input.operatoryId, typeId: input.typeId, startsAt, providerId: input.providerId ?? hold?.providerId,
    patientId: input.patientId, overrideTemplate, overrideProviderClash, onlineOnly: input.source === 'online_booking',
    ignore: hold ? { holdIds: [hold.id] } : undefined,
  })
  if (hold) {
    // The hold is consumed first so its exclusion no longer counts against the appointment.
    const converted = await uow.tx.bookingHold.updateMany({ where: { id: hold.id, status: 'held', version: hold.version }, data: { status: 'converted', version: { increment: 1 } } })
    if (converted.count !== 1) throw new DomainError(Codes.STALE_STATE, 'The hold changed while booking. Try again.')
  }

  const ref = await nextReference(uow.tx, 'APT', uow.now)
  const appointment = await uow.tx.appointment.create({
    data: {
      ref, patientId: input.patientId, locationId: input.locationId, operatoryId: input.operatoryId, typeId: input.typeId,
      startsAt: check.startsAt, endsAt: check.endsAt, localDate: new Date(`${check.localDate}T00:00:00Z`), bufferAfterMinutes: check.bufferAfterMinutes,
      status: 'scheduled', primaryProviderId: check.providerId, supervisingDentistId: check.supervisingDentistId,
      note: optionalText(input.note), warnings: check.warnings as never, source: input.source ?? 'staff',
      bookedViaHoldId: hold?.id ?? null, proposalId: input.proposalId ?? null, bookedById: actor.kind === 'user' ? actor.userId : null,
      productionScheduledMinor: check.productionMinor, isSynthetic: input.isSynthetic ?? patient.isSynthetic,
      segments: {
        create: check.segments.map(s => ({
          role: s.role, providerId: s.providerId, startsAt: new Date(s.startMs), endsAt: new Date(s.endMs), concurrencyKind: s.concurrencyKind,
          overrideReason: s.concurrencyKind === 'approved_override' ? overrideReason : '',
        })),
      },
    },
  }).catch(asSlotTaken)
  if (hold) await uow.tx.bookingHold.update({ where: { id: hold.id }, data: { convertedToId: appointment.id } })
  if (patient.status === 'prospect' && !patient.homeLocationId) await uow.tx.patient.update({ where: { id: patient.id }, data: { homeLocationId: input.locationId } })

  auditCreate(uow, actor, 'Appointment', appointment.id, 'appointment.booked', {
    ref, startsAt: appointment.startsAt, endsAt: appointment.endsAt, operatoryId: input.operatoryId, providerId: check.providerId, typeId: input.typeId,
    source: appointment.source, warnings: check.warnings, holdId: hold?.id ?? null,
  }, { reason: overrideReason || null })
  return appointment
}

export async function bookAppointment(_root: unknown, args: BookInput & { idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule')
  assertLocation(locationIds, args.locationId)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'schedule.book', actor, idempotencyKey, params }, async uow => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId).catch(async error => {
      // A patient seen nowhere yet (new prospect created by this desk) may be booked at my location.
      const p = await uow.tx.patient.findUnique({ where: { id: args.patientId }, select: { homeLocationId: true } })
      if (!p || p.homeLocationId) throw error
    })
    const appointment = await createAppointment(uow, actor, { ...params, source: 'staff' })
    return { appointmentId: appointment.id, ref: appointment.ref, status: appointment.status, startsAt: appointment.startsAt.toISOString(), endsAt: appointment.endsAt.toISOString(), warnings: appointment.warnings }
  })
  return { replay: result.replay, ...result.value }
}


// ── Lifecycle transitions ───────────────────────────────────────────────────────────────────────

async function loadScoped(tx: Tx, locationIds: string[] | null, appointmentId: string) {
  const appointment = await tx.appointment.findUnique({ where: { id: appointmentId } })
  if (!appointment) throw new DomainError(Codes.NOT_FOUND, 'Appointment not found.')
  assertLocation(locationIds, appointment.locationId)
  return appointment
}

async function cancelFollowUps(uow: UnitOfWork, appointmentId: string) {
  await uow.tx.confirmationAttempt.updateMany({ where: { appointmentId, status: 'scheduled' }, data: { status: 'suppressed', suppressedReason: 'appointment_closed', version: { increment: 1 } } })
  await uow.tx.appointmentSegment.updateMany({ where: { appointmentId }, data: { isActive: false } })
}

type TransitionArgs = { appointmentId: string; expectedVersion: number; idempotencyKey: string; reason?: string | null }

export async function confirmAppointment(_root: unknown, args: TransitionArgs & { method: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule')
  if (!(CONFIRMATION_METHODS as readonly string[]).includes(args.method)) throw new DomainError(Codes.INVALID_INPUT, 'Choose how the patient confirmed.', { field: 'method' })
  return runTransition(context, actor, 'schedule.confirm', args, async uow => {
    await loadScoped(uow.tx, locationIds, args.appointmentId)
    return confirmIn(uow, actor, args.appointmentId, args.method, args.expectedVersion)
  })
}

export async function confirmIn(uow: UnitOfWork, actor: Actor, appointmentId: string, method: string, expectedVersion?: number | null) {
  const updated = await transition<any>(uow, {
    model: 'Appointment', id: appointmentId, from: ['scheduled'], to: 'confirmed', expectedVersion, actor, eventType: 'appointment.confirmed',
    data: { confirmedAt: uow.now, confirmationMethod: method }, metadata: { method },
  })
  await uow.tx.confirmationAttempt.updateMany({ where: { appointmentId, status: 'scheduled' }, data: { status: 'suppressed', suppressedReason: 'already_confirmed', version: { increment: 1 } } })
  return updated
}

export async function markArrived(_root: unknown, args: TransitionArgs & { overrideLabGate?: boolean | null }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule')
  return runTransition(context, actor, 'schedule.arrive', args, async uow => {
    const appointment = await loadScoped(uow.tx, locationIds, args.appointmentId)
    const location = await uow.tx.location.findUniqueOrThrow({ where: { id: appointment.locationId! }, select: { timeZone: true } })
    const today = localDate(location.timeZone, uow.now)
    if (localDate(location.timeZone, appointment.startsAt) !== today && !can(actor, 'canOverrideSchedule')) {
      throw new DomainError(Codes.GUARD_FAILED, 'Only today’s appointments can be checked in.')
    }
    const gate = await labGate(uow.tx, appointment.id)
    if (gate.blocked) {
      if (!args.overrideLabGate) throw new DomainError(Codes.LAB_CASE_NOT_READY, gate.reason)
      requirePermission(actor, 'canOverrideLabGate')
      requireText(args.reason, 'override reason')
    }
    const updated = await transition<any>(uow, { model: 'Appointment', id: appointment.id, from: ['scheduled', 'confirmed'], to: 'arrived', expectedVersion: args.expectedVersion, actor, eventType: 'appointment.arrived', reason: args.reason ?? null, data: { arrivedAt: uow.now } })
    // A prospect or inactive patient becomes active when they arrive (SM§1.1).
    const patient = await uow.tx.patient.findUnique({ where: { id: appointment.patientId! }, select: { id: true, status: true, version: true } })
    if (patient && (patient.status === 'prospect' || patient.status === 'inactive')) {
      await transition(uow, { model: 'Patient', id: patient.id, from: ['prospect', 'inactive'], to: 'active', actor, eventType: 'patient.activated', metadata: { by: 'arrival', appointmentId: appointment.id }, data: patient.status === 'prospect' ? { firstVisitOn: new Date(`${today}T00:00:00Z`) } : {} })
    }
    await uow.tx.confirmationAttempt.updateMany({ where: { appointmentId: appointment.id, status: 'scheduled' }, data: { status: 'suppressed', suppressedReason: 'arrived', version: { increment: 1 } } })
    return updated
  })
}

export async function seatPatient(_root: unknown, args: TransitionArgs & { acknowledgeAlerts?: boolean | null }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule', 'canChart')
  return runTransition(context, actor, 'schedule.seat', args, async uow => {
    const appointment = await loadScoped(uow.tx, locationIds, args.appointmentId)
    const alerts = await uow.tx.patientAlert.count({ where: { patientId: appointment.patientId!, endedAt: null, severity: { in: ['caution', 'critical'] } } })
    if (alerts && !args.acknowledgeAlerts) throw new DomainError(Codes.GUARD_FAILED, `This patient has ${alerts} active medical alert${alerts === 1 ? '' : 's'}. Review and acknowledge them before seating.`)
    // I-C4 (medical history review within policy) arrives with the clinical record in Phase 2.
    return transition<any>(uow, {
      model: 'Appointment', id: appointment.id, from: ['arrived'], to: 'seated', expectedVersion: args.expectedVersion, actor, eventType: 'appointment.seated',
      data: { seatedAt: uow.now, ...(alerts ? { alertAckById: actor.kind === 'user' ? actor.userId : null, alertAckAt: uow.now } : {}) },
      metadata: { alertsAcknowledged: alerts },
    })
  })
}

export async function markReadyForCheckout(_root: unknown, args: TransitionArgs, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule', 'canChart')
  return runTransition(context, actor, 'schedule.ready', args, async uow => {
    await loadScoped(uow.tx, locationIds, args.appointmentId)
    // Until procedures are charted (Phase 2), the reason records why the visit is ready.
    return transition<any>(uow, { model: 'Appointment', id: args.appointmentId, from: ['seated'], to: 'ready_for_checkout', expectedVersion: args.expectedVersion, actor, eventType: 'appointment.ready', reason: args.reason ?? null, data: { readyAt: uow.now } })
  })
}

export async function completeAppointment(_root: unknown, args: TransitionArgs, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule', 'canCompleteProcedures')
  return runTransition(context, actor, 'schedule.complete', args, async uow => {
    const appointment = await loadScoped(uow.tx, locationIds, args.appointmentId)
    const location = await uow.tx.location.findUniqueOrThrow({ where: { id: appointment.locationId! }, select: { timeZone: true } })
    const updated = await transition<any>(uow, { model: 'Appointment', id: appointment.id, from: ['ready_for_checkout'], to: 'completed', expectedVersion: args.expectedVersion, actor, eventType: 'appointment.completed', data: { completedAt: uow.now } })
    await uow.tx.patient.update({ where: { id: appointment.patientId! }, data: { lastVisitOn: new Date(`${localDate(location.timeZone, appointment.startsAt)}T00:00:00Z`) } })
    // Recall recompute (§9) and claim drafts (§7.1) subscribe to this event in later phases.
    return updated
  })
}

/**
 * Cancel (SM§2.1). Inside the late-cancel window it is recorded as broken (late_cancel) instead, so
 * the practice's broken-appointment numbers are honest. Attached planned procedures stay unscheduled.
 */
export async function cancelAppointment(_root: unknown, args: TransitionArgs, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule')
  const reason = requireText(args.reason, 'reason')
  return runTransition(context, actor, 'schedule.cancel', args, async uow => {
    await loadScoped(uow.tx, locationIds, args.appointmentId)
    return cancelIn(uow, actor, args.appointmentId, reason, args.expectedVersion)
  })
}

export async function cancelIn(uow: UnitOfWork, actor: Actor, appointmentId: string, reason: string, expectedVersion?: number | null) {
  const appointment = await uow.tx.appointment.findUniqueOrThrow({ where: { id: appointmentId } })
  const practice = await uow.tx.practiceSettings.findUnique({ where: { id: 1 }, select: { lateCancelHours: true } })
  const lateHours = practice?.lateCancelHours ?? 24
  const late = appointment.startsAt.getTime() - uow.now.getTime() < lateHours * 3_600_000
  if (late) return breakIn(uow, actor, appointmentId, 'late_cancel', reason, expectedVersion)
  const updated = await transition<any>(uow, { model: 'Appointment', id: appointmentId, from: ['scheduled', 'confirmed'], to: 'cancelled', expectedVersion, actor, eventType: 'appointment.cancelled', reason, data: { cancelledAt: uow.now, cancelReason: reason } })
  await cancelFollowUps(uow, appointmentId)
  emitOpenTime(uow, appointment)
  return updated
}

/**
 * Cancel without the late-cancel rule: the visit is withdrawn by the practice for a reason that is
 * not the patient's choice (a death, a spam booking), so no broken-appointment event is recorded.
 */
export async function withdrawIn(uow: UnitOfWork, actor: Actor, appointmentId: string, reason: string) {
  const appointment = await uow.tx.appointment.findUniqueOrThrow({ where: { id: appointmentId } })
  const updated = await transition<any>(uow, { model: 'Appointment', id: appointmentId, from: ['scheduled', 'confirmed'], to: 'cancelled', actor, eventType: 'appointment.withdrawn', reason, data: { cancelledAt: uow.now, cancelReason: reason } })
  await cancelFollowUps(uow, appointmentId)
  emitOpenTime(uow, appointment)
  return updated
}

export async function markBroken(_root: unknown, args: TransitionArgs & { kind: 'no_show' | 'late_cancel' }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule')
  if (args.kind !== 'no_show' && args.kind !== 'late_cancel') throw new DomainError(Codes.INVALID_INPUT, 'Choose no-show or late cancel.', { field: 'kind' })
  return runTransition(context, actor, 'schedule.break', args, async uow => {
    await loadScoped(uow.tx, locationIds, args.appointmentId)
    return breakIn(uow, actor, args.appointmentId, args.kind, args.reason ?? '', args.expectedVersion)
  })
}

export async function breakIn(uow: UnitOfWork, actor: Actor, appointmentId: string, kind: 'no_show' | 'late_cancel', reason: string, expectedVersion?: number | null) {
  const appointment = await uow.tx.appointment.findUniqueOrThrow({ where: { id: appointmentId } })
  const from = kind === 'no_show' ? ['scheduled', 'confirmed', 'arrived'] : ['scheduled', 'confirmed']
  const updated = await transition<any>(uow, { model: 'Appointment', id: appointmentId, from, to: 'broken', expectedVersion, actor, eventType: 'appointment.broken', reason: reason || null, data: { brokenKind: kind, cancelledAt: kind === 'late_cancel' ? uow.now : undefined, cancelReason: reason }, metadata: { kind } })
  await uow.tx.brokenAppointmentEvent.create({ data: { appointmentId, patientId: appointment.patientId, kind, at: uow.now, recordedById: actor.kind === 'user' ? actor.userId : null, reason } })
  await cancelFollowUps(uow, appointmentId)
  emitOpenTime(uow, appointment)
  // The broken-appointment fee, when the practice charges one, is an adjustment request (Phase 4), never automatic.
  return updated
}

function emitOpenTime(uow: UnitOfWork, appointment: { id: string; locationId: string | null; operatoryId: string | null; startsAt: Date; endsAt: Date }) {
}

/** Book the new time and retire the old appointment in one transaction (SM§2.1 → rescheduled). */
export async function rescheduleAppointment(_root: unknown, args: TransitionArgs & SlotArgs & { holdId?: string | null; overrideTemplate?: boolean | null; overrideProviderClash?: boolean | null; overrideReason?: string | null }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule')
  assertLocation(locationIds, args.locationId)
  return runTransition(context, actor, 'schedule.reschedule', args, async uow => {
    const old = await loadScoped(uow.tx, locationIds, args.appointmentId)
    return rescheduleIn(uow, actor, old, args)
  })
}

export async function rescheduleIn(uow: UnitOfWork, actor: Actor, old: any, args: Omit<TransitionArgs, 'idempotencyKey'> & SlotArgs & { holdId?: string | null; holderRef?: string | null; overrideTemplate?: boolean | null; overrideProviderClash?: boolean | null; overrideReason?: string | null; source?: BookInput['source'] }) {
  if (!['scheduled', 'confirmed'].includes(old.status)) throw new DomainError(Codes.INVALID_TRANSITION, `A ${old.status} appointment can't be rescheduled.`, { currentStatus: old.status })
  if (args.expectedVersion !== undefined && args.expectedVersion !== null && old.version !== args.expectedVersion) throw new DomainError(Codes.STALE_STATE, 'The appointment changed since you loaded it.', { currentVersion: old.version })
  // Free the old time first (same transaction), so moving within an overlapping window works.
  const retired = await transition<any>(uow, { model: 'Appointment', id: old.id, from: ['scheduled', 'confirmed'], to: 'rescheduled', expectedVersion: old.version, actor, eventType: 'appointment.rescheduled', reason: args.reason ?? null, data: { cancelledAt: uow.now } })
  await cancelFollowUps(uow, old.id)
  const fresh = await createAppointment(uow, actor, {
    locationId: args.locationId, operatoryId: args.operatoryId, typeId: args.typeId, startsAt: args.startsAt, providerId: args.providerId,
    patientId: old.patientId, holdId: args.holdId, holderRef: args.holderRef, note: old.note, overrideTemplate: args.overrideTemplate, overrideProviderClash: args.overrideProviderClash,
    overrideReason: args.overrideReason, source: args.source ?? 'staff', isSynthetic: old.isSynthetic,
  })
  await uow.tx.appointment.update({ where: { id: old.id }, data: { rescheduledToId: fresh.id } })
  emitOpenTime(uow, old)
  return { ...fresh, previous: { id: retired.id, status: retired.status } }
}

async function runTransition(context: Ctx, actor: Actor, name: string, args: { idempotencyKey: string } & Record<string, unknown>, work: (uow: UnitOfWork) => Promise<any>) {
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name, actor, idempotencyKey, params }, async uow => {
    const row = await work(uow)
    return { appointmentId: row.id, ref: row.ref, status: row.status, version: row.version, startsAt: row.startsAt?.toISOString?.() ?? row.startsAt, brokenKind: row.brokenKind ?? '', previous: row.previous ?? null }
  })
  return { replay: result.replay, ...result.value }
}

// ── ASAP list ───────────────────────────────────────────────────────────────────────────────────

export async function addAsapEntry(_root: unknown, args: { patientId: string; locationId: string; appointmentTypeId?: string | null; providerId?: string | null; preferredWindows?: unknown; earliestDate?: string | null; note?: string | null; priority?: number | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule')
  assertLocation(locationIds, args.locationId)
  const windows = Array.isArray(args.preferredWindows) ? args.preferredWindows : []
  for (const w of windows as any[]) {
    if (!Number.isInteger(w?.weekday) || w.weekday < 0 || w.weekday > 6 || !/^\d{2}:\d{2}$/.test(String(w?.from)) || !/^\d{2}:\d{2}$/.test(String(w?.to)) || w.to <= w.from) {
      throw new DomainError(Codes.INVALID_INPUT, 'Each preferred window needs a weekday (0–6) and a from/to time (HH:mm).', { field: 'preferredWindows' })
    }
  }
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'schedule.asap_add', actor, idempotencyKey, params }, async uow => {
    const patientId = await resolvePatientRef(uow.tx, args.patientId)
    const patient = await assertPatientInScope(uow.tx, locationIds, patientId)
    assertBookablePatient(patient)
    const entry = await uow.tx.asapEntry.create({
      data: {
        patientId, locationId: args.locationId, appointmentTypeId: args.appointmentTypeId ?? null, providerId: args.providerId ?? null,
        preferredWindows: windows as never, earliestDate: args.earliestDate ? new Date(`${args.earliestDate}T00:00:00Z`) : null,
        note: optionalText(args.note), status: 'active', priority: Math.max(0, Math.min(9, Number(args.priority ?? 0))),
      },
    })
    auditCreate(uow, actor, 'AsapEntry', entry.id, 'asap.added', { patientId, locationId: args.locationId })
    return { asapEntryId: entry.id, status: entry.status }
  })
  return { replay: result.replay, ...result.value }
}

export async function closeAsapEntry(_root: unknown, args: { asapEntryId: string; status: 'declined' | 'expired'; expectedVersion: number; reason?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule')
  if (args.status !== 'declined' && args.status !== 'expired') throw new DomainError(Codes.INVALID_INPUT, 'Choose declined or expired.')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'schedule.asap_close', actor, idempotencyKey, params }, async uow => {
    const entry = await uow.tx.asapEntry.findUnique({ where: { id: args.asapEntryId } })
    if (!entry) throw new DomainError(Codes.NOT_FOUND, 'ASAP entry not found.')
    assertLocation(locationIds, entry.locationId)
    const updated = await transition<any>(uow, { model: 'AsapEntry', id: entry.id, from: ['active', 'offered'], to: args.status, expectedVersion: args.expectedVersion, actor, eventType: `asap.${args.status}`, reason: args.reason ?? null })
    return { asapEntryId: updated.id, status: updated.status, version: updated.version }
  })
  return { replay: result.replay, ...result.value }
}

// ── Templates ───────────────────────────────────────────────────────────────────────────────────

/**
 * Publish a draft template (SCHEMA §4.2). The previous active template for the location ends the day
 * before; booked appointments outside the new blocks are listed for review, never moved.
 */
export async function publishScheduleTemplate(_root: unknown, args: { templateId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageTemplates', 'canManagePractice')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'schedule.template_publish', actor, idempotencyKey, params }, async uow => {
    const template = await uow.tx.scheduleTemplate.findUnique({ where: { id: args.templateId }, include: { blocks: true } })
    if (!template) throw new DomainError(Codes.NOT_FOUND, 'Template not found.')
    assertLocation(locationIds, template.locationId)
    if (!template.blocks.length) throw new DomainError(Codes.GUARD_FAILED, 'Add at least one block before publishing.')
    const effectiveFrom = template.effectiveFrom.toISOString().slice(0, 10)
    const dayBefore = new Date(`${addDays(effectiveFrom, -1)}T00:00:00Z`)
    const previous = await uow.tx.scheduleTemplate.findMany({ where: { locationId: template.locationId, status: 'active', id: { not: template.id } } })
    for (const p of previous) {
      if (p.effectiveFrom.getTime() >= template.effectiveFrom.getTime()) {
        await transition(uow, { model: 'ScheduleTemplate', id: p.id, from: ['active'], to: 'retired', actor, eventType: 'template.retired', metadata: { supersededBy: template.id } })
      } else if (!p.effectiveTo || p.effectiveTo.getTime() >= template.effectiveFrom.getTime()) {
        await uow.tx.scheduleTemplate.update({ where: { id: p.id }, data: { effectiveTo: dayBefore, version: { increment: 1 } } })
        uow.audit({ eventType: 'template.ended', entityType: 'ScheduleTemplate', entityId: p.id, actorUserId: actor.kind === 'user' ? actor.userId : null, after: { effectiveTo: dayBefore } })
      }
    }
    const published = await transition<any>(uow, { model: 'ScheduleTemplate', id: template.id, from: ['draft'], to: 'active', expectedVersion: args.expectedVersion, actor, eventType: 'template.published', data: { publishedAt: uow.now, publishedById: actor.kind === 'user' ? actor.userId : null } })
    // Booked appointments that now fall outside a block, for the office manager to review.
    const location = await uow.tx.location.findUniqueOrThrow({ where: { id: template.locationId! }, select: { timeZone: true } })
    const upcoming = await uow.tx.appointment.findMany({ where: { locationId: template.locationId, status: { in: ACTIVE }, startsAt: { gte: zonedInstant(location.timeZone, effectiveFrom, '00:00') } }, select: { id: true, ref: true, operatoryId: true, typeId: true, startsAt: true, endsAt: true }, take: 500 })
    const outside: string[] = []
    const cache = new Map<string, Awaited<ReturnType<typeof loadLocationDay>>>()
    for (const a of upcoming) {
      const date = localDate(location.timeZone, a.startsAt)
      if (!cache.has(date)) cache.set(date, await loadLocationDay(uow.tx, template.locationId!, date))
      const day = cache.get(date)!
      const fits = day.windows.some(w => w.operatoryId === a.operatoryId && w.startMs <= a.startsAt.getTime() && a.endsAt.getTime() <= w.endMs && (!w.allowedTypeIds.length || w.allowedTypeIds.includes(a.typeId!)))
      if (!fits) outside.push(a.ref)
    }
    return { templateId: published.id, status: published.status, appointmentsOutsideTemplate: outside }
  })
  return { replay: result.replay, ...result.value }
}

/** The no-show job (SM§2.1): start + noShowAfterMinutes without arrival → broken (no_show). */
export async function sweepNoShows(db: any, now = new Date()) {
  const practice = await db.practiceSettings.findUnique({ where: { id: 1 }, select: { noShowAfterMinutes: true } })
  const after = (practice?.noShowAfterMinutes ?? 30) * 60_000
  const due = await db.appointment.findMany({ where: { status: { in: ['scheduled', 'confirmed'] }, startsAt: { lte: new Date(now.getTime() - after) } }, select: { id: true }, take: 100 })
  let broken = 0
  for (const a of due) {
    await command(db, { name: 'schedule.no_show_sweep', actor: { kind: 'system', name: 'no-show-sweep' }, idempotencyKey: `no-show:${a.id}`, params: { appointmentId: a.id } }, uow => breakIn(uow, { kind: 'system', name: 'no-show-sweep' }, a.id, 'no_show', 'No arrival recorded'))
      .then(() => { broken += 1 })
      .catch(() => undefined)
  }
  return broken
}

export { patternUnits }
