import { randomBytes } from 'node:crypto'
import { statelessSessions } from '@keystone-6/core/session'

/*
 * Staff sessions (BUILD-PLAN Phase 0 auth hardening).
 * - Stateless, sealed cookies with a 12 hour ceiling (PracticeSettings.sessionHours can only shorten it).
 * - A password sign-in for a user with an enrolled second factor yields a *pending* cookie: it is never
 *   a session (context.session stays undefined) until verifyMfa swaps it for a verified one.
 * - `authVersion` is embedded at sign-in; changing a password or factor bumps it and every older
 *   cookie stops working (revocation without a session table).
 * adapted from openfront-hotel@0a75ba4 features/keystone/lib/hotelMfa.ts (createHotelMfaSessionStrategy)
 */

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12
const PENDING_MS = 5 * 60_000

type Raw = { listKey?: string; itemId?: string; authVersion?: number; mfaVerified?: boolean; mfaNonce?: string; mfaExpiresAt?: number; startedAt?: number } | undefined

/** Sign-ins that verifyMfa has checked. A WeakMap so only server code holding the object can mark one. */
const attested = new WeakMap<object, number>()

export function attestVerifiedStart(user: { id: string; authVersion: number }) {
  const data = { listKey: 'User', itemId: user.id }
  attested.set(data, Number(user.authVersion))
  return data
}

function sessionSecret() {
  const secret = process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'local-development-session-secret-change-me-now')
  if (secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.')
  return secret
}

async function loadUser(context: any, id: string) {
  const user = await context.prisma.user.findUnique({ where: { id }, select: { id: true, authVersion: true, mfaEnrolled: true, accessExpiresAt: true } })
  if (!user) return undefined
  if (user.accessExpiresAt && new Date(user.accessExpiresAt).getTime() <= Date.now()) return undefined
  return user
}

async function practiceSessionHours(context: any) {
  const practice = await context.prisma.practiceSettings.findUnique({ where: { id: 1 }, select: { sessionHours: true } }).catch(() => null)
  return Math.min(12, Math.max(1, Number(practice?.sessionHours ?? 12)))
}

export function dentalSessions() {
  const base = statelessSessions<any>({ maxAge: SESSION_MAX_AGE_SECONDS, secret: sessionSecret(), sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })

  async function readRaw(context: any) {
    const raw = (await base.get({ context })) as Raw
    if (!raw?.itemId || raw.listKey !== 'User') return undefined
    const user = await loadUser(context, raw.itemId)
    if (!user || Number(user.authVersion) !== Number(raw.authVersion)) return undefined
    const hours = await practiceSessionHours(context)
    if (raw.startedAt && Date.now() - raw.startedAt > hours * 3_600_000) return undefined
    return { raw, user }
  }

  return {
    async get({ context }: { context: any }) {
      const current = await readRaw(context)
      if (!current) return undefined
      const { raw, user } = current
      if (user.mfaEnrolled && raw.mfaVerified !== true) return undefined
      return { listKey: 'User', itemId: raw.itemId, mfaVerified: raw.mfaVerified === true, authVersion: raw.authVersion }
    },
    /** The pending second-factor challenge for this cookie, if any (verifyMfa only). */
    async pending({ context }: { context: any }) {
      const current = await readRaw(context)
      if (!current) return undefined
      const { raw, user } = current
      if (!user.mfaEnrolled || raw.mfaVerified || !raw.mfaNonce || !raw.mfaExpiresAt || raw.mfaExpiresAt <= Date.now()) return undefined
      return { userId: user.id, nonce: raw.mfaNonce, authVersion: Number(user.authVersion) }
    },
    async start({ context, data }: { context: any; data: any }) {
      const user = await loadUser(context, data.itemId)
      if (!user) throw new Error('This account cannot sign in.')
      const verifiedVersion = attested.get(data)
      attested.delete(data)
      if (verifiedVersion !== undefined && verifiedVersion !== Number(user.authVersion)) throw new Error('Your sign-in details changed during verification. Sign in again.')
      return base.start({
        context,
        data: {
          listKey: 'User',
          itemId: user.id,
          authVersion: Number(user.authVersion),
          mfaVerified: verifiedVersion !== undefined,
          mfaNonce: randomBytes(24).toString('hex'),
          mfaExpiresAt: Date.now() + PENDING_MS,
          startedAt: Date.now(),
        },
      })
    },
    end: (args: any) => base.end(args),
  }
}

export type DentalSessionStrategy = ReturnType<typeof dentalSessions>
