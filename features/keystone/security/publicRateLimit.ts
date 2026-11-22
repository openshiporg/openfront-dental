import { createHash, createHmac } from 'node:crypto'
import { DomainError, Codes } from '../lib/errors'
import { clientKey, hit } from './rateLimit'

/*
 * Public and portal API limits (INTEGRATIONS §9 security). Three tiers, all counted in Postgres so
 * every instance shares them, all keyed by hashes (no address, email or phone is stored):
 *   global   — the whole public surface per minute (a flood can't starve the practice's own staff);
 *   client   — per client address per hour;
 *   contact  — per normalised email/phone per day (stops one person's details being used for spam).
 * The practice tunes them per location in OnlineBookingPolicy.rateLimit.
 * adapted from openfront-hospital@d1b1180 features/keystone/lib/publicIntakeRateLimit.ts (enforcePublicIntakeRateLimit)
 */

export type PublicLimits = { perClientPerHour: number; perContactPerDay: number; globalPerMinute: number }
export const DEFAULT_PUBLIC_LIMITS: PublicLimits = { perClientPerHour: 60, perContactPerDay: 10, globalPerMinute: 120 }

const keyHash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 40)
const secret = () => process.env.SESSION_SECRET || 'local-development-session-secret-change-me-now'

/** A keyed hash of the client (for PublicBookingRequest.ipHash), never the address itself. */
export const clientFingerprint = (req: unknown) => createHmac('sha256', secret()).update(clientKey(req, secret())).digest('hex').slice(0, 32)
export const userAgentFingerprint = (req: any) => createHmac('sha256', secret()).update(String(req?.headers?.['user-agent'] ?? '')).digest('hex').slice(0, 32)

export function limitsFrom(json: unknown): PublicLimits {
  const value = (json && typeof json === 'object' ? json : {}) as Partial<PublicLimits>
  const pick = (n: unknown, fallback: number, max: number) => (Number.isInteger(n) && Number(n) > 0 ? Math.min(Number(n), max) : fallback)
  return {
    perClientPerHour: pick(value.perClientPerHour, DEFAULT_PUBLIC_LIMITS.perClientPerHour, 1000),
    perContactPerDay: pick(value.perContactPerDay, DEFAULT_PUBLIC_LIMITS.perContactPerDay, 100),
    globalPerMinute: pick(value.globalPerMinute, DEFAULT_PUBLIC_LIMITS.globalPerMinute, 10_000),
  }
}

/**
 * Count one public write (hold, booking, sign-in code) and refuse with RATE_LIMITED when one address or one contact is over.
 * Page views and open-time reads are never counted, and there is no site-wide tier: one busy client can never take the patient
 * site dark for everyone. A limiter that can't reach its counters lets the request through (the write itself still has its checks).
 * `globalPerMinute` stays in the policy shape for old rows and is not used.
 */
export async function enforcePublicLimit(prisma: any, input: { scope: string; req?: unknown; contacts?: string[]; limits?: PublicLimits; now?: Date }) {
  const limits = input.limits ?? DEFAULT_PUBLIC_LIMITS
  const now = input.now ?? new Date()
  const checks: [string, { max: number; windowMs: number }][] = [
    [`public:client:${input.scope}:${keyHash(clientKey(input.req, secret()))}`, { max: limits.perClientPerHour, windowMs: 3_600_000 }],
    ...(input.contacts ?? []).filter(Boolean).map(c => [`public:contact:${input.scope}:${keyHash(c.toLowerCase())}`, { max: limits.perContactPerDay, windowMs: 86_400_000 }] as [string, { max: number; windowMs: number }]),
  ]
  let refused: number | null = null
  try {
    for (const [key, limit] of checks) {
      const result = await hit(prisma, key, limit, now)
      if (!result.allowed) refused = Math.max(refused ?? 0, result.retryAfterSeconds)
    }
  } catch {
    refused = null
  }
  if (refused !== null) {
    const zone = await practiceZone(prisma)
    throw new DomainError(Codes.RATE_LIMITED, `That’s more tries than we allow in a row. ${retryWhen(now, refused, zone)}, or call the office.`, { reason: 'rate_limited', retryAfterSeconds: refused })
  }
}

async function practiceZone(prisma: any) {
  try {
    const row = await prisma.practiceSettings?.findFirst?.({ select: { defaultTimeZone: true } })
    return row?.defaultTimeZone || 'America/New_York'
  } catch {
    return 'America/New_York'
  }
}

/**
 * The real moment the blocking window resets, in the practice's time: "Please try again after 4:00 PM ET" (and "tomorrow" when
 * the reset falls on the next local day). A reset within 15 minutes reads "in N minutes", which is clearer than a clock time.
 */
export function retryWhen(now: Date, retryAfterSeconds: number, timeZone: string) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
  if (minutes <= 15) return `Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}`
  const at = new Date(now.getTime() + retryAfterSeconds * 1000)
  const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone, timeZoneName: 'short' }).format(at).replace(/\b([A-Z])[SD]T\b/, '$1T')
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(d)
  return `Please try again after ${clock}${day(at) === day(now) ? '' : ' tomorrow'}`
}

/**
 * Captcha hook. With TURNSTILE_SECRET_KEY set, a Cloudflare Turnstile token is required and verified;
 * without it the hook is off and the request is marked "not_configured" for the review queue.
 */
export async function verifyCaptcha(token: string | null | undefined, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; score: string }> {
  const key = process.env.TURNSTILE_SECRET_KEY
  if (!key) return { ok: true, score: 'not_configured' }
  if (!token) return { ok: false, score: 'missing' }
  try {
    const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ secret: key, response: token }) })
    const body = (await response.json()) as { success?: boolean }
    return { ok: body.success === true, score: body.success ? 'passed' : 'failed' }
  } catch {
    return { ok: false, score: 'unreachable' }
  }
}
