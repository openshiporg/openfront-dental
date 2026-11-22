import { describe, expect, it } from 'vitest'
import { retryWhen } from './publicRateLimit'

describe('the try-again message says when the blocking window resets', () => {
  const now = new Date('2026-11-22T20:20:00Z') // 3:20 PM ET
  it('an hourly window: the top of the hour, in practice time', () => {
    expect(retryWhen(now, 40 * 60, 'America/New_York')).toBe('Please try again after 4:00 PM ET')
  })
  it('a reset within 15 minutes reads as minutes', () => {
    expect(retryWhen(now, 9 * 60, 'America/New_York')).toBe('Please try again in 9 minutes')
  })
  it('a daily window that resets after local midnight says tomorrow', () => {
    expect(retryWhen(new Date('2026-11-23T03:30:00Z'), 9 * 3600, 'America/New_York')).toBe('Please try again after 7:30 AM ET tomorrow')
  })
  it('a daily window that resets later today gives the clock time', () => {
    expect(retryWhen(now, 3 * 3600 + 40 * 60, 'America/New_York')).toBe('Please try again after 7:00 PM ET')
  })
})
