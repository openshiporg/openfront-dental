import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSchema, isObjectType } from 'graphql'
import { describe, expect, it } from 'vitest'
import { permissionNames } from '../access'
import { redact } from '../lib/log'
import { canReadTier, PHI_FIELDS, PHI_TIERS, TIER_PERMISSION } from './phiFields'

const schema = buildSchema(readFileSync(join(__dirname, '../../../schema.graphql'), 'utf8'))
const session = (granted: string[]) => ({ itemId: 'u', data: { role: Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) } }) as never

describe('PHI tier map', () => {
  it('names only lists and fields that exist in the generated schema', () => {
    const missing: string[] = []
    for (const [listKey, fields] of Object.entries(PHI_FIELDS)) {
      const type = schema.getType(listKey)
      if (!type || !isObjectType(type)) { missing.push(listKey); continue }
      for (const field of Object.keys(fields)) if (!type.getFields()[field]) missing.push(`${listKey}.${field}`)
    }
    expect(missing).toEqual([])
  })

  it('every tier maps to a real permission', () => {
    for (const tier of PHI_TIERS) expect(permissionNames).toContain(TIER_PERMISSION[tier])
  })

  it('tiers are enforced, with the documented implications only', () => {
    expect(canReadTier(session([]), 'dem')).toBe(false)
    expect(canReadTier(session(['canReadClinical']), 'dem')).toBe(true)
    expect(canReadTier(session(['canReadSensitive']), 'clin')).toBe(true)
    expect(canReadTier(session(['canReadClinical']), 'sens')).toBe(false)
    expect(canReadTier(session(['canReadLedger']), 'clin')).toBe(false)
    expect(canReadTier(session(['canReadInsurance']), 'fin')).toBe(false)
    expect(canReadTier(null, 'dem')).toBe(false)
  })

  it('the log filter masks PHI field names at any depth and keeps error codes', () => {
    const out = redact({ code: 'NOT_AUTHORIZED', patient: { firstName: 'Ada', lastName: 'Lovelace', id: 'p1' }, rows: [{ payload: { x: 1 } }], url: 'postgresql://u:p@h/db' }) as any
    expect(out.code).toBe('NOT_AUTHORIZED')
    expect(out.patient).toEqual({ firstName: '[redacted]', lastName: '[redacted]', id: 'p1' })
    expect(out.rows[0].payload).toBe('[redacted]')
    expect(out.url).toBe('<db-url>')
  })
})
