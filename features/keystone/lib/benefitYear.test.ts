import { describe, it, expect } from 'vitest'
import { benefitYearStart } from './memberships'
const d = (s: string) => new Date(`${s}T00:00:00Z`)
describe('benefitYearStart', () => {
  it('counts included visits from the latest join-date anniversary, never before the join date', () => {
    expect(benefitYearStart(d('2025-03-15'), d('2026-11-22')).toISOString().slice(0, 10)).toBe('2026-03-15')
    expect(benefitYearStart(d('2025-12-01'), d('2026-11-22')).toISOString().slice(0, 10)).toBe('2025-12-01')
    expect(benefitYearStart(d('2026-11-01'), d('2026-11-22')).toISOString().slice(0, 10)).toBe('2026-11-01')
    expect(benefitYearStart(d('2024-02-29'), d('2025-03-01')).toISOString().slice(0, 10)).toBe('2025-02-28')
  })
})
