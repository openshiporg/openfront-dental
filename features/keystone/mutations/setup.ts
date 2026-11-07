import { actorFromSession, requirePermission } from '../lib/actor'
import { command } from '../lib/command'
import { seedPracticePlatform } from '../seed/platform'

/** Onboarding: load the Bayview Family Dental sample practice (synthetic data). Idempotent per key and per record. */
export async function loadPracticeSetup(_root: unknown, args: { idempotencyKey: string }, context: any) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageOnboarding')
  const result = await command(context.prisma, { name: 'setup.load_practice', actor, idempotencyKey: args.idempotencyKey, params: {} }, uow => seedPracticePlatform(uow, actor))
  return { replay: result.replay, created: result.value }
}
