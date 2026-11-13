import { createHash } from 'node:crypto'
import { requirePermission } from '../lib/actor'
import { requestApproval } from '../lib/approval'
import { auditCreate, lockRow, transition } from '../lib/cas'
import { command } from '../lib/command'
import { consumeApproval } from '../lib/approval'
import { buildBundle } from '../lib/bundle'
import { DomainError, Codes } from '../lib/errors'
import { fileHash, freeze, MAX_PATIENTS, MAX_ROWS, parseGenericCsv, parseOpenDental, previewOf, thaw, type Normalised, type Reconciliation } from '../lib/importPure'
import { postEntry } from '../lib/ledger'
import { toCsv } from '../lib/recall'
import { nextReference } from '../lib/sequence'
import { localDate, zonedInstant } from '../lib/time'
import { normalizeSite, type AreaRule } from '../lib/teeth'
import { accountFor, dayOf, isoDay } from './clinicalShared'
import { createPatientIn } from './patients'
import { assertLocation, assertPatientInScope, normalizeContact, requireText, staff, type Ctx } from './shared'

/*
 * Import and export (Phase 6). Import is two steps: a preview that reads the file and writes nothing about patients, then an apply that a second
 * person approves first. The apply runs in chunks, each its own request; every record is mapped (source, kind, external id) so a repeated or
 * resumed chunk never creates anything twice. Export is a synchronous download: the bundle is built in the request and returned.
 */

type Tx = any
export const IMPORT_CHUNK = 100
const MAX_FILE_BYTES = 8_000_000
const OPENING = 'Opening balance (imported)'
/** The finding type an imported condition gets when its code is not one of the office's own condition codes. */
const IMPORTED_CONDITION = 'imported'

const run = async <T>(context: Ctx, actor: any, name: string, args: any, work: (uow: any) => Promise<T>) => {
  const { idempotencyKey, ...params } = args
  const clipped = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === 'string' && v.length > 200 ? `sha256:${createHash('sha256').update(v).digest('hex')}` : v]))
  const result = await command(context.prisma, { name, actor, idempotencyKey, params: clipped }, work)
  return { replay: result.replay, ...(result.value as any) }
}

// ── Preview ──────────────────────────────────────────────────────────────────────────────────────

export async function previewImport(_root: unknown, args: { source: string; fileName: string; content: string; locationId: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canImportData')
  assertLocation(locationIds, args.locationId)
  return run(context, actor, 'import.preview', args, async uow => {
    const { tx } = uow
    const content = String(args.content ?? '')
    if (!content.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Choose a file with something in it.', { field: 'content' })
    if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new DomainError(Codes.INVALID_INPUT, 'That file is too large for one import. Split it and import the parts.', { field: 'content' })
    let n: Normalised
    if (args.source === 'open_dental') {
      let json: unknown
      try { json = JSON.parse(content) } catch { throw new DomainError(Codes.INVALID_INPUT, 'This is not a readable Open Dental export (JSON).', { field: 'content' }) }
      n = parseOpenDental(json)
    } else if (args.source === 'generic_csv') n = parseGenericCsv(content)
    else throw new DomainError(Codes.INVALID_INPUT, 'Choose where the file came from.', { field: 'source' })
    if (!n.patients.length) throw new DomainError(Codes.INVALID_INPUT, n.problems.length ? `No patient could be read. First problem: ${n.problems[0].problem}` : 'No patients were found in the file.')
    if (n.patients.length > MAX_PATIENTS || n.patients.length + n.appointments.length + n.procedures.length > MAX_ROWS) throw new DomainError(Codes.INVALID_INPUT, 'That file has too many rows for one import. Split it and import the parts.')
    const sha = fileHash(content)
    const same = await tx.importBatch.findFirst({ where: { fileSha256: sha, locationId: args.locationId } })
    if (same) throw new DomainError(Codes.GUARD_FAILED, `This exact file was already read (${same.ref}, ${same.status.replaceAll('_', ' ')}).`, { batchId: same.id })
    const mapped = await tx.importRecordMap.findMany({ where: { source: n.source, entity: 'patient', externalId: { in: n.patients.map(p => p.ext) } }, select: { externalId: true } })
    const byExt = new Set(mapped.map((m: any) => m.externalId))
    let matched = 0
    for (const p of n.patients.slice(0, 1000)) {
      if (byExt.has(p.ext)) continue
      if (await tx.patient.findFirst({ where: { dateOfBirth: dayOf(p.dateOfBirth), lastName: { equals: p.lastName, mode: 'insensitive' }, firstName: { equals: p.firstName, mode: 'insensitive' }, status: { not: 'merged_into' } }, select: { id: true } })) matched += 1
    }
    const preview = previewOf(n, { matched, byExt: byExt.size })
    const ref = await nextReference(tx, 'IMP', uow.now)
    const row = await tx.importBatch.create({ data: { ref, source: n.source, fileName: requireText(args.fileName || 'import', 'file name', 120), fileSha256: sha, locationId: args.locationId, rows: freeze(n) as never, preview: preview as never, reconciliation: {} as never, cursor: 0, status: 'previewed', createdById: actor.kind === 'user' ? actor.userId : null } })
    auditCreate(uow, actor, 'ImportBatch', row.id, 'import.previewed', { ref, source: n.source, patients: n.patients.length, problems: n.problems.length })
    return { id: row.id, ref, preview }
  })
}

export async function requestImportApply(_root: unknown, args: { batchId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canImportData')
  return run(context, actor, 'import.request_apply', args, async uow => {
    const row = await lockRow<any>(uow.tx, 'ImportBatch', args.batchId)
    assertLocation(locationIds, row.locationId)
    if (row.preview?.patients?.importable < 1) throw new DomainError(Codes.GUARD_FAILED, 'There is nothing to import.')
    const approval = await requestApproval(uow, actor, {
      action: 'import.apply', targetList: 'ImportBatch', targetId: row.id, requiredPermission: 'canApproveImports',
      payload: { batchId: row.id, fileSha256: row.fileSha256 }, summary: `Import ${row.preview?.patients?.importable ?? 0} patients from ${row.fileName}`, scope: { locationId: row.locationId },
    })
    await transition<any>(uow, { model: 'ImportBatch', id: row.id, from: ['previewed'], to: 'approval_requested', expectedVersion: args.expectedVersion, actor, eventType: 'import.approval_requested', data: { approvalId: approval.id } })
    return { id: row.id, approvalId: approval.id }
  })
}

// ── Apply (chunked) ──────────────────────────────────────────────────────────────────────────────

const emptyRecon = (n: Normalised): Reconciliation => ({
  patients: { source: n.patients.length + n.problems.filter(p => p.entity === 'patient').length, created: 0, matchedExisting: 0, skipped: n.problems.filter(p => p.entity === 'patient').length },
  appointments: { source: n.appointments.length + n.problems.filter(p => p.entity === 'appointment').length, created: 0, skipped: n.problems.filter(p => p.entity === 'appointment').length, skippedReasons: n.problems.filter(p => p.entity === 'appointment').reduce<Record<string, number>>((m, p) => ({ ...m, [p.problem]: (m[p.problem] ?? 0) + 1 }), {}) },
  procedures: { source: n.procedures.length + n.problems.filter(p => p.entity === 'procedure').length, chart: 0, conditions: 0, historyOnly: 0, deleted: 0, skipped: n.problems.filter(p => p.entity === 'procedure').length },
  balances: { sourceMinor: '0', ledgerMinor: '0', patientsChecked: 0, mismatches: 0, differenceMinor: '0' }, balanced: false,
})

async function applyChunk(uow: any, actor: any, batch: any, n: Normalised, recon: Reconciliation) {
  const { tx } = uow
  const location = await tx.location.findUniqueOrThrow({ where: { id: batch.locationId }, select: { timeZone: true } })
  const settings = await tx.practiceSettings.findUnique({ where: { id: 1 }, select: { isSynthetic: true, currencyCode: true } })
  const today = localDate(location.timeZone, uow.now)
  const slice = n.patients.slice(batch.cursor, batch.cursor + IMPORT_CHUNK)
  const exts = new Set(slice.map(p => p.ext))
  const maps = await tx.importRecordMap.findMany({ where: { source: batch.source } })
  const mapOf = new Map<string, string>(maps.map((m: any) => [`${m.entity}|${m.externalId}`, m.internalId]))
  const remember = async (entity: string, ext: string, internalId: string) => {
    await tx.importRecordMap.create({ data: { batchId: batch.id, source: batch.source, entity, externalId: ext, internalId } })
    mapOf.set(`${entity}|${ext}`, internalId)
  }
  const patientIdOf = new Map<string, string>()
  for (const p of slice) {
    const known = mapOf.get(`patient|${p.ext}`)
    if (known) { patientIdOf.set(p.ext, known); continue }
    const twin = await tx.patient.findFirst({ where: { dateOfBirth: dayOf(p.dateOfBirth), lastName: { equals: p.lastName, mode: 'insensitive' }, firstName: { equals: p.firstName, mode: 'insensitive' }, status: { not: 'merged_into' } }, select: { id: true } })
    if (twin) { await remember('patient', p.ext, twin.id); patientIdOf.set(p.ext, twin.id); recon.patients.matchedExisting += 1; continue }
    const contacts: { kind: string; value: string; isPrimary: boolean }[] = []
    for (const c of [{ kind: 'mobile', value: p.phone }, { kind: 'email', value: p.email }]) {
      if (!c.value) continue
      try { normalizeContact(c.kind, c.value); contacts.push({ ...c, isPrimary: true }) } catch { /* an unreadable phone or email is left off, not guessed at */ }
    }
    const created = await createPatientIn(uow, actor, {
      firstName: p.firstName, lastName: p.lastName, middleName: p.middleName, preferredName: p.preferredName, dateOfBirth: p.dateOfBirth,
      sexAssignedAtBirth: p.sex, address: p.address, homeLocationId: batch.locationId, contacts, isSynthetic: !!settings?.isSynthetic, status: 'active',
    } as any)
    await remember('patient', p.ext, created.id)
    patientIdOf.set(p.ext, created.id)
    recon.patients.created += 1
    if (p.balanceMinor !== 0n) {
      const account = await accountFor(uow, created.id)
      await postEntry(tx, {
        accountId: account.id, patientId: created.id, kind: p.balanceMinor > 0n ? 'charge' : 'patient_adjustment', amountMinor: p.balanceMinor, currencyCode: settings?.currencyCode ?? 'USD',
        businessDate: dayOf(today), locationId: batch.locationId, memo: OPENING, postedById: actor.kind === 'user' ? actor.userId : null, isSynthetic: !!settings?.isSynthetic,
      }, uow.now)
    }
    auditCreate(uow, actor, 'Patient', created.id, 'import.patient_created', { batch: batch.ref, externalId: p.ext })
  }

  // Appointments. A time that clashes with the chair or the patient is skipped and reported; the database exclusion is never allowed to fire.
  const type = (await tx.appointmentType.findFirst({ where: { isActive: true, category: { in: ['recall_hygiene', 'general'] } }, orderBy: { createdAt: 'asc' } })) ?? (await tx.appointmentType.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } }))
  const operatory = await tx.operatory.findFirst({ where: { locationId: batch.locationId, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
  const skip = (reason: string) => { recon.appointments.skipped += 1; recon.appointments.skippedReasons[reason] = (recon.appointments.skippedReasons[reason] ?? 0) + 1 }
  for (const a of n.appointments.filter(x => exts.has(x.patientExt))) {
    if (mapOf.has(`appointment|${a.ext}`)) continue
    const patientId = patientIdOf.get(a.patientExt)
    if (!patientId) { skip('patient not imported'); continue }
    if (!type || !operatory) { skip('no appointment type or chair set up'); continue }
    const startsAt = zonedInstant(location.timeZone, a.date, a.time)
    const endsAt = new Date(startsAt.getTime() + a.minutes * 60_000)
    const status = a.status === 'completed' ? 'completed' : a.status === 'broken' ? 'broken' : a.status === 'planned' ? 'planned' : 'scheduled'
    if (status === 'scheduled') {
      if (startsAt.getTime() < uow.now.getTime()) { skip('scheduled in the past'); continue }
      const clash = await tx.appointment.findFirst({ where: { status: { in: ['scheduled', 'confirmed', 'arrived', 'seated', 'ready_for_checkout'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, OR: [{ operatoryId: operatory.id }, { patientId }] }, select: { id: true } })
      if (clash) { skip('time already taken'); continue }
    }
    const ref = await nextReference(tx, 'APT', uow.now)
    const row = await tx.appointment.create({
      data: {
        ref, patientId, locationId: batch.locationId, operatoryId: status === 'planned' ? null : operatory.id, typeId: type.id, startsAt, endsAt, localDate: dayOf(a.date), status,
        brokenKind: status === 'broken' ? 'no_show' : '', note: a.note, source: 'import', isSynthetic: !!settings?.isSynthetic, warnings: [] as never,
        ...(status === 'completed' ? { completedAt: endsAt } : {}),
      },
    })
    await remember('appointment', a.ext, row.id)
    recon.appointments.created += 1
  }

  // Chart. A procedure whose code this office does not have is kept as outside history so nothing is lost and nothing is billed.
  // A row deleted in the old system is counted and left out; a condition row becomes a finding, never a procedure.
  for (const pr of n.procedures.filter(x => exts.has(x.patientExt))) {
    if (mapOf.has(`procedure|${pr.ext}`)) continue
    if (pr.status === 'deleted') { recon.procedures.deleted += 1; continue }
    const patientId = patientIdOf.get(pr.patientExt)
    if (!patientId) { recon.procedures.skipped += 1; continue }
    if (pr.status === 'condition') {
      const known = pr.codeText ? await tx.conditionType.findFirst({ where: { code: { equals: pr.codeText, mode: 'insensitive' }, isActive: true } }) : null
      const condition = known ?? (await tx.conditionType.upsert({ where: { code: IMPORTED_CONDITION }, update: {}, create: { code: IMPORTED_CONDITION, label: 'Finding from the previous system', chartSymbol: 'IM', areaRule: 'tooth' } }))
      let site: Record<string, unknown> = { area: 'mouth' }
      try { if (pr.tooth) site = normalizeSite('tooth_surface', { tooth: pr.tooth, surfaces: pr.surfaces }, { requiresSurfaces: false }) } catch (error) { if (!(error instanceof DomainError)) throw error }
      const entry = await tx.chartEntry.create({ data: { patientId, locationId: batch.locationId, kind: 'condition', conditionId: condition.id, status: 'existing_current', conditionStatus: 'active', source: 'import', isSynthetic: !!settings?.isSynthetic, dateOfService: dayOf(pr.date), ...site } })
      recon.procedures.conditions += 1
      await remember('procedure', pr.ext, entry.id)
      continue
    }
    const code = pr.codeText ? await tx.procedureCode.findFirst({ where: { OR: [{ code: pr.codeText }, { code: { equals: `OF-${pr.codeText}`, mode: 'insensitive' } }] } }) : null
    let id: string | null = null
    if (code) {
      try {
        const site = normalizeSite(code.areaRule as AreaRule, { tooth: pr.tooth, surfaces: pr.surfaces }, { requiresSurfaces: code.requiresSurfaces, maxSurfaces: code.maxSurfaces })
        const entry = await tx.chartEntry.create({
          data: {
            patientId, locationId: batch.locationId, kind: 'procedure', codeId: code.id, status: pr.status === 'planned' ? 'planned' : pr.status, source: 'import', isSynthetic: !!settings?.isSynthetic,
            ...(pr.status === 'planned' ? {} : { dateOfService: dayOf(pr.date) }), ...site,
          },
        })
        id = entry.id
        recon.procedures.chart += 1
      } catch (error) {
        if (!(error instanceof DomainError)) throw error
      }
    }
    if (!id) {
      const h = await tx.outsideHistory.create({ data: { patientId, codeId: code?.id ?? null, codeText: pr.codeText.slice(0, 20), tooth: pr.tooth, surfaces: pr.surfaces, dateOfService: pr.date <= today ? dayOf(pr.date) : null, providerName: '', source: 'patient_reported' } })
      id = h.id
      recon.procedures.historyOnly += 1
    }
    await remember('procedure', pr.ext, id as string)
  }
  return slice.length
}

export async function applyImportChunk(_root: unknown, args: { batchId: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canImportData')
  return run(context, actor, 'import.apply_chunk', args, async uow => {
    const { tx } = uow
    let batch = await lockRow<any>(tx, 'ImportBatch', args.batchId)
    assertLocation(locationIds, batch.locationId)
    if (batch.status === 'applied') return { id: batch.id, status: 'applied', done: true, cursor: batch.cursor, reconciliation: batch.reconciliation }
    if (batch.status === 'approval_requested') {
      if (!batch.approvalId) throw new DomainError(Codes.APPROVAL_REQUIRED, 'A second person must approve this import first.')
      await consumeApproval(uow, { requestId: batch.approvalId, action: 'import.apply', targetList: 'ImportBatch', targetId: batch.id, payload: { batchId: batch.id, fileSha256: batch.fileSha256 } })
      batch = await transition<any>(uow, { model: 'ImportBatch', id: batch.id, from: ['approval_requested'], to: 'applying', actor, eventType: 'import.applying', data: { reconciliation: emptyRecon(thaw(batch.rows)) } })
    } else if (batch.status !== 'applying') throw new DomainError(Codes.APPROVAL_REQUIRED, 'A second person must approve this import first.')
    const n = thaw(batch.rows)
    const recon: Reconciliation = batch.reconciliation && (batch.reconciliation as any).patients ? (batch.reconciliation as Reconciliation) : emptyRecon(n)
    const handled = await applyChunk(uow, actor, batch, n, recon)
    const cursor = batch.cursor + handled
    const done = cursor >= n.patients.length
    if (done) await finishReconciliation(tx, batch, n, recon)
    await tx.importBatch.update({ where: { id: batch.id }, data: { cursor, reconciliation: recon as never, version: { increment: 1 }, ...(done ? { status: 'applied', appliedAt: uow.now } : {}) } })
    uow.audit({ eventType: done ? 'import.applied' : 'import.chunk_applied', entityType: 'ImportBatch', entityId: batch.id, actorUserId: actor.kind === 'user' ? actor.userId : null, after: { cursor, done, balanced: recon.balanced } })
    return { id: batch.id, status: done ? 'applied' : 'applying', done, cursor, total: n.patients.length, reconciliation: recon }
  })
}

/** The ledger is read back and compared with what the file said each patient owed. */
async function finishReconciliation(tx: Tx, batch: any, n: Normalised, recon: Reconciliation) {
  const maps = await tx.importRecordMap.findMany({ where: { batchId: batch.id, entity: 'patient' }, select: { externalId: true, internalId: true } })
  const created = new Map<string, string>(maps.map((m: any) => [m.externalId, m.internalId]))
  const entries = await tx.ledgerEntry.findMany({ where: { patientId: { in: [...created.values()] }, memo: OPENING }, select: { patientId: true, amountMinor: true } })
  const byPatient = new Map<string, bigint>()
  for (const e of entries) byPatient.set(e.patientId, (byPatient.get(e.patientId) ?? 0n) + e.amountMinor)
  let source = 0n, ledger = 0n, mismatches = 0
  for (const p of n.patients) {
    const id = created.get(p.ext)
    if (!id) continue
    const got = byPatient.get(id) ?? 0n
    // Patients who were already in the chart keep their own books; only the ones created here are compared.
    const wasCreated = got !== 0n || p.balanceMinor === 0n
    if (!wasCreated) continue
    source += p.balanceMinor; ledger += got
    if (got !== p.balanceMinor) mismatches += 1
  }
  recon.balances = { sourceMinor: source.toString(), ledgerMinor: ledger.toString(), patientsChecked: created.size, mismatches, differenceMinor: (ledger - source).toString() }
  recon.balanced = mismatches === 0 && ledger === source
}

// ── Export ───────────────────────────────────────────────────────────────────────────────────────

const slim = (rows: any[], drop: string[] = []) => rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !drop.includes(k))))

/** The electronic health information bundle for one patient: a zip of JSON files with a manifest. Built and returned in the request. */
export async function exportEhiBundle(_root: unknown, args: { patientId: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canExportData')
  return run(context, actor, 'export.ehi_bundle', args, async uow => {
    const { tx } = uow
    await assertPatientInScope(tx, locationIds, args.patientId)
    const where = { patientId: args.patientId }
    const patient = await tx.patient.findUniqueOrThrow({ where: { id: args.patientId } })
    const [contacts, alerts, appointments, chart, notes, ledger, prescriptions, consents, imaging, history, forms] = await Promise.all([
      tx.contactPoint.findMany({ where, orderBy: { createdAt: 'asc' } }),
      tx.patientAlert.findMany({ where, orderBy: { createdAt: 'asc' } }),
      tx.appointment.findMany({ where, orderBy: { startsAt: 'asc' } }),
      tx.chartEntry.findMany({ where, orderBy: { createdAt: 'asc' } }),
      tx.clinicalNote.findMany({ where: { ...where, status: { not: 'draft' } }, orderBy: { createdAt: 'asc' } }),
      tx.ledgerEntry.findMany({ where, orderBy: { createdAt: 'asc' } }),
      tx.prescription.findMany({ where, orderBy: { createdAt: 'asc' } }),
      tx.consentGrant.findMany({ where: { contactPoint: { patientId: args.patientId } }, orderBy: { createdAt: 'asc' } }),
      tx.imagingStudy.findMany({ where, orderBy: { createdAt: 'asc' } }),
      tx.outsideHistory.findMany({ where, orderBy: { createdAt: 'asc' } }),
      tx.formSubmission.findMany({ where: { request: { patientId: args.patientId } }, orderBy: { createdAt: 'asc' } }),
    ])
    const sections = [
      { name: 'patient.json', records: [slim([patient], ['mergedIntoId'])[0]] },
      { name: 'contacts.json', records: contacts }, { name: 'alerts.json', records: alerts }, { name: 'appointments.json', records: appointments.map((a: any) => slim([a], ['warnings'])[0]) },
      { name: 'chart.json', records: chart }, { name: 'notes.json', records: notes }, { name: 'ledger.json', records: ledger }, { name: 'prescriptions.json', records: prescriptions },
      { name: 'consents.json', records: consents }, { name: 'imaging.json', records: imaging },
      { name: 'outside-history.json', records: history }, { name: 'forms.json', records: forms },
    ]
    const bundle = buildBundle({ patientChart: patient.chartNumber, now: uow.now, sections })
    const ref = await nextReference(tx, 'EXP', uow.now)
    const counts = Object.fromEntries(bundle.manifest.files.map(f => [f.name.replace('.json', ''), f.records]))
    const job = await tx.exportJob.create({ data: { ref, kind: 'ehi_bundle', patientId: patient.id, status: 'completed', sha256: bundle.sha256, byteCount: bundle.bytes.length, counts: counts as never, requestedById: actor.kind === 'user' ? actor.userId : null } })
    auditCreate(uow, actor, 'ExportJob', job.id, 'export.ehi_bundle', { patientId: patient.id, sha256: bundle.sha256, bytes: bundle.bytes.length })
    return { id: job.id, ref, fileName: `ehi-${patient.chartNumber}.zip`, mimeType: 'application/zip', base64: bundle.bytes.toString('base64'), sha256: bundle.sha256, counts }
  })
}

/** A plain CSV journal of ledger postings for a date range, for the practice's accountant. */
export async function exportJournalCsv(_root: unknown, args: { locationId: string; from: string; to: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canExportData')
  assertLocation(locationIds, args.locationId)
  return run(context, actor, 'export.csv_journal', args, async uow => {
    const day = /^\d{4}-\d{2}-\d{2}$/
    if (!day.test(args.from) || !day.test(args.to) || args.to < args.from) throw new DomainError(Codes.INVALID_INPUT, 'Choose a start date and an end date after it.', { field: 'to' })
    if (Date.parse(args.to) - Date.parse(args.from) > 400 * 86_400_000) throw new DomainError(Codes.INVALID_INPUT, 'Export up to 13 months at a time.', { field: 'to' })
    const rows = await uow.tx.ledgerEntry.findMany({ where: { locationId: args.locationId, businessDate: { gte: dayOf(args.from), lte: dayOf(args.to) } }, orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }], take: 50_000, include: { patient: { select: { chartNumber: true } } } })
    const fmt = (m: bigint) => `${m < 0n ? '-' : ''}${(m < 0n ? -m : m) / 100n}.${((m < 0n ? -m : m) % 100n).toString().padStart(2, '0')}`
    const csv = toCsv(['Date', 'Chart', 'Kind', 'Amount', 'Currency', 'Memo'], rows.map((r: any) => [isoDay(r.businessDate), r.patient?.chartNumber ?? '', String(r.kind).replaceAll('_', ' '), fmt(r.amountMinor), r.currencyCode, r.memo ?? '']))
    const ref = await nextReference(uow.tx, 'EXP', uow.now)
    const job = await uow.tx.exportJob.create({ data: { ref, kind: 'csv_journal', status: 'completed', sha256: createHash('sha256').update(csv).digest('hex'), byteCount: Buffer.byteLength(csv), counts: { rows: rows.length } as never, requestedById: actor.kind === 'user' ? actor.userId : null } })
    auditCreate(uow, actor, 'ExportJob', job.id, 'export.csv_journal', { rows: rows.length, from: args.from, to: args.to })
    return { id: job.id, fileName: `journal-${args.from}-to-${args.to}.csv`, mimeType: 'text/csv', text: csv, rows: rows.length }
  })
}
