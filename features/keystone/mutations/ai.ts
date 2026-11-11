import { command } from '../lib/command'
import { requirePermission } from '../lib/actor'
import { Codes, DomainError } from '../lib/errors'
import { decideProposalIn, setAutonomyPolicyIn, loadHome, runChecks } from '../lib/ai'
import { staff, type Ctx } from './shared'

/* Staff commands for the AI home page (Phase 5). Every one checks permission itself and runs as one idempotent command. */

const READ = ['canReadSignals', 'canDecideProposals', 'canDecideClaimProposals'] as const

export async function runSignalChecks(_root: unknown, args: { idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, ...READ)
  const run = await runChecks(context.prisma, actor, locationIds)
  return { replay: false, ...run }
}

export async function decideProposal(_root: unknown, args: { proposalId: string; decision: 'approve' | 'reject'; reason?: string | null; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canDecideProposals', 'canDecideClaimProposals', 'canDecideClinicalProposals', 'canDecideFinancialProposals')
  if (args.decision !== 'approve' && args.decision !== 'reject') throw new DomainError(Codes.INVALID_INPUT, 'Decision must be approve or reject.')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'proposal.decide', actor, idempotencyKey, params }, uow =>
    decideProposalIn(uow, actor, { proposalId: args.proposalId, decision: args.decision, reason: args.reason ?? undefined, expectedVersion: args.expectedVersion, locationIds, receiptKey: idempotencyKey }))
  return { replay: result.replay, ...result.value }
}

/** The home page's data and the Export button read through here: the caller's offices only. */
export async function aiHome(_root: unknown, _args: unknown, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, ...READ)
  return loadHome(context.prisma, locationIds)
}

export async function setAutonomyPolicy(_root: unknown, args: { kind: string; mode: string; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, 'canApproveAutonomy')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'autonomy.set', actor, idempotencyKey, params }, uow => setAutonomyPolicyIn(uow, actor, { kind: args.kind, mode: args.mode }))
  return { replay: result.replay, ...result.value }
}
