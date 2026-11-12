import type { Tx } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import { parsePackRules } from '../lib/jurisdiction'
import { addDays, localDate } from '../lib/time'
import { ACTIVE_APPOINTMENT_STATUSES } from '../models/scheduling'
import {
  chairClash, dentistsOnSite, materialiseBlocks, MS_PER_MINUTE, parsePattern, patternUnits, planSegments,
  templateWindowFor, type BusyInterval, type OpenWindow, type PlannedSegment, type ProviderBusy,
} from './engine'

/*
 * Database side of scheduling: loads one location-day, takes the ordered locks, and checks a booking
 * against I-S1–I-S5 inside the command's transaction. Every capacity decision is made after the
 * locks are held, and the exclusion constraints back it up (migration dental_phase1).
 */

const ACTIVE = [...ACTIVE_APPOINTMENT_STATUSES]

/**
 * Ordered advisory locks (SM§0.4): operatory → provider → patient, each group sorted, so two
 * commands that need overlapping resources always queue in the same order and never deadlock.
 */
export async function lockResources(tx: Tx, input: { operatoryIds?: (string | null | undefined)[]; providerIds?: (string | null | undefined)[]; patientIds?: (string | null | undefined)[] }) {
  const keys = [
    ...uniq(input.operatoryIds).map(id => `operatory:${id}`),
    ...uniq(input.providerIds).map(id => `provider:${id}`),
    ...uniq(input.patientIds).map(id => `patient:${id}`),
  ]
  if (!keys.length) return keys
  // One round trip; the subquery keeps the array order, so locks are taken operatory → provider → patient.
  await tx.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtextextended(t.k, 0)) FROM (SELECT k FROM unnest($1::text[]) WITH ORDINALITY AS u(k, n) ORDER BY n) AS t',
    keys,
  )
  return keys
}

/** Expire live-looking holds past their TTL on these chairs, so a stale row never blocks a booking. */
export async function expireStaleHolds(tx: Tx, operatoryIds: string[], now: Date) {
  const stale = await tx.bookingHold.findMany({ where: { operatoryId: { in: operatoryIds }, status: 'held', expiresAt: { lte: now } }, select: { id: true } })
  if (!stale.length) return 0
  const result = await tx.bookingHold.updateMany({ where: { id: { in: stale.map(h => h.id) }, status: 'held', expiresAt: { lte: now } }, data: { status: 'expired', version: { increment: 1 } } })
  return result.count
}

const uniq = (ids?: (string | null | undefined)[]) => [...new Set((ids ?? []).filter((id): id is string => !!id))].sort()

export type LocationDay = {
  location: { id: string; timeZone: string; name: string }
  date: string
  windows: OpenWindow[]
  unitMinutes: number
  supervision: { enforcement: 'hard' | 'warn'; hygieneGeneralAllowed: boolean; verify: boolean }
}

/** The template windows for a location-date (the active template in effect), minus closures. */
export async function loadLocationDay(tx: Tx, locationId: string, date: string): Promise<LocationDay> {
  const location = await tx.location.findUnique({ where: { id: locationId }, select: { id: true, timeZone: true, name: true, isActive: true, jurisdiction: { select: { rules: true } } } })
  if (!location || !location.isActive) throw new DomainError(Codes.NOT_FOUND, 'That location does not exist or is closed.')
  const practice = await tx.practiceSettings.findUnique({ where: { id: 1 }, select: { scheduleUnitMinutes: true } })
  const day = new Date(`${date}T00:00:00.000Z`)
  const template = await tx.scheduleTemplate.findFirst({
    where: { locationId, status: 'active', effectiveFrom: { lte: day }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }] },
    orderBy: { effectiveFrom: 'desc' },
    select: { blocks: { select: { id: true, weekday: true, operatoryId: true, providerId: true, startLocal: true, endLocal: true, onlineBookable: true, allowedTypes: { select: { id: true } }, provider: { select: { providerType: true } }, operatory: { select: { isActive: true } } } } },
  })
  const closures = await tx.closureDay.findMany({ where: { date: day, OR: [{ locationId }, { locationId: null }] } })
  const blocks = (template?.blocks ?? []).filter(b => b.operatoryId && b.operatory?.isActive !== false).map(b => ({
    id: b.id, weekday: b.weekday, operatoryId: b.operatoryId as string, providerId: b.providerId, providerType: b.provider?.providerType ?? null,
    startLocal: b.startLocal, endLocal: b.endLocal, allowedTypeIds: b.allowedTypes.map(t => t.id), onlineBookable: b.onlineBookable,
  }))
  const windows = materialiseBlocks(date, location.timeZone, blocks, closures.map(c => ({ date: c.date.toISOString().slice(0, 10), isHalfDay: c.isHalfDay, startLocal: c.startLocal, endLocal: c.endLocal })))
  let supervision: LocationDay['supervision'] = { enforcement: 'hard', hygieneGeneralAllowed: false, verify: true }
  try {
    if (location.jurisdiction?.rules) {
      const rules = parsePackRules(location.jurisdiction.rules)
      supervision = { enforcement: rules.supervision.value.enforcement, hygieneGeneralAllowed: rules.supervision.value.hygieneGeneralAllowed, verify: rules.supervision.verify }
    }
  } catch {
    // A pack that doesn't parse can't relax a rule: keep the strict default.
  }
  return { location: { id: location.id, timeZone: location.timeZone, name: location.name }, date, windows, unitMinutes: practice?.scheduleUnitMinutes ?? 10, supervision }
}

/** Chair use per operatory on [from, to): active appointments and live holds. */
export async function loadChairBusy(tx: Tx, operatoryIds: string[], fromMs: number, toMs: number, now: Date, ignore: { appointmentIds?: string[]; holdIds?: string[] } = {}) {
  const from = new Date(fromMs - 4 * 60 * MS_PER_MINUTE)
  const to = new Date(toMs + 4 * 60 * MS_PER_MINUTE)
  const [appointments, holds] = await Promise.all([
    tx.appointment.findMany({ where: { operatoryId: { in: operatoryIds }, status: { in: ACTIVE }, startsAt: { lt: to }, endsAt: { gt: from }, id: { notIn: ignore.appointmentIds ?? [] } }, select: { operatoryId: true, startsAt: true, endsAt: true, bufferAfterMinutes: true } }),
    tx.bookingHold.findMany({ where: { operatoryId: { in: operatoryIds }, status: 'held', expiresAt: { gt: now }, startsAt: { lt: to }, endsAt: { gt: from }, id: { notIn: ignore.holdIds ?? [] } }, select: { operatoryId: true, startsAt: true, endsAt: true } }),
  ])
  const busy: Record<string, BusyInterval[]> = {}
  for (const a of appointments) (busy[a.operatoryId as string] ??= []).push({ startMs: a.startsAt.getTime(), endMs: a.endsAt.getTime(), bufferAfterMinutes: a.bufferAfterMinutes ?? 0 })
  for (const h of holds) (busy[h.operatoryId as string] ??= []).push({ startMs: h.startsAt.getTime(), endMs: h.endsAt.getTime() })
  return busy
}

/** Provider time on [from, to): committed segments and segments reserved by live holds. */
export async function loadProviderBusy(tx: Tx, fromMs: number, toMs: number, now: Date, ignore: { appointmentIds?: string[]; holdIds?: string[] } = {}): Promise<ProviderBusy[]> {
  const from = new Date(fromMs)
  const to = new Date(toMs)
  const [segments, holds] = await Promise.all([
    tx.appointmentSegment.findMany({
      where: { providerId: { not: null }, startsAt: { lt: to }, endsAt: { gt: from }, appointment: { status: { in: ACTIVE }, id: { notIn: ignore.appointmentIds ?? [] } } },
      select: { providerId: true, startsAt: true, endsAt: true, concurrencyKind: true, role: true },
    }),
    tx.bookingHold.findMany({ where: { status: 'held', expiresAt: { gt: now }, startsAt: { lt: to }, endsAt: { gt: from }, id: { notIn: ignore.holdIds ?? [] } }, select: { segments: true } }),
  ])
  const out: ProviderBusy[] = segments.map(s => ({ providerId: s.providerId as string, startMs: s.startsAt.getTime(), endMs: s.endsAt.getTime(), concurrencyKind: s.concurrencyKind, role: s.role as ProviderBusy['role'] }))
  for (const hold of holds) {
    for (const s of (Array.isArray(hold.segments) ? hold.segments : []) as any[]) {
      if (s?.providerId && Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && overlapsRange(s.startMs, s.endMs, fromMs, toMs)) out.push({ providerId: s.providerId, startMs: s.startMs, endMs: s.endMs, concurrencyKind: s.concurrencyKind ?? 'none', role: s.role })
    }
  }
  return out
}

const overlapsRange = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1

/** The patient's other active appointments on [from, to) (I-S2). */
export async function loadPatientBusy(tx: Tx, patientId: string, fromMs: number, toMs: number, ignore: { appointmentIds?: string[] } = {}) {
  const rows = await tx.appointment.findMany({ where: { patientId, status: { in: ACTIVE }, startsAt: { lt: new Date(toMs) }, endsAt: { gt: new Date(fromMs) }, id: { notIn: ignore.appointmentIds ?? [] } }, select: { startsAt: true, endsAt: true } })
  return rows.map(r => ({ startMs: r.startsAt.getTime(), endMs: r.endsAt.getTime() }))
}

export type SlotRequest = {
  locationId: string
  operatoryId: string
  typeId: string
  startsAt: Date
  providerId?: string | null
  patientId?: string | null
  /** Overrides (each needs its permission and a reason; checked by the caller). */
  overrideTemplate?: boolean
  overrideProviderClash?: boolean
  onlineOnly?: boolean
  ignore?: { appointmentIds?: string[]; holdIds?: string[] }
}

export type SlotCheck = {
  startsAt: Date
  endsAt: Date
  localDate: string
  bufferAfterMinutes: number
  providerId: string | null
  supervisingDentistId: string | null
  segments: PlannedSegment[]
  warnings: string[]
  productionMinor: bigint
  type: { id: string; name: string; requiresDentistOnSite: boolean; onlineBookable: boolean }
}

/**
 * Checks one booking or hold against the schedule after the caller has taken the locks. Throws the
 * specific refusal (SLOT_TAKEN, PATIENT_UNAVAILABLE, PROVIDER_UNAVAILABLE, OUTSIDE_TEMPLATE,
 * SUPERVISION_REQUIRED) so the caller can tell staff exactly what is in the way.
 */
export async function checkSlot(tx: Tx, now: Date, req: SlotRequest): Promise<SlotCheck> {
  const [type, operatory, practice] = await Promise.all([
    tx.appointmentType.findUnique({ where: { id: req.typeId } }),
    tx.operatory.findUnique({ where: { id: req.operatoryId }, select: { id: true, locationId: true, isActive: true, location: { select: { timeZone: true } } } }),
    tx.practiceSettings.findUnique({ where: { id: 1 }, select: { scheduleUnitMinutes: true } }),
  ])
  if (!type || !type.isActive) throw new DomainError(Codes.INVALID_INPUT, 'That appointment type does not exist or is retired.', { field: 'typeId' })
  if (!operatory || !operatory.isActive || operatory.locationId !== req.locationId || !operatory.location) throw new DomainError(Codes.INVALID_INPUT, 'That operatory is not an active chair at this location.', { field: 'operatoryId' })
  const unitMinutes = practice?.scheduleUnitMinutes ?? 10
  const pattern = parsePattern(type.defaultPattern)
  const startMs = req.startsAt.getTime()
  if (!Number.isFinite(startMs)) throw new DomainError(Codes.INVALID_INPUT, 'Choose a start time.', { field: 'startsAt' })
  if (startMs % (unitMinutes * MS_PER_MINUTE) !== 0) throw new DomainError(Codes.INVALID_INPUT, `Appointments start on a ${unitMinutes}-minute boundary.`, { field: 'startsAt' })
  const endMs = startMs + patternUnits(pattern) * unitMinutes * MS_PER_MINUTE
  const bufferAfterMinutes = 0

  // I-S1 chair first (appointments and live holds): the common refusal, answered in one query.
  const chair = await loadChairBusy(tx, [req.operatoryId], startMs, endMs, now, req.ignore)
  if (chairClash(startMs, endMs, bufferAfterMinutes, chair[req.operatoryId] ?? [])) throw new DomainError(Codes.SLOT_TAKEN, 'That chair is already booked or held for this time.')

  const date = localDate(operatory.location.timeZone, req.startsAt)
  const day = await loadLocationDay(tx, req.locationId, date)
  const warnings: string[] = []

  // Template (I-S7 for online; staff need canOverrideTemplate to book outside a block).
  const window = templateWindowFor(day.windows, req.operatoryId, req.typeId, startMs, endMs, { onlineOnly: req.onlineOnly })
  if (!window) {
    if (!req.overrideTemplate || req.onlineOnly) throw new DomainError(Codes.OUTSIDE_TEMPLATE, 'That time is outside the schedule template for this chair and appointment type.')
    warnings.push('outside_template')
  }
  const providerId = req.providerId ?? window?.providerId ?? null
  if (!providerId) throw new DomainError(Codes.INVALID_INPUT, 'Choose a provider for this appointment.', { field: 'providerId' })
  const provider = await tx.providerProfile.findUnique({ where: { id: providerId }, select: { id: true, providerType: true, isActive: true } })
  if (!provider || !provider.isActive) throw new DomainError(Codes.INVALID_INPUT, 'That provider is not active.', { field: 'providerId' })

  // I-S2 patient.
  if (req.patientId) {
    const patientBusy = await loadPatientBusy(tx, req.patientId, startMs, endMs, req.ignore)
    if (patientBusy.length) throw new DomainError(Codes.PATIENT_UNAVAILABLE, 'The patient already has an appointment at this time.')
  }

  // I-S3 provider time, with the hygiene exam float.
  const providerBusy = await loadProviderBusy(tx, startMs, endMs, now, req.ignore)
  const plan = planSegments({ pattern, unitMinutes, startMs, providerId, windows: day.windows, providerBusy })
  if (plan.clashes.length) {
    if (!req.overrideProviderClash) throw new DomainError(Codes.PROVIDER_UNAVAILABLE, 'The provider is already committed for part of this time.')
    for (const c of plan.clashes) c.segment.concurrencyKind = 'approved_override'
    warnings.push('provider_overlap_override')
  }

  // I-S5 supervision for hygiene visits that need a dentist on site.
  let supervisingDentistId: string | null = plan.examProviderId
  if (type.requiresDentistOnSite) {
    const onSite = dentistsOnSite(day.windows, startMs, endMs)
    supervisingDentistId = supervisingDentistId && onSite.includes(supervisingDentistId) ? supervisingDentistId : onSite[0] ?? null
    if (!supervisingDentistId && day.supervision.hygieneGeneralAllowed) warnings.push('general_supervision')
    else if (!supervisingDentistId) {
      if (day.supervision.enforcement === 'hard' || req.onlineOnly) throw new DomainError(Codes.SUPERVISION_REQUIRED, 'No dentist is scheduled on site for this hygiene visit, and this location’s jurisdiction pack requires one.')
      warnings.push('no_dentist_on_site')
    }
  }

  return {
    startsAt: new Date(startMs), endsAt: new Date(endMs), localDate: date, bufferAfterMinutes, providerId, supervisingDentistId,
    segments: plan.segments, warnings, productionMinor: BigInt(type.defaultProductionMinor ?? 0n),
    type: { id: type.id, name: type.name, requiresDentistOnSite: type.requiresDentistOnSite, onlineBookable: type.onlineBookable },
  }
}

/**
 * Before locking: which provider rows a booking will touch. The provider comes from the request or
 * the template block; a hygiene pattern with an exam unit may use any dentist on site, so all of them
 * are locked (in sorted order) and the exam float can't be double-assigned by a concurrent booking.
 */
export async function preflight(tx: Tx, req: { locationId: string; operatoryId: string; typeId: string; startsAt: Date; providerId?: string | null }) {
  const [type, operatory, practice] = await Promise.all([
    tx.appointmentType.findUnique({ where: { id: req.typeId }, select: { defaultPattern: true } }),
    tx.operatory.findUnique({ where: { id: req.operatoryId }, select: { locationId: true, location: { select: { timeZone: true } } } }),
    tx.practiceSettings.findUnique({ where: { id: 1 }, select: { scheduleUnitMinutes: true } }),
  ])
  if (!type || !operatory?.location || operatory.locationId !== req.locationId) return { providerIds: req.providerId ? [req.providerId] : [] }
  let pattern
  try { pattern = parsePattern(type.defaultPattern) } catch { return { providerIds: req.providerId ? [req.providerId] : [] } }
  const startMs = req.startsAt.getTime()
  const endMs = startMs + patternUnits(pattern) * (practice?.scheduleUnitMinutes ?? 10) * MS_PER_MINUTE
  const day = await loadLocationDay(tx, req.locationId, localDate(operatory.location.timeZone, req.startsAt))
  const window = day.windows.find(w => w.operatoryId === req.operatoryId && w.startMs <= startMs && endMs <= w.endMs)
  const providerIds = [req.providerId ?? window?.providerId ?? null]
  if (pattern.some(u => u.role === 'exam')) providerIds.push(...dentistsOnSite(day.windows, startMs, endMs))
  return { providerIds: providerIds.filter((id): id is string => !!id) }
}

/** Lab-gate (I-S6): a lab case tied to this visit that has not come back blocks check-in unless someone with the override says why. */
export async function labGate(tx: Tx, appointmentId: string): Promise<{ blocked: false } | { blocked: true; reason: string }> {
  const { labGateFor } = await import('../mutations/phase6')
  return labGateFor(tx, appointmentId)
}

/** Translate a database exclusion refusal into SLOT_TAKEN (the backstop fired after a race). */
export function asSlotTaken(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error)
  if (/exclusion constraint|exclusion_violation|23P01|is held for this time|already has an appointment/i.test(message)) {
    if (/patient_overlap/i.test(message)) throw new DomainError(Codes.PATIENT_UNAVAILABLE, 'The patient already has an appointment at this time.')
    throw new DomainError(Codes.SLOT_TAKEN, 'That chair was just booked or held by someone else. Pick another time.')
  }
  throw error
}

export const nextDay = (date: string) => addDays(date, 1)
