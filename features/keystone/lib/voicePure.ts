import { payloadHash } from './canonical'
import type { RealtimeVoiceAdapter } from './voiceAdapters'

/*
 * Phase 7: the voice receptionist's rules, as code with no database and no network.
 *
 *   1. The AI disclosure is the first thing said on every call, inbound or outbound.
 *   2. Everything the agent says comes from a fixed template. Nothing the caller says is ever passed on as text, an id or a tool argument.
 *   3. The agent can use the Front Desk's tools and no others. The caller's words only choose WHICH of those tools runs
 *      (through a fixed list of intents); the arguments always come from the call's own state. There is no cancel, delete,
 *      refund, message or clinical tool to be talked into.
 *   4. The agent never books or confirms by itself. "book" and "confirm" write a Proposal, which a person approves.
 *   5. It never records without consent, and hands the call to a person whenever it is unsure.
 */

// ── The Front Desk ceiling ──────────────────────────────────────────────────────────────────────

/** The Front Desk Assistant's tools and the grant each needs. `proposes` marks a tool that only writes a proposal. */
export const FRONT_DESK = {
  name: 'Front Desk Assistant',
  tools: {
    faq: { scope: null, proposes: null, writes: false },
    availability: { scope: 'availability.read', proposes: null, writes: false },
    hold: { scope: 'holds.create', proposes: null, writes: true },
    book: { scope: 'propose:booking', proposes: 'booking', writes: true },
    confirm_find: { scope: 'schedule.read', proposes: null, writes: false },
    confirm: { scope: 'propose:confirm_appointment', proposes: 'confirm_appointment', writes: true },
  },
} as const

export type ToolName = keyof typeof FRONT_DESK.tools
export const FRONT_DESK_TOOLS = Object.keys(FRONT_DESK.tools) as ToolName[]
export const FRONT_DESK_SCOPES = [...new Set(Object.values(FRONT_DESK.tools).map(t => t.scope).filter((s): s is NonNullable<typeof s> => !!s))]

/** The voice agent's registry. It is the Front Desk's, by construction: nothing is added here, and the enumeration test fails if anything is. */
export const VOICE_TOOLS: readonly ToolName[] = FRONT_DESK_TOOLS
export const VOICE_SCOPES: readonly string[] = FRONT_DESK_SCOPES
export const VOICE_PROPOSAL_KINDS = [...new Set(VOICE_TOOLS.map(t => FRONT_DESK.tools[t].proposes).filter((k): k is NonNullable<typeof k> => !!k))]

export const VOICE_AGENT_NAME = 'Voice Receptionist'

// ── What the agent says ─────────────────────────────────────────────────────────────────────────

export const disclosure = (practice: string, direction: 'inbound' | 'outbound') =>
  direction === 'inbound'
    ? `Thank you for calling ${practice}. This is an AI assistant, not a person. I can answer simple questions and pass requests to the front desk, and I can bring in a person at any time.`
    : `Hello, this is an AI assistant calling from ${practice}. I am not a person. I can bring in a person at any time.`

export const SAY = {
  recording: 'This call may be recorded to help our team. Is that all right with you?',
  recordingYes: 'Thank you. The call will be recorded.',
  recordingNo: 'No problem. This call will not be recorded.',
  askDob: 'To protect your privacy, please tell me your date of birth.',
  dobRetry: 'I could not match that. Please say your date of birth once more.',
  dobFail: 'I could not confirm who I am speaking with, so I will bring in someone from the front desk.',
  needsPerson: 'I will bring in someone from the front desk who can help with that.',
  emergency: 'If this is a medical emergency, please hang up and call 911 now. I am also passing your call to our team right away.',
  noSlot: 'I do not see an open time that I can offer. I will ask the front desk to call you.',
  noVisit: 'I could not find an upcoming visit to confirm. I will ask the front desk to look into it.',
  held: 'I have held that time for you and asked the front desk to book it. Someone from the office will confirm with you.',
  confirmAsked: 'Thank you. I have asked the front desk to record your confirmation.',
  declined: 'That is fine. I will ask the front desk to follow up with you.',
  unclear: 'Sorry, I did not catch that. Could you say it again, or ask for a person?',
  goodbye: 'Thank you for calling. Goodbye.',
  wrongPerson: 'Sorry for the interruption. Goodbye.',
  silent: 'I did not hear back, so I will ask the front desk to follow up. Goodbye.',
} as const

// ── Reading what the caller said ────────────────────────────────────────────────────────────────

export type Intent = 'injection' | 'emergency' | 'human' | 'change' | 'confirm' | 'booking' | 'faq' | 'goodbye' | 'unknown'

const INJECTION = /\b(ignore|disregard|forget|override)\b.{0,40}\b(instruction|prompt|rule|previous|above|polic)|system prompt|developer mode|jailbreak|\byou are (now )?(an? )?(admin|administrator|authori[sz]ed|root|the owner)\b|\bact as\b|\b(delete|erase|wipe|drop)\b.{0,20}\b(schedule|appointment|record|patient|data|database|everything)|\bcancel (all|every|everyone)\b/i
const EMERGENCY = /\b(emergency|swelling|swollen|can'?t breathe|trouble breathing|bleeding|knocked out|severe pain|a lot of pain|bad pain|fever|trauma|accident)\b/i
const HUMAN = /\b(real person|human|a person|someone|somebody|representative|operator|front desk|receptionist|speak to|talk to)\b/i
const CHANGE = /\b(cancel|reschedule|move my|change my|postpone)\b/i
const CONFIRM = /\bconfirm/i
const BOOKING = /\b(book|schedule|make|set up|need|want|would like|looking for)\b.{0,40}\b(appointment|cleaning|check-?up|exam|visit)\b|\b(cleaning|check-?up)\b/i
const FAQ = /\b(hours?|open|close[sd]?|address|where|located|location|directions?|phone number|number)\b/i
const GOODBYE = /\b(bye|goodbye|that is all|that'?s all|thanks|thank you|nothing else)\b/i

/** One utterance → one intent from a fixed list. Order matters: anything that looks like an instruction to the agent is handled before anything else. */
export function classifyIntent(text: string): Intent {
  const t = String(text ?? '')
  if (INJECTION.test(t)) return 'injection'
  if (EMERGENCY.test(t)) return 'emergency'
  if (CHANGE.test(t)) return 'change'
  if (CONFIRM.test(t)) return 'confirm'
  if (HUMAN.test(t)) return 'human'
  if (BOOKING.test(t)) return 'booking'
  if (FAQ.test(t)) return 'faq'
  if (GOODBYE.test(t)) return 'goodbye'
  return 'unknown'
}

export function yesNo(text: string): 'yes' | 'no' | 'unclear' {
  const t = String(text ?? '').trim().toLowerCase()
  if (/^(no|nope|nah)\b|\b(not|don'?t|do not|can'?t|cannot|won'?t|wrong|decline)\b/.test(t)) return 'no'
  if (/\b(yes|yeah|yep|sure|ok(ay)?|that works|sounds good|correct|that is fine|that'?s fine|speaking|i will|i'?ll be there|go ahead|agree)\b/.test(t)) return 'yes'
  return 'unclear'
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** A spoken or typed date of birth as YYYY-MM-DD, or null. Accepts "March 3, 1985", "3/3/1985" and "1985-03-03". */
export function parseDob(text: string): string | null {
  const t = String(text ?? '').toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1')
  const named = new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{1,2})\\b[,\\s]+(\\d{4})\\b`).exec(t)
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t)
  const us = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/.exec(t)
  let y: number, m: number, d: number
  if (named) { m = MONTHS.indexOf(named[1]) + 1; d = Number(named[2]); y = Number(named[3]) }
  else if (iso) { y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]) }
  else if (us) { m = Number(us[1]); d = Number(us[2]); y = Number(us[3]) }
  else return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const to12h = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}` }

/** "Monday to Thursday 8 am to 5 pm" style hours from a location's weekday map. */
export function hoursText(hours: unknown): string {
  if (!hours || typeof hours !== 'object') return ''
  const parts: string[] = []
  for (let day = 0; day < 7; day += 1) {
    const spans = (hours as Record<string, unknown>)[String(day)]
    if (!Array.isArray(spans) || !spans.length) continue
    parts.push(`${DAY_NAMES[day]} ${spans.map(s => (Array.isArray(s) ? `${to12h(String(s[0]))} to ${to12h(String(s[1]))}` : '')).filter(Boolean).join(' and ')}`)
  }
  return parts.join(', ')
}

// ── Recording consent ───────────────────────────────────────────────────────────────────────────

export type RecordingBasis = 'not_enabled' | 'caller_agreed' | 'one_party_notice' | 'caller_declined' | 'no_clear_answer'

/**
 * Whether the call may be recorded. All-party packs need the caller's clear yes; one-party packs need only that the caller did not say no
 * (the practice has agreed by turning recording on, and the caller was told). The caller's no always wins.
 */
export function recordingDecision(input: { enabled: boolean; mode: 'one_party' | 'all_party'; answer: 'yes' | 'no' | 'unclear' | null }): { record: boolean; basis: RecordingBasis } {
  if (!input.enabled) return { record: false, basis: 'not_enabled' }
  if (input.answer === 'no') return { record: false, basis: 'caller_declined' }
  if (input.answer === 'yes') return { record: true, basis: 'caller_agreed' }
  return input.mode === 'one_party' ? { record: true, basis: 'one_party_notice' } : { record: false, basis: 'no_clear_answer' }
}

// ── The call itself ─────────────────────────────────────────────────────────────────────────────

export type Turn = { who: 'agent' | 'caller'; text: string }
export type ToolCall = { tool: ToolName; argsHash: string; ok: boolean; proposes: string | null }
export type CallOutcome = 'answered' | 'appointment_requested' | 'confirmation_requested' | 'handed_off' | 'wrong_number' | 'declined'

export type CallContext = {
  direction: 'inbound' | 'outbound'
  practiceName: string
  locationName: string
  phone: string
  address: string
  hours: string
  /** The patient the caller number or the outbound list matched. Never trusted until the date of birth is spoken. */
  patient: { firstName: string; dobIso: string } | null
  recording: { enabled: boolean; mode: 'one_party' | 'all_party' }
  lines: readonly string[]
}

/** What the database side supplies. Each is one Front Desk tool; none takes anything the caller said. */
export type CallTools = {
  availability(): Promise<{ label: string } | null>
  hold(): Promise<void>
  book(): Promise<{ proposalId: string }>
  confirm_find(): Promise<{ label: string } | null>
  confirm(): Promise<{ proposalId: string }>
}

export type CallResult = {
  transcript: Turn[]
  toolCalls: ToolCall[]
  outcome: CallOutcome
  handoffReason: string
  disclosedFirst: boolean
  recording: { record: boolean; basis: RecordingBasis }
  proposalIds: string[]
  summary: string
}

const MAX_UNCLEAR = 2
const MAX_DOB_TRIES = 2

export async function runCall(ctx: CallContext, tools: CallTools, voice: RealtimeVoiceAdapter): Promise<CallResult> {
  const transcript: Turn[] = []
  const toolCalls: ToolCall[] = []
  const proposalIds: string[] = []
  const say = (text: string) => { transcript.push({ who: 'agent', text: voice.speak(text).text }) }
  const hear = (prompt?: 'recording_consent') => { const text = voice.listen(prompt); if (text !== null) transcript.push({ who: 'caller', text }); return text }

  /** The only way to use a tool. A name outside the Front Desk registry is refused here, whatever called it. */
  const callTool = async <T>(tool: ToolName, run: () => Promise<T>, proposes: string | null = null): Promise<T> => {
    if (!VOICE_TOOLS.includes(tool)) throw new Error(`The voice agent has no ${tool} tool.`)
    try {
      const out = await run()
      toolCalls.push({ tool, argsHash: payloadHash({ tool, direction: ctx.direction }).slice(0, 16), ok: true, proposes })
      return out
    } catch (error) {
      toolCalls.push({ tool, argsHash: payloadHash({ tool, direction: ctx.direction }).slice(0, 16), ok: false, proposes })
      throw error
    }
  }

  // 1. Disclosure: always the first utterance.
  say(disclosure(ctx.practiceName, ctx.direction))
  const disclosedFirst = transcript[0]?.who === 'agent' && transcript.length === 1

  // 2. Recording: ask only when the office turned recording on; record only on the decision below.
  let answer: 'yes' | 'no' | 'unclear' | null = null
  if (ctx.recording.enabled) {
    say(SAY.recording)
    answer = yesNo(hear('recording_consent') ?? '')
  }
  const recording = recordingDecision({ enabled: ctx.recording.enabled, mode: ctx.recording.mode, answer })
  if (ctx.recording.enabled) say(recording.record ? SAY.recordingYes : SAY.recordingNo)

  let outcome: CallOutcome = 'answered'
  let handoffReason = ''
  let summary = ''
  let verified = false
  let dobTries = 0
  let unclear = 0
  let pending: 'booking' | 'confirm' | null = null
  let awaiting: 'identity' | 'dob' | 'slot_ok' | 'visit_ok' | null = null
  let done = false

  const handoff = (reason: string, line: string = SAY.needsPerson) => { say(line); outcome = 'handed_off'; handoffReason = reason; done = true }

  if (ctx.direction === 'outbound') {
    if (!ctx.patient) { handoff('no patient on the outbound call'); return finish() }
    say(`I am calling from ${ctx.practiceName} for ${ctx.patient.firstName}. Is that you?`)
    awaiting = 'identity'
    pending = 'confirm'
  }

  /** The step after the caller's identity is confirmed, for whichever request was waiting. */
  async function proceed() {
    if (pending === 'booking') {
      const slot = await callTool('availability', () => tools.availability())
      if (!slot) return handoff('no open time within the booking policy', SAY.noSlot)
      say(`I can offer ${slot.label}. Does that time work for you?`)
      awaiting = 'slot_ok'
    } else if (pending === 'confirm') {
      const visit = await callTool('confirm_find', () => tools.confirm_find())
      if (!visit) return handoff('no upcoming visit to confirm', SAY.noVisit)
      say(ctx.direction === 'outbound' ? `I am calling to confirm your visit on ${visit.label}. Will you be able to make it?` : `Your next visit is ${visit.label}. Will you be there?`)
      awaiting = 'visit_ok'
    }
  }

  function finish(): CallResult {
    if (!summary) {
      summary = outcome === 'handed_off' ? `Handed to the front desk: ${handoffReason}.` : outcome === 'appointment_requested' ? 'Asked for a cleaning; the front desk was asked to book the time that was held.'
        : outcome === 'confirmation_requested' ? 'The patient said they will attend; the front desk was asked to record the confirmation.'
        : outcome === 'wrong_number' ? 'Reached someone other than the patient. Nothing was shared.' : outcome === 'declined' ? 'The patient did not take the time offered.' : 'Answered a question about the office.'
    }
    return { transcript, toolCalls, outcome, handoffReason, disclosedFirst, recording, proposalIds, summary }
  }

  if (done) return finish()

  let guard = 0
  while (!done && guard++ < 60) {
    const heard = hear()
    if (heard === null) break
    const intent = classifyIntent(heard)

    // Words that try to instruct the agent, or signal danger, are handled the same way in every state: no tool, a person takes over.
    if (intent === 'injection') { handoff('the caller tried to give the assistant instructions', SAY.needsPerson); break }
    if (intent === 'emergency') { handoff('urgent: the caller described pain or swelling', SAY.emergency); break }

    if (awaiting === 'identity') {
      const a = yesNo(heard)
      if (a === 'no') { say(SAY.wrongPerson); outcome = 'wrong_number'; done = true; break }
      if (a === 'yes') { say(SAY.askDob); awaiting = 'dob'; continue }
      unclear += 1
      if (unclear >= MAX_UNCLEAR) { handoff('could not confirm who answered'); break }
      say(SAY.unclear); continue
    }

    if (awaiting === 'dob') {
      if (intent === 'human') { handoff('the caller asked for a person'); break }
      const dob = parseDob(heard)
      if (dob && ctx.patient && dob === ctx.patient.dobIso) { verified = true; awaiting = null; await proceed(); if (done) break; continue }
      dobTries += 1
      if (dobTries >= MAX_DOB_TRIES) { handoff('could not confirm the caller’s identity', SAY.dobFail); break }
      say(SAY.dobRetry); continue
    }

    if (awaiting === 'slot_ok' || awaiting === 'visit_ok') {
      const a = yesNo(heard)
      if (a === 'yes' && awaiting === 'slot_ok') {
        await callTool('hold', () => tools.hold())
        const { proposalId } = await callTool('book', () => tools.book(), 'booking')
        proposalIds.push(proposalId); say(SAY.held); outcome = 'appointment_requested'; done = true; break
      }
      if (a === 'yes' && awaiting === 'visit_ok') {
        const { proposalId } = await callTool('confirm', () => tools.confirm(), 'confirm_appointment')
        proposalIds.push(proposalId); say(SAY.confirmAsked); outcome = 'confirmation_requested'; done = true; break
      }
      if (a === 'no') { say(SAY.declined); outcome = ctx.direction === 'outbound' ? 'handed_off' : 'declined'; if (outcome === 'handed_off') handoffReason = 'the patient could not make the visit'; done = true; break }
      unclear += 1
      if (unclear >= MAX_UNCLEAR) { handoff('the answer was not clear'); break }
      say(SAY.unclear); continue
    }

    // No question waiting: read the request.
    if (intent === 'human') { handoff('the caller asked for a person'); break }
    if (intent === 'change') { handoff('the caller wants to change or cancel a visit', SAY.needsPerson); break }
    if (intent === 'faq') {
      await callTool('faq', async () => true)
      const bits = [`We are at ${ctx.locationName}${ctx.address ? `, ${ctx.address}` : ''}.`, ctx.hours ? `Our hours are ${ctx.hours}.` : '', ctx.phone ? `The office number is ${ctx.phone}.` : ''].filter(Boolean)
      say(bits.join(' ')); continue
    }
    if (intent === 'booking' || intent === 'confirm') {
      pending = intent === 'booking' ? 'booking' : 'confirm'
      if (!ctx.patient) { handoff('the caller could not be matched to a patient record'); break }
      if (!verified) { say(SAY.askDob); awaiting = 'dob'; continue }
      await proceed(); if (done) break; continue
    }
    if (intent === 'goodbye') { say(SAY.goodbye); done = true; break }
    unclear += 1
    if (unclear >= MAX_UNCLEAR) { handoff('the assistant could not understand the request'); break }
    say(SAY.unclear)
  }

  if (!done) {
    // The caller stopped talking. A question left open is a person's job to finish.
    if (awaiting || pending) { say(SAY.silent); outcome = 'handed_off'; handoffReason = 'the caller stopped responding' }
    else say(SAY.goodbye)
  }
  return finish()
}
