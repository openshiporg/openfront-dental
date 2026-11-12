import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ageOn, convertedType, dueDateFor, DEFAULT_RECALL_RULES, recallStatus, toCsv, typeFitsAge, DEFAULT_RECALL_TYPES } from './recall'

const golden = readFileSync(join(__dirname, 'recall.golden.csv'), 'utf8').trim().split('\n').slice(1).map(l => l.split(','))

describe('recall golden table', () => {
  for (const [name, last, months, expected] of golden) {
    it(`${name}: ${last} + ${months} months = ${expected}`, () => expect(dueDateFor(last, Number(months))).toBe(expected))
  }
})

describe('recall status', () => {
  const base = { dueOn: '2026-07-15', leadDays: 30, graceDays: 14, hasFutureAppointment: false }
  it('is waiting before the lead window', () => expect(recallStatus({ ...base, today: '2026-06-14' })).toBe('scheduled_due'))
  it('is due from the lead window on', () => expect(recallStatus({ ...base, today: '2026-06-15' })).toBe('due'))
  it('stays due through the grace days', () => expect(recallStatus({ ...base, today: '2026-07-29' })).toBe('due'))
  it('is overdue the day after grace ends', () => expect(recallStatus({ ...base, today: '2026-07-30' })).toBe('overdue'))
  it('is scheduled when a future visit exists, even if overdue', () => expect(recallStatus({ ...base, today: '2026-09-01', hasFutureAppointment: true })).toBe('scheduled'))
  it('is disabled when disabled', () => expect(recallStatus({ ...base, today: '2026-09-01', disabled: true, hasFutureAppointment: true })).toBe('disabled'))
})

describe('age bands and conversion', () => {
  it('counts whole years', () => { expect(ageOn('2012-07-15', '2026-07-14')).toBe(13); expect(ageOn('2012-07-15', '2026-07-15')).toBe(14) })
  it('puts a child and an adult on different types', () => {
    const fits = (age: number) => DEFAULT_RECALL_TYPES.filter(t => t.key.startsWith('prophy') && typeFitsAge(t, age)).map(t => t.key)
    expect(fits(9)).toEqual(['prophy_child']); expect(fits(14)).toEqual(['prophy_adult'])
  })
  it('converts prophy to perio maintenance after perio therapy, and nothing else', () => {
    expect(convertedType('prophy_adult', 'perio_therapy_completed', DEFAULT_RECALL_RULES)).toBe('perio_maintenance')
    expect(convertedType('bitewing_series', 'perio_therapy_completed', DEFAULT_RECALL_RULES)).toBe('bitewing_series')
    expect(convertedType('prophy_adult', 'preventive_completed', DEFAULT_RECALL_RULES)).toBe('prophy_adult')
  })
})

describe('csv', () => {
  it('quotes commas and neutralises formulas', () => expect(toCsv(['a', 'b'], [['=cmd()', 'x,y']])).toBe("a,b\r\n'=cmd(),\"x,y\"\r\n"))
})
