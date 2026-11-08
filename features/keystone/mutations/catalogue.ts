import { requirePermission } from '../lib/actor'
import { canonicalJson, sha256 } from '../lib/canonical'
import { auditCreate, lockRow, transition } from '../lib/cas'
import { command } from '../lib/command'
import { requestApproval } from '../lib/approval'
import { registerApplier } from '../lib/approvalAppliers'
import { DomainError, Codes } from '../lib/errors'
import { AREA_RULES, CODE_CATEGORIES, FEE_KINDS, LICENCE_TYPES } from '../models/catalogue'
import { dayOf, oneOf } from './clinicalShared'
import { optionalText, requireText, staff, type Ctx } from './shared'

/*
 * Codes and fees (SM§5; SCHEMA §7; INTEGRATIONS §11). The app ships only practice-authored `OF-` codes.
 * A licensed set such as CDT arrives as an uploaded file under the practice's own licence: the batch is
 * validated, the licence is attested by a person, and a second person approves activation.
 */

const MAX_ROWS = 5000

type Row = { code: string; nomenclature?: string; patientFriendlyName?: string; category?: string; areaRule?: string; requiresSurfaces?: boolean; maxSurfaces?: number | null; effectiveFrom?: string }

function cleanRow(raw: Record<string, unknown>, index: number): { row: Row | null; problem: string | null } {
  const code = String(raw.code ?? '').trim().toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9-]{1,15}$/.test(code)) return { row: null, problem: `Row ${index + 1}: “${code.slice(0, 20)}” is not a valid code.` }
  const category = String(raw.category ?? 'diagnostic')
  const areaRule = String(raw.areaRule ?? 'tooth')
  if (!(CODE_CATEGORIES as readonly string[]).includes(category)) return { row: null, problem: `Row ${index + 1}: unknown category “${category.slice(0, 30)}”.` }
  if (!(AREA_RULES as readonly string[]).includes(areaRule)) return { row: null, problem: `Row ${index + 1}: unknown area rule “${areaRule.slice(0, 30)}”.` }
  const from = String(raw.effectiveFrom ?? '2026-01-01')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return { row: null, problem: `Row ${index + 1}: the start date must look like 2026-01-01.` }
  return {
    row: { code, nomenclature: String(raw.nomenclature ?? '').slice(0, 400), patientFriendlyName: String(raw.patientFriendlyName ?? '').slice(0, 200), category, areaRule, requiresSurfaces: raw.requiresSurfaces === true, maxSurfaces: raw.maxSurfaces == null ? null : Number(raw.maxSurfaces), effectiveFrom: from },
    problem: null,
  }
}

/** Upload a code set: held as rows on the batch, validated on the spot, not yet in use. */
export async function uploadCodeImport(_root: unknown, args: { systemKey: string; label: string; editionYear: number; fileName: string; rows: Record<string, unknown>[]; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, 'canImportCodes')
  const label = requireText(args.label, 'label', 160)
  if (!Array.isArray(args.rows) || !args.rows.length) throw new DomainError(Codes.INVALID_INPUT, 'The file has no rows.', { field: 'rows' })
  if (args.rows.length > MAX_ROWS) throw new DomainError(Codes.INVALID_INPUT, `A batch holds at most ${MAX_ROWS} rows.`, { field: 'rows' })
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'code_import.upload', actor, idempotencyKey, params: { ...params, rows: sha256(canonicalJson(args.rows)) } }, async uow => {
    const system = await uow.tx.codeSystem.findUnique({ where: { key: args.systemKey } })
    if (!system) throw new DomainError(Codes.NOT_FOUND, 'Unknown code system.', { field: 'systemKey' })
    const cleaned = args.rows.map(cleanRow)
    const problems = cleaned.map(c => c.problem).filter((p): p is string => !!p)
    const rows = cleaned.map(c => c.row).filter((r): r is Row => !!r)
    const seen = new Set<string>()
    for (const r of rows) {
      const key = `${r.code}|${r.effectiveFrom}`
      if (seen.has(key)) problems.push(`${r.code} appears twice with the same start date.`)
      seen.add(key)
    }
    const batch = await uow.tx.codeImportBatch.create({
      data: { label, codeSystemId: system.id, editionYear: args.editionYear, fileName: optionalText(args.fileName, 200), fileSha256: sha256(canonicalJson(args.rows)), rows: rows as never, rowCount: rows.length, validationReport: { ok: problems.length === 0, problems: problems.slice(0, 50), problemCount: problems.length } as never, status: problems.length ? 'rejected' : 'validated', uploadedById: actor.kind === 'user' ? actor.userId : null },
    })
    auditCreate(uow, actor, 'CodeImportBatch', batch.id, 'code_import.uploaded', { system: system.key, rows: rows.length, problems: problems.length })
    return { batchId: batch.id, status: batch.status, rowCount: rows.length, problems: problems.slice(0, 50) }
  })
  return { replay: result.replay, ...result.value }
}

/** A person attests the practice holds the licence for this set (INTEGRATIONS §11). */
export async function attestCodeLicence(_root: unknown, args: { batchId: string; expectedVersion: number; licenceType: string; licenceHolder: string; agreementRef: string; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, 'canImportCodes')
  if (actor.kind !== 'user') throw new DomainError(Codes.AGENT_CANNOT_APPROVE, 'A person attests the licence.')
  const licenceType = oneOf(args.licenceType, LICENCE_TYPES, 'licence type')
  const holder = requireText(args.licenceHolder, 'licence holder', 160)
  const agreementRef = requireText(args.agreementRef, 'agreement reference', 120)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'code_import.attest', actor, idempotencyKey, params }, async uow => {
    await transition<any>(uow, { model: 'CodeImportBatch', id: args.batchId, from: ['validated'], to: 'attested', expectedVersion: args.expectedVersion, actor, eventType: 'code_import.attested', data: { attestation: { licenceType, holder, agreementRef, attestedBy: actor.userId, at: uow.now.toISOString() }, attestedById: actor.userId, attestedAt: uow.now } })
    return { batchId: args.batchId }
  })
  return { replay: result.replay, ...result.value }
}

/** Ask a second person to activate the set. The batch is activated by the applier once approved. */
export async function requestCodeActivation(_root: unknown, args: { batchId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, 'canImportCodes')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'code_import.request_activation', actor, idempotencyKey, params }, async uow => {
    const batch = await lockRow<any>(uow.tx, 'CodeImportBatch', args.batchId)
    if (batch.status !== 'attested') throw new DomainError(Codes.GUARD_FAILED, 'Attest the licence before asking for activation.')
    if (batch.version !== args.expectedVersion) throw new DomainError(Codes.STALE_STATE, 'The batch changed since you loaded it.', { currentVersion: batch.version })
    const approval = await requestApproval(uow, actor, { action: 'code_import.activate', targetList: 'CodeImportBatch', targetId: batch.id, payload: { batchId: batch.id, fileSha256: batch.fileSha256, rowCount: batch.rowCount }, requiredPermission: 'canApproveCodeImport', summary: `Activate ${batch.label} (${batch.rowCount} codes)` })
    await uow.tx.codeImportBatch.update({ where: { id: batch.id }, data: { approvalId: approval.id, version: { increment: 1 } } })
    return { approvalId: approval.id }
  })
  return { replay: result.replay, ...result.value }
}

registerApplier('code_import.activate', async (uow, actor, request) => {
  const batch = await lockRow<any>(uow.tx, 'CodeImportBatch', String(request.payload.batchId))
  if (batch.status !== 'attested') throw new DomainError(Codes.GUARD_FAILED, 'This batch is no longer waiting for activation.')
  const rows = (batch.rows ?? []) as Row[]
  const system = await uow.tx.codeSystem.findUnique({ where: { id: batch.codeSystemId } })
  if (!system) throw new DomainError(Codes.NOT_FOUND, 'Code system not found.')
  const previous = system.activeImportId
  if (previous) await uow.tx.codeImportBatch.update({ where: { id: previous }, data: { status: 'superseded', version: { increment: 1 } } })
  for (const row of rows) {
    await uow.tx.procedureCode.upsert({
      where: { codeSystemId_code_effectiveFrom: { codeSystemId: system.id, code: row.code, effectiveFrom: dayOf(row.effectiveFrom!) } },
      create: { codeSystemId: system.id, code: row.code, nomenclature: row.nomenclature ?? '', patientFriendlyName: row.patientFriendlyName ?? '', category: row.category!, areaRule: row.areaRule!, requiresSurfaces: row.requiresSurfaces === true, maxSurfaces: row.maxSurfaces ?? null, effectiveFrom: dayOf(row.effectiveFrom!), importBatchId: batch.id },
      update: { nomenclature: row.nomenclature ?? '', patientFriendlyName: row.patientFriendlyName ?? '', category: row.category!, areaRule: row.areaRule!, importBatchId: batch.id },
    })
  }
  await uow.tx.codeSystem.update({ where: { id: system.id }, data: { activeImportId: batch.id } })
  const decision = await uow.tx.approvalDecision.findFirst({ where: { requestId: request.id, decision: 'approve' }, orderBy: { at: 'desc' } })
  await transition<any>(uow, { model: 'CodeImportBatch', id: batch.id, from: ['attested'], to: 'active', actor, eventType: 'code_import.activated', approverId: decision?.decidedById ?? null, metadata: { codes: rows.length, supersedes: previous }, data: { rows: [] } })
  return { batchId: batch.id, codes: rows.length }
}, { applyOnApprove: true })

// ── Fees ───────────────────────────────────────────────────────────────────────────────────────────

export async function openFeeSchedule(_root: unknown, args: { name: string; kind: string; isDefault?: boolean | null; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, 'canManageFees')
  const name = requireText(args.name, 'schedule name', 120)
  const kind = oneOf(args.kind, FEE_KINDS, 'schedule kind')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'fee_schedule.create', actor, idempotencyKey, params }, async uow => {
    if (args.isDefault) await uow.tx.feeSchedule.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
    const schedule = await uow.tx.feeSchedule.create({ data: { name, kind, isDefault: args.isDefault === true } })
    auditCreate(uow, actor, 'FeeSchedule', schedule.id, 'fee_schedule.created', { name, kind })
    return { scheduleId: schedule.id }
  })
  return { replay: result.replay, ...result.value }
}

/** A draft version copies the last published fees, ready for edits. */
export async function createFeeVersion(_root: unknown, args: { scheduleId: string; label: string; effectiveFrom: string; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, 'canManageFees')
  const label = requireText(args.label, 'version label', 120)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.effectiveFrom ?? '')) throw new DomainError(Codes.INVALID_INPUT, 'Enter the start date as 2026-01-01.', { field: 'effectiveFrom' })
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'fee_schedule.version_create', actor, idempotencyKey, params }, async uow => {
    const open = await uow.tx.feeScheduleVersion.findFirst({ where: { scheduleId: args.scheduleId, status: 'draft' } })
    if (open) throw new DomainError(Codes.GUARD_FAILED, 'This schedule already has a draft version. Publish or discard it first.')
    const last = await uow.tx.feeScheduleVersion.findFirst({ where: { scheduleId: args.scheduleId, status: 'published' }, orderBy: { effectiveFrom: 'desc' }, include: { fees: true } })
    const version = await uow.tx.feeScheduleVersion.create({ data: { scheduleId: args.scheduleId, label, effectiveFrom: dayOf(args.effectiveFrom), status: 'draft' } })
    for (const fee of last?.fees ?? []) await uow.tx.fee.create({ data: { feeVersionId: version.id, codeId: fee.codeId, amountMinor: fee.amountMinor, copayMinor: fee.copayMinor } })
    auditCreate(uow, actor, 'FeeScheduleVersion', version.id, 'fee_schedule.version_created', { scheduleId: args.scheduleId, copied: last?.fees.length ?? 0 })
    return { versionId: version.id }
  })
  return { replay: result.replay, ...result.value }
}

export async function setFee(_root: unknown, args: { versionId: string; codeId: string; amountMinor: string; copayMinor?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, 'canManageFees')
  if (!/^\d{1,12}$/.test(String(args.amountMinor))) throw new DomainError(Codes.INVALID_INPUT, 'Enter the fee in whole cents.', { field: 'amountMinor' })
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'fee.set', actor, idempotencyKey, params }, async uow => {
    const version = await lockRow<any>(uow.tx, 'FeeScheduleVersion', args.versionId)
    if (version.status !== 'draft') throw new DomainError(Codes.INVALID_TRANSITION, 'A published fee schedule cannot change. Start a new version.')
    const amount = BigInt(String(args.amountMinor))
    const copay = args.copayMinor ? BigInt(String(args.copayMinor)) : null
    const fee = await uow.tx.fee.upsert({ where: { feeVersionId_codeId: { feeVersionId: version.id, codeId: args.codeId } }, create: { feeVersionId: version.id, codeId: args.codeId, amountMinor: amount, copayMinor: copay }, update: { amountMinor: amount, copayMinor: copay } })
    uow.audit({ eventType: 'fee.set', entityType: 'Fee', entityId: fee.id, actorUserId: actor.kind === 'user' ? actor.userId : null, after: { amountMinor: amount.toString() } })
    return { feeId: fee.id }
  })
  return { replay: result.replay, ...result.value }
}

export async function requestFeePublish(_root: unknown, args: { versionId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, 'canManageFees')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'fee_schedule.request_publish', actor, idempotencyKey, params }, async uow => {
    const version = await lockRow<any>(uow.tx, 'FeeScheduleVersion', args.versionId)
    if (version.status !== 'draft') throw new DomainError(Codes.INVALID_TRANSITION, 'Only a draft version can be published.')
    if (version.version !== args.expectedVersion) throw new DomainError(Codes.STALE_STATE, 'The version changed since you loaded it.', { currentVersion: version.version })
    const fees = await uow.tx.fee.findMany({ where: { feeVersionId: version.id }, orderBy: { codeId: 'asc' } })
    if (!fees.length) throw new DomainError(Codes.GUARD_FAILED, 'Add fees before publishing.')
    const digest = sha256(canonicalJson(fees.map(f => [f.codeId, f.amountMinor.toString(), f.copayMinor?.toString() ?? null])))
    const approval = await requestApproval(uow, actor, { action: 'fee_schedule.publish', targetList: 'FeeScheduleVersion', targetId: version.id, payload: { versionId: version.id, digest, count: fees.length }, requiredPermission: 'canApproveFeePublish', summary: `Publish fee schedule ${version.label} (${fees.length} fees)` })
    await uow.tx.feeScheduleVersion.update({ where: { id: version.id }, data: { approvalId: approval.id, version: { increment: 1 } } })
    return { approvalId: approval.id }
  })
  return { replay: result.replay, ...result.value }
}

registerApplier('fee_schedule.publish', async (uow, actor, request) => {
  const version = await lockRow<any>(uow.tx, 'FeeScheduleVersion', String(request.payload.versionId))
  const fees = await uow.tx.fee.findMany({ where: { feeVersionId: version.id }, orderBy: { codeId: 'asc' } })
  const digest = sha256(canonicalJson(fees.map(f => [f.codeId, f.amountMinor.toString(), f.copayMinor?.toString() ?? null])))
  if (digest !== request.payload.digest) throw new DomainError(Codes.APPROVAL_MISMATCH, 'The fees changed after approval was requested.')
  // The previous published version stops the day before this one starts.
  const earlier = await uow.tx.feeScheduleVersion.findMany({ where: { scheduleId: version.scheduleId, status: 'published', effectiveTo: null, id: { not: version.id } } })
  for (const old of earlier) {
    const end = new Date(version.effectiveFrom.getTime() - 86_400_000)
    await uow.tx.feeScheduleVersion.update({ where: { id: old.id }, data: { effectiveTo: end, status: (old.effectiveFrom ?? new Date(0)) >= version.effectiveFrom ? 'retired' : 'published', version: { increment: 1 } } })
  }
  const decision = await uow.tx.approvalDecision.findFirst({ where: { requestId: request.id, decision: 'approve' }, orderBy: { at: 'desc' } })
  await transition<any>(uow, { model: 'FeeScheduleVersion', id: version.id, from: ['draft'], to: 'published', actor, eventType: 'fee_schedule.published', approverId: decision?.decidedById ?? null, metadata: { fees: fees.length, digest }, data: { publishedAt: uow.now, publishedById: decision?.decidedById ?? null } })
  return { versionId: version.id }
}, { applyOnApprove: true })
