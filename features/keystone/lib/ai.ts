import { transition, lockRow, auditCreate } from './cas'
import { advisoryLock, type Db, type Tx } from './db'
import { Codes, DomainError } from './errors'
import { payloadHash } from './canonical'
import { runInTransaction, type UnitOfWork } from './unitOfWork'
import type { Actor } from './actor'
import { KIND_ROWS, NEVER_AUTONOMOUS_ROWS, SIGNAL_DEFS, dedupeKey, effectiveStatus, parsePayload, type ExecutableKind } from './aiPure'

/*
 * AI action layer v1 (BUILD-PLAN Phase 5, with the brief's overrides).
 *   signal -> proposal -> decision -> command receipt -> outcome
 * No jobs, cron or timers: detectors run when someone asks (the AI home page, or "Run checks"), are idempotent through the
 * dedupe key, and expiry and outcomes are computed when a proposal is read. A proposal is carried out only by a person
 * with the right permission, who is not the proposer, through the same code a staff member's button would use.
 */

const DAY = 86_400_000
export const AGENT_NAME = 'Practice Assistant'

export async function ensureCatalogue(tx: Tx) {
  for (const def of SIGNAL_DEFS) {
    await tx.signalType.upsert({
      where: { key: def.key },
      create: { key: def.key, title: def.title, detectorVersion: def.detectorVersion, defaultProposalKind: def.defaultProposalKind, ownerRole: def.ownerRole },
      update: { title: def.title, detectorVersion: def.detectorVersion, defaultProposalKind: def.defaultProposalKind, ownerRole: def.ownerRole },
    })
  }
  for (const row of KIND_ROWS) {
    await tx.proposalKind.upsert({
      where: { key: row.key },
      create: { key: row.key, title: row.title, riskClass: row.riskClass, requiredPermission: row.requiredPermission, defaultExpiryMinutes: row.defaultExpiryMinutes, validatorVersion: row.validatorVersion },
      update: { title: row.title, riskClass: row.riskClass, requiredPermission: row.requiredPermission, defaultExpiryMinutes: row.defaultExpiryMinutes, validatorVersion: row.validatorVersion },
    })
  }
  for (const row of NEVER_AUTONOMOUS_ROWS) {
    await tx.proposalKind.upsert({
      where: { key: row.key },
      create: { key: row.key, title: row.title, riskClass: 'never_autonomous', requiredPermission: row.requiredPermission, defaultExpiryMinutes: 1440, validatorVersion: 'v1' },
      update: { riskClass: 'never_autonomous' },
    })
  }
  // The practice owner is the accountable owner of the assistant, so the owner can't also approve what it suggests.
  const owner = await tx.user.findFirst({ where: { role: { name: 'Practice Owner' } }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  const found = await tx.agentIdentity.findUnique({ where: { name: AGENT_NAME } })
  if (found) return found.ownerId || !owner ? found : tx.agentIdentity.update({ where: { id: found.id }, data: { ownerId: owner.id } })
  return tx.agentIdentity.create({ data: { name: AGENT_NAME, purpose: 'Looks across the schedule, benefits and claims and suggests next steps. It can suggest; it can never approve.', kind: 'rules_engine', status: 'active', ownerId: owner?.id ?? null } })
}

type Finding = { subjectType: string; subjectId: string; patientId: string | null; summary: string; evidence: { list: string; id: string; version: number; hash: string }[]; impact: Record<string, unknown>; payload: Record<string, string | null> }

const ev = (list: string, row: { id: string; version?: number | null }, extra: unknown = null): { list: string; id: string; version: number; hash: string } => ({ list, id: row.id, version: row.version ?? 0, hash: payloadHash({ id: row.id, version: row.version ?? 0, extra }).slice(0, 16) })
const fullName = (p: { firstName?: string; lastName?: string; preferredName?: string } | null | undefined) => p ? `${p.preferredName || p.firstName || ''} ${p.lastName || ''}`.trim() : 'A patient'
const dayLabel = (d: Date | null | undefined) => d ? d.toISOString().slice(0, 10) : ''

type Detector = (tx: Tx, locationId: string, now: Date) => Promise<Finding[]>

export const DETECTORS: Record<string, Detector> = {
  async 'schedule.broken_appointment'(tx, locationId, now) {
    const since = new Date(now.getTime() - 14 * DAY)
    const broken = await tx.appointment.findMany({ where: { locationId, status: 'broken', startsAt: { gte: since, lte: now } }, include: { patient: { select: { id: true, firstName: true, lastName: true, preferredName: true, status: true } } }, orderBy: { startsAt: 'desc' }, take: 200 })
    const out: Finding[] = []
    const seen = new Set<string>()
    for (const a of broken) {
      if (!a.patientId || seen.has(a.patientId) || a.patient?.status !== 'active') continue
      seen.add(a.patientId)
      const upcoming = await tx.appointment.count({ where: { patientId: a.patientId, startsAt: { gt: now }, status: { in: ['scheduled', 'confirmed'] } } })
      const waiting = await tx.asapEntry.count({ where: { patientId: a.patientId, status: 'active' } })
      if (upcoming || waiting) continue
      out.push({
        subjectType: 'Appointment', subjectId: a.id, patientId: a.patientId,
        summary: `${fullName(a.patient)} missed the visit on ${dayLabel(a.startsAt)} and has nothing booked.`,
        evidence: [ev('Appointment', a)], impact: { productionMinor: a.productionScheduledMinor?.toString() ?? '0' },
        payload: { patientId: a.patientId, locationId, appointmentTypeId: a.typeId ?? null, sourceAppointmentId: a.id },
      })
    }
    return out
  },
  async 'coverage.unverified'(tx, locationId, now) {
    const until = new Date(now.getTime() + 7 * DAY)
    const visits = await tx.appointment.findMany({ where: { locationId, status: { in: ['scheduled', 'confirmed'] }, startsAt: { gt: now, lte: until } }, select: { id: true, startsAt: true, patientId: true }, take: 500 })
    const out: Finding[] = []
    const seen = new Set<string>()
    for (const v of visits) {
      if (!v.patientId || seen.has(v.patientId)) continue
      const coverages = await tx.coverage.findMany({ where: { patientId: v.patientId, status: { in: ['pending_verification', 'active'] }, verificationLevel: 'unverified' }, include: { patient: { select: { firstName: true, lastName: true, preferredName: true } } } })
      for (const c of coverages) {
        const open = await tx.benefitVerification.count({ where: { coverageId: c.id, status: { in: ['requested', 'in_progress'] } } })
        if (open) continue
        seen.add(v.patientId)
        out.push({
          subjectType: 'Coverage', subjectId: c.id, patientId: v.patientId,
          summary: `${fullName(c.patient)} comes in on ${dayLabel(v.startsAt)} and the insurance has not been checked.`,
          evidence: [ev('Coverage', c), ev('Appointment', { id: v.id })], impact: { visitsAffected: 1 }, payload: { coverageId: c.id },
        })
      }
    }
    return out
  },
  async 'claim.rejected'(tx, locationId) {
    const claims = await tx.claim.findMany({ where: { locationId, status: 'rejected' }, include: { patient: { select: { firstName: true, lastName: true, preferredName: true } } }, take: 200 })
    return claims.map(c => ({
      subjectType: 'Claim', subjectId: c.id, patientId: c.patientId,
      summary: `Claim ${c.ref} for ${fullName(c.patient)} was rejected before reaching the payer.`,
      evidence: [ev('Claim', c)], impact: { amountMinor: c.totalChargeMinor.toString() }, payload: { claimId: c.id },
    }))
  },
  async 'claim.unpaid'(tx, locationId, now) {
    const before = new Date(now.getTime() - 30 * DAY)
    const recent = new Date(now.getTime() - 7 * DAY)
    const claims = await tx.claim.findMany({ where: { locationId, status: { in: ['acknowledged', 'pending_payer'] }, submittedAt: { lte: before } }, include: { patient: { select: { firstName: true, lastName: true, preferredName: true } } }, take: 200 })
    const out: Finding[] = []
    for (const c of claims) {
      const asked = await tx.claimStatusInquiry.count({ where: { claimId: c.id, createdAt: { gte: recent } } })
      if (asked) continue
      out.push({
        subjectType: 'Claim', subjectId: c.id, patientId: c.patientId,
        summary: `Claim ${c.ref} for ${fullName(c.patient)} was sent on ${dayLabel(c.submittedAt)} and the payer has not answered.`,
        evidence: [ev('Claim', c)], impact: { amountMinor: c.totalChargeMinor.toString() }, payload: { claimId: c.id },
      })
    }
    return out
  },
}

/** Run every enabled detector for the offices the caller may see. Safe to run any number of times. */
export async function runChecks(db: Db, actor: Actor, locationIds: string[] | null, now = new Date()) {
  return runInTransaction(db, async uow => {
    await advisoryLock(uow.tx, 'ai:checks')
    const agent = await ensureCatalogue(uow.tx)
    const locations = await uow.tx.location.findMany({ where: { isActive: true, ...(locationIds ? { id: { in: locationIds } } : {}) }, select: { id: true } })
    const types = await uow.tx.signalType.findMany({ where: { isEnabled: true } })
    const kinds = new Map((await uow.tx.proposalKind.findMany()).map(k => [k.key, k]))
    const windowStart = new Date(Math.floor(now.getTime() / DAY) * DAY)
    let created = 0, resolved = 0, proposals = 0
    for (const type of types) {
      const detector = DETECTORS[type.key]
      if (!detector) continue
      for (const location of locations) {
        const found = await detector(uow.tx, location.id, now)
        let run = await uow.tx.signalRun.findFirst({ where: { signalTypeId: type.id, locationId: location.id, windowStart } })
        if (!run) run = await uow.tx.signalRun.create({ data: { signalTypeId: type.id, locationId: location.id, windowStart, windowEnd: new Date(windowStart.getTime() + DAY), status: 'completed' } })
        const keys = new Set<string>()
        for (const f of found) {
          const key = dedupeKey(type.key, location.id, f.subjectId)
          keys.add(key)
          let signal = await uow.tx.signal.findFirst({ where: { dedupeKey: key, status: { in: ['open', 'proposed'] } } })
          if (!signal) {
            signal = await uow.tx.signal.create({ data: { typeId: type.id, runId: run.id, locationId: location.id, subjectType: f.subjectType, subjectId: f.subjectId, patientId: f.patientId, summary: f.summary, evidence: f.evidence as never, impact: f.impact as never, dedupeKey: key, status: 'open' } })
            created += 1
          }
          if (signal.status === 'open' && type.defaultProposalKind) {
            const kind = kinds.get(type.defaultProposalKind)
            const parsed = parsePayload(type.defaultProposalKind, f.payload)
            if (kind && parsed.ok) {
              const proposal = await uow.tx.proposal.create({
                data: {
                  kind: kind.key, payload: parsed.value as never, payloadHash: payloadHash({ kind: kind.key, payload: parsed.value }), summary: f.summary, expectedImpact: f.impact as never,
                  status: 'validated', validation: { checks: ['payload shape', 'subject still current'], validatorVersion: kind.validatorVersion, at: now.toISOString() } as never,
                  proposedByAgentId: agent.id, locationId: location.id, targetList: f.subjectType, targetId: f.subjectId,
                  expiresAt: new Date(now.getTime() + (kind.defaultExpiryMinutes ?? 1440) * 60_000), signals: { connect: [{ id: signal.id }] },
                },
              })
              await uow.tx.signal.update({ where: { id: signal.id }, data: { status: 'proposed', version: { increment: 1 } } })
              auditCreate(uow, actor, 'Proposal', proposal.id, 'proposal.created', { kind: kind.key, signal: type.key }, { metadata: { proposedBy: AGENT_NAME } })
              proposals += 1
            }
          }
        }
        // Signals whose condition no longer holds close themselves, and so do the suggestions that came from them.
        const stale = await uow.tx.signal.findMany({ where: { typeId: type.id, locationId: location.id, status: { in: ['open', 'proposed'] }, dedupeKey: { notIn: [...keys] } }, include: { proposals: { select: { id: true, status: true } } } })
        for (const s of stale) {
          await uow.tx.signal.update({ where: { id: s.id }, data: { status: 'resolved_by_change', version: { increment: 1 } } })
          await uow.tx.proposal.updateMany({ where: { id: { in: s.proposals.map(p => p.id) }, status: { in: ['proposed', 'validated'] } }, data: { status: 'invalid', validation: { reason: 'The situation changed before anyone acted.', at: now.toISOString() } as never, version: { increment: 1 } } })
          resolved += 1
        }
        await uow.tx.signalRun.update({ where: { id: run.id }, data: { counts: { found: found.length } as never, version: { increment: 1 } } })
      }
    }
    uow.audit({ eventType: 'signals.checked', entityType: 'SignalRun', entityId: windowStart.toISOString().slice(0, 10), actorUserId: actor.kind === 'user' ? actor.userId : null, after: { created, resolved, proposals } })
    return { created, resolved, proposals }
  }, { now })
}

// ── Decision and execution ──────────────────────────────────────────────────────────────────────

const operateOk = (actor: Actor, kind: string) => {
  const row = KIND_ROWS.find(k => k.key === kind)
  if (!row || actor.kind !== 'user') return false
  return row.operatePermissions.some(p => actor.permissions.has(p as never))
}

/** Check the proposal still describes the world. Returns a reason when it does not. */
async function stillCurrent(tx: Tx, kind: string, payload: Record<string, string | null>, now: Date): Promise<string | null> {
  if (kind === 'fill_slot') {
    const a = await tx.appointment.findUnique({ where: { id: String(payload.sourceAppointmentId) }, select: { status: true, patientId: true } })
    if (!a || a.status !== 'broken') return 'The missed visit changed.'
    const upcoming = await tx.appointment.count({ where: { patientId: String(payload.patientId), startsAt: { gt: now }, status: { in: ['scheduled', 'confirmed'] } } })
    const waiting = await tx.asapEntry.count({ where: { patientId: String(payload.patientId), status: 'active' } })
    return upcoming || waiting ? 'The patient already has a visit or is on the earlier-visit list.' : null
  }
  if (kind === 'verify_eligibility') {
    const c = await tx.coverage.findUnique({ where: { id: String(payload.coverageId) }, select: { status: true, verificationLevel: true } })
    return !c || c.verificationLevel !== 'unverified' || ['terminated', 'invalid'].includes(c.status) ? 'The insurance was checked or ended in the meantime.' : null
  }
  if (kind === 'fix_claim') {
    const c = await tx.claim.findUnique({ where: { id: String(payload.claimId) }, select: { status: true } })
    return c?.status === 'rejected' ? null : 'The claim is no longer rejected.'
  }
  if (kind === 'claim_status_inquiry') {
    const c = await tx.claim.findUnique({ where: { id: String(payload.claimId) }, select: { status: true } })
    return c && ['acknowledged', 'pending_payer'].includes(c.status) ? null : 'The claim has moved on.'
  }
  return 'This kind of suggestion cannot be carried out.'
}

async function execute(uow: UnitOfWork, actor: Actor, kind: ExecutableKind, payload: Record<string, string | null>) {
  if (kind === 'verify_eligibility') {
    const { openVerification } = await import('../mutations/insurance')
    const r = await openVerification(uow, actor, String(payload.coverageId), { trigger: 'proposal', viaClearinghouse: true })
    return { command: 'verification.request', effects: [{ list: 'BenefitVerification', id: r.verificationId }] }
  }
  if (kind === 'claim_status_inquiry') {
    const inquiry = await uow.tx.claimStatusInquiry.create({ data: { claimId: String(payload.claimId), status: 'queued' } })
    uow.after(async () => (await import('../messaging/claimWorker')).runClaimStatus(uow.db, inquiry.id))
    return { command: 'claim.request_status', effects: [{ list: 'ClaimStatusInquiry', id: inquiry.id }] }
  }
  if (kind === 'fix_claim') {
    const moved = await transition<any>(uow, { model: 'Claim', id: String(payload.claimId), from: ['rejected'], to: 'correction_required', actor, eventType: 'claim.correction_started', reason: 'Reopened from an assistant suggestion.' })
    return { command: 'claim.correct', effects: [{ list: 'Claim', id: moved.id }] }
  }
  // fill_slot: the patient joins the earlier-visit list. The front desk books from there with the usual schedule tools.
  const entry = await uow.tx.asapEntry.create({ data: { patientId: String(payload.patientId), locationId: String(payload.locationId), appointmentTypeId: payload.appointmentTypeId ?? null, status: 'active', priority: 5, note: 'Added from an assistant suggestion after a missed visit.' } })
  auditCreate(uow, actor, 'AsapEntry', entry.id, 'asap.added', { patientId: payload.patientId, locationId: payload.locationId })
  return { command: 'schedule.asap_add', effects: [{ list: 'AsapEntry', id: entry.id }] }
}

export type Decision = { proposalId: string; decision: 'approve' | 'reject'; reason?: string; expectedVersion: number; locationIds: string[] | null; receiptKey: string }

/** Called inside a command (so the command receipt commits with the effects). */
export async function decideProposalIn(uow: UnitOfWork, actor: Actor, input: Decision) {
  if (actor.kind !== 'user') throw new DomainError(Codes.NOT_AUTHORIZED, 'An agent can propose but never approve.')
  const row = await lockRow<any>(uow.tx, 'Proposal', input.proposalId)
  if (input.locationIds !== null && (!row.locationId || !input.locationIds.includes(row.locationId))) throw new DomainError(Codes.NOT_FOUND, 'Proposal not found.', { model: 'Proposal' })
  const kind = await uow.tx.proposalKind.findUnique({ where: { key: row.kind } })
  if (!kind) throw new DomainError(Codes.GUARD_FAILED, 'This kind of suggestion is not set up.')
  if (!actor.permissions.has(kind.requiredPermission as never) && !actor.permissions.has('canDecideProposals')) throw new DomainError(Codes.NOT_AUTHORIZED, `Deciding this needs the ${kind.requiredPermission} permission.`)
  if (input.decision === 'approve' && !operateOk(actor, row.kind)) throw new DomainError(Codes.NOT_AUTHORIZED, 'You need the permission that does this task by hand to approve it.')
  if (row.proposedByAgentId) {
    const agent = await uow.tx.agentIdentity.findUnique({ where: { id: row.proposedByAgentId }, select: { ownerId: true } })
    if (agent?.ownerId && agent.ownerId === actor.userId) throw new DomainError(Codes.SELF_APPROVAL, "You can't approve a suggestion made by an assistant you own.")
  }
  if (row.proposedByUserId && row.proposedByUserId === actor.userId) throw new DomainError(Codes.SELF_APPROVAL, "You can't approve your own request.")
  if (input.expectedVersion !== row.version) throw new DomainError(Codes.STALE_STATE, 'This suggestion changed. Reload and try again.', { currentStatus: row.status, currentVersion: row.version })
  if (effectiveStatus(row, uow.now) === 'expired') {
    if (['proposed', 'validated'].includes(row.status)) await uow.tx.proposal.updateMany({ where: { id: row.id, version: row.version }, data: { status: 'expired', version: { increment: 1 } } })
    uow.audit({ eventType: 'proposal.expired', entityType: 'Proposal', entityId: row.id, actorUserId: actor.userId })
    return { id: row.id, status: 'expired', refused: 'This suggestion has expired.' }
  }
  const signalIds = (await uow.tx.signal.findMany({ where: { proposals: { some: { id: row.id } } }, select: { id: true } })).map(s => s.id)
  if (input.decision === 'reject') {
    const reason = String(input.reason ?? '').trim()
    if (!reason) throw new DomainError(Codes.INVALID_INPUT, 'Say why you are rejecting it.', { field: 'reason' })
    const moved = await transition<any>(uow, { model: 'Proposal', id: row.id, from: ['proposed', 'validated'], to: 'rejected', actor, eventType: 'proposal.rejected', reason })
    await uow.tx.signal.updateMany({ where: { id: { in: signalIds }, status: 'proposed' }, data: { status: 'dismissed', version: { increment: 1 } } })
    return { id: row.id, status: moved.status }
  }
  const parsed = parsePayload(row.kind, row.payload)
  if (!parsed.ok || payloadHash({ kind: row.kind, payload: parsed.value }) !== row.payloadHash) throw new DomainError(Codes.APPROVAL_MISMATCH, 'The suggestion was changed after it was made.')
  const stale = await stillCurrent(uow.tx, row.kind, parsed.value, uow.now)
  if (stale) {
    await transition<any>(uow, { model: 'Proposal', id: row.id, from: ['proposed', 'validated'], to: 'invalid', actor, eventType: 'proposal.invalidated', reason: stale, data: { validation: { reason: stale, at: uow.now.toISOString() } } })
    await uow.tx.signal.updateMany({ where: { id: { in: signalIds }, status: 'proposed' }, data: { status: 'resolved_by_change', version: { increment: 1 } } })
    return { id: row.id, status: 'invalid', refused: stale }
  }
  const approval = await uow.tx.approvalRequest.create({
    data: { action: `proposal.${row.kind}`, summary: String(row.summary ?? '').slice(0, 300), targetList: 'Proposal', targetId: row.id, payload: parsed.value as never, payloadHash: row.payloadHash, requiredPermission: kind.requiredPermission, requestedByAgentId: row.proposedByAgentId, locationId: row.locationId, status: 'approved', consumedAt: uow.now },
  })
  await uow.tx.approvalDecision.create({ data: { requestId: approval.id, decidedById: actor.userId, decision: 'approve', reason: String(input.reason ?? ''), at: uow.now } })
  await transition<any>(uow, { model: 'Proposal', id: row.id, from: ['proposed', 'validated'], to: 'executing', actor, eventType: 'proposal.approved', reason: input.reason ?? null, data: { approvalId: approval.id } })
  const done = await execute(uow, actor, row.kind as ExecutableKind, parsed.value)
  const execution = { ...done, receipt: input.receiptKey, decidedBy: actor.userId, at: uow.now.toISOString() }
  await transition<any>(uow, { model: 'Proposal', id: row.id, from: ['executing'], to: 'executed', actor, eventType: 'proposal.executed', data: { execution } })
  await uow.tx.signal.updateMany({ where: { id: { in: signalIds }, status: 'proposed' }, data: { status: 'resolved_by_execution', version: { increment: 1 } } })
  return { id: row.id, status: 'executed', execution }
}

// ── Read model: outcomes are computed when read ─────────────────────────────────────────────────

export async function realisedOutcome(tx: Tx | Db, row: { kind: string; status: string; payload: any; execution?: any }, now: Date) {
  if (row.status !== 'executed') return null
  const p = row.payload ?? {}
  if (row.kind === 'fill_slot') {
    const booked = await (tx as any).appointment.count({ where: { patientId: p.patientId, startsAt: { gt: now }, status: { in: ['scheduled', 'confirmed'] } } })
    return booked ? { state: 'achieved', text: 'The patient has a visit booked again.' } : { state: 'waiting', text: 'On the earlier-visit list; no visit booked yet.' }
  }
  if (row.kind === 'verify_eligibility') {
    const c = await (tx as any).coverage.findUnique({ where: { id: p.coverageId }, select: { verificationLevel: true } })
    return c && c.verificationLevel !== 'unverified' ? { state: 'achieved', text: 'Benefits are checked.' } : { state: 'waiting', text: 'The benefit check is still open.' }
  }
  const claim = await (tx as any).claim.findUnique({ where: { id: p.claimId }, select: { status: true, adjudicationOutcome: true } })
  if (!claim) return null
  if (row.kind === 'fix_claim') return ['released', 'submitted', 'acknowledged', 'pending_payer', 'adjudicated', 'closed'].includes(claim.status) ? { state: 'achieved', text: 'The fixed claim went back to the payer.' } : { state: 'waiting', text: 'The claim is being corrected.' }
  const paid = ['paid', 'partially_paid'].includes(claim.adjudicationOutcome)
  return paid ? { state: 'achieved', text: 'The payer paid the claim.' } : { state: 'waiting', text: 'The payer has not paid yet.' }
}

export async function loadHome(db: Db, locationIds: string[] | null, now = new Date()) {
  const where = locationIds ? { locationId: { in: locationIds } } : {}
  const [signals, proposals, kinds] = await Promise.all([
    db.signal.findMany({ where: { ...where, status: { in: ['open', 'proposed'] } }, include: { type: { select: { key: true, title: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
    db.proposal.findMany({ where, include: { signals: { select: { id: true, summary: true, status: true, type: { select: { title: true } } } }, proposedByAgent: { select: { name: true } }, approval: { select: { decisions: { select: { reason: true, at: true, decidedBy: { select: { name: true } } } } } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
    db.proposalKind.findMany(),
  ])
  const kindTitle = new Map(kinds.map(k => [k.key, k.title]))
  const rows = []
  for (const p of proposals) {
    const status = effectiveStatus(p, now)
    rows.push({
      id: p.id, kind: p.kind, kindTitle: kindTitle.get(p.kind) ?? p.kind, summary: p.summary, status, version: p.version, expiresAt: p.expiresAt?.toISOString() ?? null, createdAt: p.createdAt.toISOString(),
      proposedBy: p.proposedByAgent?.name ?? 'Staff', locationId: p.locationId, targetList: p.targetList, targetId: p.targetId, expectedImpact: p.expectedImpact,
      trace: {
        signal: p.signals.map(s => s.type?.title).filter(Boolean).join(', '),
        decision: p.approval?.decisions.map(d => ({ by: d.decidedBy?.name ?? 'Someone', reason: d.reason, at: d.at?.toISOString() ?? null })) ?? [],
        receipt: (p.execution as any)?.receipt ?? null, effects: (p.execution as any)?.effects ?? [],
      },
      outcome: await realisedOutcome(db, p, now),
    })
  }
  return { signals: signals.map(s => ({ id: s.id, type: s.type?.title ?? '', summary: s.summary, status: s.status, createdAt: s.createdAt.toISOString(), subjectType: s.subjectType, subjectId: s.subjectId })), proposals: rows }
}

/** Record that a kind may be carried out without waiting. Refused for a never-autonomous kind; needs canApproveAutonomy and the practice switch. */
export async function setAutonomyPolicyIn(uow: UnitOfWork, actor: Actor, input: { kind: string; mode: string }) {
  if (actor.kind !== 'user' || !actor.permissions.has('canApproveAutonomy')) throw new DomainError(Codes.NOT_AUTHORIZED, 'This needs the canApproveAutonomy permission.')
  if (!['suggest_only', 'carry_out_low_risk'].includes(input.mode)) throw new DomainError(Codes.INVALID_INPUT, 'Choose suggest only or carry out low-risk.', { field: 'mode' })
  await ensureCatalogue(uow.tx)
  const kind = await uow.tx.proposalKind.findUnique({ where: { key: input.kind } })
  if (!kind) throw new DomainError(Codes.NOT_FOUND, 'That kind of suggestion does not exist.')
  if (kind.riskClass === 'never_autonomous' && input.mode !== 'suggest_only') throw new DomainError(Codes.GUARD_FAILED, 'This kind always needs a person. It cannot be set to carry out on its own.')
  if (kind.riskClass !== 'low' && input.mode !== 'suggest_only') throw new DomainError(Codes.GUARD_FAILED, 'Only low-risk kinds can be carried out without waiting.')
  const practice = await uow.tx.practiceSettings.findUnique({ where: { id: 1 }, select: { aiAutonomyAllowed: true } })
  if (input.mode !== 'suggest_only' && !practice?.aiAutonomyAllowed) throw new DomainError(Codes.GUARD_FAILED, 'The practice has not allowed the assistant to act on its own.')
  const existing = await uow.tx.autonomyPolicy.findFirst({ where: { kind: input.kind, isActive: true } })
  if (existing) await uow.tx.autonomyPolicy.update({ where: { id: existing.id }, data: { isActive: false, version: { increment: 1 } } })
  const created = await uow.tx.autonomyPolicy.create({ data: { kind: input.kind, mode: input.mode, isActive: true } })
  auditCreate(uow, actor, 'AutonomyPolicy', created.id, 'autonomy.policy_set', { kind: input.kind, mode: input.mode })
  return { id: created.id, kind: input.kind, mode: input.mode }
}
