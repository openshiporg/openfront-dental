import { createTransport } from 'nodemailer'

/*
 * MessagingAdapter (INTEGRATIONS §6). Providers declare their honest mode:
 *   manual  — nothing is sent; the message waits on the staff call/print list (mode manual_export);
 *   smtp    — email through the practice's SMTP relay (mode live when configured, else manual);
 *   twilio  — SMS; needs a BAA for anything above phiLevel none, so it arrives with Phase 7 setup
 *             and until then SMS messages fall back to the manual list.
 * `accepted` is not `delivered`: SMTP acceptance is recorded as accepted, never as delivered.
 */

export type OutboundMessage = { to: string; channel: 'email' | 'sms' | 'voice' | 'portal' | 'manual'; subject?: string; body: string; purpose: string; idempotencyKey: string }
export type SendResult = { status: 'accepted' | 'queued_manual' | 'failed'; providerMessageId: string; adapterKey: string; adapterMode: 'manual_export' | 'sandbox' | 'live'; error?: string }

export interface MessagingAdapter {
  key: string
  mode: SendResult['adapterMode']
  channels: OutboundMessage['channel'][]
  send(message: OutboundMessage): Promise<SendResult>
}

export const manualAdapter: MessagingAdapter = {
  key: 'manual',
  mode: 'manual_export',
  channels: ['email', 'sms', 'voice', 'manual'],
  async send(message) {
    return { status: 'queued_manual', providerMessageId: `manual:${message.idempotencyKey}`, adapterKey: 'manual', adapterMode: 'manual_export' }
  },
}

export function smtpConfigured(env = process.env) {
  return !!(env.SMTP_HOST && env.SMTP_FROM)
}

export function smtpAdapter(env = process.env): MessagingAdapter {
  const transport = createTransport({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined })
  return {
    key: 'smtp',
    mode: 'live',
    channels: ['email'],
    async send(message) {
      try {
        const info = await transport.sendMail({ from: env.SMTP_FROM, to: message.to, subject: message.subject || 'Message from your dental office', text: message.body, messageId: `<${message.idempotencyKey.replace(/[^A-Za-z0-9.-]/g, '')}@openfront-dental>` })
        return { status: 'accepted', providerMessageId: String(info.messageId ?? ''), adapterKey: 'smtp', adapterMode: 'live' }
      } catch (error) {
        return { status: 'failed', providerMessageId: '', adapterKey: 'smtp', adapterMode: 'live', error: error instanceof Error ? error.message.slice(0, 200) : 'send failed' }
      }
    },
  }
}

/** The adapter for a channel: SMTP for email when configured; everything else waits on the manual list. */
export function adapterFor(channel: OutboundMessage['channel'], options: { isSynthetic?: boolean; env?: NodeJS.ProcessEnv } = {}): MessagingAdapter {
  // Synthetic (sample practice) data never reaches a live provider (I-G3).
  if (options.isSynthetic) return manualAdapter
  if (channel === 'email' && smtpConfigured(options.env)) return smtpAdapter(options.env)
  return manualAdapter
}

/** Fill {{a.b}} variables; unknown variables render empty, never the raw placeholder. */
export function renderTemplate(body: string, vars: Record<string, unknown>) {
  return body.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, path: string) => {
    const value = path.split('.').reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as any)[key] : undefined), vars)
    return value === undefined || value === null ? '' : String(value)
  })
}

/** Inbound SMS keywords handled before any person or agent sees the message (INTEGRATIONS §6). */
export function keywordOf(body: string, restartKeywords: string[] = ['START', 'UNSTOP']) {
  const word = String(body ?? '').trim().toUpperCase().replace(/[^A-Z]/g, '')
  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE'].includes(word)) return 'stop' as const
  if (restartKeywords.map(k => k.toUpperCase()).includes(word) || word === 'START') return 'start' as const
  if (word === 'HELP' || word === 'INFO') return 'help' as const
  if (['C', 'Y', 'YES', 'CONFIRM', 'CONFIRMED'].includes(word)) return 'confirm' as const
  return null
}
