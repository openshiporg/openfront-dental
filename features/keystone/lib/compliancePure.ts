import { addMonths } from './estimator'
import { addDays } from './time'

/*
 * Compliance clocks and policy checks (Phase 6). Pure. Every clock is computed from stored dates when read; nothing here runs on a timer.
 * (verify with counsel) the 30-day access response and one 30-day extension, the 60-day breach notice and the retention periods vary by state;
 * the defaults here are starting values a privacy officer edits.
 */

export const RIGHTS_DAYS = 30
export const BREACH_DAYS = 60
export const CREDENTIAL_WARN_DAYS = 60

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

export type Clock = { dueOn: string; daysLeft: number; state: 'on_track' | 'due_soon' | 'overdue' }
export function clockOf(dueOn: string, today: string, soonDays = 7): Clock {
  const daysLeft = daysBetween(today, dueOn)
  return { dueOn, daysLeft, state: daysLeft < 0 ? 'overdue' : daysLeft <= soonDays ? 'due_soon' : 'on_track' }
}

export const rightsDueOn = (receivedOn: string) => addDays(receivedOn, RIGHTS_DAYS)
export const rightsExtendedDueOn = (dueOn: string) => addDays(dueOn, RIGHTS_DAYS)
/** The breach clock starts the day the incident was discovered. */
export const breachNoticeBy = (discoveredOn: string) => addDays(discoveredOn, BREACH_DAYS)

export function credentialState(expiresOn: string | null, today: string): 'no_date' | 'valid' | 'expiring' | 'expired' {
  if (!expiresOn) return 'no_date'
  const left = daysBetween(today, expiresOn)
  return left < 0 ? 'expired' : left <= CREDENTIAL_WARN_DAYS ? 'expiring' : 'valid'
}

export const DEFAULT_RETENTION = [{ recordType: 'patient_chart', years: 10, minorsUntilAge: 21 }]

/**
 * The day a chart may be disposed of: the later of (last activity + years) and (the day the patient reaches the minors age).
 * Dates are YYYY-MM-DD.
 */
export function eligibleOn(input: { lastActivityOn: string; dateOfBirth: string; years: number; minorsUntilAge: number | null }) {
  const byActivity = addMonths(input.lastActivityOn, input.years * 12)
  const byAge = input.minorsUntilAge ? addMonths(input.dateOfBirth, input.minorsUntilAge * 12) : byActivity
  return byActivity >= byAge ? byActivity : byAge
}

/**
 * Review replies must never confirm that someone is a patient, mention care, or invite more detail in public (HIPAA marketing and
 * disclosure rules). The check is deliberately blunt: a reply that trips it goes back to a person to rewrite.
 */
export type PolicyFinding = { rule: string; message: string }
const CHECKS: { rule: string; test: RegExp; message: string }[] = [
  { rule: 'confirms_patient', test: /\b(your|the)\s+(visit|appointment|treatment|procedure|surgery|cleaning|exam|x-?rays?|root canal|crown|implant|extraction|filling|dentures?|braces|diagnosis)\b|\bas (our|a) patient\b|\bwhen you (came|were here|visited|saw)\b/i, message: 'Do not mention a visit or treatment. That would confirm the reviewer is a patient.' },
  { rule: 'health_detail', test: /\b(pain|infection|cavity|cavities|gum disease|medication|allerg\w*|insurance|bill(ing)?|balance|payment|charge[sd]?)\b/i, message: 'Do not mention health, insurance or billing details in public.' },
  { rule: 'contact_detail', test: /\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b|@[a-z0-9-]+\.[a-z]{2,}|https?:\/\//i, message: 'Do not put phone numbers, emails or links in a public reply.' },
  { rule: 'incentive', test: /\b(discount|free|coupon|gift|reward|voucher|% off)\b/i, message: 'Do not offer anything in exchange for a changed review.' },
  { rule: 'too_long', test: /^[\s\S]{900,}$/, message: 'Keep the reply under 900 characters.' },
]
export function checkReviewReply(text: string, reviewerName = ''): PolicyFinding[] {
  const findings = CHECKS.filter(c => c.test.test(text)).map(c => ({ rule: c.rule, message: c.message }))
  const name = reviewerName.trim()
  if (name.length > 2 && text.toLowerCase().includes(name.toLowerCase())) findings.push({ rule: 'uses_name', message: 'Do not use the reviewer’s name.' })
  if (!text.trim()) findings.push({ rule: 'empty', message: 'Write a reply first.' })
  return findings
}

/** A safe starting draft for a person to edit. It says nothing about the reviewer or any care. */
export function draftReviewReply(rating: number, practice: string) {
  if (rating >= 4) return `Thank you for the kind words. The whole team at ${practice} appreciates you taking the time to share them.`
  if (rating === 3) return `Thank you for the feedback. We are always working to do better at ${practice}, and we would like to hear more. Please contact our office directly.`
  return `We are sorry to read this and take feedback seriously at ${practice}. Please contact our office manager directly so we can look into it properly.`
}
