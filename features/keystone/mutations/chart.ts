import { requirePermission } from '../lib/actor'
import { auditCreate, lockRow, transition } from '../lib/cas'
import { command } from '../lib/command'
import { DomainError, Codes } from '../lib/errors'
import { normalizeSite, type AreaRule } from '../lib/teeth'
import { addDays } from '../lib/time'
import { CONDITION_STATUSES } from '../models/clinical'
import { accountFor, dayOf, feeFor, locationToday, oneOf, requireReason } from './clinicalShared'
import { openBusinessDate, rebuildBalance } from '../lib/ledger'
import { applyMembershipToCharge, reverseMembershipForChart } from '../lib/memberships'
import { assertLocation, assertPatientInScope, optionalText, staff, type Ctx } from './shared'

/*
 * The chart and the charge it produces (SM§3.1–3.3; SCHEMA §5.1, §10.2; DOMAIN I-C1–I-C4).
 * Completing a procedure freezes its fee and posts exactly one charge row; a posted procedure is
 * never edited, it is corrected by a forward reversal and a new entry.
 */

const PLANNING = ['diagnosed', 'planned', 'accepted'] as const
const PLANNABLE = ['diagnosed', 'planned'] as const

type SiteInput = { tooth?: string; surfaces?: string; quadrant?: string; arch?: string; sextant?: number }

async function codeFor(tx: any, codeId: string, onDate: string) {
  const code = await tx.procedureCode.findUnique({ where: { id: codeId } })
  if (!code) throw new DomainError(Codes.NOT_FOUND, 'Procedure code not found.', { field: 'codeId' })
  const day = dayOf(onDate)
  if (code.effectiveFrom && code.effectiveFrom > day) throw new DomainError(Codes.GUARD_FAILED, `${code.code} is not in effect on that date.`, { field: 'codeId' })
  if (code.effectiveTo && code.effectiveTo < day) throw new DomainError(Codes.GUARD_FAILED, `${code.code} was retired before that date.`, { field: 'codeId' })
  return code
}

function siteData(code: { areaRule: string; requiresSurfaces: boolean; maxSurfaces: number | null }, site: SiteInput) {
  const s = normalizeSite(code.areaRule as AreaRule, site, { requiresSurfaces: code.requiresSurfaces, maxSurfaces: code.maxSurfaces })
  return { tooth: s.tooth, surfaces: s.surfaces, area: s.area, quadrant: s.quadrant, sextant: s.sextant, arch: s.arch }
}

/** Diagnose or plan a procedure, or record existing work. Planned and diagnosed work carries no fee until completion. */
export async function addChartProcedure(_root: unknown, args: { patientId: string; locationId: string; codeId: string; site: SiteInput; status?: string; providerId?: string | null; appointmentId?: string | null; diagnosisCodes?: string[] | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart')
  assertLocation(locationIds, args.locationId)
  const status = oneOf(args.status ?? 'planned', ['diagnosed', 'planned', 'existing_current', 'existing_other'] as const, 'status')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'chart.add_procedure', actor, idempotencyKey, params }, async uow => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const today = await locationToday(uow.tx, args.locationId, uow.now)
    const code = await codeFor(uow.tx, args.codeId, today)
    const entry = await uow.tx.chartEntry.create({
      data: {
        patientId: args.patientId, locationId: args.locationId, kind: 'procedure', codeId: code.id, status, source: 'staff', providerId: args.providerId ?? null, appointmentId: args.appointmentId ?? null,
        diagnosisCodes: (args.diagnosisCodes ?? []).slice(0, 4) as never, ...siteData(code, args.site ?? {}),
      },
    })
    auditCreate(uow, actor, 'ChartEntry', entry.id, 'chart.procedure_added', { patientId: args.patientId, code: code.code, tooth: entry.tooth, surfaces: entry.surfaces, status })
    return { chartEntryId: entry.id }
  })
  return { replay: result.replay, ...result.value }
}

/** Record a finding such as caries, a fracture or a missing tooth. */
export async function addChartCondition(_root: unknown, args: { patientId: string; locationId: string; conditionId: string; site: SiteInput; status?: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart')
  assertLocation(locationIds, args.locationId)
  const conditionStatus = oneOf(args.status ?? 'active', CONDITION_STATUSES, 'condition status')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'chart.add_condition', actor, idempotencyKey, params }, async uow => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const condition = await uow.tx.conditionType.findUnique({ where: { id: args.conditionId } })
    if (!condition || !condition.isActive) throw new DomainError(Codes.NOT_FOUND, 'Condition not found.', { field: 'conditionId' })
    const rule = condition.areaRule as AreaRule
    const site = normalizeSite(rule, args.site ?? {}, { requiresSurfaces: false })
    const entry = await uow.tx.chartEntry.create({
      data: { patientId: args.patientId, locationId: args.locationId, kind: 'condition', conditionId: condition.id, status: 'existing_current', conditionStatus, source: 'staff', tooth: site.tooth, surfaces: site.surfaces, area: site.area, quadrant: site.quadrant, sextant: site.sextant, arch: site.arch },
    })
    auditCreate(uow, actor, 'ChartEntry', entry.id, 'chart.condition_added', { patientId: args.patientId, condition: condition.code, tooth: entry.tooth, surfaces: entry.surfaces })
    return { chartEntryId: entry.id }
  })
  return { replay: result.replay, ...result.value }
}

export async function setConditionStatus(_root: unknown, args: { chartEntryId: string; status: string; expectedVersion: number; reason?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart')
  const status = oneOf(args.status, CONDITION_STATUSES, 'condition status')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'chart.condition_status', actor, idempotencyKey, params }, async uow => {
    const row = await lockRow<any>(uow.tx, 'ChartEntry', args.chartEntryId)
    if (row.kind !== 'condition') throw new DomainError(Codes.INVALID_TRANSITION, 'Only findings have a condition status.')
    assertLocation(locationIds, row.locationId)
    if (status === 'entered_in_error') requireReason(args.reason)
    await transition<any>(uow, { model: 'ChartEntry', id: row.id, from: [row.status], to: row.status, expectedVersion: args.expectedVersion, actor, eventType: `chart.condition_${status}`, reason: args.reason ?? null, data: { conditionStatus: status } })
    return { chartEntryId: row.id, conditionStatus: status }
  })
  return { replay: result.replay, ...result.value }
}

/** Remove planned work that was never done. A completed procedure can't be deleted; correct it instead. */
export async function removePlannedEntry(_root: unknown, args: { chartEntryId: string; expectedVersion: number; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart')
  const reason = requireReason(args.reason)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'chart.remove_planned', actor, idempotencyKey, params }, async uow => {
    const row = await lockRow<any>(uow.tx, 'ChartEntry', args.chartEntryId)
    assertLocation(locationIds, row.locationId)
    await transition<any>(uow, { model: 'ChartEntry', id: row.id, from: [...PLANNING, 'scheduled'], to: 'deleted_in_error', expectedVersion: args.expectedVersion, actor, eventType: 'chart.entry_removed', reason, data: { deletedReason: reason } })
    return { chartEntryId: row.id }
  })
  return { replay: result.replay, ...result.value }
}

export async function acceptChartEntry(_root: unknown, args: { chartEntryId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart', 'canManageTreatmentPlans')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'chart.accept_entry', actor, idempotencyKey, params }, async uow => {
    const row = await lockRow<any>(uow.tx, 'ChartEntry', args.chartEntryId)
    assertLocation(locationIds, row.locationId)
    await transition<any>(uow, { model: 'ChartEntry', id: row.id, from: PLANNABLE, to: 'accepted', expectedVersion: args.expectedVersion, actor, eventType: 'chart.entry_accepted', data: { acceptedVia: 'staff' } })
    return { chartEntryId: row.id }
  })
  return { replay: result.replay, ...result.value }
}

/**
 * Complete a procedure (SM§3.1): freeze the date, provider and fee, then post one charge row to the
 * guarantor's ledger. All in one transaction; completing twice cannot charge twice (a partial unique index).
 */
export async function completeProcedure(_root: unknown, args: { chartEntryId: string; expectedVersion: number; providerId: string; dateOfService?: string | null; feeMinor?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canCompleteProcedures')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'chart.complete_procedure', actor, idempotencyKey, params }, async uow => {
    const row = await lockRow<any>(uow.tx, 'ChartEntry', args.chartEntryId)
    assertLocation(locationIds, row.locationId)
    if (row.kind !== 'procedure') throw new DomainError(Codes.INVALID_TRANSITION, 'Only procedures can be completed.')
    const provider = await uow.tx.providerProfile.findUnique({ where: { id: args.providerId } })
    if (!provider || !provider.isActive) throw new DomainError(Codes.INVALID_INPUT, 'Choose the provider who did the work.', { field: 'providerId' })
    const settings = await uow.tx.practiceSettings.findFirst()
    const today = await locationToday(uow.tx, row.locationId, uow.now)
    const date = args.dateOfService || today
    if (date > today) throw new DomainError(Codes.INVALID_INPUT, 'A procedure cannot be completed in the future.', { field: 'dateOfService' })
    const earliest = addDays(today, -(settings?.backdateDays ?? 3))
    if (date < earliest) throw new DomainError(Codes.GUARD_FAILED, `Work can be back-dated at most ${settings?.backdateDays ?? 3} days. A correction needs a reviewer.`, { field: 'dateOfService' })
    const code = await codeFor(uow.tx, row.codeId, date)
    const manual = args.feeMinor !== undefined && args.feeMinor !== null && args.feeMinor !== ''
    let feeMinor: bigint
    let feeVersionId: string | null = null
    if (manual) {
      if (!/^\d{1,12}$/.test(String(args.feeMinor))) throw new DomainError(Codes.INVALID_INPUT, 'Enter the fee in whole cents.', { field: 'feeMinor' })
      feeMinor = BigInt(String(args.feeMinor))
    } else {
      const fee = await feeFor(uow.tx, row.codeId, date)
      if (!fee) throw new DomainError(Codes.GUARD_FAILED, `No published fee for ${code.code} on ${date}. Publish a fee schedule first.`)
      feeMinor = fee.amountMinor * BigInt(row.units ?? 1)
      feeVersionId = fee.versionId
    }
    const account = await accountFor(uow, row.patientId)
    const settingsCurrency = settings?.currencyCode ?? 'USD'
    const entry = await transition<any>(uow, {
      model: 'ChartEntry', id: row.id, from: ['accepted', 'scheduled', 'planned', 'diagnosed'], to: 'posted', expectedVersion: args.expectedVersion, actor, eventType: 'chart.procedure_completed',
      data: { providerId: provider.id, dateOfService: dayOf(date), originalServiceDate: dayOf(date), feeMinor, feeScheduleVersionId: feeVersionId },
    })
    const charge = await uow.tx.ledgerEntry.create({
      data: { accountId: account.id, patientId: row.patientId, kind: 'charge', amountMinor: feeMinor, currencyCode: settingsCurrency, businessDate: await openBusinessDate(uow.tx, row.locationId, dayOf(date)), originalBusinessDate: dayOf(date), locationId: row.locationId, providerId: provider.id, chartEntryId: row.id, memo: `${code.code} ${row.tooth}${row.surfaces ? ` ${row.surfaces}` : ''}`.trim(), postedById: actor.kind === 'user' ? actor.userId : null, postedAt: uow.now },
    })
    await uow.tx.chartEntry.update({ where: { id: row.id }, data: { ledgerEntryId: charge.id } })
    const member = await applyMembershipToCharge(uow, { patientId: row.patientId, accountId: account.id, locationId: row.locationId, chartEntryId: row.id, providerId: provider.id, category: code.category, feeMinor, serviceDate: date, businessDate: charge.businessDate!, currencyCode: settingsCurrency, postedById: actor.kind === 'user' ? actor.userId : null })
    await rebuildBalance(uow.tx, account.id, uow.now)
    if (member) auditCreate(uow, actor, 'LedgerEntry', member.ledgerEntryId, 'membership.applied', { chartEntryId: row.id, covered: member.covered, amountMinor: member.creditMinor.toString() })
    auditCreate(uow, actor, 'LedgerEntry', charge.id, 'ledger.charge_posted', { chartEntryId: row.id, amountMinor: feeMinor.toString(), businessDate: date })
    uow.emit({ topic: 'ledger.charge_posted', aggregateType: 'LedgerEntry', aggregateId: charge.id, payload: { chartEntryId: row.id, patientId: row.patientId }, dedupeKey: `ledger.charge_posted:${charge.id}` })
    return { chartEntryId: entry.id, ledgerEntryId: charge.id, feeMinor: feeMinor.toString() }
  })
  return { replay: result.replay, ...result.value }
}

/**
 * Correct a completed procedure with a forward action (SM§0, I-C3): a reversing ledger row cancels
 * the charge, the original becomes `corrected`, and a replacement entry is created when one is given.
 */
export async function correctProcedure(_root: unknown, args: { chartEntryId: string; expectedVersion: number; reason: string; replacement?: { codeId?: string; site?: SiteInput } | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canApproveClinicalCorrections')
  const reason = requireReason(args.reason)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'chart.correct_procedure', actor, idempotencyKey, params }, async uow => {
    const row = await lockRow<any>(uow.tx, 'ChartEntry', args.chartEntryId)
    assertLocation(locationIds, row.locationId)
    const charge = row.ledgerEntryId ? await uow.tx.ledgerEntry.findUnique({ where: { id: row.ledgerEntryId } }) : null
    await transition<any>(uow, { model: 'ChartEntry', id: row.id, from: ['completed', 'posted'], to: 'corrected', expectedVersion: args.expectedVersion, actor, eventType: 'chart.procedure_corrected', reason })
    let reversalId: string | null = null
    if (charge) {
      const today = await locationToday(uow.tx, row.locationId, uow.now)
      const reversal = await uow.tx.ledgerEntry.create({
        data: { accountId: charge.accountId, patientId: charge.patientId, kind: 'reversal', amountMinor: -charge.amountMinor, currencyCode: charge.currencyCode, businessDate: await openBusinessDate(uow.tx, charge.locationId!, dayOf(today)), originalBusinessDate: charge.originalBusinessDate, locationId: charge.locationId, providerId: charge.providerId, chartEntryId: row.id, reversesId: charge.id, memo: `Reversal: ${reason}`.slice(0, 200), postedById: actor.kind === 'user' ? actor.userId : null, postedAt: uow.now },
      })
      reversalId = reversal.id
      await reverseMembershipForChart(uow, { chartEntryId: row.id, reason, businessDate: reversal.businessDate!, postedById: actor.kind === 'user' ? actor.userId : null })
      if (charge.accountId) await rebuildBalance(uow.tx, charge.accountId, uow.now)
      auditCreate(uow, actor, 'LedgerEntry', reversal.id, 'ledger.charge_reversed', { reverses: charge.id, amountMinor: (-charge.amountMinor).toString() }, { reason })
    }
    let replacementId: string | null = null
    if (args.replacement?.codeId) {
      const today = await locationToday(uow.tx, row.locationId, uow.now)
      const code = await codeFor(uow.tx, args.replacement.codeId, today)
      const created = await uow.tx.chartEntry.create({
        data: { patientId: row.patientId, locationId: row.locationId, kind: 'procedure', codeId: code.id, status: 'planned', source: 'staff', correctsId: row.id, ...siteData(code, args.replacement.site ?? {}) },
      })
      replacementId = created.id
      await uow.tx.chartEntry.update({ where: { id: row.id }, data: { correctedById: created.id } })
      auditCreate(uow, actor, 'ChartEntry', created.id, 'chart.replacement_planned', { corrects: row.id })
    }
    return { chartEntryId: row.id, reversalId, replacementId }
  })
  return { replay: result.replay, ...result.value }
}

export async function setChartNote(_root: unknown, args: { chartEntryId: string; noteId: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'chart.link_note', actor, idempotencyKey, params }, async uow => {
    const row = await lockRow<any>(uow.tx, 'ChartEntry', args.chartEntryId)
    assertLocation(locationIds, row.locationId)
    await uow.tx.chartEntry.update({ where: { id: row.id }, data: { noteId: args.noteId || null } })
    auditCreate(uow, actor, 'ChartEntry', row.id, 'chart.note_linked', { noteId: args.noteId })
    return { chartEntryId: row.id, text: optionalText(args.noteId, 40) }
  })
  return { replay: result.replay, ...result.value }
}

/** Tie accepted work to the appointment it will be done at. */
export async function scheduleChartEntry(_root: unknown, args: { chartEntryId: string; expectedVersion: number; appointmentId: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart', 'canManageSchedule')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'chart.schedule_entry', actor, idempotencyKey, params }, async uow => {
    const row = await lockRow<any>(uow.tx, 'ChartEntry', args.chartEntryId)
    assertLocation(locationIds, row.locationId)
    const appointment = await uow.tx.appointment.findUnique({ where: { id: args.appointmentId } })
    if (!appointment || appointment.patientId !== row.patientId) throw new DomainError(Codes.INVALID_INPUT, 'Choose one of this patient’s appointments.', { field: 'appointmentId' })
    await transition<any>(uow, { model: 'ChartEntry', id: row.id, from: ['accepted'], to: 'scheduled', expectedVersion: args.expectedVersion, actor, eventType: 'chart.entry_scheduled', data: { appointmentId: appointment.id } })
    return { chartEntryId: row.id }
  })
  return { replay: result.replay, ...result.value }
}
