import { addMonths } from './estimator'
import { addDays } from './time'

/*
 * Recall due dates (STATE-MACHINES §9). Pure: no database, no clock. A due date is the last qualifying date of service plus the
 * interval in calendar months, clamped to the end of the month (Jan 31 + 1 month = Feb 28/29). A completed scaling and root planing
 * converts the prophy recall to perio maintenance through a RecallRule. A recall is `due` from dueOn - leadDays and `overdue` once
 * dueOn + graceDays has passed; a future linked appointment makes it `scheduled`.
 */

export type RecallStatus = 'scheduled_due' | 'due' | 'overdue' | 'scheduled' | 'disabled'

export const dueDateFor = (lastServiceOn: string, intervalMonths: number) => addMonths(lastServiceOn, intervalMonths)

export function recallStatus(input: { dueOn: string; today: string; leadDays: number; graceDays: number; hasFutureAppointment: boolean; disabled?: boolean }): RecallStatus {
  if (input.disabled) return 'disabled'
  if (input.hasFutureAppointment) return 'scheduled'
  if (input.today > addDays(input.dueOn, input.graceDays)) return 'overdue'
  if (input.today >= addDays(input.dueOn, -input.leadDays)) return 'due'
  return 'scheduled_due'
}

export function ageOn(dateOfBirth: string, on: string) {
  const [by, bm, bd] = dateOfBirth.split('-').map(Number)
  const [y, m, d] = on.split('-').map(Number)
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}

export type RecallTypeLike = { key: string; intervalMonths: number; ageMinYears: number; ageMaxYears: number | null }

/** The recall type that applies at this age: the adult interval does not apply to a child, and the other way round. */
export const typeFitsAge = (type: RecallTypeLike, age: number) => age >= type.ageMinYears && (type.ageMaxYears === null || age <= type.ageMaxYears)

/** A completed therapy that converts one recall type to another (RecallRule). Returns the type key the patient is on afterwards. */
export function convertedType(current: string, trigger: 'perio_therapy_completed' | 'preventive_completed', rules: { trigger: string; from: string; to: string }[]) {
  return rules.find(r => r.trigger === trigger && r.from === current)?.to ?? current
}

/** The starting catalogue: intervals in months. Practice-editable later; these are the usual defaults. */
export const DEFAULT_RECALL_TYPES: RecallTypeLike[] = [
  { key: 'prophy_adult', intervalMonths: 6, ageMinYears: 14, ageMaxYears: null },
  { key: 'prophy_child', intervalMonths: 6, ageMinYears: 0, ageMaxYears: 13 },
  { key: 'perio_maintenance', intervalMonths: 3, ageMinYears: 14, ageMaxYears: null },
  { key: 'bitewing_series', intervalMonths: 12, ageMinYears: 0, ageMaxYears: null },
  { key: 'full_mouth_series', intervalMonths: 60, ageMinYears: 0, ageMaxYears: null },
]
export const DEFAULT_RECALL_NAMES: Record<string, string> = {
  prophy_adult: 'Adult cleaning and exam', prophy_child: 'Child cleaning and exam', perio_maintenance: 'Gum maintenance visit', bitewing_series: 'Bitewing x-rays', full_mouth_series: 'Full mouth x-rays',
}
export const DEFAULT_RECALL_RULES = [
  { key: 'srp_converts_prophy', trigger: 'perio_therapy_completed' as const, from: 'prophy_adult', to: 'perio_maintenance' },
]

const csvCell = (v: unknown) => { const t = String(v ?? ''); return /[",\n\r]/.test(t) ? `"${t.replaceAll('"', '""')}"` : /^[=+\-@]/.test(t) ? `'${t}` : t }
/** CSV text with formula-looking cells neutralised so a spreadsheet never runs a patient's name. */
export const toCsv = (header: string[], rows: unknown[][]) => [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'

/** The message staff copy; no PHI beyond the first name, and nothing is sent from here. */
export function recallMessage(input: { firstName: string; practice: string; phone: string; kind: string }) {
  return `Hi ${input.firstName}, it's time for your ${input.kind} at ${input.practice}. Call us${input.phone ? ` at ${input.phone}` : ''} and we'll find a time that suits you.`
}
