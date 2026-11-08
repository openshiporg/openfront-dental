import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { coverageLabel, estimate, pctOf, type BenefitSource, type EstimateInput, type EstimatorLine, type PctRule, type CobMethod } from './estimator'

const rows = readFileSync(join(__dirname, 'estimator.golden.csv'), 'utf8').trim().split('\n')
const header = rows[0].split(',')
const cases = rows.slice(1).map(line => Object.fromEntries(line.split(',').map((v, i) => [header[i], v]))) as Record<string, string>[]

const big = (v: string) => (v === '' ? null : BigInt(v))
const rules = (text: string, source: BenefitSource): PctRule[] => text.split(';').filter(Boolean).map(p => { const [category, pct] = p.split('='); return { category, pct: pct === '?' ? null : pct, source } })

function toInput(c: Record<string, string>): EstimateInput {
  const source = c.source as BenefitSource
  const lines: EstimatorLine[] = c.lines.split('|').map((text, i) => {
    const [category, fee, allowed, date, group, flag] = text.split(':')
    return {
      id: `l${i}`, code: `OF-${category}`, category, date, feeMinor: BigInt(fee), allowedMinor: big(allowed), group: group || undefined,
      missingTooth: flag === 'M', downgradeAllowedMinor: flag?.startsWith('d') ? BigInt(flag.slice(1)) : undefined, secondaryAllowedMinor: flag?.startsWith('S') ? BigInt(flag.slice(1)) : undefined,
    }
  })
  const [fgroup, fcount, fmonths] = c.frequency ? c.frequency.split('/') : []
  const [acat, amin, amax] = c.ageLimit ? c.ageLimit.split('/') : []
  const [wcat, wmonths] = c.waiting ? c.waiting.split('/') : []
  const [secMethod, secPct] = c.secondary ? c.secondary.split('/') : []
  return {
    plan: {
      inNetwork: c.network === 'in', annualMaxMinor: big(c.annualMax), deductibleMinor: big(c.deductible), coveragePct: rules(c.pct, source),
      frequency: fgroup ? [{ group: fgroup, count: Number(fcount), months: Number(fmonths) }] : [],
      ageLimits: acat ? [{ category: acat, min: amin === '-' ? null : Number(amin), max: amax === '-' ? null : Number(amax) }] : [],
      waiting: wcat ? [{ category: wcat, months: Number(wmonths) }] : [],
      missingTooth: c.missingClause ? [c.missingClause] : [], downgrade: c.downgrade ? [c.downgrade] : [], deductibleCategories: ['basic', 'major'],
    },
    usage: { maxUsedMinor: BigInt(c.maxUsed), pendingMinor: BigInt(c.pending), deductibleMetMinor: BigInt(c.dedMet), history: c.history ? c.history.split(';').map(h => { const [group, date] = h.split('@'); return { group, date } }) : [] },
    patientAgeYears: Number(c.age), coverageEffectiveFrom: c.effectiveFrom || null, lines,
    secondary: secMethod ? { method: secMethod as CobMethod, coveragePct: rules(`basic=${secPct};major=${secPct};preventive=${secPct}`, 'eligibility_271') } : null,
  }
}

describe('estimator golden workbook', () => {
  it('has 44 cases', () => expect(cases).toHaveLength(44))
  for (const c of cases) {
    it(`#${c.id} ${c.scenario}`, () => {
      const result = estimate(toInput(c))
      expect({ ins: result.totals.insuranceMinor, pat: result.totals.patientMinor, wo: result.totals.writeOffMinor }).toEqual({ ins: BigInt(c.expInsurance), pat: BigInt(c.expPatient), wo: BigInt(c.expWriteOff) })
      expect(result.lines.reduce((s, l) => s + l.secondaryInsuranceMinor, 0n)).toBe(BigInt(c.expSecondary))
      expect(result.lines.map(l => l.status).join('|')).toBe(c.expStatus)
      expect(result.confidence).toBe(c.expConfidence)
      expect(estimate(toInput(c))).toEqual(result)
    })
  }
})

describe('estimator rules', () => {
  it('rounds half-even once', () => { expect(pctOf(1001n, '50')).toBe(500n); expect(pctOf(1003n, '50')).toBe(502n); expect(pctOf(5n, '50')).toBe(2n); expect(pctOf(7n, '50')).toBe(4n) })
  it('never labels an unknown benefit as covered', () => {
    expect(coverageLabel('unknown', 0n)).toBe('Benefits not verified')
    for (const c of cases.filter(x => x.expStatus.includes('unknown'))) {
      const result = estimate(toInput(c))
      for (const l of result.lines.filter(x => x.status === 'unknown')) { expect(l.insuranceMinor).toBe(0n); expect(l.patientMinor).toBe(l.allowedMinor) }
    }
  })
  it('line order does not change the answer', () => {
    const c = cases.find(x => x.id === '24')!
    const a = toInput(c); const b = { ...a, lines: [...a.lines].reverse() }
    expect(estimate(b).totals).toEqual(estimate(a).totals)
  })
})
