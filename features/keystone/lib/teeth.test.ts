import { describe, expect, it } from 'vitest'
import { cal, compareExams, summarize, suggestClassification, validateMeasurement } from './perio'
import { normalizeSite, normalizeSurfaces, normalizeTooth, quadrantOf, toFdi, toPalmer } from './teeth'

describe('tooth numbering', () => {
  it('maps Universal to FDI at the corners of each quadrant', () => {
    expect([1, 8, 9, 16, 17, 24, 25, 32].map(n => toFdi(String(n)))).toEqual(['18', '11', '21', '28', '48', '41', '31', '38'])
    expect(['A', 'E', 'F', 'J', 'K', 'O', 'P', 'T'].map(toFdi)).toEqual(['55', '51', '61', '65', '75', '71', '81', '85'])
  })
  it('names quadrants and Palmer positions', () => {
    expect(quadrantOf('3')).toBe('UR')
    expect(quadrantOf('30')).toBe('LR')
    expect(quadrantOf('K')).toBe('LL')
    expect(toPalmer('8')).toBe('UR 1')
  })
  it('refuses a tooth that does not exist', () => {
    expect(() => normalizeTooth('33')).toThrow(/tooth/i)
    expect(normalizeTooth(' 14 ')).toBe('14')
    expect(normalizeTooth('d')).toBe('D')
  })
})

describe('surfaces and areas', () => {
  it('sorts surfaces into canonical order and refuses duplicates and unknown letters', () => {
    expect(normalizeSurfaces('dom')).toBe('MOD')
    expect(normalizeSurfaces('lb')).toBe('BL')
    expect(() => normalizeSurfaces('MM')).toThrow(/twice/)
    expect(() => normalizeSurfaces('MX')).toThrow(/not a tooth surface/)
    expect(() => normalizeSurfaces('MODB', 3)).toThrow(/at most 3/)
  })
  it('enforces the code area rule', () => {
    expect(normalizeSite('tooth_surface', { tooth: '19', surfaces: 'OD' })).toMatchObject({ area: 'surface', tooth: '19', surfaces: 'OD', quadrant: 'LL' })
    expect(() => normalizeSite('tooth_surface', { tooth: '19', surfaces: '' })).toThrow(/surface/)
    expect(() => normalizeSite('tooth', {})).toThrow(/tooth/i)
    expect(normalizeSite('quadrant', { quadrant: 'ul' }).quadrant).toBe('UL')
    expect(() => normalizeSite('arch', { arch: 'X' })).toThrow(/arch/i)
    expect(normalizeSite('mouth', {}).area).toBe('mouth')
  })
})

describe('perio measurements', () => {
  const base = { tooth: '3', site: 'MB' }
  it('rejects values outside physical bounds (I-C5)', () => {
    expect(() => validateMeasurement({ ...base, probingDepthMm: 16 })).toThrow(/between 0 and 15/)
    expect(() => validateMeasurement({ ...base, probingDepthMm: -1 })).toThrow(/between 0 and 15/)
    expect(() => validateMeasurement({ ...base, gingivalMarginMm: 16 })).toThrow(/between -10 and 15/)
    expect(() => validateMeasurement({ ...base, gingivalMarginMm: -11 })).toThrow(/between -10 and 15/)
    expect(() => validateMeasurement({ ...base, probingDepthMm: 2.5 })).toThrow(/whole number/)
    expect(() => validateMeasurement({ ...base, site: 'XX' })).toThrow(/Site/)
    expect(validateMeasurement({ ...base, probingDepthMm: 15, gingivalMarginMm: -10 })).toMatchObject({ probingDepthMm: 15, gingivalMarginMm: -10 })
  })
  it('derives attachment loss from depth and margin', () => {
    expect(cal(3, 2)).toBe(5)
    expect(cal(4, -1)).toBe(3)
    expect(cal(3, null)).toBeNull()
  })
  it('summarises an exam and compares it with the prior exam', () => {
    const prior = [{ tooth: '3', site: 'MB' as const, probingDepthMm: 3, gingivalMarginMm: 0 }, { tooth: '3', site: 'B' as const, probingDepthMm: 2, gingivalMarginMm: 0 }]
    const now = [{ tooth: '3', site: 'MB' as const, probingDepthMm: 6, gingivalMarginMm: 1, bleeding: true }, { tooth: '3', site: 'B' as const, probingDepthMm: 2, gingivalMarginMm: 0 }]
    expect(summarize(now)).toMatchObject({ sites: 2, bleedingPct: 50, sitesGe5: 1, maxCal: 7 })
    expect(compareExams(prior, now)).toEqual([{ tooth: '3', site: 'MB', before: 3, after: 6, delta: 3 }])
  })
  it('suggests a stage and grade from published criteria, never a final one', () => {
    const result = suggestClassification({ teethPresent: 28, maxCalMm: 5, maxPdMm: 6, sitesGe5: 9, teethWithCalGe5: 4, smokerCigarettesPerDay: 0 })
    expect(result.stage).toBe('III')
    expect(result.extent).toBe('localized')
    expect(suggestClassification({ teethPresent: 18, maxCalMm: 6, maxPdMm: 7, sitesGe5: 30, teethWithCalGe5: 12 }).stage).toBe('IV')
    expect(suggestClassification({ teethPresent: 28, maxCalMm: 2, maxPdMm: 3, sitesGe5: 0, teethWithCalGe5: 0 }).stage).toBe('I')
    expect(suggestClassification({ teethPresent: 28, maxCalMm: 4, maxPdMm: 4, sitesGe5: 0, teethWithCalGe5: 0, smokerCigarettesPerDay: 12 }).grade).toBe('C')
  })
})
