import { describe, expect, it } from 'vitest'
import { addDays, humanInstant, localDate, localTime, minutesOf, overlaps, weekdayOf, zonedInstant } from './time'

const NY = 'America/New_York'

describe('location time', () => {
  it('maps local wall-clock times to instants on both sides of daylight saving', () => {
    expect(zonedInstant(NY, '2026-10-30', '08:00').toISOString()).toBe('2026-10-30T12:00:00.000Z')
    expect(zonedInstant(NY, '2026-11-02', '08:00').toISOString()).toBe('2026-11-02T13:00:00.000Z')
    expect(zonedInstant(NY, '2026-03-09', '08:00').toISOString()).toBe('2026-03-09T12:00:00.000Z')
  })

  it('resolves the spring-forward gap forward and the fall-back hour to its first occurrence', () => {
    // 2026-03-08 02:30 does not exist in New York; 2026-11-01 01:30 happens twice.
    expect(localTime(NY, zonedInstant(NY, '2026-03-08', '02:30'))).toBe('03:30')
    expect(zonedInstant(NY, '2026-11-01', '01:30').toISOString()).toBe('2026-11-01T05:30:00.000Z')
  })

  it('uses the location date, not UTC midnight', () => {
    expect(localDate(NY, Date.parse('2026-11-03T02:00:00Z'))).toBe('2026-11-02')
    expect(localDate('America/Los_Angeles', Date.parse('2026-11-03T07:59:00Z'))).toBe('2026-11-02')
  })

  it('does calendar arithmetic and half-open overlaps', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(weekdayOf('2026-11-07')).toBe(6)
    expect(minutesOf('13:40')).toBe(820)
    expect(overlaps(0, 10, 10, 20)).toBe(false)
    expect(overlaps(0, 11, 10, 20)).toBe(true)
    expect(() => addDays('2026-02-30', 1)).toThrow()
  })

  it('labels instants for people', () => {
    expect(humanInstant(NY, Date.parse('2026-11-18T19:30:00Z'))).toMatch(/Wed, Nov 18, 2:30\s?PM EST/)
  })
})
