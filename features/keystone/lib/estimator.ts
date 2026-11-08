import { Decimal, dec } from './decimal'

/*
 * The deterministic insurance estimator (DOMAIN §4.2, I-I3). Pure: the same inputs give the same
 * result, nothing is read from the database, nothing is invented. Per line, in (date, line order):
 *   1 fee · 2 allowed (write-off) · 3 eligibility checks (frequency, age, waiting, missing tooth,
 *   non-covered) · 4 downgrade · 5 deductible · 6 coverage % (rounded once, half-even) · 7 annual
 *   maximum remaining · 8 secondary by COB method · 9 patient portion.
 * A benefit that is unknown never renders as covered: the line gets insurance 0, status `unknown`,
 * and the patient portion is the full amount (D§4.3 "unknown stays unknown").
 */

export const ESTIMATOR_VERSION = 'est-1.0.0'

export const BENEFIT_SOURCES = ['eligibility_271', 'payer_portal', 'payer_phone', 'fax_breakdown', 'prior_eob', 'patient_reported', 'practice_default'] as const
export type BenefitSource = (typeof BENEFIT_SOURCES)[number]
export type CobMethod = 'standard' | 'non_duplication' | 'carve_out' | 'unknown'
export type Confidence = 'verified' | 'partially_verified' | 'assumed'
export type LineStatus = 'covered' | 'not_covered' | 'unknown'

/** `pct: null` means the benefit is unknown. A rule from `practice_default` is an assumption. */
export type PctRule = { category: string; pct: string | null; source: BenefitSource; ref?: string }

export type EstimatorPlan = {
  inNetwork: boolean
  annualMaxMinor: bigint | null
  deductibleMinor: bigint | null
  coveragePct: PctRule[]
  frequency: { group: string; count: number; months: number; ref?: string }[]
  ageLimits: { category: string; min: number | null; max: number | null }[]
  waiting: { category: string; months: number }[]
  missingTooth: string[]
  downgrade: string[]
  deductibleCategories: string[]
}

export type EstimatorUsage = {
  maxUsedMinor: bigint
  pendingMinor: bigint
  deductibleMetMinor: bigint
  history: { group: string; date: string }[]
}

export type EstimatorLine = {
  id: string
  code: string
  category: string
  /** ISO date of service (or planned date). */
  date: string
  feeMinor: bigint
  /** The plan's allowed amount; null when unknown. */
  allowedMinor: bigint | null
  group?: string
  missingTooth?: boolean
  downgradeAllowedMinor?: bigint | null
  secondaryAllowedMinor?: bigint | null
}

export type EstimatorSecondary = { method: CobMethod; coveragePct: PctRule[] }

export type EstimateInput = {
  plan: EstimatorPlan
  usage: EstimatorUsage
  patientAgeYears: number
  coverageEffectiveFrom: string | null
  lines: EstimatorLine[]
  secondary?: EstimatorSecondary | null
}

export type LineEstimate = {
  id: string
  code: string
  feeMinor: bigint
  allowedMinor: bigint
  writeOffMinor: bigint
  insuranceMinor: bigint
  patientMinor: bigint
  deductibleAppliedMinor: bigint
  maxAppliedMinor: bigint
  secondaryInsuranceMinor: bigint
  status: LineStatus
  confidence: Confidence
  reasons: string[]
  trace: string[]
}

export type Estimate = { estimatorVersion: string; lines: LineEstimate[]; confidence: Confidence; totals: { feeMinor: bigint; insuranceMinor: bigint; patientMinor: bigint; writeOffMinor: bigint } }

const RANK: Record<Confidence, number> = { verified: 2, partially_verified: 1, assumed: 0 }
const weakest = (a: Confidence, b: Confidence) => (RANK[a] <= RANK[b] ? a : b)

/** Percentage of an amount, rounded once to whole minor units, half-even. */
export function pctOf(amount: bigint, pct: string): bigint {
  return BigInt(dec(amount).times(dec(pct)).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toFixed(0))
}

export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(d, last))
  return date.toISOString().slice(0, 10)
}

const min = (a: bigint, b: bigint) => (a < b ? a : b)
const max = (a: bigint, b: bigint) => (a > b ? a : b)

export function estimate(input: EstimateInput): Estimate {
  const { plan, usage } = input
  const ordered = input.lines.map((line, index) => ({ line, index })).sort((a, b) => (a.line.date < b.line.date ? -1 : a.line.date > b.line.date ? 1 : a.index - b.index)).map(x => x.line)
  const consumed: { group: string; date: string }[] = []
  let deductibleUsedInRun = 0n
  let insuranceInRun = 0n
  const results: LineEstimate[] = []

  for (const line of ordered) {
    const trace: string[] = []
    const reasons: string[] = []
    let partial = false
    const fee = line.feeMinor
    let allowed: bigint
    if (line.allowedMinor === null || line.allowedMinor === undefined) {
      allowed = fee
      reasons.push('allowed_unknown')
      partial = true
      trace.push('allowed amount unknown: the office fee is used')
    } else allowed = min(line.allowedMinor, fee)
    const writeOff = plan.inNetwork ? fee - allowed : 0n
    const patientBasis = plan.inNetwork ? allowed : fee
    trace.push(`fee ${fee}, allowed ${allowed}, write-off ${writeOff}`)

    const base: LineEstimate = {
      id: line.id, code: line.code, feeMinor: fee, allowedMinor: allowed, writeOffMinor: writeOff, insuranceMinor: 0n, patientMinor: patientBasis,
      deductibleAppliedMinor: 0n, maxAppliedMinor: 0n, secondaryInsuranceMinor: 0n, status: 'covered', confidence: 'verified', reasons, trace,
    }
    const finish = (patch: Partial<LineEstimate>, confidence: Confidence) => {
      results.push({ ...base, ...patch, reasons, trace, confidence })
    }

    const rule = plan.coveragePct.find(r => r.category === line.category)
    if (!rule || rule.pct === null) {
      reasons.push('benefit_unknown')
      trace.push(`coverage for ${line.category} is unknown: insurance 0`)
      finish({ status: 'unknown' }, 'assumed')
      continue
    }
    const assumed = rule.source === 'practice_default'
    if (assumed) reasons.push('assumed_benefit')
    const confidenceOf = (): Confidence => (assumed ? 'assumed' : partial ? 'partially_verified' : 'verified')

    const block = (reason: string, why: string) => {
      reasons.push(reason)
      trace.push(why)
      finish({ status: 'not_covered' }, confidenceOf())
    }

    if (dec(rule.pct).isZero()) { block('not_covered', `${line.category} is not covered`); continue }

    const freq = line.group ? plan.frequency.find(f => f.group === line.group) : undefined
    if (freq) {
      const cutoff = addMonths(line.date, -freq.months)
      const used = [...usage.history, ...consumed].filter(h => h.group === freq.group && h.date > cutoff && h.date <= line.date).length
      if (used >= freq.count) { block('frequency_exceeded', `frequency ${freq.count} per ${freq.months} months already used (${used})`); continue }
    }
    const age = plan.ageLimits.find(a => a.category === line.category)
    if (age && ((age.min !== null && input.patientAgeYears < age.min) || (age.max !== null && input.patientAgeYears > age.max))) {
      block('age_limit', `age ${input.patientAgeYears} is outside the plan's limit`); continue
    }
    const wait = plan.waiting.find(w => w.category === line.category)
    if (wait && input.coverageEffectiveFrom && line.date < addMonths(input.coverageEffectiveFrom, wait.months)) {
      block('waiting_period', `${wait.months}-month waiting period not yet served`); continue
    }
    if (line.missingTooth && plan.missingTooth.includes(line.category)) { block('missing_tooth', 'missing-tooth clause applies'); continue }

    let basis = allowed
    if (plan.downgrade.includes(line.category) && line.downgradeAllowedMinor !== null && line.downgradeAllowedMinor !== undefined && line.downgradeAllowedMinor < basis) {
      basis = line.downgradeAllowedMinor
      reasons.push('downgraded')
      trace.push(`downgraded: benefit is based on ${basis}`)
    }

    let deductibleApplied = 0n
    if (plan.deductibleCategories.includes(line.category)) {
      if (plan.deductibleMinor === null) {
        reasons.push('deductible_unknown')
        partial = true
        trace.push('deductible unknown: none applied')
      } else {
        const remaining = max(0n, plan.deductibleMinor - usage.deductibleMetMinor - deductibleUsedInRun)
        deductibleApplied = min(remaining, basis)
        trace.push(`deductible applied ${deductibleApplied} of ${remaining} remaining`)
      }
    }
    const afterDeductible = basis - deductibleApplied
    const candidate = pctOf(afterDeductible, rule.pct)
    trace.push(`${rule.pct}% of ${afterDeductible} = ${candidate}`)

    let insurance = candidate
    let maxApplied = 0n
    if (plan.annualMaxMinor === null) {
      if (candidate > 0n) { reasons.push('annual_max_unknown'); partial = true; trace.push('annual maximum unknown: not applied') }
    } else {
      const remaining = max(0n, plan.annualMaxMinor - usage.maxUsedMinor - usage.pendingMinor - insuranceInRun)
      insurance = min(candidate, remaining)
      maxApplied = candidate - insurance
      if (maxApplied > 0n) {
        reasons.push(insurance === 0n ? 'annual_max_reached' : 'annual_max_applied')
        trace.push(`annual maximum leaves ${remaining}`)
      }
    }
    deductibleUsedInRun += deductibleApplied
    insuranceInRun += insurance
    if (line.group) consumed.push({ group: line.group, date: line.date })
    finish({
      insuranceMinor: insurance, patientMinor: patientBasis - insurance, deductibleAppliedMinor: deductibleApplied, maxAppliedMinor: maxApplied,
      status: 'covered',
    }, confidenceOf())
  }

  if (input.secondary) {
    for (const result of results) {
      const line = ordered.find(l => l.id === result.id)!
      const rule = input.secondary.coveragePct.find(r => r.category === line.category)
      if (!rule || rule.pct === null || result.status === 'unknown' || input.secondary.method === 'unknown') {
        result.trace.push('secondary: benefit or COB method unknown, nothing assumed')
        continue
      }
      const secAllowed = input.secondary.method === 'non_duplication' ? result.allowedMinor : line.secondaryAllowedMinor ?? result.allowedMinor
      const normal = pctOf(secAllowed, rule.pct)
      const raw = input.secondary.method === 'standard' ? normal : max(0n, normal - result.insuranceMinor)
      result.secondaryInsuranceMinor = min(raw, result.patientMinor)
      result.trace.push(`secondary (${input.secondary.method}) pays ${result.secondaryInsuranceMinor}`)
    }
  }

  const confidence = results.reduce<Confidence>((acc, r) => weakest(acc, r.confidence), 'verified')
  const sum = (pick: (r: LineEstimate) => bigint) => results.reduce((s, r) => s + pick(r), 0n)
  return {
    estimatorVersion: ESTIMATOR_VERSION,
    lines: input.lines.map(l => results.find(r => r.id === l.id)!),
    confidence,
    totals: { feeMinor: sum(r => r.feeMinor), insuranceMinor: sum(r => r.insuranceMinor), patientMinor: sum(r => r.patientMinor), writeOffMinor: sum(r => r.writeOffMinor) },
  }
}

/** What a screen or API may say about a line: unknown is never "covered". */
export function coverageLabel(status: LineStatus, insuranceMinor: bigint): 'Covered' | 'Not covered' | 'Benefits not verified' | 'Covered, nothing payable' {
  if (status === 'unknown') return 'Benefits not verified'
  if (status === 'not_covered') return 'Not covered'
  return insuranceMinor > 0n ? 'Covered' : 'Covered, nothing payable'
}
