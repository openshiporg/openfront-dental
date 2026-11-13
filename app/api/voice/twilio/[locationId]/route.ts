import { keystoneContext } from '@/features/keystone/context'
import { receiveInboundCall, voiceLine, voiceWebhookUrl } from '@/features/keystone/mutations/voice'
import { openSecret, sealSecret } from '@/features/keystone/lib/secretBox'
import { endTwiml, listenTwiml, normalizeNumber, verifyTwilioSignature } from '@/features/integrations/voice/twilio'
import { log } from '@/features/keystone/lib/log'

export const dynamic = 'force-dynamic'

/*
 * The phone line. Twilio posts every turn of a call here (and its call-status events), signed with X-Twilio-Signature using the auth
 * token of the number connected to this office. Nothing is trusted before the signature checks out.
 *
 * A call arrives one turn at a time. What the caller has said so far travels in the next turn's address, sealed with the practice's own
 * secret key (so it cannot be read or changed on the way); the call is written once, when it ends.
 */

const xml = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/xml; charset=utf-8', 'cache-control': 'no-store' } })
const TERMINAL = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled'])
const SORRY = ['Sorry, we cannot take your call right now. Please call the office again later.']

type State = { u: string[] }
const seal = (state: State) => { const s = sealSecret(JSON.stringify(state), 'voice.turn'); return Buffer.from(JSON.stringify([s.ciphertext, s.iv, s.authTag])).toString('base64url') }
function unseal(text: string | null): State | null {
  if (!text) return null
  try {
    const [ciphertext, iv, authTag] = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'))
    const parsed = JSON.parse(openSecret({ purpose: 'voice.turn', ciphertext, iv, authTag }))
    return Array.isArray(parsed?.u) ? { u: parsed.u.map((x: unknown) => String(x).slice(0, 400)).slice(0, 40) } : null
  } catch { return null }
}

export async function POST(request: Request, { params }: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await params
  const form = await request.formData().catch(() => null)
  if (!form) return xml('<Response/>', 400)
  const fields: Record<string, string> = {}
  for (const [key, value] of form.entries()) if (typeof value === 'string') fields[key] = value

  const line = await voiceLine(keystoneContext.prisma, locationId).catch(() => null)
  if (!line) return xml('<Response/>', 404)
  // The address Twilio signed is the one we gave it (the connected address, plus the sealed state on later turns), not what a proxy shows us.
  const search = new URL(request.url).search
  const signed = `${voiceWebhookUrl(locationId)}${search}`
  if (!verifyTwilioSignature(signed, fields, request.headers.get('x-twilio-signature'), line.authToken)) return xml('<Response/>', 403)

  const callSid = fields.CallSid
  if (!callSid || !/^CA[0-9a-f]{32}$/i.test(callSid)) return xml('<Response/>', 400)
  const sealed = new URL(request.url).searchParams.get('s')
  const prior = unseal(sealed)
  // A call-status event (the call ended) is not a turn.
  if (!prior && TERMINAL.has(fields.CallStatus ?? '')) return xml('<Response/>')
  if (sealed && !prior) return xml(endTwiml(SORRY))

  const said = (fields.SpeechResult ?? '').trim().slice(0, 400)
  const utterances = [...(prior?.u ?? []), ...(said ? [said] : [])]
  // Twilio posts a turn with no speech when the caller stays silent: after the first prompt, that ends the call.
  const silent = Boolean(prior) && !said
  try {
    const turn = await receiveInboundCall(keystoneContext.prisma, { eventId: callSid, locationId, callerNumber: normalizeNumber(fields.From ?? '') ?? '', utterances, final: silent })
    if (!turn.done) return xml(listenTwiml(turn.said, `${voiceWebhookUrl(locationId)}?s=${seal({ u: utterances })}`))
    return xml(endTwiml(turn.said))
  } catch (error) {
    log.error('voice turn failed', { locationId, error })
    return xml(endTwiml(SORRY))
  }
}
