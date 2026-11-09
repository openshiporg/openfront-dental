import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { memberIdHash } from './canonical'

const KEY_A = '07'.repeat(32), KEY_B = '08'.repeat(32)

describe('memberIdHash', () => {
  it('is keyed: not the bare sha256, and a different key gives a different value', () => {
    const bare = createHash('sha256').update('SUM-4401-A').digest('hex')
    const a = memberIdHash('SUM-4401-A', KEY_A)
    expect(a).toMatch(/^h1:[0-9a-f]{64}$/)
    expect(a).not.toContain(bare)
    expect(memberIdHash('SUM-4401-A', KEY_B)).not.toBe(a)
  })
  it('ignores case, spaces and dashes, so the same member matches however it was typed', () => {
    expect(memberIdHash('sum 4401 a', KEY_A)).toBe(memberIdHash('SUM-4401-A', KEY_A))
  })
  it('refuses to hash without a server key', () => {
    expect(() => memberIdHash('X1', '')).toThrow(/DENTAL_SECRET_KEY/)
  })
})
