import { canonicalJson, sha256 } from '../lib/canonical'
import { auditCreate } from '../lib/cas'
import type { Actor } from '../lib/actor'
import { addDays, localDate } from '../lib/time'
import type { UnitOfWork } from '../lib/unitOfWork'

/*
 * Phase 2 seed: practice-authored OF- codes, a published fee schedule, conditions, note and form
 * templates, and fictional charts for the first patients. Create-only by deterministic id.
 * No CDT text: the licensed set arrives through a code import (INTEGRATIONS §11).
 */

const day = (d: string) => new Date(`${d}T00:00:00Z`)
const TZ = 'America/New_York'

type CodeSeed = { code: string; name: string; friendly: string; category: string; rule: string; surfaces?: boolean; max?: number; fee: number; recall?: boolean }

export const OF_CODES: CodeSeed[] = [
  { code: 'OF-D001', name: 'Periodic oral evaluation', friendly: 'Check-up exam', category: 'diagnostic', rule: 'mouth', fee: 6500 },
  { code: 'OF-D002', name: 'Comprehensive oral evaluation, new patient', friendly: 'New patient exam', category: 'diagnostic', rule: 'mouth', fee: 11500 },
  { code: 'OF-D003', name: 'Limited problem-focused evaluation', friendly: 'Emergency exam', category: 'diagnostic', rule: 'mouth', fee: 8000 },
  { code: 'OF-D010', name: 'Bitewing radiographs, two images', friendly: 'Two bitewing X-rays', category: 'diagnostic', rule: 'mouth', fee: 4500 },
  { code: 'OF-D011', name: 'Periapical radiograph, single image', friendly: 'Single X-ray', category: 'diagnostic', rule: 'tooth', fee: 3000 },
  { code: 'OF-D012', name: 'Full-mouth radiographic series', friendly: 'Full-mouth X-rays', category: 'diagnostic', rule: 'mouth', fee: 14500 },
  { code: 'OF-P001', name: 'Prophylaxis, adult', friendly: 'Cleaning', category: 'preventive', rule: 'mouth', fee: 12000, recall: true },
  { code: 'OF-P002', name: 'Prophylaxis, child', friendly: 'Child cleaning', category: 'preventive', rule: 'mouth', fee: 8500, recall: true },
  { code: 'OF-P003', name: 'Topical fluoride varnish', friendly: 'Fluoride treatment', category: 'preventive', rule: 'mouth', fee: 4000 },
  { code: 'OF-P004', name: 'Sealant, per tooth', friendly: 'Sealant', category: 'preventive', rule: 'tooth', fee: 5500 },
  { code: 'OF-R001', name: 'Amalgam, one surface, primary or permanent', friendly: 'Silver filling (1 surface)', category: 'restorative', rule: 'tooth_surface', surfaces: true, max: 1, fee: 16500 },
  { code: 'OF-R002', name: 'Amalgam, two surfaces, primary or permanent', friendly: 'Silver filling (2 surfaces)', category: 'restorative', rule: 'tooth_surface', surfaces: true, max: 2, fee: 20500 },
  { code: 'OF-R003', name: 'Amalgam, three surfaces, primary or permanent', friendly: 'Silver filling (3 surfaces)', category: 'restorative', rule: 'tooth_surface', surfaces: true, max: 3, fee: 25000 },
  { code: 'OF-R010', name: 'Resin composite, one surface, posterior', friendly: 'Tooth-coloured filling (1 surface)', category: 'restorative', rule: 'tooth_surface', surfaces: true, max: 1, fee: 21500 },
  { code: 'OF-R011', name: 'Resin composite, two surfaces, posterior', friendly: 'Tooth-coloured filling (2 surfaces)', category: 'restorative', rule: 'tooth_surface', surfaces: true, max: 2, fee: 27500 },
  { code: 'OF-R012', name: 'Resin composite, three surfaces, posterior', friendly: 'Tooth-coloured filling (3 surfaces)', category: 'restorative', rule: 'tooth_surface', surfaces: true, max: 3, fee: 34000 },
  { code: 'OF-R020', name: 'Resin composite, anterior', friendly: 'Front tooth filling', category: 'restorative', rule: 'tooth_surface', surfaces: true, max: 4, fee: 25500 },
  { code: 'OF-R030', name: 'Crown, full-coverage ceramic', friendly: 'Porcelain crown', category: 'prosth_fixed', rule: 'tooth', fee: 138000 },
  { code: 'OF-R031', name: 'Core build-up', friendly: 'Build-up under a crown', category: 'restorative', rule: 'tooth', fee: 29500 },
  { code: 'OF-E010', name: 'Root canal therapy, anterior', friendly: 'Root canal (front tooth)', category: 'endodontics', rule: 'tooth', fee: 78000 },
  { code: 'OF-E011', name: 'Root canal therapy, molar', friendly: 'Root canal (molar)', category: 'endodontics', rule: 'tooth', fee: 118000 },
  { code: 'OF-G001', name: 'Scaling and root planing, per quadrant', friendly: 'Deep cleaning (one quarter of the mouth)', category: 'periodontics', rule: 'quadrant', fee: 26500 },
  { code: 'OF-G002', name: 'Periodontal maintenance', friendly: 'Gum maintenance visit', category: 'periodontics', rule: 'mouth', fee: 14500, recall: true },
  { code: 'OF-S010', name: 'Extraction, erupted tooth', friendly: 'Tooth removal', category: 'oral_surgery', rule: 'tooth', fee: 22500 },
  { code: 'OF-S011', name: 'Extraction, surgical', friendly: 'Surgical tooth removal', category: 'oral_surgery', rule: 'tooth', fee: 38500 },
  { code: 'OF-I001', name: 'Implant body placement', friendly: 'Dental implant', category: 'implant', rule: 'tooth', fee: 175000 },
  { code: 'OF-A001', name: 'Occlusal guard, hard acrylic', friendly: 'Night guard', category: 'adjunctive', rule: 'arch', fee: 52000 },
]

const CONDITIONS = [
  ['caries', 'Caries', 'tooth_surface'], ['fracture', 'Fracture', 'tooth'], ['missing', 'Missing tooth', 'tooth'], ['recession', 'Gingival recession', 'tooth'],
  ['mobility', 'Mobility', 'tooth'], ['watch', 'Area to watch', 'tooth'], ['periapical', 'Periapical lesion', 'tooth'], ['impacted', 'Impacted tooth', 'tooth'], ['wear', 'Occlusal wear', 'arch'],
] as const

const HISTORY_QUESTIONS = [
  ['allergy_latex', 'Are you allergic to latex?'], ['allergy_penicillin', 'Are you allergic to penicillin or other antibiotics?'], ['allergy_other', 'Any other allergies?'],
  ['on_blood_thinner', 'Do you take a blood thinner?'], ['on_bisphosphonate', 'Do you take a bisphosphonate (for bone density)?'], ['heart_condition', 'Do you have a heart condition?'],
  ['needs_premedication', 'Has a doctor told you to take antibiotics before dental visits?'], ['diabetes', 'Do you have diabetes?'], ['high_blood_pressure', 'Do you have high blood pressure?'],
  ['pregnant', 'Are you pregnant?'], ['medications', 'List your current medications.'],
].map(([key, label]) => ({ key, label, type: key === 'medications' ? 'list' : 'yes_no' }))

const FORMS = [
  { key: 'treatment_consent', kind: 'consent_treatment', title: 'Consent to dental treatment', body: 'I consent to the examination and treatment my dentist recommends. I understand I may ask questions and decline any treatment, and that no result is guaranteed. I have had the chance to ask about risks, benefits and alternatives.' },
  { key: 'privacy_notice_ack', kind: 'hipaa_npp_ack', title: 'Notice of privacy practices: acknowledgement', body: 'I have received the practice’s notice of privacy practices, which explains how my health information is used and shared and what rights I have over it.' },
  { key: 'financial_policy', kind: 'financial_policy', title: 'Financial policy', body: 'Payment is due at the time of service unless other arrangements are made in writing. I understand insurance is a contract between me and my plan, and I am responsible for any balance my plan does not pay.' },
  { key: 'sedation_consent', kind: 'consent_sedation', title: 'Consent to sedation', body: 'I understand the purpose, risks and alternatives of the sedation my dentist has explained. I will follow the instructions given before and after the visit and arrange an adult to take me home.' },
]

export async function seedPhase2(uow: UnitOfWork, actor: Actor) {
  const { tx, now } = uow
  const today = localDate(TZ, now)
  const meta = { metadata: { seed: true, synthetic: true } }
  const created: Record<string, number> = { codes: 0, feeVersions: 0, conditions: 0, forms: 0, chartEntries: 0, notes: 0, perioExams: 0, plans: 0, histories: 0, charges: 0 }

  // Code system and practice-authored codes.
  const system = (await tx.codeSystem.findUnique({ where: { key: 'OF' } })) ?? (await tx.codeSystem.create({ data: { key: 'OF', name: 'Practice codes', isLicensed: false } }))
  if (!(await tx.codeSystem.findUnique({ where: { key: 'CDT' } }))) await tx.codeSystem.create({ data: { key: 'CDT', name: 'CDT (imported under the practice’s own licence)', isLicensed: true } })
  const codeIds = new Map<string, string>()
  for (const c of OF_CODES) {
    const id = `seed_code_${c.code.toLowerCase().replace('-', '_')}`
    codeIds.set(c.code, id)
    if (await tx.procedureCode.findUnique({ where: { id } })) continue
    await tx.procedureCode.create({ data: { id, codeSystemId: system.id, code: c.code, nomenclature: c.name, patientFriendlyName: c.friendly, category: c.category, areaRule: c.rule, requiresSurfaces: !!c.surfaces, maxSurfaces: c.max ?? null, isPreventiveRecallTrigger: !!c.recall, effectiveFrom: day('2026-01-01'), isSynthetic: true } })
    created.codes += 1
  }

  // Default fee schedule with one published version.
  let schedule = await tx.feeSchedule.findFirst({ where: { isDefault: true } })
  if (!schedule) {
    schedule = await tx.feeSchedule.create({ data: { id: 'seed_fee_office', name: 'Office fees', kind: 'office_ucr', isDefault: true, isSynthetic: true } })
    const version = await tx.feeScheduleVersion.create({ data: { id: 'seed_fee_office_2026', label: '2026 office fees', scheduleId: schedule.id, effectiveFrom: day('2026-01-01'), status: 'draft' } })
    await tx.fee.createMany({ data: OF_CODES.map(c => ({ feeVersionId: version.id, codeId: codeIds.get(c.code)!, amountMinor: BigInt(c.fee) })) })
    await tx.feeScheduleVersion.update({ where: { id: version.id }, data: { status: 'published', publishedAt: now } })
    auditCreate(uow, actor, 'FeeScheduleVersion', version.id, 'fee_schedule.published', { fees: OF_CODES.length }, meta)
    created.feeVersions += 1
    const membership = await tx.feeSchedule.create({ data: { id: 'seed_fee_ppo', name: 'In-network plan fees', kind: 'ppo', isSynthetic: true } })
    const ppo = await tx.feeScheduleVersion.create({ data: { id: 'seed_fee_ppo_2026', label: '2026 plan fees', scheduleId: membership.id, effectiveFrom: day('2026-01-01'), status: 'draft' } })
    await tx.fee.createMany({ data: OF_CODES.map(c => ({ feeVersionId: ppo.id, codeId: codeIds.get(c.code)!, amountMinor: BigInt(Math.round((c.fee * 0.78) / 100) * 100) })) })
    await tx.feeScheduleVersion.update({ where: { id: ppo.id }, data: { status: 'published', publishedAt: now } })
    created.feeVersions += 1
  }
  const feeVersion = await tx.feeScheduleVersion.findUniqueOrThrow({ where: { id: 'seed_fee_office_2026' } })
  const feeOf = (code: string) => BigInt(OF_CODES.find(c => c.code === code)!.fee)

  for (const [code, label, rule] of CONDITIONS) {
    const id = `seed_cond_${code}`
    if (await tx.conditionType.findUnique({ where: { id } })) continue
    await tx.conditionType.create({ data: { id, code, label, areaRule: rule, chartSymbol: code.slice(0, 2).toUpperCase() } })
    created.conditions += 1
  }

  // Note templates, history form and consent forms.
  if (!(await tx.noteTemplate.findUnique({ where: { id: 'seed_nt_exam' } }))) {
    for (const [id, name, body] of [
      ['seed_nt_exam', 'Periodic exam', 'Medical history reviewed and updated.\nExtra- and intra-oral soft tissue: \nOcclusion: \nRadiographs: \nFindings: \nPlan and recommendations: \nPatient questions answered.'],
      ['seed_nt_restorative', 'Restorative visit', 'Anaesthetic: \nIsolation: \nPreparation and caries removal: \nMaterial and shade: \nOcclusion checked and adjusted.\nPost-operative instructions given.'],
      ['seed_nt_hygiene', 'Hygiene visit', 'Medical history reviewed.\nPerio status: \nCalculus and plaque: \nTreatment: \nHome-care instruction: \nRecall interval: '],
    ]) {
      await tx.noteTemplate.create({ data: { id, name, status: 'published', isSynthetic: true } })
      await tx.noteTemplateVersion.create({ data: { id: `${id}_v1`, templateId: id, number: 1, body, status: 'published' } })
    }
  }
  if (!(await tx.medicalHistoryForm.findUnique({ where: { id: 'seed_mh_form' } }))) {
    await tx.medicalHistoryForm.create({ data: { id: 'seed_mh_form', name: 'Health history', formVersion: 1, questions: HISTORY_QUESTIONS as never, jurisdictionTags: ['US-FL'] as never, status: 'published', isSynthetic: true } })
  }
  for (const f of FORMS) {
    const id = `seed_form_${f.key}`
    if (await tx.formTemplate.findUnique({ where: { id } })) continue
    await tx.formTemplate.create({ data: { id, key: f.key, kind: f.kind, title: f.title, isSynthetic: true } })
    await tx.formTemplateVersion.create({ data: { id: `${id}_v1`, templateId: id, number: 1, body: f.body, requiresWitness: f.key === 'sedation_consent', contentHash: sha256(canonicalJson({ key: f.key, number: 1, body: f.body, fields: [] })), status: 'published' } })
    created.forms += 1
  }

  // Charts for the first patients. Built in memory and written in bulk (the sample load runs in one transaction).
  const ids = Array.from({ length: 14 }, (_, i) => `seed_pt_${String(i + 1).padStart(4, '0')}`)
  const all = await tx.patient.findMany({ where: { id: { in: ids }, status: 'active' }, orderBy: { id: 'asc' } })
  const charted = new Set((await tx.chartEntry.findMany({ where: { patientId: { in: ids } }, select: { patientId: true }, distinct: ['patientId'] })).map(r => r.patientId))
  const patients = all.filter(p => !charted.has(p.id))
  if (!patients.length) return created

  // Each patient's guarantor account (created when missing).
  const links = await tx.guarantorLink.findMany({ where: { patientId: { in: patients.map(p => p.id) }, status: 'active' }, orderBy: { createdAt: 'asc' } })
  const guarantorOf = new Map<string, string>()
  for (const l of links) if (l.patientId && l.guarantorId && !guarantorOf.has(l.patientId)) guarantorOf.set(l.patientId, l.guarantorId)
  const haveAccounts = await tx.guarantorAccount.findMany({ where: { guarantorId: { in: [...new Set(guarantorOf.values())] } } })
  const accountOf = new Map(haveAccounts.map(a => [a.guarantorId as string, a.id]))
  const newAccounts = [...new Set(guarantorOf.values())].filter(g => !accountOf.has(g)).map((g, i) => ({ id: `seed_acc_${g}`, guarantorId: g, ref: `ACC-${new Date().getUTCFullYear()}-${String(i + 1).padStart(6, '0')}`, isSynthetic: true }))
  if (newAccounts.length) {
    await tx.guarantorAccount.createMany({ data: newAccounts })
    for (const a of newAccounts) accountOf.set(a.guarantorId, a.id)
  }

  const dentists = ['seed_prov_okafor', 'seed_prov_reyes'] as const
  const hygienist = 'seed_prov_hale'
  const E: any[] = [], L: any[] = [], N: any[] = [], PL: any[] = [], PV: any[] = [], PI: any[] = [], PP: any[] = [], H: any[] = [], HR: any[] = [], V: any[] = []
  const X: any[] = [], PM: any[] = [], PF: any[] = [], PC: any[] = []
  const frozen: { id: string; hash: string; total: bigint; count: number }[] = []
  const completedExams: { id: string; at: Date }[] = []
  let seq = 0
  const nid = (kind: string) => `seed_${kind}_${String(++seq).padStart(5, '0')}`

  for (const [index, patient] of patients.entries()) {
    const loc = patient.homeLocationId ?? 'seed_loc_tpa'
    const dentist = loc === 'seed_loc_stp' ? 'seed_prov_natarajan' : dentists[index % 2]
    const author = dentist === 'seed_prov_reyes' ? 'seed_user_reyes' : dentist === 'seed_prov_natarajan' ? 'seed_user_natarajan' : 'seed_user_okafor'
    const adult = patient.dateOfBirth <= day(`${Number(today.slice(0, 4)) - 18}-01-01`)
    const base = (code: string, tooth: string, surfaces: string, status: string, extra: Record<string, unknown> = {}) => ({
      id: nid('ce'), patientId: patient.id, locationId: loc, kind: 'procedure', codeId: codeIds.get(code)!, tooth, surfaces, area: tooth ? (surfaces ? 'surface' : 'tooth') : 'mouth', status, source: 'staff', isSynthetic: true, ...extra,
    })
    const accountId = accountOf.get(guarantorOf.get(patient.id) ?? '')
    const complete = (code: string, tooth: string, surfaces: string, daysAgo: number, providerId: string) => {
      const date = addDays(today, -daysAgo)
      const row = base(code, tooth, surfaces, 'posted', { providerId, dateOfService: day(date), originalServiceDate: day(date), feeMinor: feeOf(code), feeScheduleVersionId: feeVersion.id })
      E.push(row)
      if (accountId) {
        const lid = nid('le')
        L.push({ id: lid, accountId, patientId: patient.id, kind: 'charge', amountMinor: feeOf(code), currencyCode: 'USD', businessDate: day(date), originalBusinessDate: day(date), locationId: loc, providerId, chartEntryId: row.id, memo: `${code} ${tooth}${surfaces ? ` ${surfaces}` : ''}`.trim(), postedAt: now, isSynthetic: true })
        created.charges += 1
      }
      return row
    }
    complete(adult ? 'OF-D002' : 'OF-D001', '', '', 210, dentist)
    complete('OF-D010', '', '', 210, dentist)
    complete(adult ? 'OF-P001' : 'OF-P002', '', '', 205, hygienist)
    if (index % 2 === 0) complete('OF-R010', String(3 + (index % 5)), 'O', 120, dentist)

    const open = adult ? [base('OF-R011', '30', 'MO', 'planned'), base('OF-R030', '19', '', 'planned'), base('OF-R031', '19', '', 'planned')] : []
    if (adult && index % 3 === 0) open.push(base('OF-G001', '', '', 'planned', { area: 'quadrant', quadrant: 'LR' }))
    const rows = adult && index % 4 === 3 ? open.slice(0, 1) : open
    E.push(...rows)
    if (adult) {
      X.push({ id: nid('ce'), patientId: patient.id, locationId: loc, kind: 'condition', conditionId: 'seed_cond_caries', tooth: '30', surfaces: 'MO', area: 'surface', status: 'existing_current', conditionStatus: 'active', source: 'staff', isSynthetic: true })
      if (index % 5 === 0) X.push({ id: nid('ce'), patientId: patient.id, locationId: loc, kind: 'condition', conditionId: 'seed_cond_missing', tooth: '1', area: 'tooth', status: 'existing_current', conditionStatus: 'active', source: 'staff', isSynthetic: true })
    }
    if (adult && rows.length && index % 3 === 0) {
      const ref = `TP-${new Date().getUTCFullYear()}-${String(index + 1).padStart(6, '0')}`
      const planId = nid('tp'), versionId = nid('tv')
      PL.push({ id: planId, patientId: patient.id, ref, title: 'Restore and protect the lower right', status: 'presented', isSynthetic: true })
      PV.push({ id: versionId, planId, number: 1, phases: [{ key: 'phase_1', label: 'Phase 1' }] })
      let total = 0n
      const items = rows.slice(0, 3)
      items.forEach((row, order) => {
        const code = OF_CODES.find(c => codeIds.get(c.code) === row.codeId)!
        total += BigInt(code.fee)
        PI.push({ id: nid('ti'), planVersionId: versionId, chartEntryId: row.id, phaseKey: 'phase_1', priority: order === 0 ? 'recommended_necessary' : 'recommended', feeMinor: BigInt(code.fee), sortOrder: order })
      })
      frozen.push({ id: versionId, planId, hash: sha256(canonicalJson({ plan: ref, number: 1, items: items.map(r => [r.id, String(OF_CODES.find(c => codeIds.get(c.code) === r.codeId)!.fee)]) })), total, count: items.length } as never)
      PP.push({ id: nid('pp'), planVersionId: versionId, channel: 'chairside', at: now })
      created.plans += 1
    }
    const answers: Record<string, unknown> = { allergy_latex: 'no', allergy_penicillin: index % 6 === 1 ? 'yes' : 'no', on_blood_thinner: index % 7 === 2 ? 'yes' : 'no', high_blood_pressure: index % 4 === 0 ? 'yes' : 'no', diabetes: index % 9 === 4 ? 'yes' : 'no', medications: index % 4 === 0 ? [{ name: 'Lisinopril', dose: '10 mg', frequency: 'daily' }] : [] }
    const respId = nid('hr'), at = new Date(now.getTime() - 200 * 86_400_000)
    H.push({ id: respId, patientId: patient.id, formId: 'seed_mh_form', answers, submittedVia: 'tablet', submittedAt: at, status: 'reviewed', isSynthetic: true })
    HR.push({ id: nid('hv'), responseId: respId, patientId: patient.id, reviewedAt: at, changesAcknowledged: [], alertsCreated: [], signatureHash: sha256(canonicalJson(answers)) })
    created.histories += 1
    const body = 'Medical history reviewed and updated. Soft tissues within normal limits. Bitewings taken and reviewed. Caries noted and discussed. Plan presented; questions answered.'
    N.push({ id: nid('cn'), patientId: patient.id, authorId: author, providerId: dentist, title: 'Periodic exam', body, bodyHash: sha256(canonicalJson({ patientId: patient.id, title: 'Periodic exam', body, amends: null })), status: 'signed', signedAt: new Date(now.getTime() - 205 * 86_400_000), signatureMethod: 'password_reauth', isSynthetic: true })
    created.notes += 1
    if (adult && index % 3 === 1) {
      const examId = nid('px')
      PC.push({ id: examId, patientId: patient.id, locationId: loc, examinerId: hygienist, examDate: day(addDays(today, -60)), revision: 1, status: 'in_progress', isSynthetic: true })
      const teeth = ['2', '3', '4', '5', '12', '13', '14', '15', '18', '19', '30', '31']
      teeth.forEach((tooth, t) => {
        ;['MB', 'B', 'DB', 'ML', 'L', 'DL'].forEach((site, si) => {
          const depth = 2 + ((t + si + index) % 3) + (tooth === '30' || tooth === '31' ? 2 : 0)
          PM.push({ examId, tooth, site, probingDepthMm: depth, gingivalMarginMm: (t + si) % 5 === 0 ? 1 : 0, bleeding: depth >= 4 || (t + si) % 7 === 0, plaque: (t * 3 + si) % 6 === 0 })
        })
        PF.push({ examId, tooth, mobility: tooth === '31' ? 1 : 0 })
      })
      completedExams.push({ id: examId, at: new Date(now.getTime() - 60 * 86_400_000) })
      created.perioExams += 1
    }
    V.push({ patientId: patient.id, systolic: 118 + (index % 5) * 4, diastolic: 74 + (index % 4) * 3, pulse: 64 + (index % 6) * 3, asaClass: index % 4 === 0 ? 'II' : 'I', takenById: 'seed_user_dupree', at: new Date(now.getTime() - 205 * 86_400_000) })
  }

  await tx.chartEntry.createMany({ data: [...E, ...X] })
  if (L.length) {
    await tx.ledgerEntry.createMany({ data: L })
    await tx.$executeRawUnsafe(`UPDATE "ChartEntry" c SET "ledgerEntry" = l.id FROM "LedgerEntry" l WHERE l."chartEntry" = c.id AND c."ledgerEntry" IS NULL AND c.id = ANY($1::text[])`, E.map(e => e.id))
  }
  if (PL.length) {
    await tx.treatmentPlan.createMany({ data: PL })
    await tx.treatmentPlanVersion.createMany({ data: PV })
    await tx.treatmentPlanItem.createMany({ data: PI })
    await tx.planPresentation.createMany({ data: PP })
    for (const f of frozen) {
      await tx.treatmentPlanVersion.update({ where: { id: f.id }, data: { frozenAt: now, contentHash: f.hash, totalsMinor: { totalMinor: f.total.toString(), itemCount: f.count } as never } })
      await tx.treatmentPlan.update({ where: { id: (f as unknown as { planId: string }).planId }, data: { currentVersionId: f.id } })
    }
  }
  await tx.medicalHistoryResponse.createMany({ data: H })
  await tx.medicalHistoryReview.createMany({ data: HR })
  await tx.clinicalNote.createMany({ data: N })
  await tx.vitalsReading.createMany({ data: V })
  if (PC.length) {
    await tx.perioExam.createMany({ data: PC })
    await tx.perioSiteMeasurement.createMany({ data: PM })
    await tx.perioToothFinding.createMany({ data: PF })
    for (const e of completedExams) await tx.perioExam.update({ where: { id: e.id }, data: { status: 'completed', signedAt: e.at, signatureHash: sha256(`seed:${e.id}`) } })
    await tx.perioClassification.createMany({ data: completedExams.map(e => ({ examId: e.id, suggestedStage: 'II', suggestedGrade: 'B', extent: 'localized', inputs: { teethPresent: 28, reasons: ['Interdental CAL of 3 mm'] } as never, status: 'suggested' })) })
  }
  created.chartEntries = E.length + X.length
  const top = await tx.$queryRawUnsafe<{ n: number | null }[]>(`SELECT MAX("chartNumber"::int) AS n FROM "Patient" WHERE "chartNumber" ~ '^[0-9]+$'`)
  await tx.sequence.upsert({ where: { key: 'chart' }, create: { key: 'chart', nextValue: (top[0]?.n ?? 1000) + 1 }, update: { nextValue: (top[0]?.n ?? 1000) + 1 } })
  for (const [table, prefix] of [['TreatmentPlan', 'TP'], ['Appointment', 'APT'], ['GuarantorAccount', 'ACC']] as const) {
    const rows = await tx.$queryRawUnsafe<{ n: number | null }[]>(`SELECT MAX(substring("ref" from '[0-9]+$')::int) AS n FROM "${table}" WHERE "ref" ~ '^${prefix}-[0-9]{4}-[0-9]+$'`)
    const key = `${prefix}-${now.getUTCFullYear()}`
    const next = (rows[0]?.n ?? 0) + 1
    await tx.sequence.upsert({ where: { key }, create: { key, nextValue: next }, update: { nextValue: next } })
  }
  return created
}
