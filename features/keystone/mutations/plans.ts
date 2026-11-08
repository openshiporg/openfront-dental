import { requirePermission } from '../lib/actor'
import { canonicalJson, sha256 } from '../lib/canonical'
import { auditCreate, lockRow, transition } from '../lib/cas'
import { command } from '../lib/command'
import { DomainError, Codes } from '../lib/errors'
import { nextReference } from '../lib/sequence'
import { PLAN_PRIORITIES } from '../models/treatment'
import { feeFor, locationToday, oneOf, requireReason, verifyPassword } from './clinicalShared'
import { assertPatientInScope, optionalText, requireText, staff, type Ctx } from './shared'

/*
 * Treatment plans (SM§4; SCHEMA §6; I-T1–I-T3). A plan is a series of versions. Presenting freezes a
 * version (a trigger keeps it frozen); a patient accepts the exact version they saw, identified by its
 * content hash. Changing a presented plan makes a new version and supersedes nothing silently.
 */

const PLAN_OPEN = ['draft', 'presented', 'partially_accepted', 'accepted', 'in_progress'] as const

export async function buildTreatmentPlan(_root: unknown, args: { patientId: string; title: string; chartEntryIds: string[]; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageTreatmentPlans')
  const title = requireText(args.title, 'plan title', 160)
  if (!args.chartEntryIds?.length) throw new DomainError(Codes.INVALID_INPUT, 'Choose the planned procedures for this plan.', { field: 'chartEntryIds' })
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'plan.create', actor, idempotencyKey, params }, async uow => {
    const patient = await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const entries = await uow.tx.chartEntry.findMany({ where: { id: { in: args.chartEntryIds }, patientId: patient.id, kind: 'procedure' }, include: { code: true } })
    if (entries.length !== new Set(args.chartEntryIds).size) throw new DomainError(Codes.INVALID_INPUT, 'Some procedures are not on this patient’s chart.', { field: 'chartEntryIds' })
    const bad = entries.find(e => !['diagnosed', 'planned'].includes(e.status))
    if (bad) throw new DomainError(Codes.GUARD_FAILED, 'Only diagnosed or planned work can go on a plan.', { field: 'chartEntryIds' })
    const ref = await nextReference(uow.tx, 'TP', uow.now)
    const plan = await uow.tx.treatmentPlan.create({ data: { patientId: patient.id, ref, title, status: 'draft', coordinatorId: actor.kind === 'user' ? actor.userId : null } })
    const version = await uow.tx.treatmentPlanVersion.create({ data: { planId: plan.id, number: 1, phases: [{ key: 'phase_1', label: 'Phase 1' }] as never } })
    let order = 0
    for (const entry of entries) {
      const today = await locationToday(uow.tx, String(entry.locationId), uow.now)
      const fee = await feeFor(uow.tx, String(entry.codeId), today)
      await uow.tx.treatmentPlanItem.create({ data: { planVersionId: version.id, chartEntryId: entry.id, phaseKey: 'phase_1', priority: 'recommended', feeMinor: fee?.amountMinor ?? 0n, sortOrder: order++ } })
      if (entry.status === 'diagnosed') await uow.tx.chartEntry.update({ where: { id: entry.id }, data: { status: 'planned', version: { increment: 1 } } })
    }
    await uow.tx.treatmentPlan.update({ where: { id: plan.id }, data: { currentVersionId: version.id } })
    auditCreate(uow, actor, 'TreatmentPlan', plan.id, 'plan.created', { patientId: patient.id, ref, items: entries.length })
    return { planId: plan.id, versionId: version.id, ref }
  })
  return { replay: result.replay, ...result.value }
}

export async function updatePlanItem(_root: unknown, args: { itemId: string; phaseKey?: string | null; priority?: string | null; alternateGroup?: string | null; feeMinor?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageTreatmentPlans')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'plan.item_update', actor, idempotencyKey, params }, async uow => {
    const item = await lockRow<any>(uow.tx, 'TreatmentPlanItem', args.itemId)
    const version = await uow.tx.treatmentPlanVersion.findUnique({ where: { id: item.planVersionId }, include: { plan: true } })
    if (!version) throw new DomainError(Codes.NOT_FOUND, 'Plan version not found.')
    await assertPatientInScope(uow.tx, locationIds, String(version.plan?.patientId))
    if (version.frozenAt) throw new DomainError(Codes.INVALID_TRANSITION, 'This version was presented and is frozen. Start a new version to change it.')
    const data: Record<string, unknown> = {}
    if (args.phaseKey) data.phaseKey = optionalText(args.phaseKey, 40)
    if (args.priority) data.priority = oneOf(args.priority, PLAN_PRIORITIES, 'priority')
    if (args.alternateGroup !== undefined && args.alternateGroup !== null) data.alternateGroup = optionalText(args.alternateGroup, 40)
    if (args.feeMinor !== undefined && args.feeMinor !== null && args.feeMinor !== '') {
      if (!/^\d{1,12}$/.test(String(args.feeMinor))) throw new DomainError(Codes.INVALID_INPUT, 'Enter the fee in whole cents.', { field: 'feeMinor' })
      data.feeMinor = BigInt(String(args.feeMinor))
    }
    await uow.tx.treatmentPlanItem.update({ where: { id: item.id }, data: data as never })
    uow.audit({ eventType: 'plan.item_updated', entityType: 'TreatmentPlanItem', entityId: item.id, actorUserId: actor.kind === 'user' ? actor.userId : null, after: { ...data, feeMinor: data.feeMinor?.toString() } })
    return { itemId: item.id }
  })
  return { replay: result.replay, ...result.value }
}

/** Present a plan: totals are computed, the version is hashed and frozen, and the plan moves to `presented`. */
export async function presentTreatmentPlan(_root: unknown, args: { planId: string; expectedVersion: number; channel?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canPresentPlans', 'canManageTreatmentPlans')
  const channel = oneOf(args.channel ?? 'chairside', ['chairside', 'portal_api', 'email_link'] as const, 'channel')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'plan.present', actor, idempotencyKey, params }, async uow => {
    const plan = await lockRow<any>(uow.tx, 'TreatmentPlan', args.planId)
    await assertPatientInScope(uow.tx, locationIds, plan.patientId)
    const version = await uow.tx.treatmentPlanVersion.findUnique({ where: { id: plan.currentVersionId }, include: { items: { orderBy: { sortOrder: 'asc' } } } })
    if (!version || version.frozenAt) throw new DomainError(Codes.INVALID_TRANSITION, 'There is no draft version to present.')
    if (!version.items.length) throw new DomainError(Codes.GUARD_FAILED, 'Add at least one procedure before presenting the plan.')
    const totals = version.items.reduce((sum, item) => sum + item.feeMinor, 0n)
    const contentHash = sha256(canonicalJson({ plan: plan.ref, number: version.number, phases: version.phases, items: version.items.map(i => [i.chartEntryId, i.phaseKey, i.priority, i.alternateGroup, i.feeMinor.toString()]) }))
    await uow.tx.treatmentPlanVersion.update({ where: { id: version.id }, data: { frozenAt: uow.now, contentHash, presentedById: actor.kind === 'user' ? actor.userId : null, totalsMinor: { totalMinor: totals.toString(), itemCount: version.items.length } as never } })
    await uow.tx.planPresentation.create({ data: { planVersionId: version.id, presentedById: actor.kind === 'user' ? actor.userId : null, channel, at: uow.now } })
    await transition<any>(uow, { model: 'TreatmentPlan', id: plan.id, from: ['draft', 'presented', 'declined'], to: 'presented', expectedVersion: args.expectedVersion, actor, eventType: 'plan.presented', metadata: { versionNumber: version.number, contentHash, totalMinor: totals.toString() } })
    return { planId: plan.id, versionId: version.id, contentHash, totalMinor: totals.toString() }
  })
  return { replay: result.replay, ...result.value }
}

/** Record the patient's signed acceptance of the exact version presented. Unselected items stay planned. */
export async function acceptTreatmentPlan(_root: unknown, args: { planId: string; expectedVersion: number; versionHash: string; selectedItemIds: string[]; signer: string; signerName: string; password: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canPresentPlans', 'canManageTreatmentPlans')
  if (actor.kind !== 'user') throw new DomainError(Codes.AGENT_CANNOT_APPROVE, 'Only staff record an acceptance.')
  await verifyPassword(context as never, actor.userId, args.password)
  const signer = oneOf(args.signer, ['patient', 'guardian'] as const, 'signer')
  const signerName = requireText(args.signerName, 'signer name', 120)
  const { idempotencyKey, password: _password, ...params } = args
  const result = await command(context.prisma, { name: 'plan.accept', actor, idempotencyKey, params }, async uow => {
    const plan = await lockRow<any>(uow.tx, 'TreatmentPlan', args.planId)
    await assertPatientInScope(uow.tx, locationIds, plan.patientId)
    const version = await uow.tx.treatmentPlanVersion.findUnique({ where: { id: plan.currentVersionId }, include: { items: true } })
    if (!version?.frozenAt) throw new DomainError(Codes.INVALID_TRANSITION, 'Present the plan before recording an acceptance.')
    if (version.contentHash !== args.versionHash) throw new DomainError(Codes.STALE_STATE, 'The plan changed after it was shown. Present the current version.')
    const ids = new Set(args.selectedItemIds ?? [])
    if (!ids.size) throw new DomainError(Codes.INVALID_INPUT, 'Choose at least one procedure to accept.', { field: 'selectedItemIds' })
    const selected = version.items.filter(i => ids.has(i.id))
    if (selected.length !== ids.size) throw new DomainError(Codes.INVALID_INPUT, 'Some selected procedures are not in this version.', { field: 'selectedItemIds' })
    const groups = new Map<string, number>()
    for (const item of selected) if (item.alternateGroup) groups.set(item.alternateGroup, (groups.get(item.alternateGroup) ?? 0) + 1)
    const doubled = [...groups.entries()].find(([, n]) => n > 1)
    if (doubled) throw new DomainError(Codes.GUARD_FAILED, `Choose only one option from the alternatives in “${doubled[0]}”.`, { field: 'selectedItemIds' })
    const total = selected.reduce((sum, i) => sum + i.feeMinor, 0n)
    const acceptance = await uow.tx.planAcceptance.create({
      data: {
        planVersionId: version.id, versionHash: version.contentHash, selectedItems: { connect: selected.map(i => ({ id: i.id })) }, signer, signerName,
        signatureEvidence: { method: 'password_reauth', userId: actor.userId, at: uow.now.toISOString() } as never, estimateSnapshot: { totalMinor: total.toString(), items: selected.map(i => ({ id: i.id, feeMinor: i.feeMinor.toString() })) } as never, at: uow.now,
      },
    })
    for (const item of selected) {
      await uow.tx.treatmentPlanItem.update({ where: { id: item.id }, data: { selected: true } })
      await uow.tx.chartEntry.updateMany({ where: { id: item.chartEntryId!, status: { in: ['planned', 'diagnosed'] } }, data: { status: 'accepted', acceptedVia: 'plan_acceptance', version: { increment: 1 } } })
    }
    const all = selected.length === version.items.length
    await transition<any>(uow, { model: 'TreatmentPlan', id: plan.id, from: ['presented', 'partially_accepted'], to: all ? 'accepted' : 'partially_accepted', expectedVersion: args.expectedVersion, actor, eventType: 'plan.accepted', metadata: { acceptanceId: acceptance.id, items: selected.length, totalMinor: total.toString() } })
    return { acceptanceId: acceptance.id, totalMinor: total.toString(), status: all ? 'accepted' : 'partially_accepted' }
  })
  return { replay: result.replay, ...result.value }
}

export async function declineTreatmentPlan(_root: unknown, args: { planId: string; expectedVersion: number; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canPresentPlans', 'canManageTreatmentPlans')
  const reason = requireReason(args.reason)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'plan.decline', actor, idempotencyKey, params }, async uow => {
    const plan = await lockRow<any>(uow.tx, 'TreatmentPlan', args.planId)
    await assertPatientInScope(uow.tx, locationIds, plan.patientId)
    await transition<any>(uow, { model: 'TreatmentPlan', id: plan.id, from: ['presented', 'partially_accepted'], to: 'declined', expectedVersion: args.expectedVersion, actor, eventType: 'plan.declined', reason })
    return { planId: plan.id }
  })
  return { replay: result.replay, ...result.value }
}

/** Start a new draft version from the last one. The presented version stays exactly as the patient saw it. */
export async function reviseTreatmentPlan(_root: unknown, args: { planId: string; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageTreatmentPlans')
  const reason = requireReason(args.reason)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'plan.revise', actor, idempotencyKey, params }, async uow => {
    const plan = await lockRow<any>(uow.tx, 'TreatmentPlan', args.planId)
    await assertPatientInScope(uow.tx, locationIds, plan.patientId)
    if (!(PLAN_OPEN as readonly string[]).includes(plan.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'This plan is closed.')
    const current = await uow.tx.treatmentPlanVersion.findUnique({ where: { id: plan.currentVersionId }, include: { items: true } })
    if (!current?.frozenAt) throw new DomainError(Codes.INVALID_TRANSITION, 'The current version has not been presented; edit it directly.')
    const next = await uow.tx.treatmentPlanVersion.create({ data: { planId: plan.id, number: (current.number ?? 1) + 1, phases: current.phases as never } })
    for (const item of current.items) {
      await uow.tx.treatmentPlanItem.create({ data: { planVersionId: next.id, chartEntryId: item.chartEntryId, phaseKey: item.phaseKey, alternateGroup: item.alternateGroup, priority: item.priority, feeMinor: item.feeMinor, sortOrder: item.sortOrder } })
    }
    await uow.tx.treatmentPlan.update({ where: { id: plan.id }, data: { currentVersionId: next.id, status: 'draft', version: { increment: 1 } } })
    auditCreate(uow, actor, 'TreatmentPlanVersion', next.id, 'plan.version_started', { planId: plan.id, number: next.number }, { reason })
    return { planId: plan.id, versionId: next.id, number: next.number }
  })
  return { replay: result.replay, ...result.value }
}
