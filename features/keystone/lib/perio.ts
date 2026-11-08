import { DomainError, Codes } from './errors'
import { normalizeTooth } from './teeth'

/*
 * Periodontal charting maths (SCHEMA §5.3; DOMAIN I-C5). Measurements are whole millimetres inside
 * physical bounds. Clinical attachment loss is derived and never stored. The AAP/EFP 2017 stage and
 * grade here is decision support only: a clinician confirms or overrides it before it counts.
 */

export const SITES = ['MB', 'B', 'DB', 'ML', 'L', 'DL'] as const
export type Site = (typeof SITES)[number]

export const PD_MIN = 0
export const PD_MAX = 15
export const GM_MIN = -10
export const GM_MAX = 15

export type Measurement = { tooth: string; site: Site; probingDepthMm?: number | null; gingivalMarginMm?: number | null; bleeding?: boolean; suppuration?: boolean; plaque?: boolean }

const whole = (value: unknown, field: string, min: number, max: number) => {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : /^-?\d+$/.test(String(value).trim()) ? parseInt(String(value).trim(), 10) : Number.NaN
  if (!Number.isInteger(n)) throw new DomainError(Codes.INVALID_INPUT, `${field} must be a whole number of millimetres.`, { field })
  if (n < min || n > max) throw new DomainError(Codes.INVALID_INPUT, `${field} must be between ${min} and ${max} mm.`, { field })
  return n
}

export function validateMeasurement(input: Record<string, unknown>): Required<Pick<Measurement, 'tooth' | 'site'>> & { probingDepthMm: number | null; gingivalMarginMm: number | null; bleeding: boolean; suppuration: boolean; plaque: boolean } {
  const site = String(input.site ?? '').toUpperCase() as Site
  if (!(SITES as readonly string[]).includes(site)) throw new DomainError(Codes.INVALID_INPUT, 'Site must be MB, B, DB, ML, L or DL.', { field: 'site' })
  return {
    tooth: normalizeTooth(input.tooth),
    site,
    probingDepthMm: whole(input.probingDepthMm, 'Probing depth', PD_MIN, PD_MAX),
    gingivalMarginMm: whole(input.gingivalMarginMm, 'Gingival margin', GM_MIN, GM_MAX),
    bleeding: input.bleeding === true,
    suppuration: input.suppuration === true,
    plaque: input.plaque === true,
  }
}

/**
 * Clinical attachment loss in mm. The gingival margin is signed: positive when the margin sits
 * apical to the CEJ (recession), negative when it covers the CEJ. CAL = PD + recession.
 */
export function cal(probingDepthMm: number | null | undefined, gingivalMarginMm: number | null | undefined): number | null {
  if (probingDepthMm === null || probingDepthMm === undefined || gingivalMarginMm === null || gingivalMarginMm === undefined) return null
  return probingDepthMm + gingivalMarginMm
}

export type ExamSummary = { sites: number; bleedingPct: number; plaquePct: number; meanPd: number; sitesGe4: number; sitesGe5: number; maxCal: number | null; teethWithCalGe5: number }

export function summarize(measurements: Measurement[]): ExamSummary {
  const recorded = measurements.filter(m => m.probingDepthMm !== null && m.probingDepthMm !== undefined)
  const n = recorded.length
  const pct = (count: number) => (n ? Math.round((count / n) * 1000) / 10 : 0)
  const cals = measurements.map(m => cal(m.probingDepthMm, m.gingivalMarginMm)).filter((v): v is number => v !== null)
  const calByTooth = new Map<string, number>()
  for (const m of measurements) {
    const value = cal(m.probingDepthMm, m.gingivalMarginMm)
    if (value !== null) calByTooth.set(m.tooth, Math.max(calByTooth.get(m.tooth) ?? -99, value))
  }
  return {
    sites: n,
    bleedingPct: pct(recorded.filter(m => m.bleeding).length),
    plaquePct: pct(recorded.filter(m => m.plaque).length),
    meanPd: n ? Math.round((recorded.reduce((sum, m) => sum + (m.probingDepthMm ?? 0), 0) / n) * 10) / 10 : 0,
    sitesGe4: recorded.filter(m => (m.probingDepthMm ?? 0) >= 4).length,
    sitesGe5: recorded.filter(m => (m.probingDepthMm ?? 0) >= 5).length,
    maxCal: cals.length ? Math.max(...cals) : null,
    teethWithCalGe5: [...calByTooth.values()].filter(v => v >= 5).length,
  }
}

export type SiteChange = { tooth: string; site: Site; before: number | null; after: number | null; delta: number }

/** Probing-depth changes between two exams (positive delta = deeper now). */
export function compareExams(prior: Measurement[], current: Measurement[], minimumChangeMm = 2): SiteChange[] {
  const before = new Map(prior.map(m => [`${m.tooth}:${m.site}`, m.probingDepthMm ?? null]))
  const changes: SiteChange[] = []
  for (const m of current) {
    const a = before.get(`${m.tooth}:${m.site}`)
    const b = m.probingDepthMm ?? null
    if (a === undefined || a === null || b === null) continue
    if (Math.abs(b - a) >= minimumChangeMm) changes.push({ tooth: m.tooth, site: m.site, before: a, after: b, delta: b - a })
  }
  return changes.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
}

export type ClassificationInputs = { teethPresent: number; maxCalMm: number | null; maxPdMm: number | null; teethLostToPerio?: number; boneLossPctOfRoot?: number | null; yearsOfFollowUp?: number | null; boneLossPctPerDecade?: number | null; smokerCigarettesPerDay?: number; hba1c?: number | null; sitesGe5: number; teethWithCalGe5: number }
export type Classification = { stage: 'I' | 'II' | 'III' | 'IV'; grade: 'A' | 'B' | 'C'; extent: 'localized' | 'generalized' | 'molar_incisor'; reasons: string[] }

/**
 * AAP/EFP 2017 staging and grading by the published criteria. It never reads as a diagnosis: the
 * result is saved as `suggested` and a clinician must confirm or override it.
 */
export function suggestClassification(input: ClassificationInputs): Classification {
  const reasons: string[] = []
  const cal = input.maxCalMm ?? 0
  const pd = input.maxPdMm ?? 0
  let stage: Classification['stage'] = 'I'
  if (cal >= 5 || pd >= 6 || (input.teethLostToPerio ?? 0) >= 1) {
    stage = cal >= 5 ? 'III' : 'II'
    if (cal >= 5) reasons.push(`Interdental CAL of ${cal} mm`)
  }
  if (cal >= 3 && cal < 5 && stage === 'I') { stage = 'II'; reasons.push(`Interdental CAL of ${cal} mm`) }
  if (cal >= 1 && cal < 3 && stage === 'I') reasons.push(`Interdental CAL of ${cal} mm`)
  if ((input.teethLostToPerio ?? 0) >= 5 || input.teethPresent < 20) { stage = 'IV'; reasons.push(input.teethPresent < 20 ? `Fewer than 20 teeth present (${input.teethPresent})` : `${input.teethLostToPerio} teeth lost to periodontitis`) }
  else if ((input.teethLostToPerio ?? 0) >= 1) { stage = 'III'; reasons.push(`${input.teethLostToPerio} tooth lost to periodontitis`) }
  if (pd >= 6 && stage === 'II') { stage = 'III'; reasons.push(`Probing depth of ${pd} mm`) }

  let grade: Classification['grade'] = 'B'
  const progression = input.boneLossPctPerDecade
  if (progression !== null && progression !== undefined) {
    grade = progression >= 1 ? 'C' : progression > 0 ? 'B' : 'A'
    reasons.push(`Progression ${progression} (bone loss % per decade)`)
  }
  if ((input.smokerCigarettesPerDay ?? 0) >= 10 || (input.hba1c ?? 0) >= 7) { grade = 'C'; reasons.push('Risk factors raise the grade (smoking ≥ 10/day or HbA1c ≥ 7%)') }
  else if (((input.smokerCigarettesPerDay ?? 0) > 0 || (input.hba1c ?? 0) >= 6.5) && grade === 'A') { grade = 'B'; reasons.push('Risk factors raise the grade') }

  const share = input.teethPresent ? input.teethWithCalGe5 / input.teethPresent : 0
  const extent: Classification['extent'] = share >= 0.3 ? 'generalized' : 'localized'
  return { stage, grade, extent, reasons }
}
