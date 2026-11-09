import { createHash, createHmac } from 'node:crypto'
import { plain } from './decimal'

/**
 * Canonical JSON: object keys sorted, undefined dropped, bigint and Decimal-like values as strings,
 * dates as ISO-8601. The same logical value always hashes the same, whatever the key order.
 */
export function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Canonical JSON cannot hold a non-finite number')
    return value
  }
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(canonicalize)
  if (typeof value === 'object') {
    // decimal.js and Prisma.Decimal both expose toFixed(); keep the exact text, never a float.
    const decimalLike = value as { isFinite?: () => boolean; isNaN?: () => boolean; toString(): string }
    if (typeof decimalLike.isFinite === 'function' && typeof decimalLike.isNaN === 'function') return plain(decimalLike.toString())
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)])
    )
  }
  throw new Error(`Canonical JSON cannot hold a ${typeof value}`)
}

export const canonicalJson = (value: unknown) => JSON.stringify(canonicalize(value))

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

/**
 * Keyed hash of a member ID, for matching without storing it in the clear. HMAC-SHA256 under a key derived from
 * DENTAL_SECRET_KEY, so it cannot be brute-forced from a database copy. The `h1:` prefix names the scheme.
 */
export const memberIdHash = (memberId: string, keyText = process.env.DENTAL_SECRET_KEY) => {
  const text = String(keyText || '').trim()
  if (!text) throw new Error('DENTAL_SECRET_KEY is not set: member IDs cannot be hashed.')
  const root = /^[a-f0-9]{64}$/i.test(text) ? Buffer.from(text, 'hex') : Buffer.from(text, 'base64')
  const key = createHmac('sha256', root).update('dental.member-id-hash.v1').digest()
  return `h1:${createHmac('sha256', key).update(memberId.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex')}`
}

/** Hash of the canonical form: binds approvals and idempotency keys to an exact payload. */
export const payloadHash = (value: unknown) => sha256(canonicalJson(value))

/** JSON-safe copy for json() fields (bigint and Decimal become strings). */
export const toJsonValue = <T = unknown>(value: unknown) => canonicalize(value) as T
