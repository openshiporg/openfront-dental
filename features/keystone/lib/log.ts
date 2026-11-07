/*
 * The one logger for server code (BUILD-PLAN §0 PHI discipline). Field values whose names are PHI
 * (security/phiFields tiers plus common identifiers) are replaced with "[redacted]" before anything
 * is written, at any depth. Postgres connection strings are masked too. `console.log` is lint-banned
 * in features/keystone; use log.info/warn/error.
 */
import { ALWAYS_REDACT, PHI_FIELD_NAMES } from '../security/phiFields'

const URL_PATTERN = /postgres(ql)?:\/\/\S+/gi
const MAX_DEPTH = 6

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return value.replace(URL_PATTERN, '<db-url>')
  if (typeof value === 'bigint') return value.toString()
  if (typeof value !== 'object') return value
  if (depth >= MAX_DEPTH) return '[depth]'
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1) }
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.slice(0, 50).map(item => redact(item, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = PHI_FIELD_NAMES.has(key) || ALWAYS_REDACT.has(key) ? '[redacted]' : redact(inner, depth + 1)
  }
  return out
}

type Level = 'info' | 'warn' | 'error'

function write(level: Level, message: string, details?: unknown) {
  const line = JSON.stringify({ level, at: new Date().toISOString(), message: redact(message), ...(details === undefined ? {} : { details: redact(details) }) })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}

export const log = {
  info: (message: string, details?: unknown) => write('info', message, details),
  warn: (message: string, details?: unknown) => write('warn', message, details),
  error: (message: string, details?: unknown) => write('error', message, details),
}
