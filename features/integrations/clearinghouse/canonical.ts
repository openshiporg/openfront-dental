import { canonicalJson, sha256 } from '../../keystone/lib/canonical'
import { dec, toScale } from '../../keystone/lib/decimal'
import type { EligibilityRequest, RawBenefit } from './types'

/** The request hash: same member, payer, provider, date-of-birth and service type give the same hash (the cache and duplicate guard key). */
export function eligibilityRequestHash(req: EligibilityRequest, adapterKey: string): string {
  const { controlNumber: _control, ...rest } = req
  return sha256(canonicalJson({ adapter: adapterKey, ...rest }))
}

export type MappedFact = {
  field: 'coverage_active' | 'annual_max' | 'annual_max_used' | 'deductible' | 'deductible_met' | 'coverage_pct' | 'frequency_limit' | 'waiting_period' | 'other'
  appliesTo: Record<string, unknown>
  value: unknown
}

/** Service type codes the dental mapper understands (X12 EB03). Anything else is ignored, not guessed. */
const CATEGORY_BY_SERVICE: Record<string, string> = { '23': 'diagnostic', '35': 'dental', '36': 'major', '37': 'major', '38': 'orthodontic', '39': 'major', '40': 'oral_surgery', '41': 'preventive', '24': 'basic', '25': 'basic', '26': 'basic' }

/** "2" + "Two cleanings per calendar year" → 2 per 12 months. Only preventive recall visits are mapped (the group the estimator counts). */
export function frequencyOf(quantity: string | undefined, message: string | undefined, category: string | undefined): { count: number; months: number; group: string } | null {
  if (!quantity || !message || category !== 'preventive') return null
  if (!/^\d{1,2}$/.test(quantity.trim())) return null
  const count = parseInt(quantity, 10)
  if (count < 1 || count > 12) return null
  const text = message.toLowerCase()
  let months: number | null = null
  if (/(per|each|every|a)\s+(calendar\s+|benefit\s+|contract\s+)?year|annually|\byearly\b/.test(text)) months = 12
  else if (/(per|each|every)\s+(\d+|six|twelve)\s+months?/.test(text)) { const m = text.match(/(\d+|six|twelve)\s+months?/)![1]; months = m === 'six' ? 6 : m === 'twelve' ? 12 : parseInt(m, 10) }
  else if (/per\s+(six|6)\s+months/.test(text)) months = 6
  if (!months) return null
  return { count, months, group: 'recall' }
}

/** Percent as the payer sends it ("0.2" or "20") to a percentage with scale 4. */
export function percentText(value: string): string {
  const n = dec(value)
  return toScale(n.lte(1) ? n.times(100) : n, 4)
}

/** Whole minor units from a decimal dollar string. A fractional cent is refused. */
export function dollarsToMinor(value: string): bigint {
  const n = dec(value).times(100)
  if (!n.isInteger()) throw new Error('A fractional cent in a payer amount')
  return BigInt(toScale(n, 0))
}

/**
 * 271 benefit blocks to facts (INTEGRATIONS §2.3). Only what the payer returned becomes a fact: a
 * missing block stays unknown. Network: in-network benefit rows are preferred; the practice's own
 * network status decides, passed as `inNetwork`.
 */
export function mapBenefits(benefits: RawBenefit[], inNetwork: boolean): MappedFact[] {
  const facts: MappedFact[] = []
  const usable = benefits.filter(b => b.inPlanNetwork === undefined || b.inPlanNetwork === null || b.inPlanNetwork === inNetwork)
  for (const b of usable) {
    const category = b.serviceTypeCodes.map(c => CATEGORY_BY_SERVICE[c]).find(Boolean)
    const level = b.coverageLevelCode === 'FAM' ? 'family' : 'individual'
    switch (b.code) {
      case '1': facts.push({ field: 'coverage_active', appliesTo: {}, value: { active: true } }); break
      case '6': case '7': case '8': facts.push({ field: 'coverage_active', appliesTo: {}, value: { active: false } }); break
      case 'A': {
        // EB01 A is the patient's co-insurance share; the plan pays the rest.
        if (b.percent === undefined || !category) break
        facts.push({ field: 'coverage_pct', appliesTo: { category }, value: { pct: toScale(dec(100).minus(percentText(b.percent)), 4) } })
        break
      }
      case 'C':
        if (b.amount === undefined) break
        if (b.timeQualifierCode === '29') facts.push({ field: 'deductible_met', appliesTo: { level, category: category ?? 'all' }, value: { remainingMinor: dollarsToMinor(b.amount).toString() } })
        else facts.push({ field: 'deductible', appliesTo: { level, category: category ?? 'all' }, value: { amountMinor: dollarsToMinor(b.amount).toString() } })
        break
      case 'F':
        if (b.amount === undefined) break
        if (b.timeQualifierCode === '29') facts.push({ field: 'annual_max_used', appliesTo: { level }, value: { remainingMinor: dollarsToMinor(b.amount).toString() } })
        else facts.push({ field: 'annual_max', appliesTo: { level }, value: { amountMinor: dollarsToMinor(b.amount).toString() } })
        break
      case 'J': case 'K': break
      default:
        // A frequency becomes a limit only when the payer's own words give the count and the period; otherwise it stays unrecorded and a person is asked.
        const limit = frequencyOf(b.quantity, b.message, category)
        if (limit) facts.push({ field: 'frequency_limit', appliesTo: { group: limit.group }, value: { ...limit, text: (b.message ?? '').slice(0, 300) } })
    }
  }
  return facts
}

/** Fields a 271 normally cannot supply: they become checklist tasks when no fact exists (SM§5.2). */
export const CHECKLIST_FIELDS = ['frequency_used', 'history_procedure', 'waiting_period', 'missing_tooth_clause', 'downgrade', 'cob_method'] as const
