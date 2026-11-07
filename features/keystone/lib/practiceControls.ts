import { DomainError, Codes } from './errors'
import { registerApplier } from './approvalAppliers'
import { requestApproval } from './approval'
import type { Actor } from './actor'
import type { UnitOfWork } from './unitOfWork'

/**
 * Practice-wide controls (SCHEMA §1.1): the AI autonomy master switch, agent-owner separation,
 * break-glass window and the staff MFA requirement. They change only through maker-checker: one
 * person requests, a second with canApproveAutonomy approves, and the change applies against the
 * settings version that was approved (STATE-MACHINES §0).
 * adapted from openfront-hedge-fund@48199d9 features/keystone/lib/firmControls.ts
 */

export type PracticeControls = {
  aiAutonomyAllowed?: boolean
  strictAgentOwnerSoD?: boolean
  breakGlassMinutes?: number
  requireStaffMfa?: boolean
}

const KEYS = ['aiAutonomyAllowed', 'strictAgentOwnerSoD', 'breakGlassMinutes', 'requireStaffMfa'] as const

const bool = (value: unknown, name: string) => {
  if (typeof value !== 'boolean') throw new DomainError(Codes.INVALID_INPUT, `${name} must be true or false.`, { field: name })
  return value
}

export function validatePracticeControls(input: PracticeControls): PracticeControls {
  const keys = Object.keys(input ?? {})
  if (!keys.length) throw new DomainError(Codes.INVALID_INPUT, 'Nothing to change.')
  const out: PracticeControls = {}
  for (const key of keys) if (!(KEYS as readonly string[]).includes(key)) throw new DomainError(Codes.INVALID_INPUT, `${key} is not a practice control.`, { field: key })
  if (input.aiAutonomyAllowed !== undefined) out.aiAutonomyAllowed = bool(input.aiAutonomyAllowed, 'aiAutonomyAllowed')
  if (input.strictAgentOwnerSoD !== undefined) out.strictAgentOwnerSoD = bool(input.strictAgentOwnerSoD, 'strictAgentOwnerSoD')
  if (input.requireStaffMfa !== undefined) out.requireStaffMfa = bool(input.requireStaffMfa, 'requireStaffMfa')
  if (input.breakGlassMinutes !== undefined) {
    const minutes = input.breakGlassMinutes
    if (!Number.isSafeInteger(minutes) || minutes < 5 || minutes > 240) throw new DomainError(Codes.INVALID_INPUT, 'breakGlassMinutes must be a whole number from 5 to 240.', { field: 'breakGlassMinutes' })
    out.breakGlassMinutes = minutes
  }
  return out
}

export async function requestPracticeControlsChange(uow: UnitOfWork, actor: Actor, input: PracticeControls, reason: string) {
  const changes = validatePracticeControls(input)
  const practice = await uow.tx.practiceSettings.findUnique({ where: { id: 1 } })
  if (!practice) throw new DomainError(Codes.NOT_FOUND, 'Practice settings are not set up yet.')
  return requestApproval(uow, actor, {
    action: 'practice.controls',
    targetList: 'PracticeSettings',
    targetId: '1',
    payload: { changes, baseVersion: practice.version },
    requiredPermission: 'canApproveAutonomy',
    summary: `Change practice controls: ${Object.keys(changes).join(', ')}${reason ? ` (${reason})` : ''}`,
  })
}

registerApplier('practice.controls', async (uow, actor, request) => {
  const [row] = await uow.tx.$queryRaw<{ version: number }[]>`SELECT version FROM "PracticeSettings" WHERE id = 1 FOR UPDATE`
  if (!row) throw new DomainError(Codes.NOT_FOUND, 'Practice settings are not set up yet.')
  const { changes, baseVersion } = request.payload as { changes: PracticeControls; baseVersion: number }
  if (row.version !== baseVersion) throw new DomainError(Codes.STALE_STATE, 'Practice settings changed after this was approved. Request the change again.', { currentVersion: row.version })
  const before = await uow.tx.practiceSettings.findUnique({ where: { id: 1 }, select: { aiAutonomyAllowed: true, strictAgentOwnerSoD: true, breakGlassMinutes: true, requireStaffMfa: true } })
  const updated = await uow.tx.practiceSettings.updateMany({ where: { id: 1, version: baseVersion }, data: { ...changes, version: { increment: 1 } } })
  if (updated.count !== 1) throw new DomainError(Codes.STALE_STATE, 'Practice settings changed while applying.')
  uow.audit({ eventType: 'practice.controls_changed', entityType: 'PracticeSettings', entityId: '1', actorUserId: actor.kind === 'user' ? actor.userId : null, before, after: changes })
  return { applied: Object.keys(changes) }
})
