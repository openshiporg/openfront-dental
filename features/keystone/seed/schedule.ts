import { auditCreate } from '../lib/cas'
import type { Actor } from '../lib/actor'
import { addDays, localDate, weekdayOf } from '../lib/time'
import type { UnitOfWork } from '../lib/unitOfWork'
import { materialiseBlocks, parsePattern, patternUnits, planSegments, MS_PER_MINUTE, type OpenWindow, type ProviderBusy, type TemplateBlockInput } from '../scheduling/engine'

/*
 * Phase 1 sample data for Bayview Family Dental (BUILD-PLAN §5). Sample practice: synthetic data.
 * Every name, birth date, phone and email is invented (555 numbers). Sample data never leaves the manual
 * message queue, so no reminder is ever sent to these addresses.
 *
 * The schedule is laid out by the same engine the booking commands use (template windows, unit
 * patterns, the hygiene exam float), and the rows go through the database exclusion constraints, so
 * the sample can't contain a double booking either. Create-only by deterministic id.
 */

const TZ = 'America/New_York'
const meta = { metadata: { seed: true, synthetic: true } }

export const OPERATORIES = [
  { id: 'seed_op_tpa_op1', locationId: 'seed_loc_tpa', code: 'OP1', name: 'Operatory 1', kind: 'doctor', sortOrder: 1 },
  { id: 'seed_op_tpa_op2', locationId: 'seed_loc_tpa', code: 'OP2', name: 'Operatory 2', kind: 'doctor', sortOrder: 2 },
  { id: 'seed_op_tpa_op3', locationId: 'seed_loc_tpa', code: 'OP3', name: 'Operatory 3', kind: 'doctor', sortOrder: 3 },
  { id: 'seed_op_tpa_op4', locationId: 'seed_loc_tpa', code: 'OP4', name: 'Operatory 4 (surgery)', kind: 'surgery', sortOrder: 4 },
  { id: 'seed_op_tpa_h1', locationId: 'seed_loc_tpa', code: 'H1', name: 'Hygiene 1', kind: 'hygiene', sortOrder: 5 },
  { id: 'seed_op_tpa_h2', locationId: 'seed_loc_tpa', code: 'H2', name: 'Hygiene 2', kind: 'hygiene', sortOrder: 6 },
  { id: 'seed_op_stp_op1', locationId: 'seed_loc_stp', code: 'OP1', name: 'Operatory 1', kind: 'doctor', sortOrder: 1 },
  { id: 'seed_op_stp_op2', locationId: 'seed_loc_stp', code: 'OP2', name: 'Operatory 2', kind: 'doctor', sortOrder: 2 },
  { id: 'seed_op_stp_h1', locationId: 'seed_loc_stp', code: 'H1', name: 'Hygiene 1', kind: 'hygiene', sortOrder: 3 },
  { id: 'seed_op_stp_h2', locationId: 'seed_loc_stp', code: 'H2', name: 'Hygiene 2', kind: 'hygiene', sortOrder: 4 },
] as const

type Unit = { role: 'provider' | 'assistant' | 'hygienist' | 'exam'; units: number }
const P = (units: number): Unit => ({ role: 'provider', units })
const A = (units: number): Unit => ({ role: 'assistant', units })
const H = (units: number): Unit => ({ role: 'hygienist', units })
const E = (units: number): Unit => ({ role: 'exam', units })

/** Practice-authored visit types (no licensed code descriptors). Production estimates in cents. */
export const APPOINTMENT_TYPES = [
  { id: 'seed_apt_np', code: 'NEW_PATIENT', name: 'New patient exam and cleaning', publicName: 'New patient visit', category: 'new_patient', pattern: [H(5), E(1), H(3)], onlineBookable: true, newPatientOnly: true, requiresDentistOnSite: true, production: 32_500n, colour: '#0ea5e9' },
  { id: 'seed_apt_recall', code: 'RECALL', name: 'Recall exam and cleaning', publicName: 'Cleaning and check-up', category: 'recall_hygiene', pattern: [H(4), E(1), H(1)], onlineBookable: true, newPatientOnly: false, requiresDentistOnSite: true, production: 21_000n, colour: '#10b981' },
  { id: 'seed_apt_perio', code: 'PERIO_MAINT', name: 'Periodontal maintenance', publicName: 'Gum maintenance visit', category: 'perio_maintenance', pattern: [H(5), E(1)], onlineBookable: false, newPatientOnly: false, requiresDentistOnSite: true, production: 19_500n, colour: '#14b8a6' },
  { id: 'seed_apt_filling', code: 'FILLING', name: 'Filling(s)', publicName: '', category: 'restorative', pattern: [A(1), P(4), A(1)], onlineBookable: false, newPatientOnly: false, requiresDentistOnSite: false, production: 38_000n, colour: '#eab308' },
  { id: 'seed_apt_crown_prep', code: 'CROWN_PREP', name: 'Crown preparation', publicName: '', category: 'crown_prep', pattern: [A(2), P(6), A(1)], onlineBookable: false, newPatientOnly: false, requiresDentistOnSite: false, production: 125_000n, colour: '#a16207' },
  { id: 'seed_apt_crown_seat', code: 'CROWN_SEAT', name: 'Crown seat', publicName: '', category: 'crown_seat', pattern: [A(1), P(2), A(1)], onlineBookable: false, newPatientOnly: false, requiresDentistOnSite: false, production: 0n, colour: '#0369a1' },
  { id: 'seed_apt_endo', code: 'ENDO', name: 'Root canal treatment', publicName: '', category: 'endo', pattern: [A(1), P(8), A(1)], onlineBookable: false, newPatientOnly: false, requiresDentistOnSite: false, production: 110_000n, colour: '#ec4899' },
  { id: 'seed_apt_ext', code: 'EXTRACTION', name: 'Extraction', publicName: '', category: 'extraction', pattern: [A(1), P(3), A(1)], onlineBookable: false, newPatientOnly: false, requiresDentistOnSite: false, production: 29_000n, colour: '#f97316' },
  { id: 'seed_apt_emerg', code: 'EMERGENCY', name: 'Emergency visit', publicName: 'Tooth pain or emergency', category: 'emergency', pattern: [A(1), P(2)], onlineBookable: true, newPatientOnly: false, requiresDentistOnSite: false, production: 15_500n, colour: '#ef4444' },
  { id: 'seed_apt_consult', code: 'CONSULT', name: 'Treatment consultation', publicName: 'Consultation', category: 'consult', pattern: [P(3)], onlineBookable: true, newPatientOnly: false, requiresDentistOnSite: false, production: 0n, colour: '#64748b' },
] as const

type BlockSeed = { id: string; weekday: number; operatoryId: string; providerId: string; startLocal: string; endLocal: string; types: string[]; online: boolean; label: string }

const HYGIENE_TYPES = ['seed_apt_np', 'seed_apt_recall', 'seed_apt_perio']
const DOCTOR_TYPES = ['seed_apt_filling', 'seed_apt_crown_prep', 'seed_apt_crown_seat', 'seed_apt_endo', 'seed_apt_ext', 'seed_apt_emerg', 'seed_apt_consult']

/** Weekly template blocks: doctors in OP1–OP3, oral surgery in OP4 on Thursdays, hygiene in H1–H2. */
function templateBlocks(): BlockSeed[] {
  const out: BlockSeed[] = []
  const add = (loc: string, weekdays: number[], op: string, provider: string, start: string, end: string, types: string[], online: boolean, label: string) => {
    for (const w of weekdays) out.push({ id: `seed_blk_${loc}_${op}_${w}_${start.replace(':', '')}`, weekday: w, operatoryId: `seed_op_${loc}_${op}`, providerId: provider, startLocal: start, endLocal: end, types, online, label })
  }
  // Tampa: Mon–Thu full days, Fri morning.
  add('tpa', [1, 2, 3, 4], 'op1', 'seed_prov_okafor', '08:00', '12:00', DOCTOR_TYPES, false, 'Dr. Okafor AM')
  add('tpa', [1, 2, 3, 4], 'op1', 'seed_prov_okafor', '13:00', '17:00', DOCTOR_TYPES, false, 'Dr. Okafor PM')
  add('tpa', [1, 2, 3, 4], 'op2', 'seed_prov_reyes', '08:00', '12:00', DOCTOR_TYPES, false, 'Dr. Reyes AM')
  add('tpa', [1, 2, 3, 4], 'op2', 'seed_prov_reyes', '13:00', '17:00', DOCTOR_TYPES, true, 'Dr. Reyes PM (online emergencies)')
  add('tpa', [1, 3], 'op3', 'seed_prov_okafor', '13:00', '16:00', ['seed_apt_consult', 'seed_apt_emerg'], true, 'Consults and emergencies')
  add('tpa', [4], 'op4', 'seed_prov_reyes', '08:00', '12:00', ['seed_apt_ext', 'seed_apt_endo'], false, 'Surgery morning')
  add('tpa', [5], 'op1', 'seed_prov_okafor', '08:00', '13:00', DOCTOR_TYPES, false, 'Friday short day')
  add('tpa', [1, 2, 3, 4], 'h1', 'seed_prov_hale', '08:00', '12:00', HYGIENE_TYPES, true, 'Hygiene AM')
  add('tpa', [1, 2, 3, 4], 'h1', 'seed_prov_hale', '13:00', '17:00', HYGIENE_TYPES, true, 'Hygiene PM')
  add('tpa', [1, 2, 3, 4], 'h2', 'seed_prov_brandt', '08:00', '12:00', HYGIENE_TYPES, true, 'Hygiene AM')
  add('tpa', [1, 2, 3, 4], 'h2', 'seed_prov_brandt', '13:00', '17:00', HYGIENE_TYPES, false, 'Hygiene PM')
  add('tpa', [5], 'h1', 'seed_prov_ortiz', '08:00', '13:00', HYGIENE_TYPES, true, 'Friday hygiene')
  // St. Petersburg: Mon–Thu.
  add('stp', [1, 2, 3, 4], 'op1', 'seed_prov_natarajan', '08:00', '12:00', DOCTOR_TYPES, false, 'Dr. Natarajan AM')
  add('stp', [1, 2, 3, 4], 'op1', 'seed_prov_natarajan', '13:00', '17:00', DOCTOR_TYPES, true, 'Dr. Natarajan PM')
  add('stp', [2, 4], 'op2', 'seed_prov_okafor', '08:00', '12:00', DOCTOR_TYPES, false, 'Dr. Okafor (St. Pete)')
  add('stp', [1, 2, 3, 4], 'h1', 'seed_prov_kim', '08:00', '12:00', HYGIENE_TYPES, true, 'Hygiene AM')
  add('stp', [1, 2, 3, 4], 'h1', 'seed_prov_kim', '13:00', '17:00', HYGIENE_TYPES, true, 'Hygiene PM')
  add('stp', [1, 3], 'h2', 'seed_prov_ortiz', '08:00', '12:00', HYGIENE_TYPES, false, 'Hygiene AM')
  return out
}

// ── Patients ────────────────────────────────────────────────────────────────────────────────────

const FIRST_F = ['Ava', 'Sofia', 'Maria', 'Grace', 'Chloe', 'Layla', 'Isabel', 'Nora', 'Hannah', 'Leah', 'Camila', 'Zoe', 'Ruth', 'Elena', 'Priya', 'Mei', 'Aaliyah', 'Ivy', 'June', 'Rosa']
const FIRST_M = ['Liam', 'Noah', 'Mateo', 'Elijah', 'James', 'Lucas', 'Henry', 'Owen', 'Samuel', 'Diego', 'Marcus', 'Theo', 'Isaac', 'Andre', 'Kai', 'Omar', 'Felix', 'Hugo', 'Ezra', 'Walter']
const LAST = ['Alvarez', 'Bennett', 'Castillo', 'Dawson', 'Ellison', 'Fuentes', 'Garrison', 'Holloway', 'Ibarra', 'Jennings', 'Kowalski', 'Lindgren', 'Mercado', 'Nakamura', 'Oyelaran', 'Pruitt', 'Quintero', 'Ramsey', 'Sandoval', 'Thibodeaux', 'Underwood', 'Valencia', 'Whitfield', 'Yamada', 'Zelinski', 'Abernathy', 'Beaumont', 'Calloway', 'Delacroix', 'Espinoza', 'Fairbanks', 'Guerrero', 'Hargrove', 'Iverson', 'Jardine', 'Kaminski', 'Lachance', 'Montoya', 'Nightingale', 'Ortega']

/** A tiny deterministic PRNG so the sample is the same every time it loads. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type SeedPatient = {
  id: string; chart: string; familyId: string; first: string; last: string; preferred: string; dob: string; sex: 'female' | 'male'; language: string
  homeLocationId: string; status: 'active' | 'inactive' | 'prospect' | 'deceased'; dateOfDeath?: string; email?: string; mobile?: string; guarantorOf?: string | null
  relationship: 'self' | 'parent' | 'spouse'; alerts: { kind: string; severity: 'info' | 'caution' | 'critical'; text: string }[]
}

/** About 240 people in 70 households, two duplicate pairs and one deceased patient (BUILD-PLAN §5). */
export function samplePatients(today: string): SeedPatient[] {
  const rand = rng(20261107)
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]
  const year = Number(today.slice(0, 4))
  const dobFor = (age: number) => {
    const month = 1 + Math.floor(rand() * 12)
    const dayOf = 1 + Math.floor(rand() * 28)
    return `${year - age}-${String(month).padStart(2, '0')}-${String(dayOf).padStart(2, '0')}`
  }
  const out: SeedPatient[] = []
  let n = 0
  const phone = () => `+1813555${String(1000 + Math.floor(rand() * 8999)).slice(0, 4)}`
  for (let f = 0; f < 70; f += 1) {
    const last = LAST[f % LAST.length] + (f >= LAST.length ? '-' + LAST[(f * 7) % LAST.length] : '')
    const familyId = `seed_fam_${String(f + 1).padStart(3, '0')}`
    const homeLocationId = f % 3 === 2 ? 'seed_loc_stp' : 'seed_loc_tpa'
    const language = f % 6 === 1 ? 'es' : 'en'
    const size = 1 + Math.floor(rand() * 6) // 1–6
    const adults = Math.min(size, size >= 3 ? 2 : 1 + Math.floor(rand() * 2))
    let head: string | null = null
    for (let m = 0; m < size; m += 1) {
      n += 1
      const id = `seed_pt_${String(n).padStart(4, '0')}`
      const isAdult = m < adults
      const sex = (m + f) % 2 === 0 ? 'female' : 'male'
      const first = sex === 'female' ? pick(FIRST_F) : pick(FIRST_M)
      const age = isAdult ? 24 + Math.floor(rand() * 64) : 3 + Math.floor(rand() * 14)
      const slug = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '')
      const alerts: SeedPatient['alerts'] = []
      if (isAdult && rand() < 0.08) alerts.push({ kind: 'premedication', severity: 'critical', text: 'Premedicate before invasive procedures (joint replacement); confirm with the orthopaedic surgeon.' })
      if (isAdult && rand() < 0.07) alerts.push({ kind: 'anticoagulant', severity: 'caution', text: 'Takes an anticoagulant; check the latest INR before extractions.' })
      if (rand() < 0.04) alerts.push({ kind: 'latex', severity: 'critical', text: 'Latex allergy: use nitrile gloves and latex-free dam.' })
      out.push({
        id, chart: String(1000 + n), familyId, first, last, preferred: '', dob: dobFor(age), sex, language, homeLocationId,
        status: rand() < 0.08 ? 'inactive' : 'active',
        email: isAdult ? personalEmail(slug, rand) : undefined, mobile: isAdult ? phone() : undefined,
        guarantorOf: m === 0 ? null : head, relationship: m === 0 ? 'self' : isAdult ? 'spouse' : 'parent', alerts,
      })
      if (m === 0) head = id
    }
  }
  // Two suspected duplicate pairs (same person registered twice) for the merge workflow.
  const dupSource = [out[4], out[40]]
  dupSource.forEach((p, i) => {
    n += 1
    out.push({ ...p, id: `seed_pt_${String(n).padStart(4, '0')}`, chart: String(1000 + n), first: i === 0 ? p.first.slice(0, Math.max(3, p.first.length - 1)) : p.first, status: 'prospect', guarantorOf: null, relationship: 'self', alerts: [], email: p.email, mobile: undefined })
  })
  // One deceased patient (outreach stops; future visits cancelled).
  const deceased = out.find(p => p.relationship === 'self' && Number(p.dob.slice(0, 4)) < year - 75)
  if (deceased) {
    deceased.status = 'deceased'
    deceased.dateOfDeath = addDays(today, -40)
  }
  return out
}

// ── Loader ──────────────────────────────────────────────────────────────────────────────────────

export async function seedPhase1(uow: UnitOfWork, actor: Actor) {
  const { tx, now } = uow
  const today = localDate(TZ, now)
  const created: Record<string, number> = { operatories: 0, appointmentTypes: 0, templates: 0, blocks: 0, goals: 0, closures: 0, patients: 0, contacts: 0, consents: 0, alerts: 0, appointments: 0, asap: 0, bookingPolicies: 0, messageTemplates: 0, storefront: 0, portal: 0 }

  // Operatories and types.
  const haveOps = new Set((await tx.operatory.findMany({ where: { id: { in: OPERATORIES.map(o => o.id) } }, select: { id: true } })).map(o => o.id))
  const newOps = OPERATORIES.filter(o => !haveOps.has(o.id))
  if (newOps.length) {
    await tx.operatory.createMany({ data: newOps.map(o => ({ ...o, isSynthetic: true })) })
    created.operatories = newOps.length
  }
  const haveTypes = new Set((await tx.appointmentType.findMany({ where: { id: { in: APPOINTMENT_TYPES.map(t => t.id) } }, select: { id: true } })).map(t => t.id))
  for (const t of APPOINTMENT_TYPES.filter(type => !haveTypes.has(type.id))) {
    await tx.appointmentType.create({ data: { id: t.id, code: t.code, name: t.name, publicName: t.publicName, category: t.category, defaultPattern: t.pattern as never, defaultDurationUnits: patternUnits(t.pattern as never), onlineBookable: t.onlineBookable, newPatientOnly: t.newPatientOnly, requiresDentistOnSite: t.requiresDentistOnSite, defaultProductionMinor: t.production, colour: t.colour, isSynthetic: true } })
    created.appointmentTypes += 1
  }

  // Templates: one active template per location from the first of last month.
  const effectiveFrom = `${addDays(today, -60).slice(0, 7)}-01`
  const blocks = templateBlocks()
  for (const loc of ['tpa', 'stp'] as const) {
    const templateId = `seed_tpl_${loc}`
    if (await tx.scheduleTemplate.findUnique({ where: { id: templateId } })) continue
    await tx.scheduleTemplate.create({ data: { id: templateId, locationId: `seed_loc_${loc}`, name: loc === 'tpa' ? 'Tampa standard week' : 'St. Petersburg standard week', effectiveFrom: new Date(`${effectiveFrom}T00:00:00Z`), status: 'active', publishedAt: now, isSynthetic: true } })
    const mine = blocks.filter(x => x.operatoryId.startsWith(`seed_op_${loc}_`))
    await tx.templateBlock.createMany({ data: mine.map(b => ({ id: b.id, templateId, weekday: b.weekday, operatoryId: b.operatoryId, providerId: b.providerId, startLocal: b.startLocal, endLocal: b.endLocal, label: b.label, onlineBookable: b.online })) })
    // Allowed types (implicit many-to-many: A = AppointmentType, B = TemplateBlock), one statement.
    const pairs = mine.flatMap(b => b.types.map(t => [t, b.id] as const))
    await tx.$executeRawUnsafe(`INSERT INTO "_TemplateBlock_allowedTypes" ("A", "B") SELECT * FROM unnest($1::text[], $2::text[]) ON CONFLICT DO NOTHING`, pairs.map(x => x[0]), pairs.map(x => x[1]))
    created.blocks += mine.length
    auditCreate(uow, actor, 'ScheduleTemplate', templateId, 'template.published', { location: loc, effectiveFrom }, meta)
    created.templates += 1
  }

  // Production goals (per provider per weekday) and a closure (Thanksgiving-style holiday).
  const goals = [
    ['seed_prov_okafor', 'seed_loc_tpa', 520_000n], ['seed_prov_reyes', 'seed_loc_tpa', 420_000n], ['seed_prov_hale', 'seed_loc_tpa', 160_000n], ['seed_prov_brandt', 'seed_loc_tpa', 150_000n],
    ['seed_prov_natarajan', 'seed_loc_stp', 400_000n], ['seed_prov_kim', 'seed_loc_stp', 150_000n],
  ] as const
  const goalRows = goals.flatMap(([providerId, locationId, goalMinor]) => [1, 2, 3, 4].map(weekday => ({ id: `seed_goal_${providerId.slice(10)}_${weekday}`, providerId, locationId, weekday, goalMinor })))
  created.goals = (await tx.productionGoal.createMany({ data: goalRows, skipDuplicates: true })).count
  const holiday = nextWeekday(addDays(today, 18), 4)
  if (!(await tx.closureDay.findUnique({ where: { id: 'seed_closure_holiday' } }))) {
    await tx.closureDay.create({ data: { id: 'seed_closure_holiday', date: new Date(`${holiday}T00:00:00Z`), reason: 'Practice holiday (all locations)', isHalfDay: false } })
    await tx.closureDay.create({ data: { id: 'seed_closure_training', locationId: 'seed_loc_stp', date: new Date(`${nextWeekday(addDays(today, 9), 3)}T00:00:00Z`), reason: 'Staff CPR training', isHalfDay: true, startLocal: '13:00', endLocal: '17:00' } })
    created.closures = 2
  }

  // Patients, families, guarantors, contacts, consents, alerts.
  const people = samplePatients(today)
  const havePatients = new Set((await tx.patient.findMany({ where: { id: { in: people.map(p => p.id) } }, select: { id: true } })).map(p => p.id))
  const fresh = people.filter(p => !havePatients.has(p.id))
  if (fresh.length) {
    const families = [...new Set(fresh.map(p => p.familyId))]
    const haveFamilies = new Set((await tx.familyGroup.findMany({ where: { id: { in: families } }, select: { id: true } })).map(f => f.id))
    const newFamilies = families.filter(id => !haveFamilies.has(id))
    if (newFamilies.length) await tx.familyGroup.createMany({ data: newFamilies.map(id => ({ id, name: `${people.find(p => p.familyId === id)!.last} household`, isSynthetic: true })) })
    await tx.patient.createMany({
      data: fresh.map(p => ({
        id: p.id, chartNumber: p.chart, status: p.status, firstName: p.first, lastName: p.last, preferredName: p.preferred, dateOfBirth: new Date(`${p.dob}T00:00:00Z`),
        sexAssignedAtBirth: p.sex, preferredLanguage: p.language, homeLocationId: p.homeLocationId, familyId: p.status === 'prospect' ? null : p.familyId,
        primaryProviderId: p.homeLocationId === 'seed_loc_tpa' ? 'seed_prov_okafor' : 'seed_prov_natarajan', dateOfDeath: p.dateOfDeath ? new Date(`${p.dateOfDeath}T00:00:00Z`) : null,
        statementHold: p.status === 'deceased', address: { line1: `${100 + Number(p.id.slice(-3))} Palmetto Way`, city: p.homeLocationId === 'seed_loc_tpa' ? 'Tampa' : 'St. Petersburg', state: 'FL', postal: '33600', country: 'US' } as never, isSynthetic: true,
      })),
    })
    created.patients = fresh.length
    await tx.guarantor.createMany({ data: fresh.filter(p => p.relationship === 'self').map(p => ({ id: `seed_gtr_${p.id.slice(8)}`, patientId: p.id, isSynthetic: true })) })
    const startsOn = new Date(`${addDays(today, -700)}T00:00:00Z`)
    await tx.guarantorLink.createMany({
      data: fresh.map(p => ({ id: `seed_gl_${p.id.slice(8)}`, patientId: p.id, guarantorId: `seed_gtr_${(p.guarantorOf ?? p.id).slice(8)}`, relationship: p.relationship, status: 'active', startsOn })),
    })
    const contacts = fresh.flatMap(p => [
      ...(p.email ? [{ id: `seed_cp_${p.id.slice(8)}_e`, patientId: p.id, kind: 'email', value: p.email, valueNormalized: p.email, isPrimary: true, isActive: true }] : []),
      ...(p.mobile ? [{ id: `seed_cp_${p.id.slice(8)}_m`, patientId: p.id, kind: 'mobile', value: `(${p.mobile.slice(2, 5)}) ${p.mobile.slice(5, 8)}-${p.mobile.slice(8)}`, valueNormalized: p.mobile, isPrimary: true, isActive: true }] : []),
    ])
    await tx.contactPoint.createMany({ data: contacts })
    created.contacts = contacts.length
    // Reminder consent on most contacts; a few patients opted out of texts.
    const consents = contacts.filter((c, i) => p_alive(fresh, c.patientId) && (c.kind === 'email' || i % 9 !== 0)).map(c => ({
      id: `seed_cg_${c.id.slice(8)}`, contactPointId: c.id, channel: c.kind === 'email' ? 'email' : 'sms', purpose: 'appointment_reminders', status: 'granted', source: 'intake_form',
      evidence: { form: 'paper intake', note: 'Sample practice: synthetic data' } as never, grantedAt: new Date(`${addDays(today, -400)}T15:00:00Z`),
    }))
    await tx.consentGrant.createMany({ data: consents })
    created.consents = consents.length
    const alerts = fresh.flatMap(p => p.alerts.map((a, i) => ({ id: `seed_al_${p.id.slice(8)}_${i}`, patientId: p.id, kind: a.kind, severity: a.severity, text: a.text, source: 'history_answer', activeFrom: new Date(`${addDays(today, -300)}T12:00:00Z`) })))
    if (alerts.length) await tx.patientAlert.createMany({ data: alerts })
    created.alerts = alerts.length
    auditCreate(uow, actor, 'Patient', 'seed', 'patients.sample_loaded', { patients: fresh.length, families: newFamilies.length, contacts: contacts.length }, meta)
  }

  // Appointments: three weeks back, two weeks ahead, laid out by the engine.
  if (!(await tx.appointment.findFirst({ where: { id: { startsWith: 'seed_appt_' } }, select: { id: true } }))) {
    created.appointments = await seedAppointments(uow, people, today)
  }

  // ASAP list.
  const asapPatients = people.filter(p => p.status === 'active').slice(30, 35)
  for (const [i, p] of asapPatients.entries()) {
    const id = `seed_asap_${i + 1}`
    if (await tx.asapEntry.findUnique({ where: { id } })) continue
    await tx.asapEntry.create({ data: { id, patientId: p.id, locationId: p.homeLocationId, appointmentTypeId: i % 2 ? 'seed_apt_filling' : 'seed_apt_recall', preferredWindows: [{ weekday: 1 + (i % 4), from: i % 2 ? '08:00' : '13:00', to: i % 2 ? '12:00' : '17:00' }] as never, note: i === 0 ? 'Can come in on 30 minutes notice' : '', status: 'active', priority: 5 - i, isSynthetic: true } })
    created.asap += 1
  }

  // Online booking policy, message templates, a storefront record (data only; no pages).
  for (const loc of ['seed_loc_tpa', 'seed_loc_stp']) {
    const id = `seed_obp_${loc.slice(9)}`
    if (await tx.onlineBookingPolicy.findUnique({ where: { id } })) continue
    await tx.onlineBookingPolicy.create({ data: { id, locationId: loc, newPatientAllowed: true, leadTimeHours: 4, horizonDays: 60, holdMinutes: 10, depositMinor: 0n, requireInsuranceCapture: false, rateLimit: { perClientPerHour: 30, perContactPerDay: 5, globalPerMinute: 120 } as never, isActive: true, appointmentTypes: { connect: APPOINTMENT_TYPES.filter(t => t.onlineBookable).map(t => ({ id: t.id })) } } })
    created.bookingPolicies += 1
  }
  const templates = [
    { id: 'seed_mt_reminder_email', key: 'appointment.reminder', channel: 'email', subject: 'Your visit at {{location.name}}', body: 'Hi {{patient.preferredName}},\n\nThis is a reminder of your visit at {{location.name}} on {{appointment.when}}.\nReply C to confirm, or call {{location.phone}} if you need to change it.\n\nBayview Family Dental' },
    { id: 'seed_mt_reminder_sms', key: 'appointment.reminder', channel: 'sms', subject: '', body: 'Bayview Family Dental: reminder of your visit {{appointment.when}}. Reply C to confirm or call {{location.phone}}. Reply STOP to opt out.' },
  ]
  for (const t of templates) {
    if (await tx.messageTemplate.findUnique({ where: { id: t.id } })) continue
    await tx.messageTemplate.create({ data: { ...t, purpose: 'appointment_reminders', phiLevel: 'minimal', locale: 'en', status: 'active' } })
    created.messageTemplates += 1
  }
  if (!(await tx.storefrontSite.findUnique({ where: { id: 'seed_site' } }))) {
    await tx.storefrontSite.create({ data: { id: 'seed_site', slug: 'bayview', headline: 'Family dentistry on Tampa Bay', about: 'Sample practice: synthetic data.', services: [{ name: 'Cleanings and check-ups' }, { name: 'Fillings and crowns' }, { name: 'Emergency visits' }] as never, isPublished: true, isSynthetic: true, providersShown: { connect: [{ id: 'seed_prov_okafor' }, { id: 'seed_prov_reyes' }, { id: 'seed_prov_natarajan' }, { id: 'seed_prov_hale' }] } } })
    created.storefront = 1
  }
  // Portal: one parent with self + guardian scope for a child.
  const parent = people.find(p => p.relationship === 'self' && p.email && people.some(c => c.guarantorOf === p.id && c.relationship === 'parent'))
  if (parent && !(await tx.portalAccount.findUnique({ where: { id: 'seed_portal_1' } }))) {
    const child = people.find(c => c.guarantorOf === parent.id && c.relationship === 'parent')!
    await tx.portalAccount.create({ data: { id: 'seed_portal_1', email: parent.email!, status: 'active', identityVerifiedAt: now, isSynthetic: true } })
    await tx.portalScope.create({ data: { id: 'seed_ps_self', accountId: 'seed_portal_1', patientId: parent.id, relationship: 'self', capabilities: ['appointments', 'preferences', 'forms', 'statements_pay'] as never, status: 'active' } })
    await tx.portalScope.create({ data: { id: 'seed_ps_child', accountId: 'seed_portal_1', patientId: child.id, relationship: 'guardian', capabilities: ['appointments', 'preferences', 'forms'] as never, status: 'active', validUntilMajority: true } })
    created.portal = 1
  }
  return created
}

const p_alive = (people: SeedPatient[], id: string) => people.find(p => p.id === id)?.status !== 'deceased'

function nextWeekday(date: string, weekday: number) {
  let d = date
  while (weekdayOf(d) !== weekday) d = addDays(d, 1)
  return d
}

/**
 * Lay out appointments day by day: for each template window, place visits back to back with gaps,
 * using planSegments for provider time (exam float included). Past days get outcomes; future days
 * are scheduled/confirmed, leaving open slots.
 */
async function seedAppointments(uow: UnitOfWork, people: SeedPatient[], today: string) {
  const { tx, now } = uow
  const rand = rng(77)
  const types = new Map<string, (typeof APPOINTMENT_TYPES)[number]>(APPOINTMENT_TYPES.map(t => [t.id, t]))
  const blocks = templateBlocks()
  const providerType = (id: string) => (id.includes('hale') || id.includes('brandt') || id.includes('ortiz') || id.includes('kim') ? 'hygienist' : 'dentist')
  const bookable = people.filter(p => p.status === 'active' || p.status === 'inactive')
  const patientBusy = new Map<string, [number, number][]>()
  const providerBusy: ProviderBusy[] = []
  let count = 0
  let pi = 0
  const appointments: any[] = []
  const segments: any[] = []
  const broken: any[] = []
  const holiday = await tx.closureDay.findMany({ select: { date: true, isHalfDay: true, startLocal: true, endLocal: true, locationId: true } })
  for (let offset = -21; offset <= 14; offset += 1) {
    const date = addDays(today, offset)
    for (const loc of ['tpa', 'stp'] as const) {
      const input: TemplateBlockInput[] = blocks.filter(b => b.operatoryId.startsWith(`seed_op_${loc}_`)).map(b => ({ id: b.id, weekday: b.weekday, operatoryId: b.operatoryId, providerId: b.providerId, providerType: providerType(b.providerId), startLocal: b.startLocal, endLocal: b.endLocal, allowedTypeIds: b.types, onlineBookable: b.online }))
      const closures = holiday.filter(c => !c.locationId || c.locationId === `seed_loc_${loc}`).map(c => ({ date: c.date.toISOString().slice(0, 10), isHalfDay: c.isHalfDay, startLocal: c.startLocal, endLocal: c.endLocal }))
      const windows = materialiseBlocks(date, TZ, input, closures)
      const fill = offset < 0 ? 0.85 : offset <= 2 ? 0.8 : Math.max(0.25, 0.75 - offset * 0.04)
      for (const w of windows) {
        let at = w.startMs
        while (at < w.endMs) {
          const typeId = pickType(w, rand)
          const type = types.get(typeId)!
          const pattern = parsePattern(type.pattern)
          const endMs = at + patternUnits(pattern) * 10 * MS_PER_MINUTE
          if (endMs > w.endMs) break
          if (rand() > fill) { at += 10 * MS_PER_MINUTE * (1 + Math.floor(rand() * 3)); continue }
          const plan = planSegments({ pattern, unitMinutes: 10, startMs: at, providerId: w.providerId, windows, providerBusy })
          // Leave tomorrow's hygiene 10:00 slot open so the sample always shows open time.
          const patient = nextPatient(bookable, w, at, endMs, patientBusy, () => pi++)
          if (plan.clashes.length || !patient || (offset === 1 && w.operatoryId.endsWith('_h1') && at === w.startMs + 120 * MS_PER_MINUTE)) { at += 10 * MS_PER_MINUTE; continue }
          const id = `seed_appt_${String(++count).padStart(5, '0')}`
          const status = offset < 0 ? pastOutcome(rand) : offset === 0 ? (at < now.getTime() ? 'completed' : at < now.getTime() + 3_600_000 ? 'arrived' : 'confirmed') : rand() < (offset <= 2 ? 0.6 : 0.3) ? 'confirmed' : 'scheduled'
          const brokenKind = status === 'broken' ? (rand() < 0.6 ? 'no_show' : 'late_cancel') : ''
          const active = ['scheduled', 'confirmed', 'arrived', 'seated', 'ready_for_checkout'].includes(status)
          appointments.push({
            id, ref: `APT-${new Date().getUTCFullYear()}-${String(count).padStart(6, '0')}`, patientId: patient.id, locationId: `seed_loc_${loc}`, operatoryId: w.operatoryId, typeId, startsAt: new Date(at), endsAt: new Date(endMs),
            localDate: new Date(`${date}T00:00:00Z`), status, brokenKind,
            confirmedAt: status === 'confirmed' ? new Date(at - 86_400_000) : null, confirmationMethod: status === 'confirmed' ? (rand() < 0.6 ? 'sms_reply' : 'phone') : '',
            arrivedAt: ['arrived', 'completed'].includes(status) ? new Date(at - 5 * MS_PER_MINUTE) : null, completedAt: status === 'completed' ? new Date(endMs) : null,
            cancelledAt: status === 'cancelled' ? new Date(at - 3 * 86_400_000) : null, cancelReason: status === 'cancelled' ? 'Patient asked to move to next month' : '',
            primaryProviderId: w.providerId, supervisingDentistId: plan.examProviderId, source: 'import', productionScheduledMinor: type.production, warnings: [], isSynthetic: true,
          })
          plan.segments.forEach((seg, i) => segments.push({ id: `${id}_s${i}`, appointmentId: id, role: seg.role, providerId: seg.providerId, startsAt: new Date(seg.startMs), endsAt: new Date(seg.endMs), concurrencyKind: seg.concurrencyKind, isActive: active || status === 'completed' }))
          if (status === 'broken') broken.push({ id: `${id}_b`, appointmentId: id, patientId: patient.id, kind: brokenKind, at: new Date(at), reason: 'Sample practice: synthetic data' })
          if (active || status === 'completed') {
            for (const seg of plan.segments) if (seg.providerId) providerBusy.push({ providerId: seg.providerId, startMs: seg.startMs, endMs: seg.endMs, concurrencyKind: seg.concurrencyKind, role: seg.role })
            patientBusy.set(patient.id, [...(patientBusy.get(patient.id) ?? []), [at, endMs]])
          }
          at = endMs
        }
      }
    }
  }
  // Bulk insert: the exclusion constraints still check every row.
  for (let i = 0; i < appointments.length; i += 500) await tx.appointment.createMany({ data: appointments.slice(i, i + 500) })
  for (let i = 0; i < segments.length; i += 1000) await tx.appointmentSegment.createMany({ data: segments.slice(i, i + 1000) })
  if (broken.length) await tx.brokenAppointmentEvent.createMany({ data: broken })
  // First and last visit dates follow from the completed history, in the visit's local calendar.
  await tx.$executeRawUnsafe(`
    UPDATE "Patient" p SET "firstVisitOn" = v.first, "lastVisitOn" = v.last
    FROM (SELECT a.patient, min((a."startsAt" AT TIME ZONE 'UTC' AT TIME ZONE l."timeZone")::date) AS first, max((a."startsAt" AT TIME ZONE 'UTC' AT TIME ZONE l."timeZone")::date) AS last
          FROM "Appointment" a JOIN "Location" l ON l.id = a.location WHERE a.status = 'completed' AND a.id LIKE 'seed_%' GROUP BY a.patient) v
    WHERE p.id = v.patient AND p."isSynthetic"`)
  return count
}

const MAIL_DOMAINS = ['gmail.com', 'gmail.com', 'gmail.com', 'yahoo.com', 'outlook.com', 'icloud.com', 'hotmail.com', 'aol.com', 'comcast.net']
/** A personal address the way people actually pick them: first.last, firstlast, f.last, with a number sometimes. */
function personalEmail(slug: string, rand: () => number) {
  const [first, last] = slug.split('.')
  const forms = [`${first}.${last}`, `${first}${last}`, `${first[0]}${last}`, `${first}.${last}${10 + Math.floor(rand() * 80)}`, `${first}${last[0]}${Math.floor(rand() * 9000) + 1000}`]
  return `${forms[Math.floor(rand() * forms.length)]}@${MAIL_DOMAINS[Math.floor(rand() * MAIL_DOMAINS.length)]}`
}

function pickType(w: OpenWindow, rand: () => number) {
  const allowed = w.allowedTypeIds
  if (allowed.includes('seed_apt_recall')) {
    const r = rand()
    return r < 0.7 ? 'seed_apt_recall' : r < 0.85 ? 'seed_apt_perio' : 'seed_apt_np'
  }
  const weights: [string, number][] = [['seed_apt_filling', 0.4], ['seed_apt_crown_prep', 0.15], ['seed_apt_crown_seat', 0.1], ['seed_apt_endo', 0.08], ['seed_apt_ext', 0.1], ['seed_apt_emerg', 0.1], ['seed_apt_consult', 0.07]]
  const options = weights.filter(([id]) => allowed.includes(id))
  const total = options.reduce((s, [, x]) => s + x, 0)
  let r = rand() * total
  for (const [id, x] of options) {
    r -= x
    if (r <= 0) return id
  }
  return options[0]?.[0] ?? allowed[0]
}

function pastOutcome(rand: () => number) {
  const r = rand()
  return r < 0.86 ? 'completed' : r < 0.93 ? 'broken' : 'cancelled'
}

function nextPatient(people: SeedPatient[], w: OpenWindow, startMs: number, endMs: number, busy: Map<string, [number, number][]>, next: () => number) {
  const location = w.operatoryId.includes('_stp_') ? 'seed_loc_stp' : 'seed_loc_tpa'
  for (let tries = 0; tries < people.length; tries += 1) {
    const p = people[next() % people.length]
    if (p.homeLocationId !== location) continue
    if ((busy.get(p.id) ?? []).some(([s, e]) => s < endMs && startMs < e)) continue
    return p
  }
  return null
}
