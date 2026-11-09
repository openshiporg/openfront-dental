import { actorFromSession, requirePermission, systemActor } from '../lib/actor'
import { requestApproval } from '../lib/approval'
import { registerApplier } from '../lib/approvalAppliers'
import { auditCreate, lockRow, transition } from '../lib/cas'
import { command } from '../lib/command'
import { advisoryLock } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import { formatMinor } from '../lib/money'
import { parseMoney } from '../lib/ledger'
import { chargesOutstanding, completeRefund, settlePayment, sha256 } from '../lib/payments'
import { nextReference, publicCode } from '../lib/sequence'
import { addDays } from '../lib/time'
import { accountFor, dayOf, locationToday, oneOf, requireReason } from './clinicalShared'
import { assertLocation, assertPatientInScope, optionalText, requireText, resolvePatientRef, staff, type Ctx } from './shared'
import { PAYMENT_TENDERS } from '../models/payments'
import { TEST_METHODS, paymentsConfigured, isTestMode } from '../../integrations/payments/stripe'

/*
 * Taking payments, refunds, credit balances, statements and payment plans (STATE-MACHINES §6.2-§6.7).
 *
 * Cash and cheques settle in the same command. A card payment is two steps so the processor is never called while a
 * database transaction is open: the command records the payment as `initiated` and queues `payment.create`; the worker
 * calls the processor with the payment's own idempotency key, then settles or fails it. A timeout leaves it `unknown`,
 * and the reconciler asks the processor; it never charges again (I-L8: only the reference and amount are sent).
 */

const currencyOf = async (tx: any) => (await tx.practiceSettings.findUnique({ where: { id: 1 }, select: { currencyCode: true } }))?.currencyCode ?? 'USD'

async function accountBalance(tx: any, accountId: string) {
  const sum = await tx.ledgerEntry.aggregate({ where: { accountId }, _sum: { amountMinor: true } })
  return (sum._sum.amountMinor ?? 0n) as bigint
}

// ─── Take a payment ──────────────────────────────────────────────────────────

type TakePaymentArgs = {
  patientId: string; locationId: string; amount: string; tender: string; checkNumber?: string | null; testMethod?: string | null; methodTokenId?: string | null
  statementId?: string | null; allocations?: { entryId: string; amount: string }[] | null; saveCard?: boolean | null; consentText?: string | null; idempotencyKey: string
}

export async function takePayment(_root: unknown, args: TakePaymentArgs, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canTakePayments')
  const amountMinor = parseMoney(args.amount)
  const tender = oneOf(args.tender, PAYMENT_TENDERS, 'tender')
  const { idempotencyKey, ...params } = args
  if (tender === 'check' && !optionalText(args.checkNumber, 40)) throw new DomainError(Codes.INVALID_INPUT, 'Enter the check number.', { field: 'checkNumber' })
  if (tender === 'card' && !paymentsConfigured()) throw new DomainError(Codes.GUARD_FAILED, 'Card payments are not set up yet.')
  const result = await command(context.prisma, { name: 'payment.take', actor, idempotencyKey, params }, async uow => {
    const { tx } = uow
    assertLocation(locationIds, args.locationId)
    const patientId = await resolvePatientRef(tx, args.patientId)
    await assertPatientInScope(tx, locationIds, patientId)
    const account = await accountFor(uow, patientId)
    await advisoryLock(tx, `ledger:${account.id}`)
    if (tender === 'card') {
      if (!args.methodTokenId && !args.testMethod) throw new DomainError(Codes.INVALID_INPUT, 'Choose a card on file or a test card.', { field: 'testMethod' })
      if (args.testMethod && !(args.testMethod in TEST_METHODS)) throw new DomainError(Codes.INVALID_INPUT, 'Unknown test card.', { field: 'testMethod' })
    }
    const explicit = (args.allocations ?? []).map(a => ({ entryId: a.entryId, amountMinor: parseMoney(a.amount, 'allocation') }))
    if (explicit.reduce((s, a) => s + a.amountMinor, 0n) > amountMinor) throw new DomainError(Codes.INVALID_INPUT, 'You applied more than the payment.', { field: 'allocations' })
    let token: any = null
    if (args.methodTokenId) {
      token = await tx.paymentMethodToken.findUnique({ where: { id: args.methodTokenId } })
      if (!token || token.accountId !== account.id || token.status !== 'active') throw new DomainError(Codes.GUARD_FAILED, 'That saved card is not available. Choose another.', { field: 'methodTokenId' })
    }
    if (args.statementId) {
      const st = await tx.statement.findUnique({ where: { id: args.statementId }, select: { accountId: true } })
      if (!st || st.accountId !== account.id) throw new DomainError(Codes.INVALID_INPUT, 'That statement belongs to a different account.', { field: 'statementId' })
    }
    const ref = await nextReference(tx, 'PAY', uow.now)
    const payment = await tx.payment.create({
      data: {
        ref, accountId: account.id, patientId, locationId: args.locationId, amountMinor, currencyCode: await currencyOf(tx), tender, status: 'initiated',
        adapterKey: tender === 'card' ? 'stripe' : 'manual', idempotencyKey: `pay:${idempotencyKey}`, methodTokenId: token?.id ?? null,
        providerMethodId: token ? token.providerMethodId : args.testMethod ? TEST_METHODS[args.testMethod as keyof typeof TEST_METHODS] : '',
        checkNumber: optionalText(args.checkNumber, 40), receivedById: actor.kind === 'user' ? actor.userId : null, source: 'front_desk', statementId: args.statementId ?? null,
      },
    })
    auditCreate(uow, actor, 'Payment', payment.id, 'payment.initiated', { amountMinor: amountMinor.toString(), tender, ref })
    if (args.saveCard && args.testMethod) {
      const consent = optionalText(args.consentText, 400)
      if (!consent) throw new DomainError(Codes.CONSENT_REQUIRED, 'Record what the cardholder agreed to before saving the card.', { field: 'consentText' })
      uow.emit({ topic: 'payment.save_method', aggregateType: 'Payment', aggregateId: payment.id, payload: { paymentId: payment.id, accountId: account.id, consentText: consent, consentBy: actor.kind === 'user' ? actor.userId : '' }, dedupeKey: `payment.save_method:${payment.id}` })
    }
    if (tender !== 'card') {
      const settled = await settlePaymentWithAllocation(uow, actor, payment.id, explicit)
      return { id: payment.id, ref, status: 'succeeded', allocated: settled.allocated.toString(), unallocated: settled.unallocated.toString() }
    }
    uow.emit({ topic: 'payment.create', aggregateType: 'Payment', aggregateId: payment.id, payload: { paymentId: payment.id }, dedupeKey: `payment.create:${payment.id}` })
    return { id: payment.id, ref, status: 'initiated' }
  })
  return { replay: result.replay, ...result.value }
}

async function settlePaymentWithAllocation(uow: any, actor: any, paymentId: string, explicit: { entryId: string; amountMinor: bigint }[]) {
  const r: any = await settlePayment(uow, actor, paymentId, { explicit })
  return { allocated: (r.allocated ?? 0n) as bigint, unallocated: (r.unallocated ?? 0n) as bigint }
}

// ─── Refunds ─────────────────────────────────────────────────────────────────

export async function requestRefund(_root: unknown, args: { paymentId?: string | null; accountId?: string | null; locationId?: string | null; amount: string; method?: string | null; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canIssueRefunds')
  const reason = requireReason(args.reason)
  const amountMinor = parseMoney(args.amount)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'refund.request', actor, idempotencyKey, params }, async uow => {
    const { tx } = uow
    let payment: any = null
    let accountId = args.accountId ?? null
    let locationId = args.locationId ?? null
    if (args.paymentId) {
      payment = await tx.payment.findUnique({ where: { id: args.paymentId } })
      if (!payment) throw new DomainError(Codes.NOT_FOUND, 'Payment not found.')
      if (!['succeeded', 'partially_refunded'].includes(payment.status)) throw new DomainError(Codes.GUARD_FAILED, 'Only a payment that went through can be refunded.')
      accountId = payment.accountId; locationId = payment.locationId
      const pending: any = await tx.refund.aggregate({ where: { paymentId: payment.id, status: { in: ['requested', 'approved', 'executing', 'unknown'] } }, _sum: { amountMinor: true } })
      if (amountMinor + (pending._sum.amountMinor ?? 0n) > payment.amountMinor - payment.refundedMinor) throw new DomainError(Codes.GUARD_FAILED, `Only ${formatMinor(BigInt(payment.amountMinor) - BigInt(payment.refundedMinor) - BigInt(pending._sum.amountMinor ?? 0n))} of that payment can still be refunded.`, { field: 'amount' })
    } else {
      if (!accountId || !locationId) throw new DomainError(Codes.INVALID_INPUT, 'Choose the payment to refund.', { field: 'paymentId' })
      const credit = -(await accountBalance(tx, accountId))
      if (amountMinor > credit) throw new DomainError(Codes.GUARD_FAILED, `The account has ${credit > 0n ? formatMinor(credit) : 'no'} credit to refund.`, { field: 'amount' })
    }
    assertLocation(locationIds, locationId)
    const method = args.method ?? (payment?.tender === 'card' ? 'original_tender' : 'check')
    if (!['original_tender', 'check', 'ach'].includes(method)) throw new DomainError(Codes.INVALID_INPUT, 'Choose how to refund.', { field: 'method' })
    if (method === 'original_tender' && payment?.tender !== 'card') throw new DomainError(Codes.GUARD_FAILED, 'Only a card payment can go back to the card. Choose a check.', { field: 'method' })
    const ref = await nextReference(tx, 'RFD', uow.now)
    const refund = await tx.refund.create({ data: { ref, accountId, locationId, paymentId: payment?.id ?? null, target: 'patient', amountMinor, method, status: 'requested', reason, requestedById: actor.kind === 'user' ? actor.userId : null } })
    const approval = await requestApproval(uow, actor, {
      action: 'refund.execute', targetList: 'Refund', targetId: refund.id, requiredPermission: 'canApproveRefunds',
      payload: { refundId: refund.id, amountMinor: amountMinor.toString(), paymentId: payment?.id ?? null, accountId, method },
      summary: `Refund ${formatMinor(amountMinor)} (${reason.slice(0, 80)})`,
    })
    await tx.refund.update({ where: { id: refund.id }, data: { approvalId: approval.id } })
    if (!payment) await tx.creditBalance.updateMany({ where: { accountId, status: 'open' }, data: { status: 'refund_requested' } })
    auditCreate(uow, actor, 'Refund', refund.id, 'refund.requested', { amountMinor: amountMinor.toString(), method, ref }, { reason })
    return { id: refund.id, ref, status: 'requested', approvalId: approval.id }
  })
  return { replay: result.replay, ...result.value }
}

/** Approved by a second person: the refund moves to `executing` and, for a card, queues the processor call. A check refund waits for the person who writes it. */
registerApplier('refund.execute', async (uow, actor, request) => {
  const row = await lockRow<any>(uow.tx, 'Refund', request.targetId)
  if (String(row.amountMinor) !== String(request.payload.amountMinor)) throw new DomainError(Codes.APPROVAL_MISMATCH, 'The refund changed after approval was requested.')
  const decision = await uow.tx.approvalDecision.findFirst({ where: { requestId: request.id, decision: 'approve' }, orderBy: { at: 'desc' } })
  const approverId = decision?.decidedById ?? null
  if (!approverId || approverId === row.requestedById) throw new DomainError(Codes.SELF_APPROVAL, 'A refund needs a second person to approve it.')
  const card = row.method === 'original_tender'
  await transition<any>(uow, { model: 'Refund', id: row.id, from: ['requested'], to: card ? 'executing' : 'approved', actor, eventType: 'refund.approved', approverId, data: { approvedById: approverId } })
  if (card) uow.emit({ topic: 'payment.refund', aggregateType: 'Refund', aggregateId: row.id, payload: { refundId: row.id }, dedupeKey: `payment.refund:${row.id}` })
  return { refundId: row.id, status: card ? 'executing' : 'approved' }
}, { applyOnApprove: true })

/** A refund that was rejected leaves nothing behind. Called from the approvals screen through the standard rejection. */
export async function recordRefundPaid(_root: unknown, args: { refundId: string; reference?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, 'canIssueRefunds', 'canApproveRefunds')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'refund.record_paid', actor, idempotencyKey, params }, async uow => {
    const row = await lockRow<any>(uow.tx, 'Refund', args.refundId)
    if (row.status !== 'approved') throw new DomainError(Codes.GUARD_FAILED, 'Only an approved check refund can be marked as sent.')
    if (row.method === 'original_tender') throw new DomainError(Codes.GUARD_FAILED, 'A card refund is sent by the system.')
    await transition<any>(uow, { model: 'Refund', id: row.id, from: ['approved'], to: 'executing', actor, eventType: 'refund.check_written' })
    const r = await completeRefund(uow, actor, row.id, { adapterRef: optionalText(args.reference, 60) })
    return { refundId: row.id, status: 'completed', ledgerEntryId: (r as any).ledgerEntryId }
  })
  return { replay: result.replay, ...result.value }
}

// ─── Memo corrections (the ledger is append-only) ────────────────────────────

export async function correctLedgerNote(_root: unknown, args: { entryId: string; text: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canAdjust')
  const text = requireText(args.text, 'note', 200)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'ledger.correct_note', actor, idempotencyKey, params }, async uow => {
    const entry = await uow.tx.ledgerEntry.findUnique({ where: { id: args.entryId }, select: { id: true, locationId: true } })
    if (!entry) throw new DomainError(Codes.NOT_FOUND, 'Ledger entry not found.')
    assertLocation(locationIds, entry.locationId)
    const note = await uow.tx.ledgerNote.create({ data: { entryId: entry.id, text, byId: actor.kind === 'user' ? actor.userId : null } })
    auditCreate(uow, actor, 'LedgerNote', note.id, 'ledger.note_corrected', { entryId: entry.id })
    return { id: note.id }
  })
  return { replay: result.replay, ...result.value }
}

// ─── Statements ──────────────────────────────────────────────────────────────

export const STATEMENT_GRACE_DAYS = 14
export const STATEMENT_DUE_DAYS = 30

/**
 * Build one statement per account with a balance at or over the practice minimum, unless the patient is on statement hold. A
 * statement is a snapshot: its lines, aging and amount are frozen, and it carries a random pay-link code (nothing guessable).
 */
export async function buildStatements(uow: any, actor: any, input: { locationId: string; cycleDate: string; accountIds?: string[] }) {
  const { tx } = uow
  const settings = await tx.practiceSettings.findUnique({ where: { id: 1 }, select: { minStatementMinor: true } })
  const minimum = (settings?.minStatementMinor ?? 500n) as bigint
  const links: any[] = await tx.guarantorLink.findMany({ where: { status: 'active', patient: { homeLocationId: input.locationId } }, select: { guarantorId: true, patient: { select: { id: true, statementHold: true, firstName: true, lastName: true } } } })
  const holds = new Set(links.filter(l => l.patient?.statementHold).map(l => l.guarantorId as string))
  const guarantorIds = [...new Set(links.map(l => l.guarantorId as string))]
  const accounts: any[] = await tx.guarantorAccount.findMany({ where: { guarantorId: { in: guarantorIds }, ...(input.accountIds ? { id: { in: input.accountIds } } : {}) } })
  const made: { id: string; ref: string; accountId: string; amountDueMinor: string }[] = []
  const skipped: { accountId: string; reason: string }[] = []
  const cycle = dayOf(input.cycleDate)
  for (const account of accounts) {
    if (holds.has(account.guarantorId as string)) { skipped.push({ accountId: account.id, reason: 'statement_hold' }); continue }
    if (await tx.statement.findFirst({ where: { accountId: account.id, cycleDate: cycle }, select: { id: true } })) { skipped.push({ accountId: account.id, reason: 'already_built' }); continue }
    if (await tx.payment.findFirst({ where: { accountId: account.id, disputedAt: { not: null }, status: { in: ['succeeded', 'partially_refunded'] } }, select: { id: true } })) { skipped.push({ accountId: account.id, reason: 'open_dispute' }); continue }
    await advisoryLock(tx, `ledger:${account.id}`)
    const entries: any[] = await tx.ledgerEntry.findMany({ where: { accountId: account.id }, orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }], include: { chartEntry: { select: { tooth: true, surfaces: true, code: { select: { nomenclature: true, patientFriendlyName: true } } } }, patient: { select: { firstName: true } }, adjustment: { select: { type: { select: { name: true } } } } } })
    const total = entries.reduce((s, e) => s + e.amountMinor, 0n)
    if (total < minimum) { skipped.push({ accountId: account.id, reason: total <= 0n ? 'no_balance' : 'under_minimum' }); continue }
    const open = chargesOutstanding(entries as never)
    const aging = { current: 0n, d31: 0n, d61: 0n, d91: 0n }
    const todayMs = Date.parse(`${input.cycleDate}T00:00:00Z`)
    for (const row of open) {
      const e = entries.find(x => x.id === row.id)!
      const age = Math.floor((todayMs - (e.businessDate?.getTime() ?? todayMs)) / 86_400_000)
      aging[age > 90 ? 'd91' : age > 60 ? 'd61' : age > 30 ? 'd31' : 'current'] += row.left
    }
    const lines = open.map(row => {
      const e = entries.find(x => x.id === row.id)!
      const c = e.chartEntry
      const name = c?.code ? `${c.code.patientFriendlyName || c.code.nomenclature || 'Visit'}${c.tooth ? `, tooth ${c.tooth}` : ''}` : e.memo || 'Charge'
      return { date: e.businessDate?.toISOString().slice(0, 10) ?? input.cycleDate, description: name, patient: e.patient?.firstName ?? '', chargedMinor: row.amountMinor.toString(), owedMinor: row.left.toString() }
    })
    const credits = entries.filter(e => e.amountMinor < 0n && e.businessDate && e.businessDate.getTime() >= todayMs - 30 * 86_400_000).map(e => ({ date: e.businessDate!.toISOString().slice(0, 10), description: e.kind === 'patient_payment' ? 'Payment received' : e.kind === 'insurance_payment' ? 'Insurance payment' : e.kind === 'insurance_writeoff' ? 'Insurance write-off' : 'Adjustment', amountMinor: e.amountMinor.toString() }))
    const snapshot = { lines, recentActivity: credits, aging: { current: aging.current.toString(), d31: aging.d31.toString(), d61: aging.d61.toString(), d91: aging.d91.toString() }, totalMinor: total.toString(), insurancePendingMinor: '0' }
    const ref = await nextReference(tx, 'STM', uow.now)
    const statement = await tx.statement.create({
      data: { ref, accountId: account.id, locationId: input.locationId, cycleDate: cycle, snapshot, amountDueMinor: total, dueDate: dayOf(addDays(input.cycleDate, STATEMENT_DUE_DAYS)), status: 'generated', payLinkCode: publicCode('PAY', 3), documentSha256: sha256(JSON.stringify(snapshot)) },
    })
    auditCreate(uow, actor, 'Statement', statement.id, 'statement.generated', { ref, amountDueMinor: total.toString() })
    made.push({ id: statement.id, ref, accountId: account.id, amountDueMinor: total.toString() })
  }
  return { made, skipped }
}

export async function generateStatements(_root: unknown, args: { locationId: string; cycleDate?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canCloseDay', 'canAdjust')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'statement.generate', actor, idempotencyKey, params }, async uow => {
    assertLocation(locationIds, args.locationId)
    const date = args.cycleDate || (await locationToday(uow.tx, args.locationId, uow.now))
    const r = await buildStatements(uow, actor, { locationId: args.locationId, cycleDate: date })
    return { cycleDate: date, built: r.made.length, skipped: r.skipped.length, statements: r.made }
  })
  return { replay: result.replay, ...result.value }
}

export async function sendStatement(_root: unknown, args: { statementId: string; channel?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canCloseDay', 'canAdjust', 'canTakePayments')
  const channel = oneOf(args.channel ?? 'mail', ['mail', 'email', 'portal', 'in_person'] as const, 'channel')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'statement.send', actor, idempotencyKey, params }, async uow => {
    const row = await lockRow<any>(uow.tx, 'Statement', args.statementId)
    assertLocation(locationIds, row.locationId)
    await transition<any>(uow, { model: 'Statement', id: row.id, from: ['generated'], to: 'sent', actor, eventType: 'statement.sent', data: { sentAt: uow.now, sentChannel: channel } })
    return { id: row.id, status: 'sent', channel }
  })
  return { replay: result.replay, ...result.value }
}

export async function holdStatements(_root: unknown, args: { patientId: string; hold: boolean; reason?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canAdjust', 'canManagePatients')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'statement.hold', actor, idempotencyKey, params }, async uow => {
    const patientId = await resolvePatientRef(uow.tx, args.patientId)
    await assertPatientInScope(uow.tx, locationIds, patientId)
    await uow.tx.patient.update({ where: { id: patientId }, data: { statementHold: Boolean(args.hold), version: { increment: 1 } } })
    auditCreate(uow, actor, 'Patient', patientId, args.hold ? 'statement.hold_set' : 'statement.hold_cleared', { hold: Boolean(args.hold) }, { reason: optionalText(args.reason, 200) || null })
    return { patientId, hold: Boolean(args.hold) }
  })
  return { replay: result.replay, ...result.value }
}

/** Overdue statements: a sent statement goes overdue after its due date plus the grace period (and raises the staff notice). */
export async function markOverdueStatements(db: any, now: Date) {
  const cutoff = dayOf(addDays(now.toISOString().slice(0, 10), -STATEMENT_GRACE_DAYS))
  const due = await db.statement.findMany({ where: { status: { in: ['sent', 'partially_paid'] }, dueDate: { lt: cutoff } }, select: { id: true }, take: 200 })
  let moved = 0
  for (const s of due) {
    await command(db, { name: 'statement.overdue', actor: systemActor('statements'), idempotencyKey: `statement.overdue:${s.id}`, params: { id: s.id }, now }, async uow => {
      await transition<any>(uow, { model: 'Statement', id: s.id, from: ['sent', 'partially_paid'], to: 'overdue', actor: systemActor('statements'), eventType: 'statement.overdue' })
      uow.emit({ topic: 'notify.staff', aggregateType: 'Statement', aggregateId: s.id, payload: { kind: 'ledger.overdue_balance' }, dedupeKey: `notify.staff:overdue:${s.id}` })
    }).then(() => { moved += 1 }).catch(() => undefined)
  }
  return { moved }
}

// ─── Payment plans ───────────────────────────────────────────────────────────

/** The practice's agreement text for a zero-interest plan: what the patient reads and agrees to. The hash of exactly this text is stored. */
export function planAgreementText(input: { principalMinor: bigint; downPaymentMinor: bigint; installments: { dueDate: string; amountMinor: bigint }[]; autopay: boolean }) {
  const lines = input.installments.map(i => `${i.dueDate}: ${formatMinor(i.amountMinor)}`).join('; ')
  return `I agree to pay ${formatMinor(input.principalMinor)}${input.downPaymentMinor > 0n ? ` after a ${formatMinor(input.downPaymentMinor)} payment today` : ''} in ${input.installments.length} payments with no interest or fees: ${lines}.${input.autopay ? ' I agree that my saved card may be charged on each date.' : ' I will pay each amount by its date.'} Missing two payments may end this plan and the full balance becomes due.`
}

export async function proposePaymentPlan(_root: unknown, args: { patientId: string; locationId: string; downPayment?: string | null; installments: number; firstDueDate: string; intervalDays?: number | null; autopayTokenId?: string | null; amount?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canTakePayments', 'canAdjust')
  const { idempotencyKey, ...params } = args
  const count = Number(args.installments)
  if (!Number.isInteger(count) || count < 2 || count > 24) throw new DomainError(Codes.INVALID_INPUT, 'Choose between 2 and 24 payments.', { field: 'installments' })
  const result = await command(context.prisma, { name: 'plan.propose', actor, idempotencyKey, params }, async uow => {
    const { tx } = uow
    assertLocation(locationIds, args.locationId)
    const patientId = await resolvePatientRef(tx, args.patientId)
    await assertPatientInScope(tx, locationIds, patientId)
    const account = await accountFor(uow, patientId)
    if (await tx.paymentPlan.findFirst({ where: { accountId: account.id, status: { in: ['proposed', 'active', 'delinquent'] } }, select: { id: true } })) throw new DomainError(Codes.GUARD_FAILED, 'This account already has a payment plan.')
    const balance = await accountBalance(tx, account.id)
    const down = args.downPayment && Number(String(args.downPayment).replace(/[$,\s]/g, '')) !== 0 ? parseMoney(args.downPayment, 'down payment') : 0n
    const covered = args.amount ? parseMoney(args.amount) : balance
    if (covered > balance) throw new DomainError(Codes.GUARD_FAILED, `The plan can cover at most the balance, ${formatMinor(balance > 0n ? balance : 0n)}.`, { field: 'amount' })
    const principal = covered - down
    if (principal <= 0n) throw new DomainError(Codes.GUARD_FAILED, 'There is nothing left to spread after the payment today.', { field: 'downPayment' })
    if (args.autopayTokenId) {
      const token = await tx.paymentMethodToken.findUnique({ where: { id: args.autopayTokenId } })
      if (!token || token.accountId !== account.id || token.status !== 'active') throw new DomainError(Codes.GUARD_FAILED, 'That saved card is not available.', { field: 'autopayTokenId' })
    }
    const each = principal / BigInt(count)
    const remainder = principal - each * BigInt(count)
    const interval = Number(args.intervalDays ?? 30)
    const installments = Array.from({ length: count }, (_, i) => ({ dueDate: addDays(args.firstDueDate, i * interval), amountMinor: i === count - 1 ? each + remainder : each }))
    if (installments.some(i => i.amountMinor <= 0n)) throw new DomainError(Codes.GUARD_FAILED, 'That is too many payments for this amount.', { field: 'installments' })
    const ref = await nextReference(tx, 'PLN', uow.now)
    const agreement = planAgreementText({ principalMinor: principal, downPaymentMinor: down, installments, autopay: Boolean(args.autopayTokenId) })
    const plan = await tx.paymentPlan.create({
      data: { ref, accountId: account.id, patientId, locationId: args.locationId, principalMinor: principal, downPaymentMinor: down, interestRatePct: 0, schedule: { installments: installments.map(i => ({ dueDate: i.dueDate, amountMinor: i.amountMinor.toString() })) }, agreementText: agreement, autopayId: args.autopayTokenId ?? null, status: 'proposed' },
    })
    for (const i of installments) await tx.paymentPlanInstallment.create({ data: { planId: plan.id, dueDate: dayOf(i.dueDate), amountMinor: i.amountMinor, status: 'due' } })
    auditCreate(uow, actor, 'PaymentPlan', plan.id, 'plan.proposed', { ref, principalMinor: principal.toString(), installments: count })
    return { id: plan.id, ref, status: 'proposed', agreement, principalMinor: principal.toString() }
  })
  return { replay: result.replay, ...result.value }
}

export async function activatePaymentPlan(_root: unknown, args: { planId: string; expectedVersion: number; agreedByName: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canTakePayments', 'canAdjust')
  const { idempotencyKey, ...params } = args
  const name = requireText(args.agreedByName, 'name of the person agreeing', 120)
  const result = await command(context.prisma, { name: 'plan.activate', actor, idempotencyKey, params }, async uow => {
    const plan = await lockRow<any>(uow.tx, 'PaymentPlan', args.planId)
    assertLocation(locationIds, plan.locationId)
    const hash = sha256(plan.agreementText)
    const row = await transition<any>(uow, { model: 'PaymentPlan', id: plan.id, from: ['proposed'], to: 'active', expectedVersion: args.expectedVersion, actor, eventType: 'plan.activated', data: { agreementHash: hash, agreedAt: uow.now, agreedByName: name } })
    return { id: row.id, status: 'active', agreementHash: hash }
  })
  return { replay: result.replay, ...result.value }
}

export async function cancelPaymentPlan(_root: unknown, args: { planId: string; expectedVersion: number; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canTakePayments', 'canAdjust')
  const reason = requireReason(args.reason)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'plan.cancel', actor, idempotencyKey, params }, async uow => {
    const plan = await lockRow<any>(uow.tx, 'PaymentPlan', args.planId)
    assertLocation(locationIds, plan.locationId)
    const row = await transition<any>(uow, { model: 'PaymentPlan', id: plan.id, from: ['proposed', 'active', 'delinquent'], to: 'cancelled', expectedVersion: args.expectedVersion, actor, eventType: 'plan.cancelled', reason })
    return { id: row.id, status: 'cancelled' }
  })
  return { replay: result.replay, ...result.value }
}

/** Instalments due today or earlier on an autopay plan become card charges through the same worker path as any card payment. */
export async function chargeDueInstallments(db: any, now: Date) {
  const today = now.toISOString().slice(0, 10)
  const due = await db.paymentPlanInstallment.findMany({ where: { status: { in: ['due', 'failed'] }, dueDate: { lte: dayOf(today) }, plan: { status: { in: ['active', 'delinquent'] }, autopayId: { not: null } } }, include: { plan: true }, take: 100 })
  let queued = 0
  for (const i of due) {
    if (i.lastAttemptOn && i.lastAttemptOn.toISOString().slice(0, 10) === today) continue
    await command(db, { name: 'plan.charge_installment', actor: systemActor('payment-plans'), idempotencyKey: `plan.charge:${i.id}:${i.attempts}`, params: { id: i.id }, now }, async uow => {
      const { tx } = uow
      const token = await tx.paymentMethodToken.findUnique({ where: { id: i.plan.autopayId } })
      if (!token || token.status !== 'active') { await tx.paymentPlanInstallment.update({ where: { id: i.id }, data: { status: 'failed', attempts: { increment: 1 }, lastAttemptOn: dayOf(today) } }); return }
      const ref = await nextReference(tx, 'PAY', uow.now)
      const pay = await tx.payment.create({ data: { ref, accountId: i.plan.accountId, patientId: i.plan.patientId, locationId: i.plan.locationId, amountMinor: i.amountMinor, currencyCode: 'USD', tender: 'card', status: 'initiated', adapterKey: 'stripe', idempotencyKey: `plan:${i.id}:${i.attempts}`, methodTokenId: token.id, providerMethodId: token.providerMethodId, source: 'payment_plan' } })
      await tx.paymentPlanInstallment.update({ where: { id: i.id }, data: { paymentId: pay.id, lastAttemptOn: dayOf(today), version: { increment: 1 } } })
      uow.emit({ topic: 'payment.create', aggregateType: 'Payment', aggregateId: pay.id, payload: { paymentId: pay.id, offSession: true }, dedupeKey: `payment.create:${pay.id}` })
    }).then(() => { queued += 1 }).catch(() => undefined)
  }
  return { queued }
}

// ─── Credit balances ─────────────────────────────────────────────────────────

/** Refresh the credit worklist: one open row per account whose total is below zero; rows for accounts that no longer have credit are closed as applied. */
export async function refreshCreditBalances(db: any, now: Date) {
  const rows: { accountId: string; total: bigint; since: Date | null; locationId: string | null }[] = await db.$queryRaw`
    SELECT le."account" AS "accountId", SUM(le."amountMinor") AS total, MAX(le."businessDate") AS since, MAX(le."location") AS "locationId"
    FROM "LedgerEntry" le GROUP BY le."account" HAVING SUM(le."amountMinor") < 0`
  let opened = 0
  for (const r of rows) {
    const credit = -r.total
    const existing = await db.creditBalance.findFirst({ where: { accountId: r.accountId, status: { in: ['open', 'refund_requested', 'escheat_pending'] } } })
    if (existing) {
      if (existing.amountMinor !== credit) await db.creditBalance.update({ where: { id: existing.id }, data: { amountMinor: credit, version: { increment: 1 } } })
      continue
    }
    const loc = r.locationId ? await db.location.findUnique({ where: { id: r.locationId }, select: { jurisdiction: { select: { rules: true } } } }) : null
    const years = Number((loc?.jurisdiction?.rules as any)?.escheat?.value?.dormancyYears ?? 5)
    const since = r.since ?? now
    const due = new Date(Date.UTC(since.getUTCFullYear() + years, since.getUTCMonth(), since.getUTCDate()))
    await db.creditBalance.create({ data: { accountId: r.accountId, amountMinor: credit, arisenOn: since, dormancyDueOn: due, status: 'open' } }).then(() => { opened += 1 }).catch(() => undefined)
  }
  const open = await db.creditBalance.findMany({ where: { status: 'open' }, select: { id: true, accountId: true } })
  const still = new Set(rows.map(r => r.accountId))
  for (const o of open) if (!still.has(o.accountId)) await db.creditBalance.update({ where: { id: o.id }, data: { status: 'applied', version: { increment: 1 } } })
  return { opened, total: rows.length }
}

void isTestMode
