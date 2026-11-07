import { createHash, randomUUID } from 'node:crypto'
import { GraphQLError, Kind, type DocumentNode, type OperationDefinitionNode } from 'graphql'
import { verifiedInternalIdentity } from './internalIdentity'

/*
 * Authentication rate limit (BUILD-PLAN Phase 0 auth hardening). Password sign-in, MFA verification,
 * factor management, password reset and first-user creation are counted in fixed windows, per client
 * and per account, in Postgres so every app instance shares the counters. Over the limit the operation
 * is refused with RATE_LIMITED before any resolver runs. Keys are hashed; no email or address is stored.
 */

export const AUTH_FIELDS = new Set([
  'authenticateUserWithPassword', 'verifyMfa', 'manageMfa', 'sendUserPasswordResetLink', 'redeemUserPasswordResetToken', 'createInitialUser',
])

export const LIMITS = {
  /** Per client address (or verified forwarded identity). */
  client: { max: 30, windowMs: 15 * 60_000 },
  /** Per account (email or signed-in user), across all addresses. */
  account: { max: 10, windowMs: 15 * 60_000 },
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 40)

type Prisma = { $queryRawUnsafe: (sql: string, ...values: unknown[]) => Promise<any[]> }

/** Counts one attempt and reports whether the bucket is still within its limit. */
export async function hit(prisma: Prisma, key: string, limit: { max: number; windowMs: number }, now = new Date()) {
  const windowStart = new Date(Math.floor(now.getTime() / limit.windowMs) * limit.windowMs)
  const rows = await prisma.$queryRawUnsafe(
    `INSERT INTO "RateLimitBucket" ("id", "key", "windowStart", "count", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 1, $4, $4)
     ON CONFLICT ("key") DO UPDATE SET
       "count" = CASE WHEN "RateLimitBucket"."windowStart" = EXCLUDED."windowStart" THEN "RateLimitBucket"."count" + 1 ELSE 1 END,
       "windowStart" = EXCLUDED."windowStart",
       "updatedAt" = EXCLUDED."updatedAt"
     RETURNING "count"`,
    randomUUID(), key, windowStart, now,
  )
  const count = Number(rows[0]?.count ?? 0)
  return { allowed: count <= limit.max, count, retryAfterSeconds: Math.ceil((windowStart.getTime() + limit.windowMs - now.getTime()) / 1000) }
}

/** The auth fields an operation selects at its root, with their literal or variable `email` argument. */
export function authFieldsOf(document: DocumentNode, operationName: string | null | undefined, variables: Record<string, unknown> | null | undefined) {
  const operations = document.definitions.filter((d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION)
  const operation = operationName ? operations.find(d => d.name?.value === operationName) : operations[0]
  if (!operation || operation.operation !== 'mutation') return []
  const out: { field: string; email?: string }[] = []
  for (const selection of operation.selectionSet.selections) {
    if (selection.kind !== Kind.FIELD || !AUTH_FIELDS.has(selection.name.value)) continue
    const emailArg = selection.arguments?.find(a => a.name.value === 'email')
    let email: string | undefined
    if (emailArg?.value.kind === Kind.STRING) email = emailArg.value.value
    else if (emailArg?.value.kind === Kind.VARIABLE) email = String(variables?.[emailArg.value.name.value] ?? '')
    out.push({ field: selection.name.value, email: email?.trim().toLowerCase() || undefined })
  }
  return out
}

/** The client a request is counted against: a verified loopback-forwarded identity, else the edge address. */
export function clientKey(req: any, secret: string, now = Date.now()) {
  const headers = req?.headers ?? {}
  const socket = req?.socket?.remoteAddress ?? null
  const forwarded = verifiedInternalIdentity(headers, socket, secret, now)
  if (forwarded) return forwarded
  // Behind Railway's edge the socket is the proxy; x-real-ip is set by the edge, not the client.
  const edge = process.env.RAILWAY_ENVIRONMENT ? String(headers['x-real-ip'] || '').split(',')[0].trim() : ''
  return `addr:${edge || socket || 'unknown'}`
}

export function authRateLimitPlugin(options: { prisma: () => Prisma; secret: () => string }) {
  return {
    async onExecute({ args, setResultAndStopExecution }: any) {
      const fields = authFieldsOf(args.document, args.operationName, args.variableValues)
      if (!fields.length) return
      const context = args.contextValue
      const keys = [`auth:client:${hash(clientKey(context?.req, options.secret()))}`]
      for (const { email } of fields) if (email) keys.push(`auth:account:${hash(email)}`)
      if (context?.session?.itemId) keys.push(`auth:account:${hash(`user:${context.session.itemId}`)}`)
      let refused: { retryAfterSeconds: number } | null = null
      try {
        for (const key of new Set(keys)) {
          const result = await hit(options.prisma(), key, key.includes(':client:') ? LIMITS.client : LIMITS.account)
          if (!result.allowed) refused = result
        }
      } catch {
        // The limiter failing must not open a hole: refuse sign-in work until the database answers.
        refused = { retryAfterSeconds: 60 }
      }
      if (refused) {
        setResultAndStopExecution({
          errors: [new GraphQLError(`Too many attempts. Try again in ${Math.ceil(refused.retryAfterSeconds / 60)} minutes.`, { extensions: { code: 'RATE_LIMITED', retryAfterSeconds: refused.retryAfterSeconds } })],
        })
      }
    },
  }
}
