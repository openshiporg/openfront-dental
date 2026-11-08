import { requirePermission } from '../lib/actor'
import { canonicalJson, sha256 } from '../lib/canonical'
import { auditCreate, lockRow, transition } from '../lib/cas'
import { command } from '../lib/command'
import { DomainError, Codes } from '../lib/errors'
import { SITES, suggestClassification, summarize, validateMeasurement, type ClassificationInputs } from '../lib/perio'
import { normalizeTooth } from '../lib/teeth'
import { addDays } from '../lib/time'
import { dayOf, locationToday, oneOf, requireReason, verifyPassword } from './clinicalShared'
import { assertLocation, assertPatientInScope, optionalText, requireText, staff, type Ctx } from './shared'

/*
 * Notes, perio, anaesthetic and vitals, and medical history (SM§3.4–3.9; SCHEMA §5.2–§5.6; I-C3–I-C6).
 * A signed note is never edited: it is amended by a new note or marked entered in error.
 */

// ── Clinical notes ─────────────────────────────────────────────────────────────────────────────────

export async function draftClinicalNote(_root: unknown, args: { patientId: string; appointmentId?: string | null; templateVersionId?: string | null; title?: string | null; body?: string | null; amendsNoteId?: string | null; refersToAt?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds, session } = staff(context)
  requirePermission(actor, 'canChart', 'canSignClinicalNotes')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'note.draft', actor, idempotencyKey, params }, async uow => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId)
    let body = optionalText(args.body, 20_000)
    if (args.templateVersionId && !body) {
      const template = await uow.tx.noteTemplateVersion.findUnique({ where: { id: args.templateVersionId } })
      if (!template || template.status !== 'published') throw new DomainError(Codes.INVALID_INPUT, 'That note template is not available.', { field: 'templateVersionId' })
      body = template.body
    }
    if (args.amendsNoteId) {
      const original = await uow.tx.clinicalNote.findUnique({ where: { id: args.amendsNoteId } })
      if (!original || original.patientId !== args.patientId) throw new DomainError(Codes.NOT_FOUND, 'The note to amend was not found on this chart.')
      if (original.status !== 'signed') throw new DomainError(Codes.INVALID_TRANSITION, 'Only a signed note can be amended.')
    }
    const provider = await uow.tx.providerProfile.findFirst({ where: { userId: session.itemId } })
    const note = await uow.tx.clinicalNote.create({
      data: {
        patientId: args.patientId, appointmentId: args.appointmentId ?? null, authorId: actor.kind === 'user' ? actor.userId : null, providerId: provider?.id ?? null, templateId: args.templateVersionId ?? null,
        title: optionalText(args.title, 200), body, status: 'draft', amendsId: args.amendsNoteId ?? null, refersToAt: args.refersToAt ? new Date(args.refersToAt) : null,
      },
    })
    auditCreate(uow, actor, 'ClinicalNote', note.id, 'note.drafted', { patientId: args.patientId, amends: args.amendsNoteId ?? null })
    return { noteId: note.id }
  })
  return { replay: result.replay, ...result.value }
}

export async function updateNoteDraft(_root: unknown, args: { noteId: string; expectedVersion: number; title?: string | null; body: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart', 'canSignClinicalNotes')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'note.update_draft', actor, idempotencyKey, params }, async uow => {
    const note = await lockRow<any>(uow.tx, 'ClinicalNote', args.noteId)
    await assertPatientInScope(uow.tx, locationIds, note.patientId)
    if (note.status !== 'draft') throw new DomainError(Codes.INVALID_TRANSITION, 'A signed note cannot be edited. Add an amendment.')
    if (note.version !== args.expectedVersion) throw new DomainError(Codes.STALE_STATE, 'The note changed since you opened it.', { currentVersion: note.version })
    await uow.tx.clinicalNote.update({ where: { id: note.id }, data: { body: optionalText(args.body, 20_000), title: optionalText(args.title ?? note.title, 200), version: { increment: 1 } } })
    uow.audit({ eventType: 'note.draft_saved', entityType: 'ClinicalNote', entityId: note.id, actorUserId: actor.kind === 'user' ? actor.userId : null, after: { bodyLength: String(args.body ?? '').length } })
    return { noteId: note.id, version: note.version + 1 }
  })
  return { replay: result.replay, ...result.value }
}

/**
 * Sign a note (SM§3.5): re-check the signer's password, hash the content, stamp the time. The note is
 * a late entry if it refers to a time before the sign window (24 hours by default).
 */
export async function signClinicalNote(_root: unknown, args: { noteId: string; expectedVersion: number; password: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canSignClinicalNotes')
  if (actor.kind !== 'user') throw new DomainError(Codes.AGENT_CANNOT_APPROVE, 'Only a clinician signs a note.')
  await verifyPassword(context as never, actor.userId, args.password)
  const { idempotencyKey, password: _password, ...params } = args
  const result = await command(context.prisma, { name: 'note.sign', actor, idempotencyKey, params }, async uow => {
    const note = await lockRow<any>(uow.tx, 'ClinicalNote', args.noteId)
    await assertPatientInScope(uow.tx, locationIds, note.patientId)
    if (!note.body.trim()) throw new DomainError(Codes.GUARD_FAILED, 'Write the note before signing it.')
    const settings = await uow.tx.practiceSettings.findFirst()
    const hours = settings?.noteSignHours ?? 24
    const reference = note.refersToAt ?? note.createdAt
    const late = uow.now.getTime() - new Date(reference).getTime() > hours * 3_600_000
    const bodyHash = sha256(canonicalJson({ patientId: note.patientId, title: note.title, body: note.body, amends: note.amendsId }))
    await transition<any>(uow, { model: 'ClinicalNote', id: note.id, from: ['draft'], to: 'signed', expectedVersion: args.expectedVersion, actor, eventType: 'note.signed', metadata: { bodyHash, late }, data: { bodyHash, signedAt: uow.now, signatureMethod: 'password_reauth', isLateEntry: late } })
    return { noteId: note.id, bodyHash, isLateEntry: late }
  })
  return { replay: result.replay, ...result.value }
}

export async function markNoteEnteredInError(_root: unknown, args: { noteId: string; expectedVersion: number; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canApproveClinicalCorrections')
  const reason = requireReason(args.reason)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'note.entered_in_error', actor, idempotencyKey, params }, async uow => {
    const note = await lockRow<any>(uow.tx, 'ClinicalNote', args.noteId)
    await assertPatientInScope(uow.tx, locationIds, note.patientId)
    await transition<any>(uow, { model: 'ClinicalNote', id: note.id, from: ['signed'], to: 'entered_in_error', expectedVersion: args.expectedVersion, actor, eventType: 'note.entered_in_error', reason, data: { errorReason: reason } })
    return { noteId: note.id }
  })
  return { replay: result.replay, ...result.value }
}

// ── Perio ──────────────────────────────────────────────────────────────────────────────────────────

export async function startPerioExam(_root: unknown, args: { patientId: string; locationId: string; examinerId: string; examDate?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManagePerio')
  assertLocation(locationIds, args.locationId)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'perio.start', actor, idempotencyKey, params }, async uow => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const examiner = await uow.tx.providerProfile.findUnique({ where: { id: args.examinerId } })
    if (!examiner || !examiner.isActive) throw new DomainError(Codes.INVALID_INPUT, 'Choose the examiner.', { field: 'examinerId' })
    const date = args.examDate || (await locationToday(uow.tx, args.locationId, uow.now))
    const clash = await uow.tx.perioExam.findFirst({ where: { patientId: args.patientId, examinerId: examiner.id, examDate: dayOf(date) }, orderBy: { revision: 'desc' } })
    if (clash && clash.status === 'in_progress') throw new DomainError(Codes.GUARD_FAILED, 'An exam by this examiner is already open for that day.')
    if (clash) throw new DomainError(Codes.GUARD_FAILED, 'A signed exam already exists for that day. Revise it instead.')
    const exam = await uow.tx.perioExam.create({ data: { patientId: args.patientId, locationId: args.locationId, examinerId: examiner.id, examDate: dayOf(date), revision: 1, status: 'in_progress' } })
    auditCreate(uow, actor, 'PerioExam', exam.id, 'perio.started', { patientId: args.patientId, examDate: date })
    return { examId: exam.id }
  })
  return { replay: result.replay, ...result.value }
}

/** Record a batch of site measurements and tooth findings (the grid saves a tooth at a time). */
export async function recordPerioMeasurements(_root: unknown, args: { examId: string; expectedVersion: number; measurements?: Record<string, unknown>[] | null; findings?: { tooth: string; mobility?: number | null; furcation?: Record<string, unknown> | null; missing?: boolean | null; implant?: boolean | null }[] | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManagePerio')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'perio.record', actor, idempotencyKey, params }, async uow => {
    const exam = await lockRow<any>(uow.tx, 'PerioExam', args.examId)
    assertLocation(locationIds, exam.locationId)
    if (exam.status !== 'in_progress') throw new DomainError(Codes.INVALID_TRANSITION, 'This exam is signed. Record a revision to change it.')
    if (exam.version !== args.expectedVersion) throw new DomainError(Codes.STALE_STATE, 'The exam changed since you opened it.', { currentVersion: exam.version })
    const measurements = (args.measurements ?? []).slice(0, 400).map(validateMeasurement)
    for (const m of measurements) {
      await uow.tx.perioSiteMeasurement.upsert({
        where: { examId_tooth_site: { examId: exam.id, tooth: m.tooth, site: m.site } },
        create: { examId: exam.id, ...m }, update: { probingDepthMm: m.probingDepthMm, gingivalMarginMm: m.gingivalMarginMm, bleeding: m.bleeding, suppuration: m.suppuration, plaque: m.plaque },
      })
    }
    for (const f of (args.findings ?? []).slice(0, 40)) {
      const tooth = normalizeTooth(f.tooth)
      const mobility = f.mobility ?? null
      if (mobility !== null && (!Number.isInteger(mobility) || mobility < 0 || mobility > 3)) throw new DomainError(Codes.INVALID_INPUT, 'Mobility is graded 0 to 3.', { field: 'mobility' })
      const data = { mobility, furcation: (f.furcation ?? {}) as never, missing: f.missing === true, implant: f.implant === true }
      await uow.tx.perioToothFinding.upsert({ where: { examId_tooth: { examId: exam.id, tooth } }, create: { examId: exam.id, tooth, ...data }, update: data })
    }
    await uow.tx.perioExam.update({ where: { id: exam.id }, data: { version: { increment: 1 } } })
    uow.audit({ eventType: 'perio.recorded', entityType: 'PerioExam', entityId: exam.id, actorUserId: actor.kind === 'user' ? actor.userId : null, after: { sites: measurements.length, findings: (args.findings ?? []).length } })
    return { examId: exam.id, version: exam.version + 1, recorded: measurements.length }
  })
  return { replay: result.replay, ...result.value }
}

/** Sign (complete) a perio exam, and save the suggested AAP/EFP classification beside it for a clinician to confirm. */
export async function completePerioExam(_root: unknown, args: { examId: string; expectedVersion: number; password: string; classificationInputs?: Partial<ClassificationInputs> | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManagePerio')
  if (actor.kind !== 'user') throw new DomainError(Codes.AGENT_CANNOT_APPROVE, 'Only a clinician signs an exam.')
  await verifyPassword(context as never, actor.userId, args.password)
  const { idempotencyKey, password: _password, ...params } = args
  const result = await command(context.prisma, { name: 'perio.complete', actor, idempotencyKey, params }, async uow => {
    const exam = await lockRow<any>(uow.tx, 'PerioExam', args.examId)
    assertLocation(locationIds, exam.locationId)
    const sites = await uow.tx.perioSiteMeasurement.findMany({ where: { examId: exam.id } })
    if (!sites.length) throw new DomainError(Codes.GUARD_FAILED, 'Record at least one probing depth before signing.')
    const findings = await uow.tx.perioToothFinding.findMany({ where: { examId: exam.id } })
    const summary = summarize(sites.map(s => ({ tooth: s.tooth, site: s.site as (typeof SITES)[number], probingDepthMm: s.probingDepthMm, gingivalMarginMm: s.gingivalMarginMm, bleeding: s.bleeding, suppuration: s.suppuration, plaque: s.plaque })))
    const signatureHash = sha256(canonicalJson({ examId: exam.id, sites: sites.map(s => [s.tooth, s.site, s.probingDepthMm, s.gingivalMarginMm, s.bleeding]).sort(), findings: findings.map(f => [f.tooth, f.mobility]).sort() }))
    await transition<any>(uow, { model: 'PerioExam', id: exam.id, from: ['in_progress'], to: 'completed', expectedVersion: args.expectedVersion, actor, eventType: 'perio.completed', metadata: { signatureHash, summary }, data: { signedAt: uow.now, signedById: actor.userId, signatureHash } })
    const missing = findings.filter(f => f.missing).length
    const inputs: ClassificationInputs = { teethPresent: 32 - missing, maxCalMm: summary.maxCal, maxPdMm: Math.max(0, ...sites.map(s => s.probingDepthMm ?? 0)), sitesGe5: summary.sitesGe5, teethWithCalGe5: summary.teethWithCalGe5, ...(args.classificationInputs ?? {}) }
    const suggestion = suggestClassification(inputs)
    const classification = await uow.tx.perioClassification.create({ data: { examId: exam.id, suggestedStage: suggestion.stage, suggestedGrade: suggestion.grade, extent: suggestion.extent, inputs: { ...inputs, reasons: suggestion.reasons } as never, status: 'suggested' } })
    auditCreate(uow, actor, 'PerioClassification', classification.id, 'perio.classification_suggested', { stage: suggestion.stage, grade: suggestion.grade })
    return { examId: exam.id, classificationId: classification.id, signatureHash, summary }
  })
  return { replay: result.replay, ...result.value }
}

/** A clinician confirms the suggested stage and grade, or overrides them with their own judgement. */
export async function confirmPerioClassification(_root: unknown, args: { classificationId: string; expectedVersion: number; stage: string; grade: string; reason?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canSignClinicalNotes')
  if (actor.kind !== 'user') throw new DomainError(Codes.AGENT_CANNOT_APPROVE, 'Only a clinician confirms a diagnosis.')
  const stage = oneOf(args.stage, ['I', 'II', 'III', 'IV'] as const, 'stage')
  const grade = oneOf(args.grade, ['A', 'B', 'C'] as const, 'grade')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'perio.classification_confirm', actor, idempotencyKey, params }, async uow => {
    const row = await lockRow<any>(uow.tx, 'PerioClassification', args.classificationId)
    const exam = await uow.tx.perioExam.findUnique({ where: { id: row.examId } })
    assertLocation(locationIds, exam?.locationId)
    const overridden = stage !== row.suggestedStage || grade !== row.suggestedGrade
    if (overridden) requireReason(args.reason, 'reason for changing the suggestion')
    await transition<any>(uow, { model: 'PerioClassification', id: row.id, from: ['suggested'], to: overridden ? 'overridden' : 'confirmed', expectedVersion: args.expectedVersion, actor, eventType: overridden ? 'perio.classification_overridden' : 'perio.classification_confirmed', reason: args.reason ?? null, data: { confirmedStage: stage, confirmedGrade: grade, signedById: actor.userId, signedAt: uow.now } })
    return { classificationId: row.id, stage, grade, overridden }
  })
  return { replay: result.replay, ...result.value }
}

/** A signed exam is revised by a new exam row that points back at it; the original stays as it was signed. */
export async function reviseSignedPerioExam(_root: unknown, args: { examId: string; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManagePerio', 'canApproveClinicalCorrections')
  const reason = requireReason(args.reason)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'perio.revise', actor, idempotencyKey, params }, async uow => {
    const original = await lockRow<any>(uow.tx, 'PerioExam', args.examId)
    assertLocation(locationIds, original.locationId)
    if (original.status !== 'completed') throw new DomainError(Codes.INVALID_TRANSITION, 'Only a signed exam can be revised.')
    const latest = await uow.tx.perioExam.findFirst({ where: { patientId: original.patientId, examinerId: original.examinerId, examDate: original.examDate }, orderBy: { revision: 'desc' } })
    const exam = await uow.tx.perioExam.create({ data: { patientId: original.patientId, locationId: original.locationId, examinerId: original.examinerId, examDate: original.examDate, revision: (latest?.revision ?? 1) + 1, revisionOfId: original.id, status: 'in_progress' } })
    const sites = await uow.tx.perioSiteMeasurement.findMany({ where: { examId: original.id } })
    for (const s of sites) await uow.tx.perioSiteMeasurement.create({ data: { examId: exam.id, tooth: s.tooth, site: s.site, probingDepthMm: s.probingDepthMm, gingivalMarginMm: s.gingivalMarginMm, bleeding: s.bleeding, suppuration: s.suppuration, plaque: s.plaque } })
    const findings = await uow.tx.perioToothFinding.findMany({ where: { examId: original.id } })
    for (const f of findings) await uow.tx.perioToothFinding.create({ data: { examId: exam.id, tooth: f.tooth, mobility: f.mobility, furcation: (f.furcation ?? {}) as never, missing: f.missing, implant: f.implant } })
    await transition<any>(uow, { model: 'PerioExam', id: original.id, from: ['completed'], to: 'revised', expectedVersion: original.version, actor, eventType: 'perio.revised', reason })
    auditCreate(uow, actor, 'PerioExam', exam.id, 'perio.revision_started', { revisionOf: original.id }, { reason })
    return { examId: exam.id }
  })
  return { replay: result.replay, ...result.value }
}

// ── Anaesthetic and vitals ─────────────────────────────────────────────────────────────────────────

export async function logAnesthetic(_root: unknown, args: { patientId: string; appointmentId?: string | null; drug: string; concentration?: string | null; vasoconstrictor?: string | null; carpules: string; injectionSites?: string[] | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart')
  const drug = requireText(args.drug, 'anaesthetic', 120)
  const carpules = Number(args.carpules)
  if (!Number.isFinite(carpules) || carpules <= 0 || carpules > 10) throw new DomainError(Codes.INVALID_INPUT, 'Carpules must be more than 0 and no more than 10.', { field: 'carpules' })
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'anesthetic.log', actor, idempotencyKey, params }, async uow => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const row = await uow.tx.anestheticLog.create({ data: { patientId: args.patientId, appointmentId: args.appointmentId ?? null, drug, concentration: optionalText(args.concentration, 40), vasoconstrictor: optionalText(args.vasoconstrictor, 60), carpules: String(carpules), injectionSites: (args.injectionSites ?? []).slice(0, 8) as never, administeredById: actor.kind === 'user' ? actor.userId : null, at: uow.now } })
    auditCreate(uow, actor, 'AnestheticLog', row.id, 'anesthetic.logged', { patientId: args.patientId, drug, carpules })
    return { logId: row.id }
  })
  return { replay: result.replay, ...result.value }
}

export async function recordVitals(_root: unknown, args: { patientId: string; appointmentId?: string | null; systolic?: number | null; diastolic?: number | null; pulse?: number | null; asaClass?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart')
  const within = (value: number | null | undefined, min: number, max: number, field: string) => {
    if (value === null || value === undefined) return null
    if (!Number.isInteger(value) || value < min || value > max) throw new DomainError(Codes.INVALID_INPUT, `${field} must be a whole number from ${min} to ${max}.`, { field })
    return value
  }
  const systolic = within(args.systolic, 50, 300, 'Systolic pressure')
  const diastolic = within(args.diastolic, 30, 200, 'Diastolic pressure')
  const pulse = within(args.pulse, 20, 250, 'Pulse')
  if ((systolic === null) !== (diastolic === null)) throw new DomainError(Codes.INVALID_INPUT, 'Enter both blood pressure numbers.', { field: 'systolic' })
  if (systolic !== null && diastolic !== null && diastolic >= systolic) throw new DomainError(Codes.INVALID_INPUT, 'Diastolic pressure must be lower than systolic.', { field: 'diastolic' })
  const asa = args.asaClass ? oneOf(args.asaClass, ['I', 'II', 'III', 'IV', 'V', 'VI'] as const, 'ASA class') : ''
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'vitals.record', actor, idempotencyKey, params }, async uow => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const row = await uow.tx.vitalsReading.create({ data: { patientId: args.patientId, appointmentId: args.appointmentId ?? null, systolic, diastolic, pulse, asaClass: asa, takenById: actor.kind === 'user' ? actor.userId : null, at: uow.now } })
    auditCreate(uow, actor, 'VitalsReading', row.id, 'vitals.recorded', { patientId: args.patientId })
    return { readingId: row.id }
  })
  return { replay: result.replay, ...result.value }
}

// ── Medical history ────────────────────────────────────────────────────────────────────────────────

/** Answers that raise a chart alert when reviewed. The alert kind matches the PatientAlert kinds. */
const ALERTING: Record<string, { kind: string; severity: 'caution' | 'critical'; text: (answer: unknown) => string }> = {
  allergy_latex: { kind: 'latex', severity: 'critical', text: () => 'Latex allergy' },
  allergy_penicillin: { kind: 'allergy', severity: 'critical', text: () => 'Penicillin allergy' },
  allergy_other: { kind: 'allergy', severity: 'critical', text: a => `Allergy: ${String((a as { detail?: string })?.detail ?? 'see history')}` },
  on_blood_thinner: { kind: 'anticoagulant', severity: 'caution', text: () => 'Takes a blood thinner' },
  on_bisphosphonate: { kind: 'antiresorptive', severity: 'critical', text: () => 'Takes a bisphosphonate or antiresorptive' },
  heart_condition: { kind: 'cardiac', severity: 'caution', text: () => 'Heart condition reported' },
  needs_premedication: { kind: 'premedication', severity: 'caution', text: () => 'Needs antibiotic premedication' },
  diabetes: { kind: 'diabetes', severity: 'caution', text: () => 'Diabetes' },
  high_blood_pressure: { kind: 'hypertension', severity: 'caution', text: () => 'High blood pressure' },
  pregnant: { kind: 'pregnancy', severity: 'caution', text: () => 'Pregnant' },
}

const isYes = (answer: unknown) => answer === true || answer === 'yes' || (typeof answer === 'object' && answer !== null && (answer as { value?: unknown }).value === 'yes')

/** Staff enter or import a patient's answers; a clinician then reviews them. A new response supersedes the last one. */
export async function submitMedicalHistory(_root: unknown, args: { patientId: string; formId: string; answers: Record<string, unknown>; via?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart', 'canManagePatients')
  const via = oneOf(args.via ?? 'staff', ['staff', 'tablet', 'import'] as const, 'channel')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'history.submit', actor, idempotencyKey, params }, async uow => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const form = await uow.tx.medicalHistoryForm.findUnique({ where: { id: args.formId } })
    if (!form || form.status !== 'published') throw new DomainError(Codes.INVALID_INPUT, 'That history form is not available.', { field: 'formId' })
    const prior = await uow.tx.medicalHistoryResponse.findFirst({ where: { patientId: args.patientId, status: { in: ['submitted', 'reviewed'] } }, orderBy: { submittedAt: 'desc' } })
    const response = await uow.tx.medicalHistoryResponse.create({ data: { patientId: args.patientId, formId: form.id, answers: args.answers as never, submittedVia: via, submittedAt: uow.now, status: 'submitted' } })
    if (prior) await uow.tx.medicalHistoryResponse.update({ where: { id: prior.id }, data: { status: 'superseded', version: { increment: 1 } } })
    auditCreate(uow, actor, 'MedicalHistoryResponse', response.id, 'history.submitted', { patientId: args.patientId, supersedes: prior?.id ?? null })
    return { responseId: response.id }
  })
  return { replay: result.replay, ...result.value }
}

/**
 * A clinician reviews the answers (SM§3.8): each change since the last review is acknowledged, chart
 * alerts are raised for answers that matter, and the medication list is rebuilt from what was reported.
 * Skipping a change that raises a critical alert needs a reason.
 */
export async function reviewMedicalHistory(_root: unknown, args: { responseId: string; expectedVersion: number; acknowledgedChanges: string[]; overrideReason?: string | null; password: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart', 'canSignClinicalNotes')
  if (actor.kind !== 'user') throw new DomainError(Codes.AGENT_CANNOT_APPROVE, 'Only a clinician reviews a medical history.')
  await verifyPassword(context as never, actor.userId, args.password)
  const { idempotencyKey, password: _password, ...params } = args
  const result = await command(context.prisma, { name: 'history.review', actor, idempotencyKey, params }, async uow => {
    const response = await lockRow<any>(uow.tx, 'MedicalHistoryResponse', args.responseId)
    await assertPatientInScope(uow.tx, locationIds, response.patientId)
    const answers = (response.answers ?? {}) as Record<string, any>
    const priorReview = await uow.tx.medicalHistoryReview.findFirst({ where: { patientId: response.patientId }, orderBy: { reviewedAt: 'desc' }, include: { response: true } })
    const priorAnswers = ((priorReview as any)?.response?.answers ?? {}) as Record<string, any>
    const changed = Object.keys({ ...answers, ...priorAnswers }).filter(key => canonicalJson(answers[key] ?? null) !== canonicalJson(priorAnswers[key] ?? null)).filter(key => key !== 'medications')
    const unacknowledged = changed.filter(key => !args.acknowledgedChanges.includes(key))
    const criticalSkipped = unacknowledged.filter(key => ALERTING[key]?.severity === 'critical' && isYes(answers[key]))
    if (criticalSkipped.length && !String(args.overrideReason ?? '').trim()) {
      throw new DomainError(Codes.GUARD_FAILED, `Acknowledge ${criticalSkipped.length === 1 ? 'the change' : 'each change'} to ${criticalSkipped.join(', ').replace(/_/g, ' ')}, or give a reason for leaving it.`)
    }
    const existing = await uow.tx.patientAlert.findMany({ where: { patientId: response.patientId, source: 'history_answer', endedAt: null } })
    const created: string[] = []
    for (const [key, rule] of Object.entries(ALERTING)) {
      const yes = isYes(answers[key])
      const open = existing.find(a => a.text === rule.text(answers[key]))
      if (yes && !open) {
        const alert = await uow.tx.patientAlert.create({ data: { patientId: response.patientId, kind: rule.kind, severity: rule.severity, text: rule.text(answers[key]), source: 'history_answer', activeFrom: uow.now, recordedById: actor.userId } })
        created.push(alert.id)
        auditCreate(uow, actor, 'PatientAlert', alert.id, 'alert.added', { patientId: response.patientId, kind: rule.kind, source: 'history_answer' })
      }
      if (!yes && open && key in answers) await uow.tx.patientAlert.update({ where: { id: open.id }, data: { endedAt: uow.now, version: { increment: 1 } } })
    }
    const meds = Array.isArray(answers.medications) ? answers.medications.slice(0, 60) : []
    await uow.tx.medicationEntry.updateMany({ where: { patientId: response.patientId, source: 'history', endedAt: null }, data: { endedAt: dayOf(uow.now.toISOString().slice(0, 10)) } })
    for (const med of meds) {
      const name = String((med as { name?: string })?.name ?? '').trim().slice(0, 120)
      if (name) await uow.tx.medicationEntry.create({ data: { patientId: response.patientId, name, dose: String((med as { dose?: string }).dose ?? '').slice(0, 60), frequency: String((med as { frequency?: string }).frequency ?? '').slice(0, 60), source: 'history', activeFrom: dayOf(uow.now.toISOString().slice(0, 10)) } })
    }
    const signatureHash = sha256(canonicalJson({ responseId: response.id, answers, acknowledged: args.acknowledgedChanges }))
    const review = await uow.tx.medicalHistoryReview.create({ data: { responseId: response.id, patientId: response.patientId, reviewedById: actor.userId, reviewedAt: uow.now, changesAcknowledged: args.acknowledgedChanges as never, alertsCreated: created as never, signatureHash, overrideReason: optionalText(args.overrideReason, 500) } })
    await transition<any>(uow, { model: 'MedicalHistoryResponse', id: response.id, from: ['submitted'], to: 'reviewed', expectedVersion: args.expectedVersion, actor, eventType: 'history.reviewed', metadata: { reviewId: review.id, changed: changed.length, alerts: created.length } })
    return { reviewId: review.id, alertsCreated: created.length, changes: changed }
  })
  return { replay: result.replay, ...result.value }
}

export async function addMedication(_root: unknown, args: { patientId: string; name: string; dose?: string | null; frequency?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart')
  const name = requireText(args.name, 'medication', 120)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'medication.add', actor, idempotencyKey, params }, async uow => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const today = dayOf(uow.now.toISOString().slice(0, 10))
    const row = await uow.tx.medicationEntry.create({ data: { patientId: args.patientId, name, dose: optionalText(args.dose, 60), frequency: optionalText(args.frequency, 60), source: 'staff', activeFrom: today } })
    auditCreate(uow, actor, 'MedicationEntry', row.id, 'medication.added', { patientId: args.patientId, name })
    return { medicationId: row.id }
  })
  return { replay: result.replay, ...result.value }
}

export async function endMedication(_root: unknown, args: { medicationId: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'medication.end', actor, idempotencyKey, params }, async uow => {
    const row = await lockRow<any>(uow.tx, 'MedicationEntry', args.medicationId)
    await assertPatientInScope(uow.tx, locationIds, row.patientId)
    if (row.endedAt) return { medicationId: row.id }
    await uow.tx.medicationEntry.update({ where: { id: row.id }, data: { endedAt: dayOf(addDays(uow.now.toISOString().slice(0, 10), 0)) } })
    uow.audit({ eventType: 'medication.ended', entityType: 'MedicationEntry', entityId: row.id, actorUserId: actor.kind === 'user' ? actor.userId : null, after: { endedAt: uow.now.toISOString().slice(0, 10) } })
    return { medicationId: row.id }
  })
  return { replay: result.replay, ...result.value }
}
