// Location time (DOMAIN §6, SCHEMA G4). Instants are UTC; local business dates (date of service,
// ledger business date, recall due dates) are computed in the location's IANA time zone, never on the
// server's midnight. Wall-clock → instant conversion is DST-safe.
// adapted from openfront-hedge-fund@48199d9 features/keystone/lib/calendar.ts (zone helpers only)

const DATE = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export function assertDate(date: string) {
  if (!DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid date ${date}`)
  }
}

export function assertHhmm(value: string) {
  if (!HHMM.test(value)) throw new Error(`Invalid local time ${value} (expected HH:mm)`)
}

export function assertTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0)
  } catch {
    throw new Error(`Unknown time zone ${timeZone}`)
  }
}

export function addDays(date: string, days: number) {
  assertDate(date)
  const t = Date.parse(`${date}T12:00:00Z`) + days * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday, for a calendar date (no zone involved). */
export const weekdayOf = (date: string) => {
  assertDate(date)
  return new Date(`${date}T12:00:00Z`).getUTCDay()
}

const zoneParts = (timeZone: string, at: number) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(at))
      .map(p => [p.type, p.value]),
  )

/** The local calendar date of an instant in a time zone. */
export function localDate(timeZone: string, at: Date | number) {
  const p = zoneParts(timeZone, typeof at === 'number' ? at : at.getTime())
  return `${p.year}-${p.month}-${p.day}`
}

/** The local wall-clock HH:mm of an instant in a time zone. */
export function localTime(timeZone: string, at: Date | number) {
  const p = zoneParts(timeZone, typeof at === 'number' ? at : at.getTime())
  return `${p.hour}:${p.minute}`
}

/**
 * The UTC instant of a local wall-clock time on a date (DST-safe). A time that doesn't exist (the
 * spring-forward gap) resolves forward by the gap; an ambiguous fall-back time resolves to the first
 * occurrence (daylight time), the convention calendar apps use.
 */
export function zonedInstant(timeZone: string, date: string, hhmm: string) {
  assertDate(date)
  assertHhmm(hhmm)
  const [h, m] = hhmm.split(':').map(x => Number.parseInt(x, 10))
  const target = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h, m)
  const wall = (at: number) => {
    const p = zoneParts(timeZone, at)
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second))
  }
  // The zone offsets in force either side of the date: at most two around a transition.
  const offsetBefore = wall(target - 86_400_000) - (target - 86_400_000)
  const offsetAfter = wall(target + 86_400_000) - (target + 86_400_000)
  const valid = [target - offsetBefore, target - offsetAfter].filter(at => wall(at) === target).sort((x, y) => x - y)
  // Ambiguous (fall back): the earlier instant. Gap (spring forward): apply the pre-transition
  // offset, which lands the same distance past the gap (02:30 → 03:30).
  return new Date(valid[0] ?? target - offsetBefore)
}

/** Minutes since local midnight for an HH:mm string. */
export const minutesOf = (hhmm: string) => {
  assertHhmm(hhmm)
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
}

/** Half-open interval overlap: [a0, a1) ∩ [b0, b1) ≠ ∅. */
export const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1

/** "Tue 18 Nov, 2:30 pm EST" (DOMAIN §6.1 human labels). */
export function humanInstant(timeZone: string, at: Date | number) {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(at))
}
