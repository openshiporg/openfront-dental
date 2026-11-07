import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { DomainError, Codes } from './errors'

/*
 * Staff second factor (BUILD-PLAN Phase 0 auth hardening): RFC 6238 TOTP (SHA-1, 6 digits, 30 s),
 * a ±1 step window, and a replay guard that refuses any counter at or below the last one used.
 * Seeds live in SecretBox under the purpose `mfa:<userId>`; recovery codes are stored as hashes.
 * adapted from openfront-hotel@0a75ba4 features/keystone/lib/hotelMfa.ts
 */

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function encodeMfaSecret(bytes: Buffer) {
  let bits = 0
  let value = 0
  let result = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      result += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits) result += BASE32[(value << (5 - bits)) & 31]
  return result
}

function decodeSecret(secret: string) {
  if (!/^[A-Z2-7]{32}$/.test(secret)) throw new Error('Invalid authenticator secret.')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const character of secret) {
    value = (value << 5) | BASE32.indexOf(character)
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

export const newMfaSecret = () => encodeMfaSecret(randomBytes(20))

export function totp(secret: string, counter: number) {
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error('Invalid authenticator counter.')
  const input = Buffer.alloc(8)
  input.writeBigUInt64BE(BigInt(counter))
  const hash = createHmac('sha1', decodeSecret(secret)).update(input).digest()
  const offset = hash[hash.length - 1] & 15
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

/** Returns the matched counter, which the caller must store as the new last counter. */
export function verifyTotp(secret: string, code: string, lastCounter: number, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) throw new DomainError(Codes.INVALID_INPUT, 'Enter the six-digit code from your authenticator app.', { field: 'code' })
  const current = Math.floor(now / 30_000)
  for (const counter of [current, current - 1, current + 1]) {
    if (counter >= 0 && counter > lastCounter && timingSafeEqual(Buffer.from(totp(secret, counter)), Buffer.from(code))) return counter
  }
  throw new DomainError(Codes.MFA_REQUIRED, 'That code is wrong, expired or already used. Wait for the next code and try again.')
}

export const provisioningUri = (issuer: string, account: string, secret: string) =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`

export const hashRecoveryCode = (userId: string, code: string) => createHash('sha256').update(`${userId}:${code.trim().toUpperCase()}`).digest('hex')

export function newRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => randomBytes(10).toString('hex').toUpperCase().replace(/(.{5})(?=.)/g, '$1-'))
}

/** Removes the matching hash; throws when the code is unknown or already used. */
export function consumeRecoveryCode(userId: string, stored: string | null | undefined, code: string) {
  let hashes: string[] = []
  try {
    const parsed = JSON.parse(stored || '[]')
    hashes = Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    hashes = []
  }
  const hash = hashRecoveryCode(userId, code.replaceAll('-', '').replace(/(.{5})(?=.)/g, '$1-'))
  const index = hashes.findIndex(value => value.length === hash.length && timingSafeEqual(Buffer.from(value), Buffer.from(hash)))
  if (index < 0) throw new DomainError(Codes.MFA_REQUIRED, 'That recovery code is wrong or already used.')
  return JSON.stringify(hashes.filter((_, position) => position !== index))
}

/** Five wrong codes lock the second factor for fifteen minutes (brute-force guard on 10^6 codes). */
export const MFA_MAX_FAILURES = 5
export const MFA_LOCK_MS = 15 * 60_000
