/**
 * Calendar-day helpers for the staff schedule (server-side). Dates are practice-local `YYYY-MM-DD`
 * strings; instants come back from GraphQL as ISO strings and are shown in the location's zone.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isDate = (value: unknown): value is string => typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));

export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

export function localToday(timeZone: string, at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes after local midnight of an instant in a zone (DST-correct: uses the zone's wall clock). */
export function localMinutes(iso: string, timeZone: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
}

export const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export function clock(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'a' : 'p'}`;
}

const thisYear = () => new Date().getUTCFullYear()

/** "Mon, Nov 9" (with the year when it is not this year). */
export function dayTitle(date: string) {
  const otherYear = Number(date.slice(0, 4)) !== thisYear()
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', ...(otherYear ? { year: 'numeric' } : {}) }).format(new Date(`${date}T12:00:00Z`))
}

/** "Mon, Nov 9": a column heading or a range end; the year is added when it is not this year. */
export const shortDay = dayTitle

/** Monday of the week that contains `date`. */
export const weekStart = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7));

export const ACTIVE = ['scheduled', 'confirmed', 'arrived', 'seated', 'ready_for_checkout'];
export const COUNTS_FOR_PRODUCTION = [...ACTIVE, 'completed'];

/** Sum minor-unit strings exactly (BigInt), never as floats. */
export const sumMinor = (values: (string | null | undefined)[]) => values.reduce((total, v) => total + BigInt(v && /^-?\d+$/.test(v) ? v : '0'), 0n).toString();

/** Integer percentage of two minor-unit strings, for a progress bar only. */
export function percentOf(part: string, whole: string) {
  const w = BigInt(whole || '0');
  if (w <= 0n) return 0;
  return Number((BigInt(part || '0') * 100n) / w);
}
