import { requirePermission } from '../lib/actor'
import { requestApproval } from '../lib/approval'
import { registerApplier } from '../lib/approvalAppliers'
import { auditCreate, lockRow, transition } from '../lib/cas'
import { command } from '../lib/command'
import { DomainError, Codes } from '../lib/errors'
import { formatMinor } from '../lib/money'
import { parseMoney, postEntry, rebuildBalance } from '../lib/ledger'
import { accountFor, dayOf, locationToday, requireReason } from './clinicalShared'
import { assertLocation, assertPatientInScope, resolvePatientRef, staff, type Ctx } from './shared'

/*
 * Adjustments, reversals and balance rebuilds (STATE-MACHINES §6; SCHEMA §10.6). An adjustment under its type's
 * threshold is one command with a reason. At or over the threshold, or for a type that always needs a second
 * person (bad debt), it waits for someone else with canApproveAdjustments; that approval posts it (I-L5).
 */

const currencyOf = async (tx: any) => (await tx.practiceSettings.findUnique({ where: { id: 1 }, select: { currencyCode: true } }))?.currencyCode ?? 'USD'

async function accountTotal(tx: any, accountId: string) {
  const sum = await tx.ledgerEntry.aggregate({ where: { accountId }, _sum: { amountMinor: true } })
  return (sum._sum.amountMinor ?? 0n) as bigint
}

async function postAdjustmentRow(uow: any, actor: any, request: any, type: any, approverId: string | null) {
  const { tx } = uow
  const total = await accountTotal(tx, request.accountId)
  const signed = type.direction === 'credit' ? -request.amountMinor : request.amountMinor
  if (signed < 0n && total + signed < 0n) throw new DomainError(Codes.GUARD_FAILED, 'That credit is more than the balance owed. Reduce the amount.', { field: 'amount' })
  const date = await locationToday(tx, request.locationId, uow.now)
  const entry = await postEntry(tx, {
    accountId: request.accountId, patientId: request.patientId, kind: 'patient_adjustment', amountMinor: signed, currencyCode: await currencyOf(tx),
    businessDate: dayOf(date), locationId: request.locationId, adjustmentId: request.id, memo: `${type.name}`, postedById: actor.kind === 'user' ? actor.userId : approverId,
  }, uow.now)
  auditCreate(uow, actor, 'LedgerEntry', entry.id, 'ledger.adjustment_posted', { adjustmentId: request.id, type: type.code, amountMinor: signed.toString() }, { reason: request.reason })
  return entry
}

export async function requestAdjustment(_root: unknown, args: { patientId: string; locationId: string; typeId: string; amount: string; reason: string; relatedEntryId?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canAdjust')
  const reason = requireReason(args.reason)
  const amountMinor = parseMoney(args.amount)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'ledger.request_adjustment', actor, idempotencyKey, params }, async uow => {
    const { tx } = uow
    assertLocation(locationIds, args.locationId)
    const patientId = await resolvePatientRef(tx, args.patientId)
    await assertPatientInScope(tx, locationIds, patientId)
    const type = await tx.adjustmentType.findUnique({ where: { id: args.typeId } })
    if (!type || !type.isActive) throw new DomainError(Codes.NOT_FOUND, 'Adjustment type not found.', { field: 'typeId' })
    const account = await accountFor(uow, patientId)
    if (args.relatedEntryId) {
      const related = await tx.ledgerEntry.findUnique({ where: { id: args.relatedEntryId }, select: { accountId: true } })
      if (!related || related.accountId !== account.id) throw new DomainError(Codes.INVALID_INPUT, 'That entry belongs to a different account.', { field: 'relatedEntryId' })
    }
    if (type.direction === 'credit' && (await accountTotal(tx, account.id)) < amountMinor) throw new DomainError(Codes.GUARD_FAILED, 'That credit is more than the balance owed. Reduce the amount.', { field: 'amount' })
    const needsSecondPerson = type.requiresApproval || amountMinor >= type.approvalThresholdMinor
    const row = await tx.adjustmentRequest.create({
      data: { accountId: account.id, patientId, locationId: args.locationId, typeId: type.id, amountMinor, reason, relatedEntryId: args.relatedEntryId ?? null, status: 'requested', requestedById: actor.kind === 'user' ? actor.userId : null },
    })
    auditCreate(uow, actor, 'AdjustmentRequest', row.id, 'ledger.adjustment_requested', { type: type.code, amountMinor: amountMinor.toString() }, { reason })
    if (!needsSecondPerson) {
      const entry = await postAdjustmentRow(uow, actor, row, type, null)
      await tx.adjustmentRequest.update({ where: { id: row.id }, data: { status: 'posted', postedEntryId: entry.id, version: { increment: 1 } } })
      return { id: row.id, status: 'posted', ledgerEntryId: entry.id }
    }
    const approval = await requestApproval(uow, actor, {
      action: 'ledger.adjustment', targetList: 'AdjustmentRequest', targetId: row.id, requiredPermission: 'canApproveAdjustments',
      payload: { adjustmentId: row.id, typeId: type.id, amountMinor: amountMinor.toString(), accountId: account.id },
      summary: `${type.name}: ${formatMinor(amountMinor)} (${reason.slice(0, 80)})`,
      scope: { locationId: args.locationId, patientId, accountId: account.id },
    })
    await tx.adjustmentRequest.update({ where: { id: row.id }, data: { approvalId: approval.id, version: { increment: 1 } } })
    return { id: row.id, status: 'requested', approvalId: approval.id }
  })
  return { replay: result.replay, ...result.value }
}

registerApplier('ledger.adjustment', async (uow, actor, request) => {
  const row = await lockRow<any>(uow.tx, 'AdjustmentRequest', request.targetId)
  const type = await uow.tx.adjustmentType.findUniqueOrThrow({ where: { id: row.typeId } })
  if (String(row.amountMinor) !== String(request.payload.amountMinor) || row.typeId !== request.payload.typeId) throw new DomainError(Codes.APPROVAL_MISMATCH, 'The adjustment changed after approval was requested.')
  const decision = await uow.tx.approvalDecision.findFirst({ where: { requestId: request.id, decision: 'approve' }, orderBy: { at: 'desc' } })
  await transition<any>(uow, { model: 'AdjustmentRequest', id: row.id, from: ['requested'], to: 'approved', actor, eventType: 'ledger.adjustment_approved', approverId: decision?.decidedById ?? null })
  const entry = await postAdjustmentRow(uow, actor, row, type, decision?.decidedById ?? null)
  await transition<any>(uow, { model: 'AdjustmentRequest', id: row.id, from: ['approved'], to: 'posted', actor, eventType: 'ledger.adjustment_applied', approverId: decision?.decidedById ?? null, data: { postedEntryId: entry.id } })
  return { adjustmentId: row.id, ledgerEntryId: entry.id }
}, { applyOnApprove: true })

/** Reverse an adjustment: a new opposite row, never an edit (I-L1). Charges are corrected through the chart; payments through refunds. */
export async function reverseLedgerEntry(_root: unknown, args: { entryId: string; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canAdjust')
  const reason = requireReason(args.reason)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'ledger.reverse_entry', actor, idempotencyKey, params }, async uow => {
    const { tx } = uow
    const original = await tx.ledgerEntry.findUnique({ where: { id: args.entryId } })
    if (!original) throw new DomainError(Codes.NOT_FOUND, 'Ledger entry not found.')
    assertLocation(locationIds, original.locationId)
    if (!['patient_adjustment', 'insurance_adjustment'].includes(original.kind)) {
      throw new DomainError(Codes.GUARD_FAILED, original.kind === 'charge' ? 'Correct a charge from the chart; the reversal follows.' : 'Only adjustments are reversed here. Payments are refunded.')
    }
    if (await tx.ledgerEntry.findFirst({ where: { reversesId: original.id }, select: { id: true } })) throw new DomainError(Codes.GUARD_FAILED, 'This entry was already reversed.')
    const date = await locationToday(tx, original.locationId!, uow.now)
    const reversal = await postEntry(tx, {
      accountId: original.accountId!, patientId: original.patientId, kind: 'reversal', amountMinor: -original.amountMinor, currencyCode: original.currencyCode,
      businessDate: dayOf(date), originalBusinessDate: original.originalBusinessDate ?? undefined, locationId: original.locationId!, providerId: original.providerId,
      chartEntryId: original.chartEntryId, adjustmentId: original.adjustmentId, reversesId: original.id, memo: `Reversal: ${reason.slice(0, 120)}`, postedById: actor.kind === 'user' ? actor.userId : null,
    }, uow.now)
    auditCreate(uow, actor, 'LedgerEntry', reversal.id, 'ledger.entry_reversed', { reverses: original.id, amountMinor: (-original.amountMinor).toString() }, { reason })
    return { id: reversal.id, reverses: original.id }
  })
  return { replay: result.replay, ...result.value }
}

/** Rebuild one account's cached balance from its entries (also what the nightly check does). */
export async function rebuildAccountBalance(_root: unknown, args: { accountId: string; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, 'canAdjust', 'canCloseDay')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'ledger.rebuild_balance', actor, idempotencyKey, params }, async uow => {
    const before = await uow.tx.guarantorAccount.findUnique({ where: { id: args.accountId }, select: { balanceCache: true } })
    if (!before) throw new DomainError(Codes.NOT_FOUND, 'Account not found.')
    const cache = await rebuildBalance(uow.tx, args.accountId, uow.now)
    const drifted = JSON.stringify((before.balanceCache as any)?.totalMinor ?? null) !== JSON.stringify(cache.totalMinor)
    if (drifted) auditCreate(uow, actor, 'GuarantorAccount', args.accountId, 'ledger.balance_drift_repaired', { totalMinor: cache.totalMinor })
    return { accountId: args.accountId, totalMinor: cache.totalMinor, drifted }
  })
  return { replay: result.replay, ...result.value }
}
