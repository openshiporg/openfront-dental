import { isSignedIn, sessionLocationIds, type Permission, permissions, anyOf } from '../access'

/*
 * Row filters for location-scoped clinical and front-desk lists (SCHEMA §1.6, §19 "loc").
 * A person with canAccessAllLocations sees every row; everyone else sees rows at the locations of
 * their active StaffAssignments. Server commands run with sudo and apply the same rule explicitly.
 */

type AccessArgs = { session?: any }

const rule = (read: Permission | Permission[]) => (Array.isArray(read) ? anyOf(...read) : permissions[read])

/** Records older than this no longer give a location access to a patient (SCHEMA §3.1). */
export const PATIENT_LOCATION_LOOKBACK_YEARS = 3

/** Filter for lists that point straight at a location. */
export const locationFilter = (path: string[] = ['location']) => ({ session }: AccessArgs) => {
  if (!isSignedIn({ session })) return false
  const ids = sessionLocationIds(session)
  if (ids === null) return true
  return nest(path, { id: { in: ids } })
}

/**
 * Patients: visible at their home location, or at any location where they had an appointment in
 * the last three years. Break-glass (Phase 0 BreakGlassEvent) widens this through a server command.
 */
export const patientFilter = (path: string[] = []) => ({ session }: AccessArgs) => {
  if (!isSignedIn({ session })) return false
  const ids = sessionLocationIds(session)
  if (ids === null) return true
  const since = new Date(Date.now() - PATIENT_LOCATION_LOOKBACK_YEARS * 365.25 * 86_400_000)
  const where = {
    OR: [
      { homeLocation: { id: { in: ids } } },
      { appointments: { some: { location: { id: { in: ids } }, startsAt: { gte: since.toISOString() } } } },
    ],
  }
  return path.length ? nest(path, where) : where
}

function nest(path: string[], leaf: Record<string, unknown>): Record<string, unknown> {
  return path.reduceRight<Record<string, unknown>>((inner, key) => ({ [key]: inner }), leaf)
}

/** Read with `read` at my locations; every write through a server command. */
export const scopedGoverned = (read: Permission | Permission[], filter: (args: AccessArgs) => unknown) => ({
  operation: { query: rule(read), create: () => false, update: () => false, delete: () => false },
  filter: { query: filter as any },
})

/** Read with `read` at my locations; reference data edited by holders of `write` at those locations. */
export const scopedManaged = (read: Permission | Permission[], write: Permission | Permission[], filter: (args: AccessArgs) => unknown) => ({
  operation: { query: rule(read), create: rule(write), update: rule(write), delete: () => false },
  filter: { query: filter as any, update: filter as any },
})
