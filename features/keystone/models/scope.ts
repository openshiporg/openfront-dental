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
  const where = patientWhere(ids)
  return path.length ? nest(path, where) : where
}

/** The patient-visibility rule as a plain where for the given locations. */
function patientWhere(ids: string[]) {
  const since = new Date(Date.now() - PATIENT_LOCATION_LOOKBACK_YEARS * 365.25 * 86_400_000)
  return {
    OR: [
      { homeLocation: { id: { in: ids } } },
      { appointments: { some: { location: { id: { in: ids } }, startsAt: { gte: since.toISOString() } } } },
    ],
  }
}

/** A guarantor is mine when every patient linked to them is visible to me, and at least one is. */
function linksWhere(ids: string[]) {
  const visible = patientWhere(ids)
  return { links: { some: { patient: visible }, none: { patient: { NOT: [visible] } } } }
}

/**
 * Paths from a list to the relationships that place a money row. `location` and `guarantor` are required matches; `patient` and
 * `account` may be empty, but when set they must be visible (a family account through its guarantor's linked patients).
 */
export type MoneyPaths = { location?: string[]; patient?: string[]; account?: string[]; guarantor?: string[] }

/** The same rule seen from a list that reaches the money row through `prefix` (e.g. a note on a ledger entry). */
export const under = (prefix: string[], spec: MoneyPaths): MoneyPaths =>
  Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, [...prefix, ...(v as string[])]])) as MoneyPaths

/** The where a money row must match for a reader limited to `ids`. */
export function moneyWhere(spec: MoneyPaths, ids: string[]): Record<string, unknown> {
  const parts: Record<string, unknown>[] = []
  const optional = (path: string[], where: Record<string, unknown>) => {
    const last = path[path.length - 1]
    return nest(path.slice(0, -1), { OR: [{ [last]: null }, { [last]: where }] })
  }
  if (spec.location) parts.push(nest(spec.location, { id: { in: ids } }))
  if (spec.patient) parts.push(optional(spec.patient, patientWhere(ids)))
  if (spec.account) parts.push(optional(spec.account, { guarantor: linksWhere(ids) }))
  if (spec.guarantor) parts.push(nest(spec.guarantor, linksWhere(ids)))
  return parts.length === 1 ? parts[0] : { AND: parts }
}

/** Shapes shared by several lists. */
export const MONEY = {
  ledgerEntry: { location: ['location'], patient: ['patient'], account: ['account'] },
  claim: { location: ['location'], patient: ['patient'] },
  payment: { location: ['location'], patient: ['patient'], account: ['account'] },
} satisfies Record<string, MoneyPaths>

/**
 * Money rows (Phase 4 r1 B1): the row's office is one of mine, and any patient or family account it names is visible to me.
 * A Tampa-only reader sees no St. Petersburg row, no Tampa row about a St. Petersburg patient, and no family balance that
 * includes one. Applies to every read path: lists, counts, relation fields and MCP (which runs the caller's session).
 */
export const moneyFilter = (spec: MoneyPaths) => ({ session }: AccessArgs) => {
  if (!isSignedIn({ session })) return false
  const ids = sessionLocationIds(session)
  if (ids === null) return true
  return moneyWhere(spec, ids)
}

/** Insurance remittances: every matched claim is mine, and at least one is; a repeat delivery follows its original. */
export const remittanceFilter = () => ({ session }: AccessArgs) => {
  if (!isSignedIn({ session })) return false
  const ids = sessionLocationIds(session)
  if (ids === null) return true
  const claim = moneyWhere(MONEY.claim, ids)
  const mine = { some: { claim }, none: { claim: { NOT: [claim] } } }
  return { OR: [{ claims: mine }, { duplicateOf: { claims: mine } }] }
}

/**
 * Rows that name patients or guarantors (Phase 4 r2 N3): contact points, consent, family groups, broken appointments. A row is mine
 * when its office (if it has one) is mine, and every patient and guarantor it names is visible to me, and it names at least one.
 * `patients` are paths to a single Patient relationship (may be empty on the row); `members` is a path to a Patient list (a family:
 * at least one member, and none outside my scope); `guarantors` are paths to a Guarantor relationship (may be empty).
 */
export type PeoplePaths = { location?: string[]; patients?: string[][]; members?: string[]; guarantors?: string[][] }

export function peopleWhere(spec: PeoplePaths, ids: string[]): Record<string, unknown> {
  const visible = patientWhere(ids)
  const parts: Record<string, unknown>[] = []
  const some: Record<string, unknown>[] = []
  // Empty at any step of the path is allowed (a conversation with no contact point); filled in, it must be visible.
  const optional = (path: string[], where: Record<string, unknown>): Record<string, unknown> =>
    path.length === 1 ? { OR: [{ [path[0]]: null }, { [path[0]]: where }] } : { OR: [{ [path[0]]: null }, { [path[0]]: optional(path.slice(1), where) }] }
  if (spec.location) parts.push(nest(spec.location, { id: { in: ids } }))
  for (const path of spec.patients ?? []) {
    parts.push(optional(path, visible))
    some.push(nest(path, visible))
  }
  for (const path of spec.guarantors ?? []) {
    parts.push(optional(path, linksWhere(ids)))
    some.push(nest(path, linksWhere(ids)))
  }
  if (spec.members) {
    parts.push(nest(spec.members, { none: { NOT: [visible] } }))
    some.push(nest(spec.members, { some: visible }))
  }
  if (some.length) parts.push(some.length === 1 ? some[0] : { OR: some })
  return parts.length === 1 ? parts[0] : { AND: parts }
}

export const peopleFilter = (spec: PeoplePaths) => ({ session }: AccessArgs) => {
  if (!isSignedIn({ session })) return false
  const ids = sessionLocationIds(session)
  if (ids === null) return true
  return peopleWhere(spec, ids)
}

/** Any rule as a where for a reader limited to `ids` (all-offices readers see everything). */
export const scopedBy = (build: (ids: string[]) => Record<string, unknown>) => ({ session }: AccessArgs) => {
  if (!isSignedIn({ session })) return false
  const ids = sessionLocationIds(session)
  if (ids === null) return true
  return build(ids)
}

/** Portal accounts: every patient the account may act for is visible to me, and it acts for at least one. */
export function portalAccountWhere(ids: string[]) {
  const visible = patientWhere(ids)
  return { scopes: { some: { patient: visible }, none: { OR: [{ patient: null }, { patient: { NOT: [visible] } }] } } }
}

/** The patient-visibility rule for a reader limited to `ids`, for use in other rules. */
export const visiblePatient = (ids: string[]) => patientWhere(ids)

/** Rows that record what a person did (audit, PHI reads): a reader limited to some offices sees only what they did themselves. */
export const ownActionsOnly = (actorPath: string[] = ['actorUser']) => ({ session }: AccessArgs) => {
  if (!isSignedIn({ session })) return false
  if (sessionLocationIds(session) === null) return true
  return nest(actorPath, { id: { equals: String(session!.itemId) } })
}

/** Who may read a row that has no office and no patient of its own: only a reader with every office. */
export const allOfficesOnly = () => ({ session }: AccessArgs) => {
  if (!isSignedIn({ session })) return false
  return sessionLocationIds(session) === null
}

/**
 * A relationship whose rows can sit in another office than the row holding it (Restatement.entries, ChartEntry.ledgerEntry):
 * a relation filter runs inside the related list without that list's office filter, so it would confirm hidden rows one guess at
 * a time (Phase 4 r3 R3-2). Only a reader with every office may filter on it; reading the relation still applies the list's filter.
 */
export const filterableWithEveryOffice = ({ session }: AccessArgs) => isSignedIn({ session }) && sessionLocationIds(session) === null

/** The where an approval request must match for a reader limited to `ids` (N4): its office is mine, and its patients and account are visible. */
export function approvalWhere(ids: string[]) {
  return moneyWhere({ location: ['location'], patient: ['patient'], account: ['account'] }, ids) as Record<string, unknown>
}

export const approvalFilter = (prefix: string[] = []) => ({ session }: AccessArgs) => {
  if (!isSignedIn({ session })) return false
  const ids = sessionLocationIds(session)
  if (ids === null) return true
  const visible = patientWhere(ids)
  const where = { AND: [approvalWhere(ids), { OR: [{ otherPatient: null }, { otherPatient: visible }] }] }
  return prefix.length ? nest(prefix, where) : where
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
