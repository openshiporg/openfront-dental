import { requirePermission } from '../lib/actor'
import { requestApproval } from '../lib/approval'
import { registerApplier } from '../lib/approvalAppliers'
import { auditCreate, lockRow, transition } from '../lib/cas'
import { command } from '../lib/command'
import { advisoryLock } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import { formatMinor } from '../lib/money'
import { parseMoney, postEntry } from '../lib/ledger'
import { nextReference } from '../lib/sequence'
import { addDays } from '../lib/time'
import { dayOf, locationToday, requireReason } from './clinicalShared'
import { assertLocation, staff, type Ctx } from './shared'

/*
 * Day close and month close (STATE-MACHINES §6.8, DOMAIN I-L2). Closing a day freezes its sheet (production, collections, adjustments,
 * by provider and tender) and builds the deposit slip for cash and checks. Closing a month needs every day that has entries closed.
 * A closed month is reopened only with a second person's approval; the entries posted while it is open are tied to a Restatement.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/
const iso = (d: Date) => d.toISOString().slice(0, 10)
const sum = (rows: { amountMinor: bigint }[]) => rows.reduce((s, r) => s + r.amountMinor, 0n)
const OPEN_PAYMENT = ['initiated', 'requires_action', 'unknown']

export async function buildDaySheet(tx: any, locationId: string, date: string) {
  const day = dayOf(date)
  const entries = await tx.ledgerEntry.findMany({ where: { locationId, businessDate: day }, select: { kind: true, amountMinor: true, providerId: true } })
  const byKind: Record<string, bigint> = {}
  for (const e of entries) byKind[e.kind] = (byKind[e.kind] ?? 0n) + e.amountMinor
  // Production is charges less the charges reversed that day, by the provider who did the work.
  const production: Record<string, bigint> = {}
  const reversed = await tx.ledgerEntry.findMany({ where: { locationId, businessDate: day, kind: 'reversal' }, select: { amountMinor: true, providerId: true, reverses: { select: { kind: true } } } })
  for (const e of entries) if (e.kind === 'charge') production[e.providerId ?? 'none'] = (production[e.providerId ?? 'none'] ?? 0n) + e.amountMinor
  for (const e of reversed) if (e.reverses?.kind === 'charge') production[e.providerId ?? 'none'] = (production[e.providerId ?? 'none'] ?? 0n) + e.amountMinor
  const payments = await tx.payment.findMany({ where: { locationId, businessDate: day, status: { in: ['succeeded', 'partially_refunded', 'refunded'] } }, select: { id: true, tender: true, amountMinor: true, refundedMinor: true } })
  const byTender: Record<string, bigint> = {}
  for (const p of payments) byTender[p.tender] = (byTender[p.tender] ?? 0n) + p.amountMinor
  const adjustments = (byKind.patient_adjustment ?? 0n) + (byKind.insurance_adjustment ?? 0n) + (byKind.insurance_writeoff ?? 0n)
  const text = (m: Record<string, bigint>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.toString()]))
  const production_ = Object.values(production).reduce((a, b) => a + b, 0n)
  return {
    businessDate: date, entryCount: entries.length,
    productionMinor: production_.toString(), productionByProvider: text(production),
    collectionsMinor: sum(payments).toString(), collectionsByTender: text(byTender),
    insurancePaymentsMinor: (-(byKind.insurance_payment ?? 0n)).toString(),
    adjustmentsMinor: adjustments.toString(), refundsMinor: (byKind.refund ?? 0n).toString(),
    byKind: text(byKind),
  }
}

export async function closeDay(_root: unknown, args: { locationId: string; businessDate: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canCloseDay')
  if (!DATE.test(args.businessDate)) throw new DomainError(Codes.INVALID_INPUT, 'Enter the day as YYYY-MM-DD.', { field: 'businessDate' })
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'day.close', actor, idempotencyKey, params }, async uow => {
    const { tx } = uow
    assertLocation(locationIds, args.locationId)
    await advisoryLock(tx, `close:${args.locationId}`)
    const today = await locationToday(tx, args.locationId, uow.now)
    if (args.businessDate > today) throw new DomainError(Codes.GUARD_FAILED, 'A day cannot be closed before it has happened.', { field: 'businessDate' })
    const existing = await tx.dayClose.findFirst({ where: { locationId: args.locationId, businessDate: dayOf(args.businessDate) } })
    if (existing?.status === 'closed') throw new DomainError(Codes.GUARD_FAILED, 'That day is already closed.')
    const period = await tx.periodClose.findFirst({ where: { locationId: args.locationId, period: args.businessDate.slice(0, 7) } })
    if (period && period.status !== 'open') throw new DomainError(Codes.GUARD_FAILED, 'That month is already closed.')
    const open = await tx.payment.count({ where: { locationId: args.locationId, businessDate: dayOf(args.businessDate), status: { in: OPEN_PAYMENT } } })
    const openToday = await tx.payment.count({ where: { locationId: args.locationId, createdAt: { gte: dayOf(args.businessDate), lt: dayOf(addDays(args.businessDate, 1)) }, status: { in: OPEN_PAYMENT } } })
    if (open + openToday > 0) throw new DomainError(Codes.GUARD_FAILED, `${open + openToday} payment${open + openToday === 1 ? ' is' : 's are'} still waiting on the card processor. Resolve them, then close the day.`)
    const earlier = await tx.ledgerEntry.findFirst({ where: { locationId: args.locationId, businessDate: { lt: dayOf(args.businessDate) } }, orderBy: { businessDate: 'asc' }, select: { businessDate: true } })
    if (earlier) {
      for (let d = iso(earlier.businessDate!); d < args.businessDate; d = addDays(d, 1)) {
        if (d.slice(0, 7) !== args.businessDate.slice(0, 7)) continue
        const has = await tx.ledgerEntry.findFirst({ where: { locationId: args.locationId, businessDate: dayOf(d) }, select: { id: true } })
        const closed = has ? await tx.dayClose.findFirst({ where: { locationId: args.locationId, businessDate: dayOf(d), status: 'closed' }, select: { id: true } }) : true
        if (!closed) throw new DomainError(Codes.GUARD_FAILED, `${d} has entries and is not closed. Close the earlier day first.`)
      }
    }
    const row = existing ?? (await tx.dayClose.create({ data: { locationId: args.locationId, businessDate: dayOf(args.businessDate), status: 'open' } }))
    await transition<any>(uow, { model: 'DayClose', id: row.id, from: ['open'], to: 'closing', actor, eventType: 'day.closing' })
    const sheet = await buildDaySheet(tx, args.locationId, args.businessDate)
    // Cash and checks go to the bank; cards settle with the processor.
    const cashPayments = await tx.payment.findMany({ where: { locationId: args.locationId, businessDate: dayOf(args.businessDate), tender: { in: ['cash', 'check'] }, status: { in: ['succeeded', 'partially_refunded'] } } })
    let depositRef: string | null = null
    let deposit: any = null
    if (cashPayments.length) {
      const total = cashPayments.reduce((s: bigint, p: any) => s + p.amountMinor, 0n)
      depositRef = await nextReference(tx, 'DEP', uow.now)
      deposit = await tx.depositBatch.create({ data: { ref: depositRef, locationId: args.locationId, businessDate: dayOf(args.businessDate), totalMinor: total, status: 'open' } })
      for (const p of cashPayments) await tx.depositLine.create({ data: { batchId: deposit.id, paymentId: p.id, tender: p.tender, amountMinor: p.amountMinor } })
    }
    const closed = await transition<any>(uow, {
      model: 'DayClose', id: row.id, from: ['closing'], to: 'closed', actor, eventType: 'day.closed',
      data: { daySheet: sheet as never, closedById: actor.kind === 'user' ? actor.userId : null, closedAt: uow.now },
    })
    if (deposit) await tx.depositBatch.update({ where: { id: deposit.id }, data: { dayCloseId: closed.id } })
    return { id: closed.id, status: 'closed', businessDate: args.businessDate, depositRef, collections: formatMinor(BigInt(sheet.collectionsMinor)), production: formatMinor(BigInt(sheet.productionMinor)) }
  })
  return { replay: result.replay, ...result.value }
}

export async function bankDeposit(_root: unknown, args: { depositId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canCloseDay')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'deposit.bank', actor, idempotencyKey, params }, async uow => {
    const row = await lockRow<any>(uow.tx, 'DepositBatch', args.depositId)
    assertLocation(locationIds, row.locationId)
    const next = await transition<any>(uow, { model: 'DepositBatch', id: row.id, from: ['open'], to: 'banked', expectedVersion: args.expectedVersion, actor, eventType: 'deposit.banked' })
    return { id: next.id, status: 'banked' }
  })
  return { replay: result.replay, ...result.value }
}

async function periodWarnings(tx: any, locationId: string, period: string, today: string) {
  const warnings: string[] = []
  const cutoff = new Date(dayOf(today).getTime() - 14 * 86_400_000)
  const stale = await tx.remittance.count({ where: { status: { in: ['received', 'parsed', 'matched', 'exception'] }, createdAt: { lt: cutoff } } })
  if (stale) warnings.push(`${stale} insurance payment${stale === 1 ? ' has' : 's have'} waited over 14 days to be posted.`)
  const credits = await tx.creditBalance.count({ where: { status: 'open', account: { guarantor: { patient: { homeLocationId: locationId } } } } })
  if (credits) warnings.push(`${credits} account${credits === 1 ? ' has' : 's have'} a credit that has not been reviewed.`)
  void period
  return warnings
}

export async function closePeriod(_root: unknown, args: { locationId: string; period: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canClosePeriod')
  if (!PERIOD.test(args.period)) throw new DomainError(Codes.INVALID_INPUT, 'Enter the month as YYYY-MM.', { field: 'period' })
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'period.close', actor, idempotencyKey, params }, async uow => {
    const { tx } = uow
    assertLocation(locationIds, args.locationId)
    await advisoryLock(tx, `close:${args.locationId}`)
    const today = await locationToday(tx, args.locationId, uow.now)
    const [y, m] = args.period.split('-').map(Number)
    const first = `${args.period}-01`
    const last = iso(new Date(Date.UTC(y, m, 0)))
    if (last >= today) throw new DomainError(Codes.GUARD_FAILED, 'A month can be closed only after its last day has passed.', { field: 'period' })
    const existing = await tx.periodClose.findFirst({ where: { locationId: args.locationId, period: args.period } })
    if (existing && existing.status !== 'open') throw new DomainError(Codes.GUARD_FAILED, 'That month is already closed.')
    // Every day that has entries is closed first.
    const days = await tx.ledgerEntry.findMany({ where: { locationId: args.locationId, businessDate: { gte: dayOf(first), lte: dayOf(last) } }, select: { businessDate: true }, distinct: ['businessDate'] })
    const closedDays = new Set((await tx.dayClose.findMany({ where: { locationId: args.locationId, businessDate: { gte: dayOf(first), lte: dayOf(last) }, status: 'closed' }, select: { businessDate: true } })).map((d: any) => iso(d.businessDate)))
    const missing = days.map((d: any) => iso(d.businessDate)).filter((d: string) => !closedDays.has(d)).sort()
    if (missing.length) throw new DomainError(Codes.GUARD_FAILED, `${missing.length} day${missing.length === 1 ? '' : 's'} with entries ${missing.length === 1 ? 'is' : 'are'} not closed yet (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ', …' : ''}).`)
    const warnings = await periodWarnings(tx, args.locationId, args.period, today)
    const row = existing ?? (await tx.periodClose.create({ data: { locationId: args.locationId, period: args.period, status: 'open' } }))
    await transition<any>(uow, { model: 'PeriodClose', id: row.id, from: ['open'], to: 'closing', actor, eventType: 'period.closing' })
    const closed = await transition<any>(uow, { model: 'PeriodClose', id: row.id, from: ['closing'], to: 'closed', actor, eventType: 'period.closed', data: { closedById: actor.kind === 'user' ? actor.userId : null, closedAt: uow.now } })
    return { id: closed.id, status: 'closed', period: args.period, warnings }
  })
  return { replay: result.replay, ...result.value }
}

/** Ask to reopen a closed month. A second person with canApprovePeriodReopen decides (I-L5). */
export async function requestPeriodReopen(_root: unknown, args: { periodCloseId: string; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canClosePeriod')
  const reason = requireReason(args.reason)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'period.request_reopen', actor, idempotencyKey, params }, async uow => {
    const row = await lockRow<any>(uow.tx, 'PeriodClose', args.periodCloseId)
    assertLocation(locationIds, row.locationId)
    await transition<any>(uow, { model: 'PeriodClose', id: row.id, from: ['closed'], to: 'reopen_requested', actor, eventType: 'period.reopen_requested', reason })
    const approval = await requestApproval(uow, actor, {
      action: 'period.reopen', targetList: 'PeriodClose', targetId: row.id, requiredPermission: 'canApprovePeriodReopen',
      payload: { periodCloseId: row.id, period: row.period, reason }, summary: `Reopen ${row.period}: ${reason.slice(0, 80)}`,
      scope: { locationId: row.locationId },
    })
    await uow.tx.periodClose.update({ where: { id: row.id }, data: { approvalId: approval.id } })
    return { id: row.id, status: 'reopen_requested', approvalId: approval.id }
  })
  return { replay: result.replay, ...result.value }
}

registerApplier('period.reopen', async (uow, actor, request) => {
  const row = await lockRow<any>(uow.tx, 'PeriodClose', request.targetId)
  const decision = await uow.tx.approvalDecision.findFirst({ where: { requestId: request.id, decision: 'approve' }, orderBy: { at: 'desc' } })
  await transition<any>(uow, { model: 'PeriodClose', id: row.id, from: ['reopen_requested'], to: 'reopened', actor, eventType: 'period.reopened', approverId: decision?.decidedById ?? null })
  const restatement = await uow.tx.restatement.create({ data: { periodCloseId: row.id, reason: String(request.payload?.reason ?? ''), approvedById: decision?.decidedById ?? null } })
  auditCreate(uow, actor, 'Restatement', restatement.id, 'period.restatement_opened', { period: row.period })
  return { periodCloseId: row.id, restatementId: restatement.id }
}, { applyOnApprove: true })

/** Called when the approval is rejected: the month stays closed. */
export async function periodReopenRejected(uow: any, actor: any, periodCloseId: string) {
  const row = await uow.tx.periodClose.findUnique({ where: { id: periodCloseId }, select: { status: true } })
  if (row?.status === 'reopen_requested') await transition<any>(uow, { model: 'PeriodClose', id: periodCloseId, from: ['reopen_requested'], to: 'closed', actor, eventType: 'period.reopen_rejected' })
}

/** While a month is reopened, a correction posts as an adjustment tied to the restatement and dated inside that month. */
export async function postRestatement(_root: unknown, args: { periodCloseId: string; patientId: string; typeId: string; amount: string; businessDate: string; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canClosePeriod')
  const reason = requireReason(args.reason)
  const amountMinor = parseMoney(args.amount)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'period.post_restatement', actor, idempotencyKey, params }, async uow => {
    const { tx } = uow
    const period = await lockRow<any>(tx, 'PeriodClose', args.periodCloseId)
    assertLocation(locationIds, period.locationId)
    if (period.status !== 'reopened') throw new DomainError(Codes.GUARD_FAILED, 'That month is not open for corrections.')
    if (!DATE.test(args.businessDate) || args.businessDate.slice(0, 7) !== period.period) throw new DomainError(Codes.INVALID_INPUT, `Date the correction inside ${period.period}.`, { field: 'businessDate' })
    const restatement = await tx.restatement.findFirst({ where: { periodCloseId: period.id }, orderBy: { createdAt: 'desc' } })
    if (!restatement) throw new DomainError(Codes.GUARD_FAILED, 'There is no restatement to post under.')
    const type = await tx.adjustmentType.findUnique({ where: { id: args.typeId } })
    if (!type || !type.isActive) throw new DomainError(Codes.NOT_FOUND, 'Adjustment type not found.', { field: 'typeId' })
    const patient = await tx.patient.findUnique({ where: { id: args.patientId }, select: { id: true } })
    if (!patient) throw new DomainError(Codes.NOT_FOUND, 'Patient not found.')
    const { accountFor } = await import('./clinicalShared')
    const account = await accountFor(uow, patient.id)
    await advisoryLock(tx, `ledger:${account.id}`)
    const signed = type.direction === 'credit' ? -amountMinor : amountMinor
    const entry = await postEntry(tx, {
      accountId: account.id, patientId: patient.id, kind: 'patient_adjustment', amountMinor: signed, currencyCode: 'USD', businessDate: dayOf(args.businessDate),
      locationId: period.locationId, restatementId: restatement.id, memo: `${type.name} (correction to ${period.period})`, postedById: actor.kind === 'user' ? actor.userId : null,
    }, uow.now)
    auditCreate(uow, actor, 'LedgerEntry', entry.id, 'period.restatement_posted', { period: period.period, amountMinor: signed.toString() }, { reason })
    return { id: entry.id, restatementId: restatement.id }
  })
  return { replay: result.replay, ...result.value }
}

export async function reclosePeriod(_root: unknown, args: { periodCloseId: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canClosePeriod')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'period.reclose', actor, idempotencyKey, params }, async uow => {
    const row = await lockRow<any>(uow.tx, 'PeriodClose', args.periodCloseId)
    assertLocation(locationIds, row.locationId)
    const next = await transition<any>(uow, { model: 'PeriodClose', id: row.id, from: ['reopened'], to: 'closed', actor, eventType: 'period.reclosed', data: { closedById: actor.kind === 'user' ? actor.userId : null, closedAt: uow.now } })
    const restated = await uow.tx.ledgerEntry.count({ where: { restatement: { periodCloseId: row.id } } })
    return { id: next.id, status: 'closed', restatedEntries: restated }
  })
  return { replay: result.replay, ...result.value }
}

