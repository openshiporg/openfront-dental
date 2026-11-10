import { actorFromSession, requirePermission } from '../lib/actor'
import { command } from '../lib/command'
import { consumeApproval, decideApproval } from '../lib/approval'
import { applierFor } from '../lib/approvalAppliers'
import { transition } from '../lib/cas'
import { DomainError, Codes } from '../lib/errors'
import { requestPracticeControlsChange, type PracticeControls } from '../lib/practiceControls'
import { sessionLocationIds } from '../access'
import type { Tx } from '../lib/db'
import { assertLocation, assertPatientInScope } from './shared'

type Ctx = { session: any; prisma: any }

/**
 * A person limited to some offices decides only that office's requests, about patients and accounts they can see (Phase 4 r2 N4).
 * A practice-wide request (no office) needs a person with every office. Same rule as the ApprovalRequest list filter.
 */
export async function assertApprovalInScope(tx: Tx, locationIds: string[] | null, requestId: string) {
  if (locationIds === null) return
  const request = await tx.approvalRequest.findUnique({ where: { id: requestId }, select: { locationId: true, patientId: true, otherPatientId: true, accountId: true } })
  if (!request) throw new DomainError(Codes.NOT_FOUND, 'Approval request not found.')
  if (!request.locationId) throw new DomainError(Codes.OUTSIDE_LOCATION_SCOPE, 'This request covers the whole practice. Someone who works at every office decides it.')
  assertLocation(locationIds, request.locationId)
  for (const patientId of [request.patientId, request.otherPatientId]) if (patientId) await assertPatientInScope(tx, locationIds, patientId)
  if (request.accountId) {
    const account = await tx.guarantorAccount.findUnique({ where: { id: request.accountId }, select: { guarantorId: true } })
    const links = account?.guarantorId ? await tx.guarantorLink.findMany({ where: { guarantorId: account.guarantorId }, select: { patientId: true } }) : []
    if (!links.length) throw new DomainError(Codes.NOT_FOUND, 'Approval request not found.')
    for (const link of links) if (link.patientId) await assertPatientInScope(tx, locationIds, link.patientId)
  }
}

/** Approve or reject a pending request. An approval whose action applies on approval runs now, in the same transaction. */
export async function decideApprovalRequest(_root: unknown, args: { requestId: string; decision: 'approve' | 'reject'; reason?: string | null; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canAccessDashboard')
  if (args.decision !== 'approve' && args.decision !== 'reject') throw new DomainError(Codes.INVALID_INPUT, 'Decision must be approve or reject.')
  if (args.decision === 'reject' && !args.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Say why you are rejecting it.', { field: 'reason' })
  const locationIds = sessionLocationIds(context.session)
  const result = await command(context.prisma, { name: 'approval.decide', actor, idempotencyKey: args.idempotencyKey, params: { requestId: args.requestId, decision: args.decision, reason: args.reason ?? '', expectedVersion: args.expectedVersion } }, async uow => {
    const practice = await uow.tx.practiceSettings.findUnique({ where: { id: 1 }, select: { strictAgentOwnerSoD: true } })
    const decided = await decideApproval(uow, actor, { requestId: args.requestId, decision: args.decision, reason: args.reason ?? undefined, expectedVersion: args.expectedVersion, strictAgentOwner: practice?.strictAgentOwnerSoD ?? true, inScope: () => assertApprovalInScope(uow.tx as never, locationIds, args.requestId) })
    let applied: unknown = null
    const registration = applierFor(String(decided.action))
    if (args.decision === 'approve' && registration?.applyOnApprove) {
      const request = await uow.tx.approvalRequest.findUniqueOrThrow({ where: { id: args.requestId } })
      await consumeApproval(uow, { requestId: request.id, action: request.action, targetList: request.targetList, targetId: request.targetId, payload: request.payload })
      applied = await registration.apply(uow, actor, request)
    }
    if (args.decision === 'reject' && decided.targetList === 'Refund') {
      const refund = await uow.tx.refund.findUnique({ where: { id: String(decided.targetId) }, select: { accountId: true, status: true } })
      if (refund?.status === 'requested') {
        await uow.tx.refund.update({ where: { id: String(decided.targetId) }, data: { status: 'rejected', failureNote: String(args.reason ?? '').slice(0, 200), version: { increment: 1 } } })
        if (refund.accountId) await uow.tx.creditBalance.updateMany({ where: { accountId: refund.accountId, status: 'refund_requested' }, data: { status: 'open', version: { increment: 1 } } })
      }
    }
    if (args.decision === 'reject' && decided.targetList === 'PeriodClose') {
      const { periodReopenRejected } = await import('./close')
      await periodReopenRejected(uow, actor, String(decided.targetId))
    }
    return { id: decided.id, status: decided.status, applied }
  })
  return { replay: result.replay, ...result.value }
}

/** The requester withdraws a pending request. */
export async function cancelApprovalRequest(_root: unknown, args: { requestId: string; expectedVersion: number; idempotencyKey: string; reason?: string | null }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canAccessDashboard')
  const result = await command(context.prisma, { name: 'approval.cancel', actor, idempotencyKey: args.idempotencyKey, params: args }, async uow => {
    const row = await transition<{ id: string; status: string; requestedById: string | null }>(uow, {
      model: 'ApprovalRequest', id: args.requestId, from: ['pending'], to: 'cancelled', expectedVersion: args.expectedVersion, actor,
      eventType: 'approval.cancelled', reason: args.reason ?? null,
      guard: request => {
        if (actor.kind !== 'user' || request.requestedById !== actor.userId) throw new DomainError(Codes.NOT_AUTHORIZED, 'Only the person who asked can withdraw a request.')
      },
    })
    return { id: row.id, status: row.status }
  })
  return { replay: result.replay, ...result.value }
}

/** Ask for a change to practice-wide controls; a second person with canApproveAutonomy approves it. */
export async function requestPracticeControls(_root: unknown, args: { changes: PracticeControls; reason: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManagePractice')
  if (!args.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Say why the controls should change.', { field: 'reason' })
  const result = await command(context.prisma, { name: 'practice.controls.request', actor, idempotencyKey: args.idempotencyKey, params: args }, async uow => {
    const request = await requestPracticeControlsChange(uow, actor, args.changes, args.reason.trim())
    return { id: request.id, status: request.status }
  })
  return { replay: result.replay, ...result.value }
}
