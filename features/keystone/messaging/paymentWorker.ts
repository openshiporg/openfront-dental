import { systemActor } from '../lib/actor'
import type { Db } from '../lib/db'
import { auditCreate } from '../lib/cas'
import { log } from '../lib/log'
import type { ClaimedMessage, OutboxHandlers } from '../lib/outbox'
import { runInTransaction } from '../lib/unitOfWork'
import { completeRefund, failPayment, settlePayment, sha256 } from '../lib/payments'
import { createIntent, refundIntent, retrieveIntent, saveMethod, type PaymentCtx } from '../../integrations/payments/stripe'
import { chargeDueInstallments, markOverdueStatements, refreshCreditBalances } from '../mutations/payments'

/*
 * The card processor jobs (STATE-MACHINES §6.2). Each is claim → call → apply, never one transaction:
 *   the processor is called with the row's own idempotency key and no database transaction open; the outcome is then applied
 *   under a row lock that only moves a payment still waiting. A timeout leaves it `unknown` and the reconciler asks the
 *   processor; nothing here ever charges a second time. Only the reference, amount and kind reach the processor (I-L8).
 */

const actor = systemActor('payments')

export async function runPaymentCreate(db: Db, paymentId: string, deps: PaymentCtx = {}) {
  const pay = await (db as any).payment.findUnique({ where: { id: paymentId } })
  if (!pay || pay.status !== 'initiated' || pay.tender !== 'card') return { skipped: true }
  const plan = await (db as any).paymentPlanInstallment.findFirst({ where: { paymentId }, select: { id: true } })
  const token = pay.methodTokenId ? await (db as any).paymentMethodToken.findUnique({ where: { id: pay.methodTokenId } }) : null
  const outcome = await createIntent({
    amountMinor: pay.amountMinor, currency: (pay.currencyCode || 'USD').toLowerCase(), reference: pay.ref, kind: plan ? 'plan_installment' : 'payment',
    idempotencyKey: pay.idempotencyKey, methodId: pay.providerMethodId || undefined, customerId: token?.providerCustomerId || undefined, offSession: Boolean(token && pay.source === 'payment_plan'),
  }, deps)
  return runInTransaction(db, async uow => {
    if (outcome.kind === 'succeeded') return settlePayment(uow, actor, paymentId, { providerIntentId: outcome.intentId })
    if (outcome.kind === 'pending') {
      await uow.tx.payment.updateMany({ where: { id: paymentId, status: 'initiated' }, data: { status: 'requires_action', providerIntentId: outcome.intentId } })
      return { pending: true }
    }
    if (outcome.kind === 'failed') {
      if (outcome.intentId) await uow.tx.payment.updateMany({ where: { id: paymentId }, data: { providerIntentId: outcome.intentId } })
      return failPayment(uow, actor, paymentId, outcome.message, 'failed')
    }
    return failPayment(uow, actor, paymentId, outcome.message, 'unknown')
  })
}

export async function runRefund(db: Db, refundId: string, deps: PaymentCtx = {}) {
  const refund = await (db as any).refund.findUnique({ where: { id: refundId }, include: { payment: true } })
  if (!refund || refund.status !== 'executing' || !refund.payment) return { skipped: true }
  if (!refund.payment.providerIntentId) return runInTransaction(db, async uow => { await uow.tx.refund.update({ where: { id: refundId }, data: { status: 'failed', failureNote: 'The original card payment has no processor record.' } }) })
  const outcome = await refundIntent({ intentId: refund.payment.providerIntentId, amountMinor: refund.amountMinor, reference: refund.ref, idempotencyKey: `refund:${refund.id}` }, deps)
  return runInTransaction(db, async uow => {
    if (outcome.kind === 'completed' || outcome.kind === 'pending') return completeRefund(uow, actor, refundId, { adapterRef: outcome.refundId })
    if (outcome.kind === 'failed') {
      await uow.tx.refund.updateMany({ where: { id: refundId, status: 'executing' }, data: { status: 'failed', failureNote: outcome.message.slice(0, 200), version: { increment: 1 } } })
      auditCreate(uow, actor, 'Refund', refundId, 'refund.failed', { message: outcome.message.slice(0, 200) })
      return { failed: true }
    }
    await uow.tx.refund.updateMany({ where: { id: refundId, status: 'executing' }, data: { status: 'unknown', failureNote: outcome.message.slice(0, 200), version: { increment: 1 } } })
    return { unknown: true }
  })
}

/** Card on file: attach the test or Elements method to a customer, with the cardholder's recorded agreement. Only brand, last four and expiry are kept. */
export async function runSaveMethod(db: Db, input: { paymentId: string; accountId: string; consentText: string; consentBy: string }, deps: PaymentCtx = {}) {
  const pay = await (db as any).payment.findUnique({ where: { id: input.paymentId } })
  if (!pay || !pay.providerMethodId) return { skipped: true }
  if (await (db as any).paymentMethodToken.findFirst({ where: { accountId: input.accountId, status: 'active', providerMethodId: { startsWith: 'pm_' }, createdAt: { gte: pay.createdAt } }, select: { id: true } })) return { skipped: true }
  const out = await saveMethod({ reference: pay.ref, methodId: pay.providerMethodId, idempotencyKey: `save:${pay.id}` }, deps)
  if (out.kind !== 'ok') return { skipped: true, message: out.message }
  return runInTransaction(db, async uow => {
    const token = await uow.tx.paymentMethodToken.create({
      data: { accountId: input.accountId, adapterKey: 'stripe', providerCustomerId: out.customerId, providerMethodId: out.methodId, brand: out.brand, last4: out.last4, expMonth: out.expMonth, expYear: out.expYear, consentText: input.consentText, consentAt: uow.now, consentBy: input.consentBy, status: 'active' },
    })
    auditCreate(uow, actor, 'PaymentMethodToken', token.id, 'payment_method.saved', { brand: out.brand, last4: out.last4 })
    return { tokenId: token.id }
  })
}

/** A payment stuck as initiated, requires_action or unknown: ask the processor what became of it. Never creates a charge. */
export async function reconcilePayments(db: Db, now: Date, deps: PaymentCtx = {}) {
  const cutoff = new Date(now.getTime() - 2 * 60_000)
  const stuck = await (db as any).payment.findMany({ where: { tender: 'card', status: { in: ['initiated', 'requires_action', 'unknown'] }, updatedAt: { lt: cutoff } }, take: 50 })
  let settled = 0, failed = 0
  for (const pay of stuck) {
    if (!pay.providerIntentId) {
      // Never reached the processor with an answer: give up after an hour and say so.
      if (now.getTime() - pay.createdAt.getTime() > 3_600_000) { await runInTransaction(db, uow => failPayment(uow, actor, pay.id, 'The card processor never confirmed this payment. Nothing was charged.', 'failed')); failed += 1 }
      continue
    }
    const intent = await retrieveIntent(pay.providerIntentId, deps)
    if (!intent) continue
    if (intent.status === 'succeeded') { await runInTransaction(db, uow => settlePayment(uow, actor, pay.id)); settled += 1 }
    else if (['canceled', 'requires_payment_method'].includes(intent.status)) { await runInTransaction(db, uow => failPayment(uow, actor, pay.id, 'The card was not charged.', 'failed')); failed += 1 }
  }
  const refunds = await (db as any).refund.findMany({ where: { status: 'unknown', updatedAt: { lt: cutoff } }, take: 20 })
  for (const r of refunds) {
    await (db as any).refund.updateMany({ where: { id: r.id, status: 'unknown' }, data: { status: 'executing' } })
    await runRefund(db, r.id, deps).catch(error => log.error('refund retry failed', { refundId: r.id, error }))
  }
  return { checked: stuck.length, settled, failed, refundsRetried: refunds.length }
}

/** An event from the processor, already deduplicated by event id. Reads only ids and status from it; applies them under the payment's lock. */
export async function applyPaymentEvent(db: Db, event: { id: string; type: string; data?: { object?: any } }) {
  const object = event.data?.object ?? {}
  const intentId = String(object.object === 'charge' ? object.payment_intent ?? '' : object.id ?? '')
  const pay = intentId ? await (db as any).payment.findFirst({ where: { providerIntentId: intentId } }) : null
  if (!pay) return { matched: false }
  return runInTransaction(db, async uow => {
    if (event.type === 'payment_intent.succeeded') return { matched: true, ...(await settlePayment(uow, actor, pay.id, { providerIntentId: intentId })) }
    if (event.type === 'payment_intent.payment_failed') return { matched: true, ...(await failPayment(uow, actor, pay.id, String(object.last_payment_error?.message ?? 'The card was declined.'), 'failed')) }
    if (event.type === 'charge.dispute.created') {
      await uow.tx.payment.update({ where: { id: pay.id }, data: { disputedAt: uow.now, version: { increment: 1 } } })
      auditCreate(uow, actor, 'Payment', pay.id, 'payment.disputed', { reason: String(object.reason ?? '') })
      uow.emit({ topic: 'notify.staff', aggregateType: 'Payment', aggregateId: pay.id, payload: { kind: 'payment.disputed', locationId: pay.locationId }, dedupeKey: `notify.staff:dispute:${pay.id}` })
      return { matched: true, disputed: true }
    }
    if (event.type === 'charge.refunded') {
      // A refund started in the processor's own dashboard is flagged for staff, never posted silently.
      const known = await uow.tx.refund.findFirst({ where: { paymentId: pay.id, status: { in: ['executing', 'completed', 'unknown'] } }, select: { id: true } })
      if (!known) uow.emit({ topic: 'notify.staff', aggregateType: 'Payment', aggregateId: pay.id, payload: { kind: 'payment.refund_outside', locationId: pay.locationId }, dedupeKey: `notify.staff:refund_outside:${event.id}` })
      return { matched: true, refund: Boolean(known) }
    }
    return { matched: true, ignored: true }
  })
}

/** Record a webhook event once (by processor event id) and apply it; a repeat delivery finds it applied and does nothing. */
export async function receiveStripeEvent(db: Db, rawBody: string, event: { id: string; type: string; data?: any }) {
  const existing = await (db as any).inboundObservation.findFirst({ where: { source: 'stripe', externalId: event.id } })
  if (existing?.appliedAt) return { replay: true }
  const observation = existing ?? await (db as any).inboundObservation.create({ data: { source: 'stripe', kind: event.type, externalId: event.id, contentHash: sha256(rawBody), receivedAt: new Date() } }).catch(async () => (db as any).inboundObservation.findFirst({ where: { source: 'stripe', externalId: event.id } }))
  const result = await applyPaymentEvent(db, event)
  await (db as any).inboundObservation.update({ where: { id: observation.id }, data: { appliedAt: new Date(), applyResult: JSON.parse(JSON.stringify(result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) } })
  return { replay: false, result }
}

export function paymentHandlers(db: Db, deps: PaymentCtx = {}): OutboxHandlers {
  return {
    'payment.create': async (m: ClaimedMessage) => { const p = (m.payload ?? {}) as { paymentId?: string }; if (p.paymentId) await runPaymentCreate(db, p.paymentId, deps) },
    'payment.refund': async (m: ClaimedMessage) => { const p = (m.payload ?? {}) as { refundId?: string }; if (p.refundId) await runRefund(db, p.refundId, deps) },
    'payment.save_method': async (m: ClaimedMessage) => { const p = (m.payload ?? {}) as any; if (p.paymentId) await runSaveMethod(db, p, deps) },
  }
}

export const paymentJobs = (db: Db, now: () => Date): [string, () => Promise<unknown>][] => [
  ['job:payment-reconcile', () => reconcilePayments(db, now())],
  ['job:plan-installments', () => chargeDueInstallments(db, now())],
  ['job:statements-overdue', () => markOverdueStatements(db, now())],
  ['job:credit-balances', () => refreshCreditBalances(db, now())],
]
