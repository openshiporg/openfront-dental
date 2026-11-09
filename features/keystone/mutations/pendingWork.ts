import { actorFromSession, requirePermission } from '../lib/actor'
import { runPendingWork } from '../messaging/worker'

/** Admin command: run the scheduled steps now (holds, sweeps, remittance poll, reconciliation, installments, renewals). */
export async function runPendingWorkNow(_root: unknown, _args: { idempotencyKey: string }, context: any) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManagePractice')
  return runPendingWork(context.prisma)
}
