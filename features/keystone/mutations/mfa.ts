import { GraphQLError } from 'graphql'
import { DomainError, Codes } from '../lib/errors'
import { runInTransaction } from '../lib/unitOfWork'
import { readSecret, storeSecret } from '../lib/secretBox'
import { attestVerifiedStart } from '../lib/session'
import {
  MFA_LOCK_MS, MFA_MAX_FAILURES, consumeRecoveryCode, hashRecoveryCode, newMfaSecret, newRecoveryCodes, provisioningUri, verifyTotp,
} from '../lib/mfa'

/*
 * Second-factor commands. Every change bumps User.authVersion (all other cookies stop working) and
 * writes an audit event; codes are never logged or stored in receipts.
 * adapted from openfront-hotel@0a75ba4 features/keystone/lib/hotelMfa.ts (resolvers)
 */

type Ctx = { session?: any; prisma: any; sessionStrategy?: any; graphql?: any }

const lockUser = (tx: any, id: string) => tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `mfa:${id}`)

async function requirePassword(context: Ctx, user: { password: string }, password: string) {
  const field = context.graphql?.schema?.getType('User')?.getFields()?.password?.extensions?.keystoneSecretField
  if (!field?.compare || typeof password !== 'string' || password.length > 1_000 || !(await field.compare(password, user.password))) {
    throw new DomainError(Codes.NOT_AUTHORIZED, 'Enter your current password.')
  }
}

function assertNotLocked(user: { mfaLockedUntil: Date | null }) {
  if (user.mfaLockedUntil && user.mfaLockedUntil.getTime() > Date.now()) throw new DomainError(Codes.RATE_LIMITED, 'Too many wrong codes. Try again in 15 minutes.')
}

/** Counts a wrong code in its own transaction so the failure survives the rollback of the attempt. */
async function recordFailure(prisma: any, userId: string) {
  await prisma.$transaction(async (tx: any) => {
    await lockUser(tx, userId)
    const user = await tx.user.findUnique({ where: { id: userId }, select: { mfaFailures: true } })
    const failures = Number(user?.mfaFailures ?? 0) + 1
    await tx.user.update({ where: { id: userId }, data: failures >= MFA_MAX_FAILURES ? { mfaFailures: 0, mfaLockedUntil: new Date(Date.now() + MFA_LOCK_MS) } : { mfaFailures: failures } })
  })
}

const audit = (uow: any, userId: string, eventType: string, metadata: Record<string, unknown> = {}) =>
  uow.audit({ eventType, entityType: 'User', entityId: userId, actorUserId: userId, metadata })

export async function mfaStatus(_root: unknown, _args: unknown, context: Ctx) {
  if (context.session?.itemId) {
    const user = await context.prisma.user.findUnique({ where: { id: context.session.itemId }, select: { mfaEnrolled: true, mfaRecoveryHashes: true } })
    const remaining = (() => { try { return JSON.parse(user?.mfaRecoveryHashes || '[]').length } catch { return 0 } })()
    return { signedIn: true, enrolled: Boolean(user?.mfaEnrolled), verified: context.session.mfaVerified === true, recoveryCodesRemaining: remaining }
  }
  const pending = await context.sessionStrategy?.pending?.({ context })
  return { signedIn: false, challengeRequired: Boolean(pending) }
}

/** Second sign-in step: swaps a pending cookie for a verified session token. */
export async function verifyMfa(_root: unknown, args: { code: string; recovery?: boolean }, context: Ctx) {
  const pending = await context.sessionStrategy?.pending?.({ context })
  if (!pending) throw new DomainError(Codes.MFA_REQUIRED, 'Sign in again to get a new verification step.')
  const code = String(args.code ?? '').trim()
  let user: any
  try {
    user = await runInTransaction(context.prisma, async uow => {
      await lockUser(uow.tx, pending.userId)
      const row = await uow.tx.user.findUnique({ where: { id: pending.userId } })
      if (!row?.mfaEnrolled || !row.mfaSecretId || Number(row.authVersion) !== pending.authVersion) throw new DomainError(Codes.MFA_REQUIRED, 'Sign in again to get a new verification step.')
      assertNotLocked(row)
      const used = await uow.tx.auditEvent.findUnique({ where: { eventKey: `mfa-challenge:${pending.nonce}` }, select: { id: true } })
      if (used) throw new DomainError(Codes.MFA_REQUIRED, 'This verification step was already used. Sign in again.')
      const data = args.recovery
        ? { mfaRecoveryHashes: consumeRecoveryCode(row.id, row.mfaRecoveryHashes, code) }
        : { mfaLastCounter: verifyTotp(await readSecret(uow.tx, row.mfaSecretId), code, Number(row.mfaLastCounter)) }
      await uow.tx.user.update({ where: { id: row.id }, data: { ...data, mfaFailures: 0, mfaLockedUntil: null } })
      uow.audit({ eventKey: `mfa-challenge:${pending.nonce}`, eventType: args.recovery ? 'mfa.recovery_used' : 'mfa.verified', entityType: 'User', entityId: row.id, actorUserId: row.id })
      return row
    })
  } catch (error) {
    if (error instanceof DomainError && error.code === Codes.MFA_REQUIRED && /wrong/.test(error.message)) await recordFailure(context.prisma, pending.userId)
    throw error
  }
  const sessionToken = await context.sessionStrategy.start({ context, data: attestVerifiedStart({ id: user.id, authVersion: Number(user.authVersion) }) })
  return { sessionToken }
}

/** enrol → confirm → (rotate_recovery | disable). Needs the current password every time. */
export async function manageMfa(_root: unknown, args: { action: string; password: string; code?: string; recovery?: boolean }, context: Ctx) {
  const id = context.session?.itemId
  if (!id) throw new GraphQLError('Sign in to manage your second factor.', { extensions: { code: Codes.NOT_AUTHORIZED } })
  const code = String(args.code ?? '').trim()
  try {
    return await runInTransaction(context.prisma, async uow => {
      await lockUser(uow.tx, id)
      const user = await uow.tx.user.findUnique({ where: { id } })
      if (!user || Number(user.authVersion) !== Number(context.session.authVersion)) throw new DomainError(Codes.NOT_AUTHORIZED, 'Your session changed. Sign in again.')
      assertNotLocked(user)
      await requirePassword(context, user, args.password)
      if (args.action === 'enrol') {
        if (user.mfaEnrolled) throw new DomainError(Codes.INVALID_TRANSITION, 'A second factor is already set up. Disable it first to change authenticators.')
        const secret = newMfaSecret()
        const box = await storeSecret(uow.tx, `mfa:${id}`, secret)
        await uow.tx.user.update({ where: { id }, data: { mfaPendingSecretId: box.id, mfaPendingExpiresAt: new Date(uow.now.getTime() + 10 * 60_000) } })
        audit(uow, id, 'mfa.enrolment_started')
        return { secret, provisioningUri: provisioningUri('Openfront Dental', user.email, secret), expiresInMinutes: 10 }
      }
      let factor: Record<string, unknown>
      if (args.action === 'confirm') {
        if (user.mfaEnrolled || !user.mfaPendingSecretId || !user.mfaPendingExpiresAt || user.mfaPendingExpiresAt.getTime() <= uow.now.getTime()) {
          throw new DomainError(Codes.INVALID_TRANSITION, 'Set-up expired. Start again.')
        }
        factor = { mfaLastCounter: verifyTotp(await readSecret(uow.tx, user.mfaPendingSecretId), code, -1), mfaSecretId: user.mfaPendingSecretId, mfaEnrolled: true }
      } else if (args.action === 'disable' || args.action === 'rotate_recovery') {
        if (!user.mfaEnrolled || !user.mfaSecretId) throw new DomainError(Codes.INVALID_TRANSITION, 'No second factor is set up.')
        factor = args.recovery
          ? { mfaRecoveryHashes: consumeRecoveryCode(id, user.mfaRecoveryHashes, code) }
          : { mfaLastCounter: verifyTotp(await readSecret(uow.tx, user.mfaSecretId), code, Number(user.mfaLastCounter)) }
      } else {
        throw new DomainError(Codes.INVALID_INPUT, 'Choose enrol, confirm, rotate_recovery or disable.', { field: 'action' })
      }
      const codes = args.action === 'disable' ? [] : newRecoveryCodes()
      await uow.tx.user.update({
        where: { id },
        data: {
          ...factor,
          ...(args.action === 'disable' ? { mfaEnrolled: false, mfaSecretId: null, mfaLastCounter: -1 } : {}),
          mfaRecoveryHashes: JSON.stringify(codes.map(c => hashRecoveryCode(id, c))),
          mfaPendingSecretId: null,
          mfaPendingExpiresAt: null,
          mfaFailures: 0,
          authVersion: { increment: 1 },
        },
      })
      audit(uow, id, args.action === 'confirm' ? 'mfa.enrolled' : `mfa.${args.action}`)
      return { recoveryCodes: codes, signedOut: true }
    })
  } catch (error) {
    if (error instanceof DomainError && error.code === Codes.MFA_REQUIRED && /wrong/.test(error.message)) await recordFailure(context.prisma, id)
    throw error
  }
}
