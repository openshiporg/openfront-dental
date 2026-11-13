/*
 * The phone seam. Two interfaces and the implementations behind them.
 *
 *   TelephonyAdapter     what a phone provider gives us: a normalised inbound call event.
 *   RealtimeVoiceAdapter the caller's next words in, the agent's words out.
 *
 * `manual`  staff log a call they took or made themselves. No AI, no provider, nothing is spoken.
 * `twilio`  a real phone number on the practice's own Twilio account (features/integrations/voice/twilio.ts). Each turn of a call is a
 *           signed webhook; the call is replayed from its own signed state and written once, when it ends.
 *
 * Plain module: no database, no network, no timers.
 */

export type InboundCallEvent = {
  /** The provider's id for the call (Twilio's CallSid). It keys the call, so a redelivered webhook never runs a call twice. */
  eventId: string
  locationId: string
  callerNumber: string
  /** What the caller said, in order, as the provider's speech to text handed it over. */
  utterances: string[]
  /** True when the caller has finished (hung up or said nothing). False: the call may need another turn, and nothing is written until it ends. */
  final?: boolean
}

export type CallAdapterKey = 'manual' | 'twilio'

export interface RealtimeVoiceAdapter {
  readonly key: CallAdapterKey
  /** True while the caller may still say more: when the words run out the engine waits instead of ending the call. */
  readonly awaitingMore?: boolean
  /** The caller's next utterance (speech to text), or null when they hang up. `recording_consent` marks the answer to the recording question. */
  listen(prompt?: 'recording_consent'): string | null
  /** The agent speaks (text to speech). */
  speak(text: string): { text: string }
}

/** A manual call has no AI voice: nothing to listen to and nothing to say. Asking it to speak is a bug, so it throws. */
export const manualVoice: RealtimeVoiceAdapter = {
  key: 'manual',
  listen: () => null,
  speak: () => { throw new Error('A manually logged call has no voice. Staff made it; nothing is spoken.') },
}

/** One phone call, replayed from the words heard so far. Each turn's webhook builds one of these and runs the call engine again. */
export class PhoneVoice implements RealtimeVoiceAdapter {
  readonly key = 'twilio' as const
  private index = 0
  readonly spoken: string[] = []
  constructor(private readonly heard: readonly string[], private readonly callerHasFinished: boolean) {}
  get awaitingMore() { return !this.callerHasFinished }
  listen() { return this.index < this.heard.length ? this.heard[this.index++] : null }
  speak(text: string) { this.spoken.push(text); return { text } }
}

/** Parse the caller's turn into a call event, or null if it is not one. Pure: it verifies nothing; the route has already checked the signature. */
export function parseInboundEvent(raw: unknown): InboundCallEvent | null {
  const r = raw as Partial<InboundCallEvent> | null
  if (!r || typeof r.eventId !== 'string' || !r.eventId || typeof r.locationId !== 'string' || !Array.isArray(r.utterances)) return null
  return { eventId: r.eventId.slice(0, 120), locationId: r.locationId, callerNumber: String(r.callerNumber ?? '').slice(0, 40), utterances: r.utterances.map(u => String(u ?? '').slice(0, 400)).slice(0, 40), final: r.final !== false }
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** "March 3, 1985" from an ISO date, with no time zone shift. */
export const spokenDob = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${MONTH_NAMES[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : ''
}
