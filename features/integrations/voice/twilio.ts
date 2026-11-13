import { createHmac, timingSafeEqual } from 'node:crypto'

/*
 * Twilio Voice over its REST API and TwiML webhooks, with the platform's fetch (no SDK, so nothing to keep in step).
 *
 *   inbound   Twilio posts each turn of a call to our route, signed with X-Twilio-Signature. We answer with TwiML:
 *             what the assistant says, then a <Gather> that listens for the caller's next words (Twilio's own speech to text).
 *   connect   "Connect a phone number" checks the account and the number with Twilio, then points the number's voice and
 *             status webhooks at this app, so a real call reaches the receptionist.
 *
 * Only the practice's own template words are ever spoken. The caller's words come back as data.
 */

export type TwilioCtx = { fetch?: typeof fetch; baseUrl?: string; timeoutMs?: number }
const BASE = 'https://api.twilio.com'

/** E.164 for a US/Canada number typed in any common way, or null. */
export function normalizeNumber(value: string): string | null {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (/^\+\d{8,15}$/.test(String(value ?? '').trim())) return String(value).trim()
  return null
}

/** Twilio's signature: base64 HMAC-SHA1 of the full URL followed by every posted field (sorted by name) as name+value. */
export function twilioSignature(url: string, params: Record<string, string>, authToken: string) {
  const data = Object.keys(params).sort().reduce((text, key) => text + key + params[key], url)
  return createHmac('sha1', authToken).update(data, 'utf8').digest('base64')
}

export function verifyTwilioSignature(url: string, params: Record<string, string>, header: string | null, authToken: string): boolean {
  if (!header || !authToken) return false
  const want = Buffer.from(twilioSignature(url, params, authToken))
  const got = Buffer.from(header)
  return got.length === want.length && timingSafeEqual(got, want)
}

export const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const says = (lines: readonly string[]) => lines.map(line => `<Say>${escapeXml(line)}</Say>`).join('')

/** Say these lines, then listen. `actionOnEmptyResult` makes Twilio post again even when the caller says nothing, so silence is handled. */
export const listenTwiml = (lines: readonly string[], action: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="${escapeXml(action)}" method="POST" speechTimeout="auto" language="en-US" actionOnEmptyResult="true">${says(lines)}</Gather></Response>`

/** Say these lines and end the call. */
export const endTwiml = (lines: readonly string[]) => `<?xml version="1.0" encoding="UTF-8"?><Response>${says(lines)}<Hangup/></Response>`

const auth = (sid: string, token: string) => `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`

async function call(ctx: TwilioCtx, method: 'GET' | 'POST', path: string, sid: string, token: string, data?: Record<string, string>) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs ?? 20_000)
  try {
    const response = await (ctx.fetch ?? fetch)(`${ctx.baseUrl ?? BASE}${path}`, {
      method,
      headers: { authorization: auth(sid, token), ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: method === 'POST' && data ? new URLSearchParams(data) : undefined,
      signal: controller.signal,
    })
    const text = await response.text()
    let json: any = null
    try { json = text ? JSON.parse(text) : null } catch { json = null }
    return { status: response.status, json }
  } finally { clearTimeout(timer) }
}

export type ConnectOutcome = { ok: true; numberSid: string; accountName: string } | { ok: false; message: string }

/**
 * Check the account and the number with Twilio, then point the number's voice and status webhooks at this app.
 * Refuses on anything it cannot confirm: nothing is saved by the caller unless this returns ok.
 */
export async function connectNumber(input: { accountSid: string; authToken: string; phoneNumber: string; voiceUrl: string }, ctx: TwilioCtx = {}): Promise<ConnectOutcome> {
  try {
    const account = await call(ctx, 'GET', `/2010-04-01/Accounts/${encodeURIComponent(input.accountSid)}.json`, input.accountSid, input.authToken)
    if (account.status === 401 || account.status === 403 || account.status === 404) return { ok: false, message: 'Twilio did not accept that Account SID and Auth Token.' }
    if (account.status >= 400 || account.json?.status !== 'active') return { ok: false, message: 'That Twilio account is not active.' }
    const found = await call(ctx, 'GET', `/2010-04-01/Accounts/${encodeURIComponent(input.accountSid)}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(input.phoneNumber)}`, input.accountSid, input.authToken)
    if (found.status >= 400) return { ok: false, message: 'Twilio could not list the numbers on that account.' }
    const numberSid = String(found.json?.incoming_phone_numbers?.[0]?.sid ?? '')
    if (!numberSid) return { ok: false, message: 'That phone number is not on this Twilio account.' }
    const set = await call(ctx, 'POST', `/2010-04-01/Accounts/${encodeURIComponent(input.accountSid)}/IncomingPhoneNumbers/${encodeURIComponent(numberSid)}.json`, input.accountSid, input.authToken, {
      VoiceUrl: input.voiceUrl, VoiceMethod: 'POST', StatusCallback: input.voiceUrl, StatusCallbackMethod: 'POST',
    })
    if (set.status >= 400) return { ok: false, message: 'Twilio would not let us point that number at this app.' }
    return { ok: true, numberSid, accountName: String(account.json?.friendly_name ?? '') }
  } catch {
    return { ok: false, message: 'Twilio did not answer. Nothing was saved. Try again.' }
  }
}
