import type { Db } from '../lib/db'
import { OF_CODES } from './clinical'

/*
 * Claim reference data: scrub rules and the denial reason map (any practice), and, for the sample practice only,
 * made-up insurance-shaped codes with a confirmed match from each office code, plus a live enrollment. All of it is
 * written with skip-duplicates, so it is safe at every start-up and in every test database.
 */

export const SCRUB_RULESET = '2026.1'

export const SCRUB_RULES = [
  { key: 'coverage-active', kind: 'coverage_active', severity: 'blocking', message: 'The patient’s coverage is not active. Verify the insurance before the claim goes out.' },
  { key: 'primary-first', kind: 'primary_first', severity: 'blocking', message: 'The primary payer has to finish before a secondary claim goes out.' },
  { key: 'crosswalk-required', kind: 'crosswalk_required', severity: 'blocking', message: 'A procedure has no confirmed insurance code. Confirm its match in the code crosswalk.' },
  { key: 'tooth-required', kind: 'tooth_required', severity: 'blocking', message: 'This procedure needs a tooth number.' },
  { key: 'surface-required', kind: 'surface_required', severity: 'blocking', message: 'This procedure needs the tooth surfaces.' },
  { key: 'timely-filing', kind: 'timely_filing', severity: 'blocking', message: 'The payer’s filing window has closed.' },
  { key: 'duplicate-claim', kind: 'duplicate', severity: 'blocking', message: 'A procedure on this claim is already on another claim to this payer.' },
  { key: 'enrollment-required', kind: 'enrollment_required', severity: 'blocking', message: 'The practice is not enrolled with this payer for electronic claims. Finish enrollment or send the claim on paper.' },
  { key: 'xray-for-major', kind: 'attachment_required', severity: 'blocking', message: 'Crowns, bridges and implants need an X-ray attached.', appliesTo: { categories: ['prosth_fixed', 'implant'] } },
  { key: 'narrative-for-surgery', kind: 'narrative_required', severity: 'warning', message: 'Surgical procedures go through faster with a short narrative.', appliesTo: { categories: ['oral_surgery'] } },
] as const

export const DENIAL_REASONS = [
  { carc: '16', preventableClass: 'coding', suggestedAction: 'Fix the missing or wrong information and send a corrected claim.' },
  { carc: '18', preventableClass: 'duplicate', suggestedAction: 'Check whether the first claim was paid. If it was, nothing more is needed.' },
  { carc: '22', preventableClass: 'coordination', suggestedAction: 'Send the claim to the other payer first, then bill this payer for the rest.' },
  { carc: '27', preventableClass: 'eligibility', suggestedAction: 'Confirm the coverage dates with the patient, then bill the right payer or the patient.' },
  { carc: '29', preventableClass: 'timely_filing', suggestedAction: 'Appeal with proof of timely filing, such as the clearinghouse acceptance.' },
  { carc: '96', preventableClass: 'non_covered', suggestedAction: 'Tell the patient the service is not covered and bill them.' },
  { carc: '119', preventableClass: 'non_covered', suggestedAction: 'The yearly maximum is used up. Bill the patient for the balance.' },
  { carc: '151', preventableClass: 'frequency', suggestedAction: 'Check the plan’s frequency limit. Appeal only if the service was needed sooner.' },
  { carc: '204', preventableClass: 'non_covered', suggestedAction: 'The plan does not cover this service. Bill the patient.' },
] as const

export async function seedClaimReference(db: Db) {
  const rules = await db.scrubRule.createMany({ data: SCRUB_RULES.map(r => ({ key: r.key, kind: r.kind, severity: r.severity, message: r.message, appliesTo: ('appliesTo' in r ? r.appliesTo : {}) as never, isActive: true, rulesetVersion: SCRUB_RULESET })), skipDuplicates: true })
  const existing = new Set((await db.denialReasonMap.findMany({ select: { carc: true } })).map(r => r.carc))
  const reasons = DENIAL_REASONS.filter(r => !existing.has(r.carc))
  if (reasons.length) await db.denialReasonMap.createMany({ data: reasons.map(r => ({ carc: r.carc, rarc: '', preventableClass: r.preventableClass, suggestedAction: r.suggestedAction })) })
  return { scrubRules: rules.count, denialReasons: reasons.length }
}

/** Sample practice only: insurance-shaped codes are generated here (never typed as literals) and matched one-to-one from the office codes. */
export async function seedClaimSample(db: Db) {
  const system = await db.codeSystem.findUnique({ where: { key: 'CDT' } })
  if (!system) return { codes: 0, crosswalks: 0, enrollments: 0 }
  let codes = 0
  let crosswalks = 0
  for (const [index, of] of OF_CODES.entries()) {
    const local = await db.procedureCode.findFirst({ where: { code: of.code, codeSystem: { key: 'OF' } } })
    if (!local) continue
    const theirs = `D${9000 + index}`
    let target = await db.procedureCode.findFirst({ where: { code: theirs, codeSystemId: system.id } })
    if (!target) {
      target = await db.procedureCode.create({ data: { codeSystemId: system.id, code: theirs, nomenclature: of.name, patientFriendlyName: of.friendly, category: of.category, areaRule: of.rule, requiresSurfaces: !!of.surfaces, maxSurfaces: of.max ?? null, isSynthetic: true } })
      codes += 1
    }
    if (!(await db.procedureCodeCrosswalk.findFirst({ where: { localCodeId: local.id, targetCodeId: target.id } }))) {
      await db.procedureCodeCrosswalk.create({ data: { localCodeId: local.id, targetCodeId: target.id, status: 'confirmed', proposedBasis: 'Sample practice' } })
      crosswalks += 1
    }
  }
  let enrollments = 0
  const entity = await db.billingEntity.findFirst({ orderBy: { createdAt: 'asc' } })
  if (entity) {
    for (const payer of await db.payer.findMany({ where: { isSynthetic: true } })) {
      if (!(await db.payerEnrollment.findFirst({ where: { billingEntityId: entity.id, payerId: payer.id, transaction: 'claims' } }))) {
        await db.payerEnrollment.create({ data: { billingEntityId: entity.id, payerId: payer.id, adapterKey: 'stedi', transaction: 'claims', status: 'live', notes: 'Sample practice' } })
        enrollments += 1
      }
    }
  }
  return { codes, crosswalks, enrollments }
}
