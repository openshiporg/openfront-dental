import { actorFromSession, requirePermission } from '../lib/actor'
import { command } from '../lib/command'
import { seedPracticePlatform } from '../seed/platform'
import { seedPhase3 } from '../seed/insurance'

/** Onboarding: load the Bayview Family Dental sample practice (synthetic data). Idempotent per key and per record. */
export async function loadPracticeSetup(_root: unknown, args: { idempotencyKey: string }, context: any) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageOnboarding')
  const result = await command(context.prisma, { name: 'setup.load_practice', actor, idempotencyKey: args.idempotencyKey, params: {} }, uow => seedPracticePlatform(uow, actor))
  // Insurance sample data runs in its own transaction: the base load already uses most of the time budget.
  const insurance = await command(context.prisma, { name: 'setup.load_insurance', actor, idempotencyKey: `${args.idempotencyKey}:insurance`, params: {} }, uow => seedPhase3(uow, actor))
  return { replay: result.replay, created: { ...result.value, ...insurance.value } }
}
