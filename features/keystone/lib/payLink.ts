import { systemActor } from './actor'
import { auditCreate } from './cas'
import type { Db } from './db'
import { advisoryLock } from './db'
import { DomainError, Codes } from './errors'
import { parseMoney } from './ledger'
import { failPayment, settlePayment } from './payments'
import { nextReference } from './sequence'
import { runInTransaction } from './unitOfWork'
import { cancelIntent, createIntent, isTestMode, paymentsConfigured, retrieveIntent, type PaymentCtx } from '../../integrations/payments/stripe'

/*
 * The pay link (STATE-MACHINES §6.3). A statement carries a random code; the code opens that one statement's balance, nothing else,
 * until the statement's expiry. A code that matches no statement, has expired, or belongs to a statement that was suppressed or
 * put on collections hold gets exactly the same "not found" as a made-up one: nothing about it is revealed.
 *
 * The patient's card is typed into the processor's own field in their browser; only a reference, amount and kind leave this server
 * (I-L8) and only an intent's client secret comes back. The payment is recorded as `initiated` before the processor is called, the
 * processor is called with the payment's own idempotency key and no transaction open, and a payment is settled by the same
 * `settlePayment` that every other tender uses, so a repeated confirmation or webhook cannot post twice.
 */

export const PAY_LINK_DAYS = 60
export const PAY_LINK_PATTERN = /^PAY-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/
const SHOWN = ['generated', 'sent', 'partially_paid', 'overdue', 'payment_plan', 'paid']
const MINIMUM_MINOR = 100n
const actor = systemActor('pay-link')
const NOT_FOUND = () => new DomainError(Codes.NOT_FOUND, 'This link is not available.')

export type PayLinkView = {
  ref: string
  practiceName: string
  locationName: string
  dueDate: string
  expiresAt: string
  statementAmountMinor: string
  owedMinor: string
  lines: { date: string; description: string; owedMinor: string }[]
  canPay: boolean
}

type Row = Awaited<ReturnType<typeof loadStatement>>

async function loadStatement(db: Db, code: string, now: Date) {
  const normal = String(code ?? '').trim().toUpperCase()
  if (!PAY_LINK_PATTERN.test(normal)) return null
  const row = await (db as any).statement.findUnique({ where: { payLinkCode: normal }, include: { location: { select: { name: true } } } })
  if (!row || !row.accountId || !row.payLinkExpiresAt || row.payLinkExpiresAt.getTime() <= now.getTime() || !SHOWN.includes(row.status)) return null
  return row as { id: string; ref: string; accountId: string; locationId: string; status: string; dueDate: Date | null; amountDueMinor: bigint; snapshot: any; payLinkExpiresAt: Date; pdfSha256: string; cycleDate: Date | null; payLinkCode: string; location: { name: string } | null }
}

/** A pay-link payment the patient started and never finished stops holding the statement after this long (r2 m-b). */
export const PAY_LINK_PENDING_MINUTES = 30

/**
 * Expire this statement's pay-link payments left in `requires_action` (or `initiated`) for more than 30 minutes, when the link is
 * read: no timer, no background work. The processor is asked first; a payment that did go through is settled, never failed. An
 * unfinished TEST-mode intent is cancelled at Stripe; a live-mode one is only asked about (its own expiry applies). Then the
 * payment is marked failed ("expired"), so it no longer blocks a new attempt or day close.
 */
export async function expireStalePayLinkPayments(db: Db, statementId: string, now = new Date(), deps: PaymentCtx = {}) {
  const cutoff = new Date(now.getTime() - PAY_LINK_PENDING_MINUTES * 60_000)
  const stale = await (db as any).payment.findMany({ where: { statementId, source: 'pay_link', status: { in: ['initiated', 'requires_action'] }, createdAt: { lt: cutoff } }, select: { id: true, providerIntentId: true }, take: 10 })
  let expired = 0
  for (const pay of stale as { id: string; providerIntentId: string }[]) {
    if (pay.providerIntentId) {
      const intent = await retrieveIntent(pay.providerIntentId, deps)
      if (!intent) continue
      if (intent.status === 'succeeded') { await runInTransaction(db, uow => settlePayment(uow, actor, pay.id, { providerIntentId: pay.providerIntentId })); continue }
      if (intent.status === 'processing') continue
      if (intent.status !== 'canceled' && isTestMode(deps.apiKey)) {
        const cancelled = await cancelIntent(pay.providerIntentId, deps)
        if (cancelled.kind === 'succeeded') { await runInTransaction(db, uow => settlePayment(uow, actor, pay.id, { providerIntentId: pay.providerIntentId })); continue }
        if (cancelled.kind === 'unknown') continue
      }
    }
    const done = await runInTransaction(db, uow => failPayment(uow, actor, pay.id, `Not finished within ${PAY_LINK_PENDING_MINUTES} minutes; expired.`, 'failed'))
    if (done.changed) expired += 1
  }
  return { expired }
}

/**
 * This statement's OWN unfinished pay-link attempts (the customer reloaded or came back) are released so a new one can start: the
 * processor's intent is cancelled (never charges), or settled if it was paid meanwhile. One the processor will not release (for
 * example a card being confirmed right now) stays open and the open-attempt guard still refuses. Other statements are never touched.
 */
async function releaseOwnOpenAttempts(db: Db, statementId: string, deps: PaymentCtx) {
  const open = await (db as any).payment.findMany({ where: { statementId, source: 'pay_link', status: { in: ['initiated', 'requires_action'] } }, select: { id: true, providerIntentId: true }, take: 10 })
  for (const pay of open as { id: string; providerIntentId: string | null }[]) {
    if (!pay.providerIntentId) continue
    const cancelled = await cancelIntent(pay.providerIntentId, deps)
    if (cancelled.kind === 'succeeded') await runInTransaction(db, uow => settlePayment(uow, actor, pay.id, { providerIntentId: pay.providerIntentId! }))
    else if (cancelled.kind === 'canceled') await runInTransaction(db, uow => failPayment(uow, actor, pay.id, 'Replaced by a new attempt on the same link.', 'failed'))
  }
}

const balanceOf = async (db: Db, accountId: string) => ((await (db as any).ledgerEntry.aggregate({ where: { accountId }, _sum: { amountMinor: true } }))._sum.amountMinor ?? 0n) as bigint

/** What this link can show and take: the statement's open lines, and what is still owed on the account now (never more than the statement's amount). */
export async function openPayLink(db: Db, code: string, now = new Date(), deps: PaymentCtx = {}): Promise<PayLinkView> {
  const row = await loadStatement(db, code, now)
  if (!row) throw NOT_FOUND()
  await expireStalePayLinkPayments(db, row.id, now, deps)
  const balance = await balanceOf(db, row.accountId)
  const owed = balance <= 0n ? 0n : balance < row.amountDueMinor ? balance : row.amountDueMinor
  const settings = await (db as any).practiceSettings.findUnique({ where: { id: 1 }, select: { displayName: true } })
  const lines = ((row.snapshot?.lines ?? []) as { date: string; description: string; owedMinor: string }[]).map(l => ({ date: String(l.date), description: String(l.description), owedMinor: String(l.owedMinor) }))
  return {
    ref: row.ref, practiceName: settings?.displayName ?? '', locationName: row.location?.name ?? '', dueDate: row.dueDate?.toISOString().slice(0, 10) ?? '',
    expiresAt: row.payLinkExpiresAt.toISOString(), statementAmountMinor: row.amountDueMinor.toString(), owedMinor: owed.toString(), lines,
    canPay: owed > 0n && paymentsConfigured(),
  }
}

/** The statement's PDF source, for the public copy: same lookup, so an expired or unknown code gets nothing here either. */
export async function payLinkStatement(db: Db, code: string, now = new Date()) {
  const row = await loadStatement(db, code, now)
  if (!row) throw NOT_FOUND()
  return row
}

export async function startPayLinkPayment(db: Db, code: string, amountText: string | null | undefined, now = new Date(), deps: PaymentCtx = {}) {
  const row = await loadStatement(db, code, now)
  if (!row) throw NOT_FOUND()
  if (!paymentsConfigured()) throw new DomainError(Codes.GUARD_FAILED, 'Online payment is not available right now. Please call the front desk.')
  await expireStalePayLinkPayments(db, row.id, now, deps)
  await releaseOwnOpenAttempts(db, row.id, deps)
  const created = await runInTransaction(db, async uow => {
    const { tx } = uow
    await advisoryLock(tx, `ledger:${row.accountId}`)
    const balance = await balanceOf(tx as any, row.accountId)
    const owed = balance <= 0n ? 0n : balance < row.amountDueMinor ? balance : row.amountDueMinor
    if (owed <= 0n) throw new DomainError(Codes.GUARD_FAILED, 'Nothing is owed on this statement.')
    const amount = amountText ? parseMoney(amountText) : owed
    const floor = owed < MINIMUM_MINOR ? owed : MINIMUM_MINOR
    if (amount < floor) throw new DomainError(Codes.INVALID_INPUT, 'The smallest payment online is $1.00.', { field: 'amount' })
    const open = await tx.payment.aggregate({ where: { statementId: row.id, source: 'pay_link', status: { in: ['initiated', 'requires_action'] }, createdAt: { gte: new Date(now.getTime() - 30 * 60_000) } }, _sum: { amountMinor: true } })
    if (amount + (open._sum.amountMinor ?? 0n) > owed) throw new DomainError(Codes.INVALID_INPUT, amount > owed ? 'That is more than is owed.' : 'A payment for this statement is already in progress. Finish it or wait a few minutes.', { field: 'amount' })
    const patientId = (await tx.guarantorAccount.findUnique({ where: { id: row.accountId }, select: { guarantor: { select: { patientId: true } } } }))?.guarantor?.patientId ?? null
    const settings = await tx.practiceSettings.findUnique({ where: { id: 1 }, select: { currencyCode: true } })
    const ref = await nextReference(tx, 'PAY', uow.now)
    const payment = await tx.payment.create({
      data: { ref, accountId: row.accountId, patientId, locationId: row.locationId, amountMinor: amount, currencyCode: settings?.currencyCode ?? 'USD', tender: 'card', status: 'initiated', adapterKey: 'stripe', idempotencyKey: `paylink:${ref}`, source: 'pay_link', statementId: row.id },
    })
    auditCreate(uow, actor, 'Payment', payment.id, 'payment.initiated', { amountMinor: amount.toString(), tender: 'card', ref, source: 'pay_link' })
    return { id: payment.id, ref, amount, key: payment.idempotencyKey as string, currency: (settings?.currencyCode ?? 'USD') as string }
  })
  const outcome = await createIntent({ amountMinor: created.amount, currency: created.currency.toLowerCase(), reference: created.ref, kind: 'payment', idempotencyKey: created.key }, deps)
  if (outcome.kind === 'pending') {
    await (db as any).payment.updateMany({ where: { id: created.id, status: 'initiated' }, data: { status: 'requires_action', providerIntentId: outcome.intentId } })
    return { ref: created.ref, clientSecret: outcome.clientSecret, amountMinor: created.amount.toString() }
  }
  await runInTransaction(db, uow => failPayment(uow, actor, created.id, outcome.kind === 'succeeded' ? 'Unexpected answer from the card processor.' : outcome.message, outcome.kind === 'unknown' ? 'unknown' : 'failed'))
  throw new DomainError(Codes.GUARD_FAILED, 'We could not start the payment. Nothing was charged. Please try again or call the front desk.')
}

/** After the browser says the card was confirmed: ask the processor, and settle (once) if it succeeded. A repeat call changes nothing. */
export async function confirmPayLinkPayment(db: Db, code: string, ref: string, now = new Date(), deps: PaymentCtx = {}) {
  const row = await loadStatement(db, code, now)
  if (!row) throw NOT_FOUND()
  const pay = await (db as any).payment.findFirst({ where: { ref: String(ref ?? ''), statementId: row.id, source: 'pay_link' } })
  if (!pay) throw NOT_FOUND()
  if (['succeeded', 'partially_refunded', 'refunded'].includes(pay.status)) return { status: 'paid' as const, amountMinor: pay.amountMinor.toString() }
  if (pay.status === 'failed') return { status: 'failed' as const, message: pay.failureNote || 'The card was declined.' }
  if (!pay.providerIntentId) return { status: 'pending' as const }
  const intent = await retrieveIntent(pay.providerIntentId, deps)
  if (!intent) return { status: 'pending' as const }
  if (intent.status === 'succeeded') {
    await runInTransaction(db, uow => settlePayment(uow, actor, pay.id, { providerIntentId: pay.providerIntentId }))
    return { status: 'paid' as const, amountMinor: pay.amountMinor.toString() }
  }
  if (intent.status === 'requires_payment_method') {
    await runInTransaction(db, uow => failPayment(uow, actor, pay.id, 'The card was declined.', 'failed'))
    return { status: 'failed' as const, message: 'The card has not been confirmed yet. Please enter the card and try again.' }
  }
  return { status: 'pending' as const }
}

export type { Row as PayLinkRow }
