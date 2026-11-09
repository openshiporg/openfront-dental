import { createHash } from 'node:crypto'
import type { Tx } from './db'
import { advisoryLock } from './db'
import { auditCreate } from './cas'
import type { Actor } from './actor'
import { DomainError, Codes } from './errors'
import { postEntry } from './ledger'
import type { UnitOfWork } from './unitOfWork'
import { localDate } from './time'

const dayOf = (date: string) => new Date(`${date}T00:00:00Z`)
async function locationToday(tx: Tx, locationId: string, now: Date) {
  const location = await tx.location.findUnique({ where: { id: locationId }, select: { timeZone: true } })
  return localDate(location?.timeZone ?? 'America/New_York', now)
}

/*
 * Payment settlement shared by the front desk, the worker and the webhook (STATE-MACHINES §6.2, DOMAIN I-L4).
 * Everything here runs inside a caller's transaction and under the account's advisory lock, so two payments on one
 * account never race for the same charge.
 */

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

/**
 * Pure: what is still owed on each charge. Credits (payments, write-offs, adjustments, reversals) are applied to the oldest
 * debits first, the same rule the balance uses, so the answer agrees with "how old the balance is".
 */
export function chargesOutstanding(entries: { id: string; kind: string; amountMinor: bigint; businessDate: Date | null; createdAt?: Date }[]) {
  const sorted = [...entries].sort((a, b) => (a.businessDate?.getTime() ?? 0) - (b.businessDate?.getTime() ?? 0) || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))
  let credit = sorted.filter(e => e.amountMinor < 0n).reduce((sum, e) => sum - e.amountMinor, 0n)
  const out: { id: string; left: bigint; amountMinor: bigint }[] = []
  for (const e of sorted.filter(x => x.amountMinor > 0n)) {
    const applied = credit < e.amountMinor ? credit : e.amountMinor
    credit -= applied
    if (e.kind === 'charge' && e.amountMinor - applied > 0n) out.push({ id: e.id, left: e.amountMinor - applied, amountMinor: e.amountMinor })
  }
  return out
}

/** Split a payment across the oldest charges still owed (or exactly where the user says). The remainder stays on the account as credit. */
export async function allocatePayment(tx: Tx, input: { paymentId: string; accountId: string; amountMinor: bigint; explicit?: { entryId: string; amountMinor: bigint }[] }) {
  const entries = await tx.ledgerEntry.findMany({ where: { accountId: input.accountId }, select: { id: true, kind: true, amountMinor: true, businessDate: true, createdAt: true } })
  const outstanding = chargesOutstanding(entries as never)
  const already = await tx.paymentAllocation.groupBy({ by: ['ledgerEntryId'], where: { ledgerEntryId: { in: outstanding.map(o => o.id) } }, _sum: { amountMinor: true } })
  const allocated = new Map(already.map(a => [a.ledgerEntryId as string, (a._sum.amountMinor ?? 0n) as bigint]))
  let remaining = input.amountMinor
  const made: { entryId: string; amountMinor: bigint }[] = []
  const plan = input.explicit?.length ? input.explicit : outstanding.map(o => ({ entryId: o.id, amountMinor: o.left }))
  for (const want of plan) {
    if (remaining <= 0n) break
    const row = outstanding.find(o => o.id === want.entryId)
    if (!row) throw new DomainError(Codes.INVALID_INPUT, 'That charge is not owed on this account.', { field: 'allocations' })
    const room = row.amountMinor - (allocated.get(row.id) ?? 0n)
    let take = want.amountMinor < row.left ? want.amountMinor : row.left
    if (take > room) take = room
    if (take > remaining) take = remaining
    if (take <= 0n) continue
    await tx.paymentAllocation.create({ data: { paymentId: input.paymentId, ledgerEntryId: row.id, amountMinor: take } })
    remaining -= take
    made.push({ entryId: row.id, amountMinor: take })
  }
  return { allocated: input.amountMinor - remaining, unallocated: remaining, made }
}

type PaymentRow = { id: string; ref: string; accountId: string | null; patientId: string | null; locationId: string | null; amountMinor: bigint; currencyCode: string; tender: string; status: string; statementId: string | null; receivedById: string | null; checkNumber: string; version: number }

/**
 * A payment that has really happened (cash in the drawer, a processor confirmation): post the ledger credit, apply it to the
 * oldest charges, mark the statement and instalment it paid. Safe to call twice: only a payment not yet settled moves.
 */
export async function settlePayment(uow: UnitOfWork, actor: Actor, paymentId: string, extra: { providerIntentId?: string; installmentId?: string | null; explicit?: { entryId: string; amountMinor: bigint }[] } = {}) {
  const { tx } = uow
  const rows = await tx.$queryRaw<PaymentRow[]>`SELECT id, ref, account AS "accountId", patient AS "patientId", location AS "locationId", "amountMinor", "currencyCode", tender, status, statement AS "statementId", "receivedBy" AS "receivedById", "checkNumber", version FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`
  const pay = rows[0]
  if (!pay) throw new DomainError(Codes.NOT_FOUND, 'Payment not found.')
  if (!['initiated', 'requires_action', 'unknown', 'failed'].includes(pay.status)) return { settled: false as const, paymentId, status: pay.status }
  await advisoryLock(tx, `ledger:${pay.accountId}`)
  const date = await locationToday(tx, pay.locationId!, uow.now)
  const entry = await postEntry(tx, {
    accountId: pay.accountId!, patientId: pay.patientId, kind: 'patient_payment', amountMinor: -pay.amountMinor, currencyCode: pay.currencyCode || 'USD',
    businessDate: dayOf(date), locationId: pay.locationId!, paymentId: pay.id, postedById: pay.receivedById,
    memo: `Payment received (${pay.ref})${pay.tender === 'check' && pay.checkNumber ? `, check ${pay.checkNumber}` : ''}`,
  }, uow.now)
  const split = await allocatePayment(tx, { paymentId: pay.id, accountId: pay.accountId!, amountMinor: pay.amountMinor, explicit: extra.explicit })
  await tx.payment.update({ where: { id: pay.id }, data: { status: 'succeeded', ledgerEntryId: entry.id, businessDate: dayOf(date), ...(extra.providerIntentId ? { providerIntentId: extra.providerIntentId } : {}), failureNote: '', version: { increment: 1 } } })
  auditCreate(uow, actor, 'Payment', pay.id, 'payment.succeeded', { amountMinor: pay.amountMinor.toString(), tender: pay.tender, allocated: split.allocated.toString(), ledgerEntryId: entry.id })
  if (pay.statementId) await refreshStatementStatus(tx, pay.statementId)
  const installment = extra.installmentId ?? (await tx.paymentPlanInstallment.findFirst({ where: { paymentId: pay.id }, select: { id: true } }))?.id ?? null
  if (installment) await markInstallmentPaid(uow, actor, installment, pay.id)
  return { settled: true as const, paymentId: pay.id, ledgerEntryId: entry.id, allocated: split.allocated, unallocated: split.unallocated }
}

export async function failPayment(uow: UnitOfWork, actor: Actor, paymentId: string, message: string, to: 'failed' | 'unknown' = 'failed') {
  const { tx } = uow
  const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`
  if (!rows[0] || !['initiated', 'requires_action', 'unknown'].includes(rows[0].status)) return { changed: false as const }
  await tx.payment.update({ where: { id: paymentId }, data: { status: to, failureNote: message.slice(0, 200), version: { increment: 1 } } })
  auditCreate(uow, actor, 'Payment', paymentId, to === 'failed' ? 'payment.failed' : 'payment.unknown', { message: message.slice(0, 200) })
  const installment = await tx.paymentPlanInstallment.findFirst({ where: { paymentId }, select: { id: true } })
  if (installment && to === 'failed') await markInstallmentFailed(uow, actor, installment.id)
  return { changed: true as const }
}

/** After a payment: a statement is `paid` when nothing is owed on the account at its amount, `partially_paid` when something has been paid. */
export async function refreshStatementStatus(tx: Tx, statementId: string) {
  const statement = await tx.statement.findUnique({ where: { id: statementId }, select: { id: true, amountDueMinor: true, status: true } })
  if (!statement || ['suppressed', 'collections_hold'].includes(statement.status)) return
  const paid = await tx.payment.aggregate({ where: { statementId, status: { in: ['succeeded', 'partially_refunded', 'refunded'] } }, _sum: { amountMinor: true, refundedMinor: true } })
  const net = (paid._sum.amountMinor ?? 0n) - (paid._sum.refundedMinor ?? 0n)
  const next = net >= statement.amountDueMinor ? 'paid' : net > 0n ? 'partially_paid' : statement.status
  if (next !== statement.status) await tx.statement.update({ where: { id: statementId }, data: { status: next, version: { increment: 1 } } })
}

export async function markInstallmentPaid(uow: UnitOfWork, actor: Actor, installmentId: string, paymentId: string) {
  const { tx } = uow
  const row = await tx.paymentPlanInstallment.findUnique({ where: { id: installmentId } })
  if (!row || row.status === 'paid') return
  await tx.paymentPlanInstallment.update({ where: { id: installmentId }, data: { status: 'paid', paymentId, version: { increment: 1 } } })
  auditCreate(uow, actor, 'PaymentPlanInstallment', installmentId, 'plan.installment_paid', { paymentId })
  const planId = row.planId as string
  const open = await tx.paymentPlanInstallment.count({ where: { planId, status: { not: 'paid' } } })
  const plan = await tx.paymentPlan.findUnique({ where: { id: planId }, select: { status: true } })
  if (plan && open === 0 && ['active', 'delinquent'].includes(plan.status)) {
    await tx.paymentPlan.update({ where: { id: planId }, data: { status: 'completed', version: { increment: 1 } } })
    auditCreate(uow, actor, 'PaymentPlan', planId, 'plan.completed', {})
  } else if (plan?.status === 'delinquent') {
    const missed = await tx.paymentPlanInstallment.count({ where: { planId, status: 'missed' } })
    if (missed < 2) await tx.paymentPlan.update({ where: { id: planId }, data: { status: 'active', version: { increment: 1 } } })
  }
}

export const MAX_INSTALLMENT_ATTEMPTS = 3

export async function markInstallmentFailed(uow: UnitOfWork, actor: Actor, installmentId: string) {
  const { tx } = uow
  const row = await tx.paymentPlanInstallment.findUnique({ where: { id: installmentId } })
  if (!row || row.status === 'paid') return
  const attempts = (row.attempts ?? 0) + 1
  const missed = attempts >= MAX_INSTALLMENT_ATTEMPTS
  await tx.paymentPlanInstallment.update({ where: { id: installmentId }, data: { status: missed ? 'missed' : 'failed', attempts, lastAttemptOn: dayOf(uow.now.toISOString().slice(0, 10)), version: { increment: 1 } } })
  auditCreate(uow, actor, 'PaymentPlanInstallment', installmentId, missed ? 'plan.installment_missed' : 'plan.installment_failed', { attempts })
  if (missed) {
    const planId = row.planId as string
    const count = await tx.paymentPlanInstallment.count({ where: { planId, status: 'missed' } })
    const plan = await tx.paymentPlan.findUnique({ where: { id: planId }, select: { status: true } })
    if (count >= 2 && plan?.status === 'active') {
      await tx.paymentPlan.update({ where: { id: planId }, data: { status: 'delinquent', version: { increment: 1 } } })
      auditCreate(uow, actor, 'PaymentPlan', planId, 'plan.delinquent', { missed: count })
    }
  }
}

/** A refund the processor (or the person with the check book) has carried out: the ledger debit, the payment's refunded total, the credit it clears. */
export async function completeRefund(uow: UnitOfWork, actor: Actor, refundId: string, extra: { adapterRef?: string } = {}) {
  const { tx } = uow
  const rows = await tx.$queryRaw<{ id: string; ref: string; accountId: string; locationId: string; paymentId: string | null; amountMinor: bigint; status: string; approvedById: string | null }[]>`SELECT id, ref, account AS "accountId", location AS "locationId", payment AS "paymentId", "amountMinor", status, "approvedBy" AS "approvedById" FROM "Refund" WHERE id = ${refundId} FOR UPDATE`
  const refund = rows[0]
  if (!refund) throw new DomainError(Codes.NOT_FOUND, 'Refund not found.')
  if (refund.status === 'completed') return { completed: false as const, refundId }
  if (!['executing', 'unknown', 'approved'].includes(refund.status)) throw new DomainError(Codes.INVALID_TRANSITION, `A refund that is ${refund.status} cannot be completed.`)
  await advisoryLock(tx, `ledger:${refund.accountId}`)
  const patient = await tx.paymentPlan.findFirst({ where: { accountId: refund.accountId }, select: { patientId: true } })
  const original = refund.paymentId ? await tx.payment.findUnique({ where: { id: refund.paymentId }, select: { patientId: true, refundedMinor: true, amountMinor: true } }) : null
  const date = await locationToday(tx, refund.locationId, uow.now)
  const entry = await postEntry(tx, {
    accountId: refund.accountId, patientId: original?.patientId ?? patient?.patientId ?? null, kind: 'refund', amountMinor: refund.amountMinor, currencyCode: 'USD',
    businessDate: dayOf(date), locationId: refund.locationId, refundId: refund.id, paymentId: refund.paymentId, postedById: refund.approvedById, memo: `Refund (${refund.ref})`,
  }, uow.now)
  if (refund.paymentId && original) {
    const refunded = original.refundedMinor + refund.amountMinor
    await tx.payment.update({ where: { id: refund.paymentId }, data: { refundedMinor: refunded, status: refunded === original.amountMinor ? 'refunded' : 'partially_refunded', version: { increment: 1 } } })
  }
  await tx.refund.update({ where: { id: refund.id }, data: { status: 'completed', ledgerEntryId: entry.id, ...(extra.adapterRef ? { adapterRef: extra.adapterRef } : {}), version: { increment: 1 } } })
  await tx.creditBalance.updateMany({ where: { accountId: refund.accountId, status: 'refund_requested' }, data: { status: 'refunded', version: { increment: 1 } } })
  auditCreate(uow, actor, 'Refund', refund.id, 'refund.completed', { amountMinor: refund.amountMinor.toString(), ledgerEntryId: entry.id })
  const statementId = refund.paymentId ? (await tx.payment.findUnique({ where: { id: refund.paymentId }, select: { statementId: true } }))?.statementId : null
  if (statementId) await refreshStatementStatus(tx, statementId)
  return { completed: true as const, refundId, ledgerEntryId: entry.id }
}
