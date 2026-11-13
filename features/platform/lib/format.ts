/**
 * Display formatting for exact values. Inputs are the strings GraphQL returns for bigInt and
 * decimal fields; nothing here turns money into a float.
 */

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

function splitDecimal(value: string) {
  const text = value.trim()
  const negative = text.startsWith('-')
  const [whole = '0', fraction = ''] = text.replace(/^[+-]/, '').split('.')
  return { negative, whole: whole.replace(/^0+(?=\d)/, '') || '0', fraction }
}

/** Minor units ("123456") → "$1,234.56". */
export function money(minor: string | bigint | null | undefined, currency = 'USD', digits = 2) {
  if (minor === null || minor === undefined || minor === '') return '—'
  const text = String(minor)
  if (!/^-?\d+$/.test(text)) return '—'
  const negative = text.startsWith('-')
  const abs = text.replace('-', '').padStart(digits + 1, '0')
  const whole = abs.slice(0, abs.length - digits)
  const fraction = digits ? `.${abs.slice(-digits)}` : ''
  const symbol = currency === 'USD' ? '$' : `${currency} `
  return `${negative ? '−' : ''}${symbol}${group(whole.replace(/^0+(?=\d)/, ''))}${fraction}`
}

/** An exact decimal string trimmed to at most `maxPlaces` (truncating display only) and at least `minPlaces`. */
export function decimalText(value: string | null | undefined, options: { minPlaces?: number; maxPlaces?: number; prefix?: string } = {}) {
  if (value === null || value === undefined || value === '') return '—'
  if (!/^[+-]?\d*(\.\d*)?$/.test(String(value).trim())) return '—'
  const { negative, whole, fraction } = splitDecimal(String(value))
  const max = options.maxPlaces ?? 10
  const min = options.minPlaces ?? 0
  let f = fraction.slice(0, max).replace(/0+$/, '')
  if (f.length < min) f = f.padEnd(min, '0')
  const isZero = /^0*$/.test(whole + f)
  return `${negative && !isZero ? '−' : ''}${options.prefix ?? ''}${group(whole)}${f ? `.${f}` : ''}`
}

/** Price in dollars from a decimal string: at least cents, up to 4 places. */
export const price = (value: string | null | undefined) => decimalText(value, { minPlaces: 2, maxPlaces: 4, prefix: '$' })

/** Quantity: up to 6 places (micro-shares). */
export const quantity = (value: string | null | undefined) => decimalText(value, { maxPlaces: 6 })

export const bps = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value} bps`)

/** "Eastern Time" for America/New_York: screens never show the raw zone name. */
export function zoneLabel(tz: string) {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longGeneric' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName');
    return part?.value ?? tz;
  } catch {
    return tz;
  }
}

const yearIn = (d: Date, tz: string) => new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(d)

/**
 * A date or time in the practice time zone ("Tue, Nov 10", "Nov 10, 2:30 PM EST"). Dates outside
 * the current year carry the year. Screens never show an ISO string.
 * adapted from openfront-vet-clinic@5255bb9 features/platform/lib/format.ts
 */
export function when(iso: string | null | undefined, tz = 'America/New_York', style: 'full' | 'time' | 'day' | 'date' | 'seconds' | 'dayTime' = 'full', now: Date = new Date()) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const otherYear = yearIn(d, tz) !== yearIn(now, tz)
  const opts: Intl.DateTimeFormatOptions =
    style === 'time' ? { hour: 'numeric', minute: '2-digit' }
    : style === 'seconds' ? { hour: 'numeric', minute: '2-digit', second: '2-digit' }
    : style === 'day' ? { weekday: 'short', month: 'short', day: 'numeric', ...(otherYear ? { year: 'numeric' } : {}) }
    : style === 'date' ? { month: 'short', day: 'numeric', year: 'numeric' }
    : style === 'dayTime' ? { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...(otherYear ? { year: 'numeric' } : {}) }
    : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...(otherYear ? { year: 'numeric' } : {}) }
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: style === 'day' || style === 'date' ? undefined : 'short', ...opts }).format(d)
}

/**
 * A calendar date stored without a time ("2026-11-10" or a midnight-UTC timestamp). Read at noon UTC
 * so no time zone moves it to the day before. `day` → "Tue, Nov 10" (year when not this year);
 * `date` → "Nov 10, 2026" (always the year: birth dates, licences).
 */
export function calendarDate(value: string | null | undefined, style: 'day' | 'date' = 'day', now: Date = new Date()) {
  if (!value) return ''
  const ymd = String(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ''
  return when(`${ymd}T12:00:00Z`, 'UTC', style, now)
}

/**
 * Human wording for stored codes. Screens never show a raw enum: `label()` is the lower-case phrase
 * for use inside a sentence ("by SMS"), `title()` the same phrase capitalised for a list item, an
 * option or a heading ("No-show", "Ready for checkout").
 */
const WORDS: Record<string, string> = {
  // acronyms
  sms: 'SMS', mms: 'MMS', api: 'API', ai: 'AI', mcp: 'MCP', baa: 'BAA', dea: 'DEA', npi: 'NPI', erx: 'e-prescribing', eob: 'EOB', era: 'ERA', llm_agent: 'LLM agent',
  ai_text_outbound: 'AI text (outbound)', ai_voice_outbound: 'AI voice (outbound)', external_mcp_client: 'external MCP client', cpr_bls: 'CPR / BLS',
  ppo: 'PPO', office_ucr: 'Office (UCR)',
  // patients
  merged_into: 'merged into another chart', deceased: 'deceased', prospect: 'prospect', inactive: 'inactive', archived: 'archived',
  female: 'female', male: 'male', unknown: 'unknown', self: 'self', spouse: 'spouse', parent: 'parent', guardian: 'guardian', personal_representative: 'personal representative',
  mrn_external: 'external record number', id_card: 'ID card', insurance_card: 'insurance card',
  // alerts
  anticoagulant: 'anticoagulant', antiresorptive: 'antiresorptive', premedication: 'premedication', latex: 'latex allergy', sedation_history: 'sedation history', behavioural: 'behavioural', financial: 'financial',
  // scheduling
  scheduled: 'scheduled', confirmed: 'confirmed', arrived: 'arrived', seated: 'seated', in_progress: 'in progress', ready_for_checkout: 'ready for checkout', completed: 'completed',
  broken: 'broken', cancelled: 'cancelled', rescheduled: 'rescheduled', no_show: 'no-show', late_cancel: 'late cancel', short_notice: 'short notice', held: 'held', released: 'released',
  new_patient: 'new patient', recall_hygiene: 'hygiene recall', perio_maintenance: 'perio maintenance', crown_prep: 'crown prep', crown_seat: 'crown seat', treatment_follow_up: 'treatment follow-up',
  oral_surgery: 'oral surgery', endo: 'endodontics', perio: 'periodontics', ortho: 'orthodontics', prostho: 'prosthodontics', pediatric: 'pediatric', consult: 'consult', emergency: 'emergency',
  hygiene: 'hygiene', restorative: 'restorative', extraction: 'extraction', surgery: 'surgery', exam: 'exam', flex: 'flex',
  primary_provider: 'primary provider', doctor: 'doctor', hygienist: 'hygienist', assistant: 'assistant', provider: 'provider',
  scheduled_elsewhere: 'scheduled elsewhere', no_reply: 'no reply',
  // booking requests and the inbox
  online_booking: 'online booking', portal_api: 'portal API', web_chat: 'web chat', rejected_spam: 'rejected as spam', converted: 'booked', requested: 'requested',
  matched: 'matched an existing patient', possible_duplicate: 'possible existing patient', not_configured: 'not configured', passed: 'passed', missing: 'missing', unreachable: 'unreachable',
  similar_name: 'similar name', same_last_name: 'same last name', shared_contact: 'shared phone or email', offered: 'offered', declined: 'closed',
  verbal_staff: 'told staff', intake_form: 'intake form', sms_keyword: 'text reply', public_api: 'online booking', caution: 'caution', critical: 'critical', info: 'information',
  agent_offer: 'agent offer', hygiene_exam_float: 'hygiene exam float', approved_override: 'approved override', location_scope: 'location', records_override: 'records override',
  // approval actions
  'adapter.go_live': 'turn on a live connection', 'adjustment.post': 'post an adjustment', 'agent_grant.activate': 'give an agent access', 'autonomy.activate': 'let an agent act on its own',
  'claim.void_paid': 'void a paid claim', 'clinical.correct': 'correct a signed clinical record', 'code_import.activate': 'activate a code set', 'fee_schedule.publish': 'publish a fee schedule',
  'import.apply': 'apply an import', 'patient.merge': 'merge two patient charts', 'period.reopen': 'reopen a closed period', 'practice.controls': 'change practice controls',
  'refund.execute': 'issue a refund', 'retention.dispose': 'dispose of records past retention', 'role.assign_approval': 'give someone approval rights',
  in_person: 'in person', email_link: 'email link', phone: 'phone', email: 'email', voice: 'voice', manual: 'manual', manual_export: 'manual export', live: 'live',
  in_app: 'in app',
  // messaging and consent
  appointment_reminders: 'appointment reminders', payment_reminders: 'payment reminders', billing_statements: 'billing statements', marketing: 'marketing', recall: 'recall',
  replied_confirm: 'replied to confirm', replied_cancel: 'replied to cancel', replied_other: 'replied', queued: 'queued', sent: 'sent', delivered: 'delivered', failed: 'failed', suppressed: 'suppressed',
  granted: 'granted', revoked: 'withdrawn', quiet_hours: 'quiet hours', no_consent: 'no consent', opted_out: 'opted out', synthetic: 'fictional record',
  // staff and licences
  dental_licence: 'dental licence', hygiene_licence: 'hygiene licence', da_radiography: 'radiography permit', sedation_permit: 'sedation permit', state_controlled_substance: 'state controlled-substance registration',
  full_time: 'full-time', part_time: 'part-time', invited: 'invited', disabled: 'disabled', suspended: 'suspended',
  // approvals, agents and audit
  pending: 'pending', approved: 'approved', rejected: 'rejected', expired: 'expired', executed: 'done', executing: 'running', superseded: 'superseded', reverted: 'undone',
  human_active: 'staff active', agent_active: 'agent active', rules_engine: 'rules engine', reviewed_ok: 'reviewed, fine', reviewed_violation: 'reviewed, policy breach',
  claim_attachment: 'claim attachment', clinical_attachment: 'clinical attachment', insurance_directory: 'insurance directory', report_received: 'report received',
  break_glass: 'emergency access', code_licence: 'code licence',
  // insurance: payers, plans, coordination, benefits, sources, checks
  commercial: 'commercial', medicaid: 'Medicaid', chip: 'CHIP', medicare_advantage: 'Medicare Advantage', tricare: 'TRICARE', discount: 'discount plan',
  indemnity: 'indemnity', dhmo: 'DHMO', ma_dental: 'Medicare Advantage dental', in_network: 'in network', out_of_network: 'out of network',
  standard: 'standard', non_duplication: 'non-duplication', carve_out: 'carve-out', maintenance_of_benefits: 'maintenance of benefits',
  primary: 'primary', secondary: 'secondary', tertiary: 'tertiary', child: 'child',
  pending_verification: 'waiting to be verified', terminated: 'ended', invalid: 'invalid', unverified: 'not verified', verified_electronic: 'electronically verified', verified_partial: 'partly verified', verified_full: 'fully verified',
  verified: 'verified', partially_verified: 'partly verified', assumed: 'assumed',
  eligibility_271: 'electronic check', payer_portal: 'payer portal', payer_phone: 'payer phone call', fax_breakdown: 'faxed breakdown', prior_eob: 'earlier EOB', patient_reported: 'told by the patient', practice_default: 'practice assumption',
  coverage_active: 'coverage', annual_max: 'annual maximum', annual_max_used: 'maximum left this year', deductible: 'deductible', deductible_met: 'deductible left this year', coverage_pct: 'plan pays',
  frequency_limit: 'frequency limit', frequency_used: 'frequency used', history_procedure: 'treatment elsewhere', waiting_period: 'waiting period', missing_tooth_clause: 'missing-tooth clause',
  downgrade: 'downgrade rule', cob_method: 'coordination of benefits', ortho_max: 'orthodontic maximum', ortho_used: 'orthodontic used', non_covered: 'not covered', age_limit: 'age limit',
  preventive: 'preventive', basic: 'basic', major: 'major', orthodontic: 'orthodontic', all: 'all categories',
  responded: 'answered', error_retryable: 'try again', not_covered: 'not covered', covered: 'covered', plan_year: 'new plan year', signal: 'signal', proposal: 'proposal', staff: 'staff',
  verification_checklist: 'verification question', note_sign: 'note to sign', unsigned_plan_follow_up: 'unsigned plan follow-up', lab_follow_up: 'lab follow-up', rejection_fix: 'rejection to fix', credit_review: 'credit review',
  complete: 'complete', partial: 'partial', done: 'done', plan_item: 'treatment plan item', claim_line: 'claim line', appointment: 'appointment',
  open_dental: 'Open Dental', generic_csv: 'CSV file', pdmp_check: 'PDMP check', break_glass_event: 'emergency access',
  incumbent_dentrix: 'Dentrix', incumbent_eaglesoft: 'Eaglesoft', incumbent_opendental: 'Open Dental', incumbent_other: 'another system', state_medicaid: 'state Medicaid',
}

export const label = (value: string | null | undefined) => (value ? (WORDS[value] ?? value.replaceAll('_', ' ').replaceAll('.', ' · ')) : '')

export const title = (value: string | null | undefined) => {
  const text = label(value)
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}

/** Options for a select from stored codes, worded by `title()`. */
export const options = (values: readonly string[]) => values.map((value) => ({ value, label: title(value) }))

const NOUNS: Record<string, string> = { booking_request: 'booking request', approval_policy: 'approval policy', jurisdiction_pack: 'state rules pack', mfa: 'two-step sign-in', asap: 'ASAP entry', hold: 'slot hold', template: 'schedule template', merge: 'chart merge', portal: 'patient portal', guarantor: 'guarantor', contact: 'phone or email', patients: 'patients', confirmation: 'reminder' }
const EVENTS: Record<string, string> = {
  'appointment.ready': 'Appointment ready for checkout', 'appointment.withdrawn': 'Appointment withdrawn (spam booking)', 'patient.merged_into': 'Patient chart merged into another', 'patient.unmerged': 'Patient chart merge undone',
  'patients.sample_loaded': 'Practice loaded', 'confirmation.send_failed': 'Reminder failed to send', 'confirmation.suppressed': 'Reminder held back', 'consent.opt_out': 'Patient opted out (STOP)',
  'portal.code_sent': 'Patient portal sign-in code sent', 'portal.signed_in': 'Patient signed in to the portal', 'patient.duplicate_acknowledged': 'Possible duplicate reviewed: different person',
  'booking_request.accept': 'Online booking kept', 'booking_request.reject_spam': 'Online booking rejected as spam', 'booking_request.link': 'Online booking linked to an existing chart',
  'mfa.enrolment_started': 'Two-step sign-in set-up started', 'mfa.recovery_used': 'Recovery code used', 'practice.controls_changed': 'Practice controls changed',
}

/** An audit event type ("appointment.confirmed") as a sentence fragment ("Appointment confirmed"). */
export function eventText(eventType: string) {
  if (EVENTS[eventType]) return EVENTS[eventType]
  const [noun, ...rest] = eventType.split('.')
  const thing = NOUNS[noun] ?? noun.replaceAll('_', ' ')
  const what = rest.join(' ').replaceAll('_', ' ')
  const text = what ? `${thing} ${what}` : thing
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "es" → "Spanish". Unknown or empty codes fall back to the code itself. */
export function languageName(code: string | null | undefined) {
  if (!code) return '—'
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code } catch { return code }
}

/** Chart numbers are plain numbers; screens show them as "Chart #1001". */
export const chartLabel = (n: string | null | undefined) => (n ? `Chart #${n}` : '')
