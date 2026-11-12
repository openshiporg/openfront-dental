import { can, requirePermission } from '../lib/actor'
import { requestApproval } from '../lib/approval'
import { registerApplier } from '../lib/approvalAppliers'
import { auditCreate, lockRow, transition } from '../lib/cas'
import { command } from '../lib/command'
import { DomainError, Codes } from '../lib/errors'
import { checkReviewReply, draftReviewReply as draftText, eligibleOn, rightsDueOn, rightsExtendedDueOn } from '../lib/compliancePure'
import { addMonths } from '../lib/estimator'
import { DEFAULT_RECALL_NAMES, DEFAULT_RECALL_RULES, DEFAULT_RECALL_TYPES, ageOn, convertedType, recallMessage, recallStatus, toCsv, typeFitsAge } from '../lib/recall'
import { localDate } from '../lib/time'
import { dayOf, isoDay, requireReason } from './clinicalShared'
import { assertBookablePatient, assertLocation, assertPatientInScope, optionalText, requireText, staff, type Ctx } from './shared'

/*
 * Phase 6 commands: recall, lab cases, review requests and replies, prescriptions (print mode and PDMP evidence), compliance.
 * Nothing here sends anything and nothing runs on a timer. Clocks are computed when read; "Refresh" buttons advance stored state and are safe to press twice.
 */

type Tx = any
const DAY = 86_400_000
export const RECALL_GRACE_DAYS = 30

const practiceToday = async (tx: Tx, now: Date) => {
  const s = await tx.practiceSettings.findUnique({ where: { id: 1 }, select: { defaultTimeZone: true, recallLeadDays: true, displayName: true, isSynthetic: true } })
  return { today: localDate(s?.defaultTimeZone ?? 'America/New_York', now), lead: s?.recallLeadDays ?? 30, practice: s?.displayName ?? 'our office', synthetic: !!s?.isSynthetic }
}
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], field: string): T => {
  if (!(allowed as readonly string[]).includes(String(value))) throw new DomainError(Codes.INVALID_INPUT, `Choose a valid ${field}.`, { field })
  return value as T
}
const needDate = (value: unknown, field: string) => {
  const v = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new DomainError(Codes.INVALID_INPUT, 'Enter the date as YYYY-MM-DD.', { field })
  return v
}
const run = async <T>(context: Ctx, actor: any, name: string, args: any, work: (uow: any) => Promise<T>) => {
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name, actor, idempotencyKey, params }, work)
  return { replay: result.replay, ...(result.value as any) }
}

// ── Recall ───────────────────────────────────────────────────────────────────────────────────────

export async function ensureRecallCatalogue(tx: Tx) {
  const types: Record<string, string> = {}
  for (const t of DEFAULT_RECALL_TYPES) {
    const row = await tx.recallType.upsert({ where: { key: t.key }, update: {}, create: { key: t.key, name: DEFAULT_RECALL_NAMES[t.key] ?? t.key, intervalMonths: t.intervalMonths, ageMinYears: t.ageMinYears, ageMaxYears: t.ageMaxYears } })
    types[t.key] = row.id
  }
  for (const r of DEFAULT_RECALL_RULES) {
    await tx.recallRule.upsert({ where: { key: r.key }, update: {}, create: { key: r.key, trigger: r.trigger, fromTypeId: types[r.from], toTypeId: types[r.to] } })
  }
  return types
}

/** Work out each patient's recall from the visits on the chart. Pressing it twice changes nothing the second time. */
export async function refreshRecall(_root: unknown, args: { locationId?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule')
  if (args.locationId) assertLocation(locationIds, args.locationId)
  return run(context, actor, 'recall.refresh', args, async uow => {
    const { tx } = uow
    const { today, lead } = await practiceToday(tx, uow.now)
    await ensureRecallCatalogue(tx)
    const typeRows = await tx.recallType.findMany({ where: { isActive: true } })
    const byKey = new Map<string, any>(typeRows.map((t: any) => [t.key, t]))
    const rules = (await tx.recallRule.findMany({ where: { isActive: true }, include: { fromType: true, toType: true } })).map((r: any) => ({ trigger: r.trigger, from: r.fromType?.key, to: r.toType?.key }))
    const scope = args.locationId ? [args.locationId] : locationIds
    const patients = await tx.patient.findMany({
      where: { status: { in: ['active', 'inactive'] }, homeLocationId: scope ? { in: scope } : { not: null } },
      select: { id: true, dateOfBirth: true, homeLocationId: true }, orderBy: { id: 'asc' }, take: 3000,
    })
    const ids = patients.map((p: any) => p.id)
    const entries = await tx.chartEntry.findMany({
      where: { patientId: { in: ids }, kind: 'procedure', status: { in: ['completed', 'posted', 'existing_current', 'existing_other'] }, dateOfService: { not: null }, code: { OR: [{ isPreventiveRecallTrigger: true }, { category: 'periodontics' }] } },
      select: { patientId: true, dateOfService: true, code: { select: { isPreventiveRecallTrigger: true, category: true } } },
    })
    const future = await tx.appointment.findMany({ where: { patientId: { in: ids }, startsAt: { gt: uow.now }, status: { in: ['scheduled', 'confirmed'] } }, select: { patientId: true }, distinct: ['patientId'] })
    const hasFuture = new Set(future.map((f: any) => f.patientId))
    const last = new Map<string, { prev?: string; perio?: string }>()
    for (const e of entries) {
      const slot = last.get(e.patientId) ?? {}
      const d = isoDay(e.dateOfService)!
      if (e.code.isPreventiveRecallTrigger) { if (!slot.prev || d > slot.prev) slot.prev = d }
      else if (!slot.perio || d > slot.perio) slot.perio = d
      last.set(e.patientId, slot)
    }
    const existing = await tx.patientRecall.findMany({ where: { patientId: { in: ids } } })
    const have = new Map<string, any>(existing.map((r: any) => [`${r.patientId}|${r.typeId}`, r]))
    let created = 0, changed = 0, closed = 0
    for (const p of patients) {
      const slot = last.get(p.id)
      const lastService = slot?.prev ?? slot?.perio
      if (!lastService) continue
      const age = ageOn(isoDay(p.dateOfBirth)!, today)
      const base = typeRows.filter((t: any) => t.key.startsWith('prophy_') && typeFitsAge(t, age))[0]
      if (!base) continue
      const key = slot?.perio ? convertedType(base.key, 'perio_therapy_completed', rules) : base.key
      const type = byKey.get(key) && typeFitsAge(byKey.get(key), age) ? byKey.get(key) : base
      const dueOn = addMonths(lastService, type.intervalMonths)
      const row = have.get(`${p.id}|${type.id}`)
      const disabled = row?.status === 'disabled'
      const status = recallStatus({ dueOn, today, leadDays: lead, graceDays: RECALL_GRACE_DAYS, hasFutureAppointment: hasFuture.has(p.id), disabled })
      if (!row) {
        await tx.patientRecall.create({ data: { patientId: p.id, typeId: type.id, locationId: p.homeLocationId, status, dueOn: dayOf(dueOn), lastCompletedOn: dayOf(lastService) } })
        created += 1
      } else if (!disabled && (row.status !== status || isoDay(row.dueOn) !== dueOn || isoDay(row.lastCompletedOn) !== lastService)) {
        await tx.patientRecall.update({ where: { id: row.id }, data: { status, dueOn: dayOf(dueOn), lastCompletedOn: dayOf(lastService), version: { increment: 1 } } })
        changed += 1
      }
      // A patient who moved to another recall type no longer waits on the old one.
      for (const other of existing.filter((r: any) => r.patientId === p.id && r.typeId !== type.id && r.status !== 'disabled')) {
        await tx.patientRecall.update({ where: { id: other.id }, data: { status: 'disabled', disabledReason: 'Moved to a different recall', version: { increment: 1 } } })
        closed += 1
      }
    }
    if (created || changed || closed) uow.audit({ eventType: 'recall.refreshed', entityType: 'PatientRecall', entityId: 'batch', actorUserId: actor.kind === 'user' ? actor.userId : null, after: { created, changed, closed } })
    return { created, changed, closed, checked: patients.length }
  })
}

export async function setRecallDisabled(_root: unknown, args: { recallId: string; expectedVersion: number; disable: boolean; reason?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule')
  return run(context, actor, 'recall.set_disabled', args, async uow => {
    const row = await lockRow<any>(uow.tx, 'PatientRecall', args.recallId)
    await assertPatientInScope(uow.tx, locationIds, row.patientId)
    const reason = args.disable ? requireReason(args.reason) : ''
    const { today, lead } = await practiceToday(uow.tx, uow.now)
    const to = args.disable ? 'disabled' : recallStatus({ dueOn: isoDay(row.dueOn)!, today, leadDays: lead, graceDays: RECALL_GRACE_DAYS, hasFutureAppointment: false })
    await transition<any>(uow, { model: 'PatientRecall', id: row.id, from: args.disable ? ['scheduled_due', 'due', 'overdue', 'scheduled'] : ['disabled'], to, expectedVersion: args.expectedVersion, actor, eventType: args.disable ? 'recall.disabled' : 'recall.enabled', reason: reason || null, data: { disabledReason: reason } })
    return { id: row.id, status: to }
  })
}

type RecallRow = { id: string; dueOn: Date; lastCompletedOn: Date | null; status: string; patient: { id: string; firstName: string; lastName: string; chartNumber: string; contactPoints: { kind: string; value: string; isPrimary: boolean }[] }; type: { name: string } }
const listRecall = async (tx: Tx, locationIds: string[] | null, now: Date, only?: string[]) => {
  const { today, lead, practice } = await practiceToday(tx, now)
  const rows = (await tx.patientRecall.findMany({
    where: { status: { not: 'disabled' }, ...(locationIds ? { locationId: { in: locationIds } } : {}) },
    include: { type: true, patient: { select: { id: true, firstName: true, lastName: true, chartNumber: true, contactPoints: { where: { isActive: true }, select: { kind: true, value: true, isPrimary: true } } } } },
    orderBy: { dueOn: 'asc' }, take: 2000,
  })) as RecallRow[]
  const shown = rows.map(r => ({ r, live: recallStatus({ dueOn: isoDay(r.dueOn)!, today, leadDays: lead, graceDays: RECALL_GRACE_DAYS, hasFutureAppointment: r.status === 'scheduled' }) })).filter(x => (only ?? ['due', 'overdue']).includes(x.live))
  return { shown, practice, today }
}

/** The recall list as a CSV download. It records that the list was prepared; nothing is sent. */
export async function exportRecallCsv(_root: unknown, args: { idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule')
  return run(context, actor, 'recall.export_csv', args, async uow => {
    const { shown, practice } = await listRecall(uow.tx, locationIds, uow.now)
    const csv = toCsv(['Chart', 'First name', 'Last name', 'Visit', 'Due', 'Status', 'Phone or email', 'Message to copy'], shown.map(({ r, live }) => {
      const contact = r.patient.contactPoints.find(c => c.isPrimary) ?? r.patient.contactPoints[0]
      return [r.patient.chartNumber, r.patient.firstName, r.patient.lastName, r.type.name, isoDay(r.dueOn), live === 'overdue' ? 'Overdue' : 'Due', contact?.value ?? '', recallMessage({ firstName: r.patient.firstName, practice, phone: '', kind: r.type.name.toLowerCase() })]
    }))
    const job = await uow.tx.exportJob.create({ data: { kind: 'recall_list', status: 'completed', byteCount: Buffer.byteLength(csv), counts: { rows: shown.length } as never, requestedById: actor.kind === 'user' ? actor.userId : null, ref: `EXP-${uow.now.getTime().toString(36).toUpperCase()}` } })
    auditCreate(uow, actor, 'ExportJob', job.id, 'export.recall_list', { rows: shown.length })
    return { fileName: 'recall-list.csv', mimeType: 'text/csv', text: csv, rows: shown.length }
  })
}

/** Note that outreach was prepared for a patient and give back the message to copy. */
export async function prepareRecallMessage(_root: unknown, args: { recallId: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule', 'canMessagePatients')
  return run(context, actor, 'recall.prepare_message', args, async uow => {
    const row = await uow.tx.patientRecall.findUnique({ where: { id: args.recallId }, include: { type: true, patient: { select: { id: true, firstName: true } } } })
    if (!row) throw new DomainError(Codes.NOT_FOUND, 'Recall not found.')
    await assertPatientInScope(uow.tx, locationIds, row.patientId)
    const { practice } = await practiceToday(uow.tx, uow.now)
    await uow.tx.patientRecall.update({ where: { id: row.id }, data: { lastOutreachPreparedAt: uow.now, outreachCount: { increment: 1 }, version: { increment: 1 } } })
    uow.audit({ eventType: 'recall.message_prepared', entityType: 'PatientRecall', entityId: row.id, actorUserId: actor.kind === 'user' ? actor.userId : null, after: { count: (row.outreachCount ?? 0) + 1 } })
    return { message: recallMessage({ firstName: row.patient.firstName, practice, phone: '', kind: row.type.name.toLowerCase() }) }
  })
}

export { listRecall }

// ── Lab cases ────────────────────────────────────────────────────────────────────────────────────

const LAB_NEXT: Record<string, string[]> = {
  draft: ['sent', 'cancelled'], sent: ['in_production', 'shipped', 'received', 'cancelled'], in_production: ['shipped', 'received', 'cancelled'], shipped: ['received', 'cancelled'],
  received: ['qc_passed', 'remake_requested'], qc_passed: ['seated', 'remake_requested'], seated: [], remake_requested: ['sent', 'cancelled'], cancelled: [],
}
export const LAB_READY = ['received', 'qc_passed', 'seated', 'cancelled']

export async function saveLab(_root: unknown, args: { name: string; contactName?: string | null; phone?: string | null; email?: string | null; turnaroundDays?: number | null; bufferDays?: number | null; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, 'canManageLabCases')
  return run(context, actor, 'lab.save', args, async uow => {
    const name = requireText(args.name, 'name', 80)
    const turnaround = Number(args.turnaroundDays ?? 10), buffer = Number(args.bufferDays ?? 2)
    if (!Number.isInteger(turnaround) || turnaround < 1 || turnaround > 90) throw new DomainError(Codes.INVALID_INPUT, 'Turnaround is 1 to 90 days.', { field: 'turnaroundDays' })
    if (!Number.isInteger(buffer) || buffer < 0 || buffer > 30) throw new DomainError(Codes.INVALID_INPUT, 'Buffer is 0 to 30 days.', { field: 'bufferDays' })
    const data = { name, contactName: optionalText(args.contactName, 100), phone: optionalText(args.phone, 40), email: optionalText(args.email, 120), turnaroundDays: turnaround, bufferDays: buffer }
    const row = await uow.tx.lab.upsert({ where: { name }, update: data, create: data })
    auditCreate(uow, actor, 'Lab', row.id, 'lab.saved', data)
    return { id: row.id }
  })
}

export async function openLabCase(_root: unknown, args: { patientId: string; locationId: string; labId: string; workType: string; tooth?: string | null; shade?: string | null; instructions?: string | null; dueDate?: string | null; seatAppointmentId?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageLabCases')
  assertLocation(locationIds, args.locationId)
  return run(context, actor, 'lab_case.create', args, async uow => {
    const { tx } = uow
    await assertPatientInScope(tx, locationIds, args.patientId)
    const patient = await tx.patient.findUniqueOrThrow({ where: { id: args.patientId }, select: { status: true } })
    assertBookablePatient(patient)
    const lab = await tx.lab.findUnique({ where: { id: args.labId } })
    if (!lab || !lab.isActive) throw new DomainError(Codes.NOT_FOUND, 'Lab not found.', { field: 'labId' })
    if (args.seatAppointmentId) {
      const appt = await tx.appointment.findUnique({ where: { id: args.seatAppointmentId }, select: { patientId: true, locationId: true } })
      if (!appt || appt.patientId !== args.patientId) throw new DomainError(Codes.INVALID_INPUT, 'That appointment belongs to someone else.', { field: 'seatAppointmentId' })
    }
    const today = (await practiceToday(tx, uow.now)).today
    const due = args.dueDate ? needDate(args.dueDate, 'dueDate') : localDate('UTC', new Date(Date.parse(`${today}T00:00:00Z`) + (lab.turnaroundDays ?? 10) * DAY))
    const { nextReference } = await import('../lib/sequence')
    const ref = await nextReference(tx, 'LAB', uow.now)
    const prescriber = actor.kind === 'user' ? await tx.providerProfile.findUnique({ where: { userId: actor.userId }, select: { id: true } }) : null
    const row = await tx.labCase.create({
      data: { ref, patientId: args.patientId, labId: lab.id, locationId: args.locationId, seatAppointmentId: args.seatAppointmentId ?? null, prescriberId: prescriber?.id ?? null, workType: requireText(args.workType, 'work type', 80), tooth: optionalText(args.tooth, 8), shade: optionalText(args.shade, 20), instructions: optionalText(args.instructions, 2000), dueDate: dayOf(due), files: [] as never, status: 'draft' },
    })
    auditCreate(uow, actor, 'LabCase', row.id, 'lab_case.created', { ref, workType: row.workType, labId: lab.id })
    return { id: row.id, ref }
  })
}

export async function attachLabFile(_root: unknown, args: { caseId: string; expectedVersion: number; fileName: string; note?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageLabCases')
  return run(context, actor, 'lab_case.attach_file', args, async uow => {
    const row = await lockRow<any>(uow.tx, 'LabCase', args.caseId)
    await assertPatientInScope(uow.tx, locationIds, row.patientId)
    if (row.version !== args.expectedVersion) throw new DomainError(Codes.STALE_STATE, 'This lab case changed. Reload and try again.')
    if (['seated', 'cancelled'].includes(row.status)) throw new DomainError(Codes.GUARD_FAILED, 'This case is closed.')
    const files = [...((row.files as any[]) ?? []), { name: requireText(args.fileName, 'file name', 120), note: optionalText(args.note, 200), addedAt: uow.now.toISOString() }]
    await uow.tx.labCase.update({ where: { id: row.id }, data: { files: files as never, version: { increment: 1 } } })
    auditCreate(uow, actor, 'LabCase', row.id, 'lab_case.file_attached', { count: files.length })
    return { id: row.id, files: files.length }
  })
}

export async function advanceLabCase(_root: unknown, args: { caseId: string; expectedVersion: number; to: string; note?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageLabCases')
  return run(context, actor, 'lab_case.advance', args, async uow => {
    const row = await lockRow<any>(uow.tx, 'LabCase', args.caseId)
    await assertPatientInScope(uow.tx, locationIds, row.patientId)
    const to = String(args.to)
    if (!(LAB_NEXT[row.status] ?? []).includes(to)) throw new DomainError(Codes.INVALID_TRANSITION, `A case that is ${row.status.replaceAll('_', ' ')} can't move to ${to.replaceAll('_', ' ')}.`)
    const data: Record<string, unknown> = {}
    if (to === 'sent') {
      if (!String(row.instructions).trim()) throw new DomainError(Codes.GUARD_FAILED, 'Write the lab prescription (instructions) before sending.')
      if (!((row.files as any[]) ?? []).length) throw new DomainError(Codes.GUARD_FAILED, 'Attach the scan or impression file before sending.')
      data.sentAt = uow.now
    }
    if (to === 'received') data.receivedAt = uow.now
    if (to === 'cancelled') data.cancelReason = requireReason(args.note)
    if (to === 'remake_requested' || to === 'qc_passed') data.qcNote = to === 'remake_requested' ? requireReason(args.note, 'reason for the remake') : optionalText(args.note, 300)
    await transition<any>(uow, { model: 'LabCase', id: row.id, from: [row.status], to, expectedVersion: args.expectedVersion, actor, eventType: `lab_case.${to}`, data })
    return { id: row.id, status: to }
  })
}

export async function chaseLabCase(_root: unknown, args: { caseId: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageLabCases')
  return run(context, actor, 'lab_case.chase', args, async uow => {
    const row = await lockRow<any>(uow.tx, 'LabCase', args.caseId)
    await assertPatientInScope(uow.tx, locationIds, row.patientId)
    if (LAB_READY.includes(row.status) || row.status === 'draft') throw new DomainError(Codes.GUARD_FAILED, 'Nothing to chase on this case.')
    await uow.tx.labCase.update({ where: { id: row.id }, data: { lastChasedAt: uow.now, version: { increment: 1 } } })
    auditCreate(uow, actor, 'LabCase', row.id, 'lab_case.chased', {})
    return { id: row.id }
  })
}

/** Check-in gate (I-S6): any lab case tied to this visit that has not come back blocks it. */
export async function labGateFor(tx: Tx, appointmentId: string): Promise<{ blocked: false } | { blocked: true; reason: string }> {
  const cases = await tx.labCase.findMany({ where: { seatAppointmentId: appointmentId, status: { notIn: LAB_READY } }, include: { lab: { select: { name: true } } } })
  if (!cases.length) return { blocked: false }
  const c = cases[0]
  return { blocked: true, reason: `The ${c.workType || 'lab work'} from ${c.lab?.name ?? 'the lab'} has not come back (${String(c.status).replaceAll('_', ' ')}). Check it in with an override, or move the visit.` }
}

// ── Reviews ──────────────────────────────────────────────────────────────────────────────────────

/** A copyable review request. The patient's review consent is checked now, at copy time, and the grant is recorded with it. */
export async function copyReviewRequest(_root: unknown, args: { patientId: string; locationId: string; appointmentId?: string | null; channel: string; reviewLink: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canMessagePatients', 'canReplyReviews')
  assertLocation(locationIds, args.locationId)
  return run(context, actor, 'review.copy_request', args, async uow => {
    const { tx } = uow
    await assertPatientInScope(tx, locationIds, args.patientId)
    const channel = oneOf(args.channel, ['sms', 'email', 'link'] as const, 'channel')
    const link = String(args.reviewLink ?? '').trim()
    if (!/^https:\/\/[^\s]+$/.test(link) || link.length > 300) throw new DomainError(Codes.INVALID_INPUT, 'Paste the review page link (it starts with https://).', { field: 'reviewLink' })
    const grant = await tx.consentGrant.findFirst({
      where: { purpose: 'reviews', status: 'granted', revokedAt: null, ...(channel === 'link' ? {} : { channel }), contactPoint: { patientId: args.patientId, isActive: true } },
      orderBy: { grantedAt: 'desc' },
    })
    if (!grant) throw new DomainError(Codes.GUARD_FAILED, channel === 'link' ? 'This patient has not agreed to review requests.' : `This patient has not agreed to review requests by ${channel === 'sms' ? 'text' : 'email'}.`)
    const patient = await tx.patient.findUniqueOrThrow({ where: { id: args.patientId }, select: { firstName: true } })
    const { practice } = await practiceToday(tx, uow.now)
    const row = await tx.reviewRequest.create({ data: { patientId: args.patientId, locationId: args.locationId, appointmentId: args.appointmentId ?? null, channel, consentCheckedAt: uow.now, consentGrantId: grant.id, copiedById: actor.kind === 'user' ? actor.userId : null, status: 'copied' } })
    auditCreate(uow, actor, 'ReviewRequest', row.id, 'review.request_copied', { channel, consentGrantId: grant.id })
    return { id: row.id, message: `Hi ${patient.firstName}, thank you for visiting ${practice}. If you have a minute, we would be glad to hear how it went: ${link}` }
  })
}

export async function draftReviewReply(_root: unknown, args: { locationId: string; platform: string; reviewerName?: string | null; rating: number; reviewText?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canReplyReviews')
  assertLocation(locationIds, args.locationId)
  return run(context, actor, 'review.draft_reply', args, async uow => {
    const rating = Number(args.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new DomainError(Codes.INVALID_INPUT, 'The rating is 1 to 5.', { field: 'rating' })
    const platform = oneOf(args.platform, ['google', 'facebook', 'yelp', 'other'] as const, 'platform')
    const { practice } = await practiceToday(uow.tx, uow.now)
    const draft = draftText(rating, practice)
    const reviewerName = optionalText(args.reviewerName, 100)
    const findings = checkReviewReply(draft, reviewerName)
    const row = await uow.tx.reviewReply.create({ data: { locationId: args.locationId, platform, reviewerName, rating, reviewText: optionalText(args.reviewText, 2000), draft, policyFindings: findings as never, status: findings.length ? 'policy_failed' : 'policy_passed' } })
    auditCreate(uow, actor, 'ReviewReply', row.id, 'review.reply_drafted', { platform, rating })
    return { id: row.id, status: row.status }
  })
}

export async function editReviewReply(_root: unknown, args: { replyId: string; expectedVersion: number; draft: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canReplyReviews')
  return run(context, actor, 'review.edit_reply', args, async uow => {
    const row = await lockRow<any>(uow.tx, 'ReviewReply', args.replyId)
    assertLocation(locationIds, row.locationId)
    if (row.version !== args.expectedVersion) throw new DomainError(Codes.STALE_STATE, 'This reply changed. Reload and try again.')
    if (!['draft', 'policy_failed', 'policy_passed'].includes(row.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'This reply is already approved. Start a new one to change it.')
    const draft = optionalText(args.draft, 2000)
    const findings = checkReviewReply(draft, row.reviewerName)
    await uow.tx.reviewReply.update({ where: { id: row.id }, data: { draft, policyFindings: findings as never, status: findings.length ? 'policy_failed' : 'policy_passed', version: { increment: 1 } } })
    auditCreate(uow, actor, 'ReviewReply', row.id, 'review.reply_edited', { findings: findings.map(f => f.rule) })
    return { id: row.id, status: findings.length ? 'policy_failed' : 'policy_passed', findings }
  })
}

export async function approveReviewReply(_root: unknown, args: { replyId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canReplyReviews')
  return run(context, actor, 'review.approve_reply', args, async uow => {
    const row = await lockRow<any>(uow.tx, 'ReviewReply', args.replyId)
    assertLocation(locationIds, row.locationId)
    // The policy is checked again at approval, so an edit that slipped past cannot be approved.
    if (checkReviewReply(row.draft, row.reviewerName).length) throw new DomainError(Codes.GUARD_FAILED, 'The reply still breaks the reply rules. Edit it first.')
    await transition<any>(uow, { model: 'ReviewReply', id: row.id, from: ['policy_passed'], to: 'approved', expectedVersion: args.expectedVersion, actor, eventType: 'review.reply_approved', data: { approvedById: actor.kind === 'user' ? actor.userId : null } })
    return { id: row.id, status: 'approved' }
  })
}

export async function markReviewReplyPosted(_root: unknown, args: { replyId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canReplyReviews')
  return run(context, actor, 'review.mark_posted', args, async uow => {
    const row = await lockRow<any>(uow.tx, 'ReviewReply', args.replyId)
    assertLocation(locationIds, row.locationId)
    await transition<any>(uow, { model: 'ReviewReply', id: row.id, from: ['approved'], to: 'posted', expectedVersion: args.expectedVersion, actor, eventType: 'review.reply_posted', data: { postedAt: uow.now } })
    return { id: row.id, status: 'posted' }
  })
}

// ── Prescriptions: print mode, with PDMP evidence for controlled drugs ───────────────────────────

export async function writePrescription(_root: unknown, args: { patientId: string; drug: string; strength?: string | null; form?: string | null; sig: string; quantity: string; refills?: number | null; schedule?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canPrescribe')
  return run(context, actor, 'rx.create', args, async uow => {
    const { tx } = uow
    await assertPatientInScope(tx, locationIds, args.patientId)
    const prescriber = actor.kind === 'user' ? await tx.providerProfile.findUnique({ where: { userId: actor.userId }, select: { id: true } }) : null
    if (!prescriber) throw new DomainError(Codes.GUARD_FAILED, 'Only a provider with a profile can write a prescription.')
    const schedule = oneOf(args.schedule ?? 'none', ['none', 'II', 'III', 'IV', 'V'] as const, 'schedule')
    const quantity = String(args.quantity ?? '').trim()
    if (!/^\d{1,6}(\.\d{1,3})?$/.test(quantity) || !/[1-9]/.test(quantity)) throw new DomainError(Codes.INVALID_INPUT, 'Enter the quantity as a number.', { field: 'quantity' })
    const refills = Number(args.refills ?? 0)
    if (!Number.isInteger(refills) || refills < 0 || refills > 11 || (schedule === 'II' && refills > 0)) throw new DomainError(Codes.INVALID_INPUT, schedule === 'II' ? 'A schedule II drug cannot have refills.' : 'Refills are 0 to 11.', { field: 'refills' })
    const row = await tx.prescription.create({
      data: { patientId: args.patientId, prescriberId: prescriber.id, drug: requireText(args.drug, 'drug', 120), strength: optionalText(args.strength, 60), form: optionalText(args.form, 60), sig: requireText(args.sig, 'directions', 300), quantity, refills, isControlled: schedule !== 'none', schedule, mode: 'print', status: 'draft', isSynthetic: (await practiceToday(tx, uow.now)).synthetic },
    })
    auditCreate(uow, actor, 'Prescription', row.id, 'rx.created', { drug: row.drug, schedule })
    return { id: row.id }
  })
}

export async function recordPdmpCheck(_root: unknown, args: { prescriptionId: string; result: string; note: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canPrescribe')
  return run(context, actor, 'rx.pdmp_check', args, async uow => {
    const rx = await uow.tx.prescription.findUnique({ where: { id: args.prescriptionId } })
    if (!rx) throw new DomainError(Codes.NOT_FOUND, 'Prescription not found.')
    await assertPatientInScope(uow.tx, locationIds, rx.patientId)
    const result = oneOf(args.result, ['reviewed_no_concern', 'reviewed_concern', 'not_required'] as const, 'result')
    // The note is the evidence: where the state report was looked up and what it showed. (verify) state rules on PDMP lookup differ.
    const note = requireText(args.note, 'note', 500)
    const row = await uow.tx.pdmpCheck.create({ data: { prescriptionId: rx.id, patientId: rx.patientId, checkedAt: uow.now, checkedById: actor.kind === 'user' ? actor.userId : null, result, note } })
    auditCreate(uow, actor, 'PdmpCheck', row.id, 'rx.pdmp_checked', { result })
    return { id: row.id }
  })
}

export async function signPrescription(_root: unknown, args: { prescriptionId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canPrescribe')
  return run(context, actor, 'rx.sign', args, async uow => {
    const rx = await lockRow<any>(uow.tx, 'Prescription', args.prescriptionId)
    await assertPatientInScope(uow.tx, locationIds, rx.patientId)
    await transition<any>(uow, {
      model: 'Prescription', id: rx.id, from: ['draft'], to: 'signed', expectedVersion: args.expectedVersion, actor, eventType: 'rx.signed', data: { signedAt: uow.now },
      guard: async row => {
        if (!row.isControlled) return
        const ok = await uow.tx.pdmpCheck.findFirst({ where: { prescriptionId: row.id, result: { in: ['reviewed_no_concern', 'reviewed_concern', 'not_required'] } } })
        if (!ok) throw new DomainError(Codes.GUARD_FAILED, 'Record the PDMP check before signing a controlled drug.')
      },
    })
    return { id: rx.id }
  })
}

export async function markPrescriptionPrinted(_root: unknown, args: { prescriptionId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canPrescribe')
  return run(context, actor, 'rx.printed', args, async uow => {
    const rx = await lockRow<any>(uow.tx, 'Prescription', args.prescriptionId)
    await assertPatientInScope(uow.tx, locationIds, rx.patientId)
    await transition<any>(uow, { model: 'Prescription', id: rx.id, from: ['signed'], to: 'printed', expectedVersion: args.expectedVersion, actor, eventType: 'rx.printed' })
    return { id: rx.id }
  })
}

// ── Compliance ───────────────────────────────────────────────────────────────────────────────────

const COMPLIANCE = ['canManageCompliance', 'canReviewPrivacy'] as const

export async function addComplianceTask(_root: unknown, args: { title: string; category: string; dueOn: string; repeatMonths?: number | null; ownerId?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, ...COMPLIANCE)
  return run(context, actor, 'compliance.add_task', args, async uow => {
    const category = oneOf(args.category, ['training', 'risk_analysis', 'policy_review', 'credential', 'equipment', 'baa', 'other'] as const, 'category')
    const repeat = args.repeatMonths ? Number(args.repeatMonths) : null
    if (repeat !== null && (!Number.isInteger(repeat) || repeat < 1 || repeat > 60)) throw new DomainError(Codes.INVALID_INPUT, 'Repeat every 1 to 60 months.', { field: 'repeatMonths' })
    const row = await uow.tx.complianceTask.create({ data: { title: requireText(args.title, 'title', 140), category, dueOn: dayOf(needDate(args.dueOn, 'dueOn')), repeatMonths: repeat, ownerId: args.ownerId || (actor.kind === 'user' ? actor.userId : null), status: 'open' } })
    auditCreate(uow, actor, 'ComplianceTask', row.id, 'compliance.task_added', { category, dueOn: args.dueOn })
    return { id: row.id }
  })
}

export async function completeComplianceTask(_root: unknown, args: { taskId: string; expectedVersion: number; note?: string | null; dismiss?: boolean | null; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, ...COMPLIANCE)
  return run(context, actor, 'compliance.complete_task', args, async uow => {
    const row = await transition<any>(uow, {
      model: 'ComplianceTask', id: args.taskId, from: ['open'], to: args.dismiss ? 'dismissed' : 'done', expectedVersion: args.expectedVersion, actor, eventType: args.dismiss ? 'compliance.task_dismissed' : 'compliance.task_completed',
      data: { completedAt: uow.now, completedById: actor.kind === 'user' ? actor.userId : null, note: optionalText(args.note, 500) },
    })
    // A repeating task makes its next occurrence now, in the same step, so completing it twice cannot make two.
    let nextId: string | null = null
    if (!args.dismiss && row.repeatMonths && row.dueOn) {
      const next = await uow.tx.complianceTask.create({ data: { title: row.title, category: row.category, dueOn: dayOf(addMonths(isoDay(row.dueOn)!, row.repeatMonths)), repeatMonths: row.repeatMonths, ownerId: row.ownerId, status: 'open' } })
      nextId = next.id
      auditCreate(uow, actor, 'ComplianceTask', next.id, 'compliance.task_repeated', { from: row.id })
    }
    return { id: row.id, nextId }
  })
}

const INCIDENT_NEXT: Record<string, string[]> = { reported: ['assessing'], assessing: ['notifiable', 'not_notifiable'], notifiable: ['notified'], not_notifiable: ['closed'], notified: ['closed'], closed: [] }
export async function reportIncident(_root: unknown, args: { title: string; description: string; discoveredOn: string; affectedCount?: number | null; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, ...COMPLIANCE)
  return run(context, actor, 'incident.report', args, async uow => {
    const on = needDate(args.discoveredOn, 'discoveredOn')
    const affected = Number(args.affectedCount ?? 0)
    if (!Number.isInteger(affected) || affected < 0 || affected > 10_000_000) throw new DomainError(Codes.INVALID_INPUT, 'Enter how many people may be affected.', { field: 'affectedCount' })
    const row = await uow.tx.incidentReport.create({ data: { title: requireText(args.title, 'title', 140), description: requireText(args.description, 'description', 4000), discoveredAt: new Date(`${on}T00:00:00Z`), affectedCount: affected, reportedById: actor.kind === 'user' ? actor.userId : null } })
    auditCreate(uow, actor, 'IncidentReport', row.id, 'incident.reported', { discoveredOn: on, affected })
    return { id: row.id }
  })
}

export async function advanceIncident(_root: unknown, args: { incidentId: string; expectedVersion: number; to: string; riskAssessment?: string | null; notifiedOn?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, ...COMPLIANCE)
  return run(context, actor, 'incident.advance', args, async uow => {
    const row = await lockRow<any>(uow.tx, 'IncidentReport', args.incidentId)
    const to = String(args.to)
    if (!(INCIDENT_NEXT[row.status] ?? []).includes(to)) throw new DomainError(Codes.INVALID_TRANSITION, `An incident that is ${row.status.replaceAll('_', ' ')} can't move to ${to.replaceAll('_', ' ')}.`)
    const data: Record<string, unknown> = {}
    if (to === 'notifiable' || to === 'not_notifiable') data.riskAssessment = requireText(args.riskAssessment, 'risk assessment', 4000)
    if (to === 'notified') data.notifiedAt = new Date(`${needDate(args.notifiedOn, 'notifiedOn')}T00:00:00Z`)
    await transition<any>(uow, { model: 'IncidentReport', id: row.id, from: [row.status], to, expectedVersion: args.expectedVersion, actor, eventType: `incident.${to}`, data })
    return { id: row.id, status: to }
  })
}

export async function openRightsRequest(_root: unknown, args: { patientId: string; kind: string; receivedOn: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, ...COMPLIANCE)
  return run(context, actor, 'rights.open', args, async uow => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const kind = oneOf(args.kind, ['access', 'amendment', 'accounting', 'restriction', 'confidential_communication'] as const, 'kind')
    const received = needDate(args.receivedOn, 'receivedOn')
    const { nextReference } = await import('../lib/sequence')
    const ref = await nextReference(uow.tx, 'RR', uow.now)
    const row = await uow.tx.patientRightsRequest.create({ data: { ref, patientId: args.patientId, kind, receivedOn: dayOf(received), dueOn: dayOf(rightsDueOn(received)) } })
    auditCreate(uow, actor, 'PatientRightsRequest', row.id, 'rights.opened', { kind, dueOn: rightsDueOn(received) })
    return { id: row.id, ref }
  })
}

export async function extendRightsRequest(_root: unknown, args: { requestId: string; expectedVersion: number; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, ...COMPLIANCE)
  return run(context, actor, 'rights.extend', args, async uow => {
    const reason = requireReason(args.reason)
    const row = await transition<any>(uow, {
      model: 'PatientRightsRequest', id: args.requestId, from: ['open'], to: 'extended', expectedVersion: args.expectedVersion, actor, eventType: 'rights.extended', reason,
      guard: r => { if (r.extendedOnce) throw new DomainError(Codes.GUARD_FAILED, 'A request can be extended once.') },
      data: r => ({ extendedOnce: true, dueOn: dayOf(rightsExtendedDueOn(isoDay(r.dueOn)!)) }),
    })
    return { id: row.id, dueOn: isoDay(row.dueOn) }
  })
}

export async function resolveRightsRequest(_root: unknown, args: { requestId: string; expectedVersion: number; outcome: string; resolution: string; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, ...COMPLIANCE)
  return run(context, actor, 'rights.resolve', args, async uow => {
    const to = oneOf(args.outcome, ['fulfilled', 'denied'] as const, 'outcome')
    await transition<any>(uow, { model: 'PatientRightsRequest', id: args.requestId, from: ['open', 'extended'], to, expectedVersion: args.expectedVersion, actor, eventType: `rights.${to}`, data: { resolution: requireText(args.resolution, 'resolution', 1000), resolvedAt: uow.now } })
    return { id: args.requestId, status: to }
  })
}

export async function recordDisclosure(_root: unknown, args: { patientId: string; disclosedOn: string; recipient: string; purpose: string; description?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, ...COMPLIANCE)
  return run(context, actor, 'disclosure.record', args, async uow => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const row = await uow.tx.accountingOfDisclosure.create({ data: { patientId: args.patientId, disclosedOn: dayOf(needDate(args.disclosedOn, 'disclosedOn')), recipient: requireText(args.recipient, 'recipient', 140), purpose: requireText(args.purpose, 'purpose', 200), description: optionalText(args.description, 1000), recordedById: actor.kind === 'user' ? actor.userId : null } })
    auditCreate(uow, actor, 'AccountingOfDisclosure', row.id, 'disclosure.recorded', { patientId: args.patientId })
    return { id: row.id }
  })
}

export async function saveRetentionPolicy(_root: unknown, args: { recordType: string; years: number; minorsUntilAge?: number | null; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, ...COMPLIANCE)
  return run(context, actor, 'retention.save_policy', args, async uow => {
    const years = Number(args.years)
    if (!Number.isInteger(years) || years < 1 || years > 100) throw new DomainError(Codes.INVALID_INPUT, 'Keep records for 1 to 100 years.', { field: 'years' })
    const minors = args.minorsUntilAge ? Number.parseInt(String(args.minorsUntilAge), 10) : null
    if (minors !== null && (!Number.isInteger(minors) || minors < 1 || minors > 30)) throw new DomainError(Codes.INVALID_INPUT, 'Enter an age from 1 to 30.', { field: 'minorsUntilAge' })
    const recordType = oneOf(args.recordType, ['patient_chart'] as const, 'record type')
    const row = await uow.tx.retentionPolicy.upsert({ where: { recordType }, update: { years, minorsUntilAge: minors, isActive: true }, create: { recordType, years, minorsUntilAge: minors } })
    auditCreate(uow, actor, 'RetentionPolicy', row.id, 'retention.policy_saved', { years, minors })
    return { id: row.id }
  })
}

export async function placeRecordHold(_root: unknown, args: { patientId: string; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, ...COMPLIANCE)
  return run(context, actor, 'hold.place', args, async uow => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const reason = requireReason(args.reason)
    if (await uow.tx.recordHold.findFirst({ where: { patientId: args.patientId, status: 'active' } })) throw new DomainError(Codes.GUARD_FAILED, 'This record is already on hold.')
    const row = await uow.tx.recordHold.create({ data: { patientId: args.patientId, reason, status: 'active', placedById: actor.kind === 'user' ? actor.userId : null } })
    // Anything waiting to be disposed of stops here.
    await uow.tx.retentionDisposition.updateMany({ where: { patientId: args.patientId, status: { in: ['eligible', 'approval_requested'] } }, data: { status: 'blocked', blockedReason: 'On legal hold', version: { increment: 1 } } })
    auditCreate(uow, actor, 'RecordHold', row.id, 'hold.placed', { patientId: args.patientId }, { reason })
    return { id: row.id }
  })
}

export async function releaseRecordHold(_root: unknown, args: { holdId: string; expectedVersion: number; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, ...COMPLIANCE)
  return run(context, actor, 'hold.release', args, async uow => {
    const releaseReason = requireReason(args.reason)
    await transition<any>(uow, { model: 'RecordHold', id: args.holdId, from: ['active'], to: 'released', expectedVersion: args.expectedVersion, actor, eventType: 'hold.released', reason: releaseReason, data: { releasedAt: uow.now, releaseReason } })
    return { id: args.holdId }
  })
}

/** Find charts past their retention period. Pressing it twice finds nothing new. */
export async function scanRetention(_root: unknown, args: { idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, ...COMPLIANCE)
  return run(context, actor, 'retention.scan', args, async uow => {
    const { tx } = uow
    const policy = await tx.retentionPolicy.findUnique({ where: { recordType: 'patient_chart' } })
    if (!policy || !policy.isActive) throw new DomainError(Codes.GUARD_FAILED, 'Set a retention period first.')
    const { today } = await practiceToday(tx, uow.now)
    const patients = await tx.patient.findMany({ where: { status: { in: ['active', 'inactive'] }, lastVisitOn: { not: null } }, select: { id: true, dateOfBirth: true, lastVisitOn: true }, orderBy: { lastVisitOn: 'asc' }, take: 2000 })
    let found = 0, blocked = 0
    for (const p of patients) {
      const due = eligibleOn({ lastActivityOn: isoDay(p.lastVisitOn)!, dateOfBirth: isoDay(p.dateOfBirth)!, years: policy.years, minorsUntilAge: policy.minorsUntilAge })
      if (due > today) continue
      if (await tx.retentionDisposition.findFirst({ where: { patientId: p.id, status: { not: 'blocked' } } })) continue
      const held = !!(await tx.recordHold.findFirst({ where: { patientId: p.id, status: 'active' } }))
      if (held && (await tx.retentionDisposition.findFirst({ where: { patientId: p.id } }))) continue
      const row = await tx.retentionDisposition.create({ data: { patientId: p.id, eligibleOn: dayOf(due), status: held ? 'blocked' : 'eligible', blockedReason: held ? 'On legal hold' : '' } })
      auditCreate(uow, actor, 'RetentionDisposition', row.id, 'retention.eligible', { eligibleOn: due, held })
      found += 1
      if (held) blocked += 1
    }
    return { found, blocked }
  })
}

const holdOf = (tx: Tx, patientId: string) => tx.recordHold.findFirst({ where: { patientId, status: 'active' } })

/** Ask a second person to approve disposing of a chart. A hold blocks it here, and again at the end, and the database refuses it too. */
export async function requestDisposition(_root: unknown, args: { dispositionId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, ...COMPLIANCE)
  return run(context, actor, 'retention.request', args, async uow => {
    const row = await lockRow<any>(uow.tx, 'RetentionDisposition', args.dispositionId)
    await assertPatientInScope(uow.tx, locationIds, row.patientId)
    if (await holdOf(uow.tx, row.patientId)) {
      if (row.status !== 'blocked') await transition<any>(uow, { model: 'RetentionDisposition', id: row.id, from: ['eligible', 'approval_requested'], to: 'blocked', expectedVersion: args.expectedVersion, actor, eventType: 'retention.blocked', data: { blockedReason: 'On legal hold' } })
      return { id: row.id, blocked: true, reason: 'This record is on legal hold and cannot be disposed of.' }
    }
    const approval = await requestApproval(uow, actor, {
      action: 'retention.dispose', targetList: 'RetentionDisposition', targetId: row.id, requiredPermission: 'canApproveRetention',
      payload: { dispositionId: row.id, patientId: row.patientId }, summary: 'Dispose of a chart past its retention period', scope: { patientId: row.patientId },
    })
    await transition<any>(uow, { model: 'RetentionDisposition', id: row.id, from: ['eligible', 'blocked'], to: 'approval_requested', expectedVersion: args.expectedVersion, actor, eventType: 'retention.approval_requested', data: { approvalId: approval.id, blockedReason: '' } })
    return { id: row.id, blocked: false, approvalId: approval.id }
  })
}

registerApplier('retention.dispose', async (uow, actor, request) => {
  const row = await lockRow<any>(uow.tx, 'RetentionDisposition', request.targetId)
  if (await holdOf(uow.tx, row.patientId)) throw new DomainError(Codes.GUARD_FAILED, 'This record is on legal hold and cannot be disposed of.')
  await transition<any>(uow, { model: 'RetentionDisposition', id: row.id, from: ['approval_requested'], to: 'approved', actor, eventType: 'retention.approved' })
  // The chart is closed and archived; ledger, audit and consent history stay as the law requires. (verify) with counsel what must be physically erased.
  await transition<any>(uow, { model: 'RetentionDisposition', id: row.id, from: ['approved'], to: 'executed', actor, eventType: 'retention.executed', data: { executedAt: uow.now } })
  await uow.tx.patient.update({ where: { id: row.patientId }, data: { status: 'archived', version: { increment: 1 } } })
  return { dispositionId: row.id }
}, { applyOnApprove: true })

/** An approval that was turned down or withdrawn puts the thing it was about back where staff can act on it. */
export async function approvalEnded(uow: any, actor: any, targetList: string, targetId: string) {
  if (targetList === 'RetentionDisposition') {
    await uow.tx.retentionDisposition.updateMany({ where: { id: targetId, status: 'approval_requested' }, data: { status: 'eligible', version: { increment: 1 } } })
  }
  // R3-4: an adjustment whose approval was turned down or withdrawn no longer waits as 'requested'.
  if (targetList === 'AdjustmentRequest') {
    await uow.tx.adjustmentRequest.updateMany({ where: { id: targetId, status: 'requested' }, data: { status: 'rejected', version: { increment: 1 } } })
  }
  if (targetList === 'ImportBatch') {
    await uow.tx.importBatch.updateMany({ where: { id: targetId, status: 'approval_requested' }, data: { status: 'previewed', approvalId: null, version: { increment: 1 } } })
  }
  void actor
}

export { can }

// ── Imaging and findings: records only, no vendor ────────────────────────────────────────────────

/** Records a study the office took itself (manual mode), with the file name of the image kept in the imaging software. */
export async function recordManualStudy(_root: unknown, args: { patientId: string; modality: string; teeth?: string[] | null; acquiredAt?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart')
  const { IMAGING_MODALITIES } = await import('../lib/clinicalAdapters')
  return run(context, actor, 'imaging.record_manual', args, async uow => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const modality = oneOf(args.modality, IMAGING_MODALITIES, 'kind of image')
    const teeth = (args.teeth ?? []).map(t => requireText(t, 'tooth', 4))
    const when = args.acquiredAt ? new Date(args.acquiredAt) : uow.now
    if (Number.isNaN(when.getTime()) || when.getTime() > uow.now.getTime() + 5 * 60_000) throw new DomainError(Codes.INVALID_INPUT, 'The image date cannot be in the future.', { field: 'acquiredAt' })
    const study = await uow.tx.imagingStudy.create({ data: { patientId: args.patientId, modality, teeth: teeth as never, acquiredAt: when, source: 'upload', status: 'acquired' } })
    auditCreate(uow, actor, 'ImagingStudy', study.id, 'imaging.recorded', { patientId: args.patientId, modality, adapter: 'manual' })
    return { id: study.id }
  })
}

/** Stores a finding from an outside reader against a study. It is a record to look at: it creates no chart entry and no treatment. */
export async function receiveExternalFinding(_root: unknown, args: { studyId: string; vendor?: string | null; device: string; modelVersion: string; clearanceRef?: string | null; findingType: string; tooth?: string | null; surfaces?: string | null; confidence?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart')
  const { findingProblem } = await import('../lib/clinicalAdapters')
  return run(context, actor, 'imaging.finding_received', args, async uow => {
    const study = await uow.tx.imagingStudy.findUnique({ where: { id: args.studyId }, select: { id: true, patientId: true, status: true } })
    if (!study?.patientId) throw new DomainError(Codes.NOT_FOUND, 'Study not found.')
    await assertPatientInScope(uow.tx, locationIds, study.patientId)
    if (study.status === 'entered_in_error') throw new DomainError(Codes.GUARD_FAILED, 'That study was entered in error.')
    const problem = findingProblem(args as never)
    if (problem) throw new DomainError(Codes.INVALID_INPUT, problem)
    const row = await uow.tx.externalFinding.create({ data: {
      studyId: study.id, patientId: study.patientId, vendor: optionalText(args.vendor, 80), device: requireText(args.device, 'device', 80), modelVersion: requireText(args.modelVersion, 'version', 40),
      clearanceRef: optionalText(args.clearanceRef, 80), findingType: requireText(args.findingType, 'finding', 120), tooth: optionalText(args.tooth, 4), surfaces: optionalText(args.surfaces, 8),
      confidence: args.confidence ? args.confidence : null, status: 'received',
    } })
    auditCreate(uow, actor, 'ExternalFinding', row.id, 'imaging.finding_received', { studyId: study.id })
    return { id: row.id }
  })
}

/** A person looks at a finding and accepts or dismisses it. Neither choice changes the chart. */
export async function decideExternalFinding(_root: unknown, args: { findingId: string; expectedVersion: number; decision: string; reason?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart')
  return run(context, actor, 'imaging.finding_decided', args, async uow => {
    const row = await lockRow<any>(uow.tx, 'ExternalFinding', args.findingId)
    await assertPatientInScope(uow.tx, locationIds, row.patientId)
    const to = oneOf(args.decision, ['accepted', 'dismissed'] as const, 'decision')
    const reason = to === 'dismissed' ? requireText(args.reason, 'reason', 300) : ''
    await transition<any>(uow, { model: 'ExternalFinding', id: row.id, from: ['received', 'shown'], to, expectedVersion: args.expectedVersion, actor, eventType: `imaging.finding_${to}`, data: { decidedById: actor.kind === 'user' ? actor.userId : null, dismissReason: reason } })
    return { id: row.id, status: to }
  })
}
