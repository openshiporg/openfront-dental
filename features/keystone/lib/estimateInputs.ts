import type { Tx } from './db'
import type { BenefitSource, CobMethod, EstimateInput, EstimatorLine, EstimatorPlan, PctRule } from './estimator'
import { minorOf } from './money'

/*
 * Builds the estimator's inputs from stored benefit facts (I-I1, I-I3). Rules:
 *   - the newest fact for a field wins, an unknown one included: a later "the payer could not say" retracts an older value;
 *   - a category with no fact (or only an unknown one) is unknown, never zero and never covered;
 *   - every fact used is listed by id so the estimate can be reproduced.
 */

export const CATEGORY_OF_CODE: Record<string, string> = {
  diagnostic: 'preventive', preventive: 'preventive', restorative: 'basic', endodontics: 'basic', periodontics: 'basic', oral_surgery: 'basic',
  maxillofacial: 'major', prosth_removable: 'major', prosth_fixed: 'major', implant: 'major', orthodontics: 'orthodontic',
}
export const ESTIMATING_CATEGORIES = ['preventive', 'basic', 'major', 'orthodontic'] as const

type Fact = { id: string; field: string; appliesTo: any; valueJson: any; isUnknown: boolean; source: string; observedAt: Date; createdAt: Date }

const newestFirst = (a: Fact, b: Fact) => b.observedAt.getTime() - a.observedAt.getTime() || b.createdAt.getTime() - a.createdAt.getTime()

/** Facts about the same thing share a key: an unknown answer (recorded with no scope) meets the known one it replaces. */
export const factKey = (fact: Pick<Fact, 'field' | 'appliesTo'>) => {
  const a = (fact.appliesTo ?? {}) as Record<string, unknown>
  const category = a.category === 'all' || a.category === 'dental' ? '' : String(a.category ?? '')
  const group = fact.field === 'frequency_limit' ? String(a.group ?? '') || 'recall' : String(a.group ?? '')
  return `${fact.field}|${category}|${String(a.level ?? 'individual')}|${group}`
}

/** The effective fact per (field, scope): the newest answer wins, an unknown one included ("the payer could not say" retracts an older value). */
export function effectiveFacts(facts: Fact[]): Fact[] {
  const groups = new Map<string, Fact[]>()
  for (const fact of facts) groups.set(factKey(fact), [...(groups.get(factKey(fact)) ?? []), fact])
  const newest = [...groups.values()].map(group => [...group].sort(newestFirst)[0])
  // An unknown answer with no scope ("could not say" about the whole field) also retracts every older scoped value of that field.
  const wide = newest.filter(f => f.isUnknown && !Object.keys((f.appliesTo ?? {}) as object).length)
  return newest.filter(f => f.isUnknown || !wide.some(w => w.field === f.field && newestFirst(w, f) < 0))
}

export type LoadedCoverage = {
  coverageId: string
  ordinal: string
  plan: EstimatorPlan
  usage: EstimateInput['usage']
  effectiveFrom: string | null
  cobMethod: CobMethod
  factIds: string[]
  feeScheduleVersionId: string | null
  usageNotes: string[]
  coveragePct: PctRule[]
  /** How well this coverage's own benefits are verified (drives the confidence of a secondary payment). */
  verificationLevel: string
  /** A frequency limit was reported in words the estimator cannot read: a person must ask. */
  frequencyUnreadable: boolean
  /** This coverage's frequency and waiting-period answers are both known (a value, or "none"): only then may it pay, as a secondary, on a line the primary refused. */
  limitsKnown: boolean
}

export async function loadCoverageForEstimate(tx: Tx, coverageId: string, onDate: string): Promise<LoadedCoverage | null> {
  const coverage = await tx.coverage.findUnique({ where: { id: coverageId }, include: { subscriber: { include: { plan: true } } } })
  const plan = coverage?.subscriber?.plan
  if (!coverage || !plan) return null
  const facts = effectiveFacts((await tx.benefitFact.findMany({ where: { coverageId } })) as unknown as Fact[])
  const known = (field: string, scope?: (a: any) => boolean) => facts.filter(f => f.field === field && !f.isUnknown && (!scope || scope(f.appliesTo ?? {})))
  const one = (field: string, scope?: (a: any) => boolean) => known(field, scope)[0]

  const pct: PctRule[] = ESTIMATING_CATEGORIES.map(category => {
    const fact = facts.find(f => f.field === 'coverage_pct' && (f.appliesTo as any)?.category === category)
    return { category, pct: fact && !fact.isUnknown ? String((fact.valueJson as any).pct) : null, source: (fact?.source ?? 'practice_default') as BenefitSource, ref: fact?.id }
  })
  const max = one('annual_max', a => !a.level || a.level === 'individual')
  const maxLeft = one('annual_max_used', a => !a.level || a.level === 'individual')
  const ded = one('deductible', a => !a.level || a.level === 'individual')
  const dedLeft = one('deductible_met', a => !a.level || a.level === 'individual')
  const annualMax = max ? minorOf((max.valueJson as any).amountMinor) : null
  const deductible = ded ? minorOf((ded.valueJson as any).amountMinor) : null
  const usageNotes: string[] = []
  let maxUsed = 0n
  if (annualMax !== null && maxLeft) maxUsed = annualMax - minorOf((maxLeft.valueJson as any).remainingMinor)
  else if (annualMax !== null) usageNotes.push('Maximum used so far was not reported; none is assumed.')
  let dedMet = 0n
  if (deductible !== null && dedLeft) dedMet = deductible - minorOf((dedLeft.valueJson as any).remainingMinor)
  else if (deductible !== null) usageNotes.push('Deductible met so far was not reported; none is assumed.')

  const frequency = known('frequency_limit').filter(f => (f.valueJson as any)?.count && (f.valueJson as any)?.months).map(f => ({ group: String((f.valueJson as any).group ?? (f.appliesTo as any)?.group ?? 'recall'), count: Number((f.valueJson as any).count), months: Number((f.valueJson as any).months), ref: f.id }))
  const frequencyUnreadable = known('frequency_limit').some(f => !((f.valueJson as any)?.count && (f.valueJson as any)?.months))
  const ages = known('age_limit').map(f => ({ category: String((f.appliesTo as any).category), min: (f.valueJson as any).min ?? null, max: (f.valueJson as any).max ?? null }))
  const waiting = known('waiting_period').filter(f => (f.valueJson as any)?.months).map(f => ({ category: String((f.appliesTo as any).category), months: Number((f.valueJson as any).months) }))
  const missing = known('missing_tooth_clause').flatMap(f => ((f.valueJson as any)?.categories ?? []) as string[])
  const downgrade = known('downgrade').flatMap(f => ((f.valueJson as any)?.categories ?? []) as string[])
  const cobFact = one('cob_method')
  const cobMethod = ((cobFact?.valueJson as any)?.method ?? plan.cobMethod ?? 'unknown') as LoadedCoverage['cobMethod']

  const version = plan.feeScheduleId
    ? await tx.feeScheduleVersion.findFirst({ where: { scheduleId: plan.feeScheduleId, status: 'published', effectiveFrom: { lte: new Date(`${onDate}T00:00:00Z`) } }, orderBy: { effectiveFrom: 'desc' } })
    : null

  const history = await tx.outsideHistory.findMany({ where: { patientId: coverage.patientId, frequencyGroup: { not: '' } }, select: { frequencyGroup: true, dateOfService: true } })
  const done = await tx.chartEntry.findMany({ where: { patientId: coverage.patientId, kind: 'procedure', status: { in: ['completed', 'posted'] } }, include: { code: true }, take: 500 })
  const dayOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '')

  const used = [
    ...history.filter(h => h.dateOfService).map(h => ({ group: String(h.frequencyGroup), date: dayOf(h.dateOfService) })),
    ...done.filter(e => e.dateOfService).map(e => ({ group: groupOf(e.code as any), date: dayOf(e.dateOfService) })),
  ]
  return {
    coverageId, ordinal: coverage.ordinal, effectiveFrom: coverage.effectiveFrom ? dayOf(coverage.effectiveFrom) : null, cobMethod,
    factIds: facts.map(f => f.id), feeScheduleVersionId: version?.id ?? null, usageNotes, coveragePct: pct, verificationLevel: coverage.verificationLevel, frequencyUnreadable,
    limitsKnown: known('frequency_limit').length > 0 && !frequencyUnreadable && known('waiting_period').length > 0,
    plan: { inNetwork: plan.networkStatus === 'in_network', annualMaxMinor: annualMax, deductibleMinor: deductible, coveragePct: pct, frequency, ageLimits: ages, waiting, missingTooth: missing, downgrade, deductibleCategories: ['basic', 'major'] },
    usage: { maxUsedMinor: maxUsed < 0n ? 0n : maxUsed, pendingMinor: 0n, deductibleMetMinor: dedMet < 0n ? 0n : dedMet, history: used },
  }
}

export const groupOf = (code: { code?: string | null; isPreventiveRecallTrigger?: boolean | null } | null | undefined) => (code?.isPreventiveRecallTrigger ? 'recall' : String(code?.code ?? ''))
export const categoryOf = (code: { category?: string | null; estimatingCategory?: string | null } | null | undefined) => (code?.estimatingCategory || CATEGORY_OF_CODE[String(code?.category)] || 'basic')

export type { EstimatorLine }
