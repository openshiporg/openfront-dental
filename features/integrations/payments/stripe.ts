import { createHmac, timingSafeEqual } from 'node:crypto'

/*
 * Payments adapter (INTEGRATIONS §4). Stripe over its REST API with the platform's fetch; no SDK, so there is nothing to
 * keep in step. The same interface has a `manual` side (cash, cheque) that never leaves the practice.
 *
 * I-L8: the only things sent to the processor are an amount, a currency, a reference such as PAY-2026-000012, and what
 * kind of payment it is. No name, procedure or diagnosis ever goes in metadata or the description.
 *
 * Every create call carries an Idempotency-Key, so a retry after a timeout returns the first attempt's result and can
 * never charge twice.
 */

export type PaymentCtx = { apiKey?: string; baseUrl?: string; timeoutMs?: number; fetch?: typeof fetch }

export type IntentRequest = {
  amountMinor: bigint
  currency: string
  reference: string
  kind: 'payment' | 'plan_installment' | 'membership'
  idempotencyKey: string
  /** A Stripe payment-method id (pm_…) to charge now. Omit to create an intent the payer completes later with a client secret. */
  methodId?: string
  customerId?: string
  /** Charge a saved method without the payer present (autopay). */
  offSession?: boolean
}

export type IntentOutcome =
  | { kind: 'succeeded'; intentId: string; chargeId: string }
  | { kind: 'pending'; intentId: string; status: string; clientSecret: string }
  | { kind: 'failed'; message: string; intentId: string }
  | { kind: 'unknown'; message: string }

export type RefundOutcome =
  | { kind: 'completed'; refundId: string }
  | { kind: 'pending'; refundId: string }
  | { kind: 'failed'; message: string }
  | { kind: 'unknown'; message: string }

export type CustomerOutcome = { kind: 'ok'; customerId: string; methodId: string; brand: string; last4: string; expMonth: number; expYear: number } | { kind: 'failed'; message: string } | { kind: 'unknown'; message: string }

const BASE = 'https://api.stripe.com'

/** Test mode is read from the key's own prefix, so the label can never disagree with what is actually running. */
export const isTestMode = (apiKey = process.env.STRIPE_SECRET_KEY ?? '') => apiKey.startsWith('sk_test_')
export const paymentsConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY)

function form(data: Record<string, string | number | boolean | undefined>) {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(data)) if (value !== undefined) body.set(key, String(value))
  return body
}

async function call(ctx: PaymentCtx, method: 'GET' | 'POST', path: string, data: Record<string, string | number | boolean | undefined> | null, idempotencyKey?: string) {
  const apiKey = ctx.apiKey ?? process.env.STRIPE_SECRET_KEY
  if (!apiKey) throw new Error('Card payments are not set up.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs ?? 20_000)
  try {
    const response = await (ctx.fetch ?? fetch)(`${ctx.baseUrl ?? BASE}${path}`, {
      method,
      headers: { authorization: `Bearer ${apiKey}`, ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) },
      body: method === 'POST' && data ? form(data) : undefined,
      signal: controller.signal,
    })
    const text = await response.text()
    let json: any = null
    try { json = text ? JSON.parse(text) : null } catch { json = null }
    return { status: response.status, json }
  } finally {
    clearTimeout(timer)
  }
}

const declineText = (json: any) => String(json?.error?.message ?? 'The card was declined.').slice(0, 200)

export async function createIntent(request: IntentRequest, ctx: PaymentCtx = {}): Promise<IntentOutcome> {
  try {
    const confirm = Boolean(request.methodId)
    const { status, json } = await call(ctx, 'POST', '/v1/payment_intents', {
      amount: request.amountMinor.toString(),
      currency: request.currency.toLowerCase(),
      'automatic_payment_methods[enabled]': true,
      'automatic_payment_methods[allow_redirects]': 'never',
      'metadata[ref]': request.reference,
      'metadata[kind]': request.kind,
      description: request.reference,
      ...(confirm ? { confirm: true, payment_method: request.methodId } : {}),
      ...(request.customerId ? { customer: request.customerId } : {}),
      ...(request.offSession ? { off_session: true } : {}),
    }, request.idempotencyKey)
    if (status >= 500 || status === 429 || status === 409) return { kind: 'unknown', message: 'The card processor did not answer. It will be checked, not charged again.' }
    if (status === 402 || (status >= 400 && json?.error?.type === 'card_error')) return { kind: 'failed', message: declineText(json), intentId: String(json?.error?.payment_intent?.id ?? '') }
    if (status >= 400) return { kind: 'failed', message: declineText(json), intentId: '' }
    const intent = json
    if (intent?.status === 'succeeded') return { kind: 'succeeded', intentId: String(intent.id), chargeId: String(intent.latest_charge ?? '') }
    if (intent?.status === 'requires_payment_method' && confirm) return { kind: 'failed', message: declineText({ error: intent.last_payment_error }), intentId: String(intent.id) }
    return { kind: 'pending', intentId: String(intent?.id ?? ''), status: String(intent?.status ?? ''), clientSecret: String(intent?.client_secret ?? '') }
  } catch {
    return { kind: 'unknown', message: 'The card processor did not answer. It will be checked, not charged again.' }
  }
}

export async function retrieveIntent(intentId: string, ctx: PaymentCtx = {}): Promise<{ status: string; chargeId: string } | null> {
  try {
    const { status, json } = await call(ctx, 'GET', `/v1/payment_intents/${encodeURIComponent(intentId)}`, null)
    if (status >= 400) return null
    return { status: String(json?.status ?? ''), chargeId: String(json?.latest_charge ?? '') }
  } catch { return null }
}

/**
 * Cancel an intent nobody finished (r2 m-b). Only an intent that can still be cancelled is touched; one that succeeded meanwhile
 * comes back as `succeeded` so the caller settles it instead. Never charges, never refunds.
 */
export async function cancelIntent(intentId: string, ctx: PaymentCtx = {}): Promise<{ kind: 'canceled' } | { kind: 'succeeded' } | { kind: 'unknown' }> {
  try {
    const { status, json } = await call(ctx, 'POST', `/v1/payment_intents/${encodeURIComponent(intentId)}/cancel`, { cancellation_reason: 'abandoned' }, `cancel:${intentId}`)
    if (status < 400 && json?.status === 'canceled') return { kind: 'canceled' }
    const current = json?.error?.payment_intent?.status ?? (status < 400 ? json?.status : '')
    if (current === 'succeeded') return { kind: 'succeeded' }
    if (current === 'canceled') return { kind: 'canceled' }
    return { kind: 'unknown' }
  } catch { return { kind: 'unknown' } }
}

export async function refundIntent(input: { intentId: string; amountMinor: bigint; reference: string; idempotencyKey: string }, ctx: PaymentCtx = {}): Promise<RefundOutcome> {
  try {
    const { status, json } = await call(ctx, 'POST', '/v1/refunds', { payment_intent: input.intentId, amount: input.amountMinor.toString(), 'metadata[ref]': input.reference }, input.idempotencyKey)
    if (status >= 500 || status === 429 || status === 409) return { kind: 'unknown', message: 'The card processor did not answer. The refund will be checked, not repeated.' }
    if (status >= 400) return { kind: 'failed', message: String(json?.error?.message ?? 'The refund was refused.').slice(0, 200) }
    if (json?.status === 'succeeded') return { kind: 'completed', refundId: String(json.id) }
    if (json?.status === 'failed' || json?.status === 'canceled') return { kind: 'failed', message: 'The refund did not go through.' }
    return { kind: 'pending', refundId: String(json?.id ?? '') }
  } catch {
    return { kind: 'unknown', message: 'The card processor did not answer. The refund will be checked, not repeated.' }
  }
}

/** Save a method for later (card on file). `methodId` is a Stripe test or Elements method id; the card number never touches this system. */
export async function saveMethod(input: { reference: string; methodId: string; idempotencyKey: string }, ctx: PaymentCtx = {}): Promise<CustomerOutcome> {
  try {
    const customer = await call(ctx, 'POST', '/v1/customers', { 'metadata[ref]': input.reference }, `${input.idempotencyKey}:customer`)
    if (customer.status >= 500) return { kind: 'unknown', message: 'The card processor did not answer.' }
    if (customer.status >= 400) return { kind: 'failed', message: declineText(customer.json) }
    const attached = await call(ctx, 'POST', `/v1/payment_methods/${encodeURIComponent(input.methodId)}/attach`, { customer: String(customer.json.id) }, `${input.idempotencyKey}:attach`)
    if (attached.status >= 500) return { kind: 'unknown', message: 'The card processor did not answer.' }
    if (attached.status >= 400) return { kind: 'failed', message: declineText(attached.json) }
    const card = attached.json?.card ?? {}
    return { kind: 'ok', customerId: String(customer.json.id), methodId: String(attached.json.id), brand: String(card.brand ?? ''), last4: String(card.last4 ?? ''), expMonth: Number(card.exp_month ?? 0), expYear: Number(card.exp_year ?? 0) }
  } catch {
    return { kind: 'unknown', message: 'The card processor did not answer.' }
  }
}

/** Stripe's own test payment methods, so the front desk can exercise the real rails without a card number. */
export const TEST_METHODS = { test_visa: 'pm_card_visa', test_mastercard: 'pm_card_mastercard', test_declined: 'pm_card_chargeDeclined' } as const

// ─── Webhooks ───────────────────────────────────────────────────────────────

/** Verify Stripe's signature header (`t=…,v1=…`) against the raw body: HMAC-SHA256 of `${t}.${body}`, five-minute tolerance. */
export function verifyWebhook(rawBody: string, header: string | null, secret: string, now = Date.now(), toleranceSec = 300): boolean {
  if (!header || !secret) return false
  const parts = header.split(',').map(p => p.trim().split('='))
  const t = parts.find(([k]) => k === 't')?.[1]
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!t || !signatures.length || !/^\d+$/.test(t)) return false
  if (Math.abs(now / 1000 - Number(t)) > toleranceSec) return false
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  const want = Buffer.from(expected, 'hex')
  return signatures.some(sig => {
    const got = Buffer.from(sig, 'hex')
    return got.length === want.length && timingSafeEqual(got, want)
  })
}

/** Used by tests and by the recorded fixtures: sign a body the way Stripe does. */
export function signWebhook(rawBody: string, secret: string, now = Date.now()) {
  const t = Math.floor(now / 1000)
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')}`
}
