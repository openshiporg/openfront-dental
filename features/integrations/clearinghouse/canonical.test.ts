import { describe, expect, it } from 'vitest'
import { frequencyOf } from './canonical'
describe('frequencyOf', () => {
  it('reads preventive limits and nothing else', () => {
    expect(frequencyOf('2', 'Two cleanings per calendar year', 'preventive')).toEqual({ count: 2, months: 12, group: 'recall' })
    expect(frequencyOf('1', 'One exam every 6 months', 'preventive')).toEqual({ count: 1, months: 6, group: 'recall' })
    expect(frequencyOf('2', 'Two per year', 'major')).toBeNull()
    expect(frequencyOf('2', 'As needed', 'preventive')).toBeNull()
    expect(frequencyOf(undefined, 'per year', 'preventive')).toBeNull()
  })
})
