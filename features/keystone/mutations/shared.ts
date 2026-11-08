import { sessionLocationIds, type Session } from '../access'
import { actorFromSession, type Actor } from '../lib/actor'
import type { Tx } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import { PATIENT_LOCATION_LOOKBACK_YEARS } from '../models/scope'

/*
 * Shared guards for Phase 1 commands. Commands run on the unscoped Prisma client, so they apply the
 * same location rule as the list filters (models/scope.ts) themselves, before touching a row.
 */

export type Ctx = { session?: any; prisma: any; req?: any }

export function staff(context: Ctx) {
  const actor = actorFromSession(context.session)
  const locationIds = sessionLocationIds(context.session as Session)
  return { actor, locationIds, session: context.session as Session }
}

export function assertLocation(locationIds: string[] | null, locationId: string | null | undefined) {
  if (!locationId) throw new DomainError(Codes.INVALID_INPUT, 'Choose a location.', { field: 'locationId' })
  if (locationIds !== null && !locationIds.includes(locationId)) {
    throw new DomainError(Codes.OUTSIDE_LOCATION_SCOPE, 'You are not assigned to that location today.')
  }
}

/** The same rule as patientFilter(): home location, or an appointment at my locations in the lookback window. */
export async function assertPatientInScope(tx: Tx, locationIds: string[] | null, patientId: string) {
  const patient = await tx.patient.findUnique({ where: { id: patientId }, select: { id: true, status: true, homeLocationId: true, version: true } })
  if (!patient) throw new DomainError(Codes.NOT_FOUND, 'Patient not found.')
  if (locationIds === null) return patient
  if (patient.homeLocationId && locationIds.includes(patient.homeLocationId)) return patient
  const since = new Date(Date.now() - PATIENT_LOCATION_LOOKBACK_YEARS * 365.25 * 86_400_000)
  const seen = await tx.appointment.findFirst({ where: { patientId, locationId: { in: locationIds }, startsAt: { gte: since } }, select: { id: true } })
  if (!seen) throw new DomainError(Codes.NOT_FOUND, 'Patient not found.')
  return patient
}

/**
 * Staff screens may name a patient by chart number (`chart:PT-…`) instead of the record id. Resolved
 * inside the command, then checked against the location scope like any id.
 */
export async function resolvePatientRef(tx: Tx, ref: string) {
  const value = String(ref ?? '').trim()
  if (!value.startsWith('chart:')) return value
  const chartNumber = value.slice(6).trim().replace(/^(chart\s*)?#?/i, '')
  const patient = chartNumber ? await tx.patient.findUnique({ where: { chartNumber }, select: { id: true } }) : null
  if (!patient) throw new DomainError(Codes.NOT_FOUND, 'No patient has that chart number.', { field: 'patientId' })
  return patient.id
}

export const BOOKABLE_PATIENT = new Set(['prospect', 'active', 'inactive'])

export function assertBookablePatient(patient: { status: string }) {
  if (!BOOKABLE_PATIENT.has(patient.status)) {
    throw new DomainError(Codes.GUARD_FAILED, patient.status === 'merged_into' ? 'This record was merged; book on the surviving record.' : `A ${patient.status} patient can't be booked.`, { currentStatus: patient.status })
  }
}

export const toDate = (value: unknown, field: string) => {
  const date = new Date(String(value ?? ''))
  if (Number.isNaN(date.getTime())) throw new DomainError(Codes.INVALID_INPUT, `Enter a valid ${field}.`, { field })
  return date
}

export const requireText = (value: unknown, field: string, max = 500) => {
  const text = String(value ?? '').trim()
  if (!text) throw new DomainError(Codes.INVALID_INPUT, `Enter a ${field}.`, { field })
  if (text.length > max) throw new DomainError(Codes.INVALID_INPUT, `The ${field} is too long.`, { field })
  return text
}

export const optionalText = (value: unknown, max = 2000) => String(value ?? '').trim().slice(0, max)

/** Normalised contact values: digits only for phones (US +1 assumed for 10 digits), lower-case email. */
export function normalizeContact(kind: string, value: string) {
  const raw = String(value ?? '').trim()
  if (kind === 'email') {
    const email = raw.toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new DomainError(Codes.INVALID_INPUT, 'Enter a valid email address.', { field: 'value' })
    return { value: raw, normalized: email }
  }
  const digits = raw.replace(/\D/g, '')
  const e164 = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : digits.length >= 8 && digits.length <= 15 ? `+${digits}` : ''
  if (!e164) throw new DomainError(Codes.INVALID_INPUT, 'Enter a valid phone number.', { field: 'value' })
  return { value: raw, normalized: e164 }
}

export type { Actor }
