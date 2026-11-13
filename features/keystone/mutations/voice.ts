import { requirePermission, requireScope, type Actor } from '../lib/actor'
import { payloadHash } from '../lib/canonical'
import { auditCreate } from '../lib/cas'
import { command } from '../lib/command'
import { advisoryLock } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import { recordingModeOf } from '../lib/jurisdiction'
import { nextReference } from '../lib/sequence'
import { addDays, humanInstant, localDate } from '../lib/time'
import { parsePayload } from '../lib/aiPure'
import { ensureCatalogue } from '../lib/ai'
import { CALL_OUTCOMES } from '../models/phase6'
import { SimulatedVoice, adapterStatus, fillScenario, manualTelephony, scenarioByKey, simulatedTelephony, SCENARIOS, type InboundCallEvent } from '../lib/voiceAdapters'
import { FRONT_DESK, VOICE_AGENT_NAME, VOICE_SCOPES, hoursText, parseDob, runCall, type CallResult, type CallTools } from '../lib/voicePure'
import { availability, createAppointment, placeHold, confirmIn } from './scheduling'
import { assertBookablePatient, assertLocation, assertPatientInScope, optionalText, requireText, staff, type Ctx } from './shared'

/*
 * Phase 7 commands: the voice receptionist, behind telephony adapters.
 *
 * A call happens only inside one of these requests: a staff member runs a simulation, or an inbound event arrives at the webhooks port.
 * Nothing dials, nothing sends, nothing waits on a timer, and no provider is connected. The agent uses the Front Desk's tools through the
 * proposal path; it has no write path of its own.
 */

type Tx = any
const run = async <T>(context: Ctx, actor: any, name: string, args: any, work: (uow: any) => Promise<T>) => {
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name, actor, idempotencyKey, params }, work)
  return { replay: result.replay, ...(result.value as any) }
}

const uid = (actor: Actor) => (actor.kind === 'user' ? actor.userId : null)
const HOLD_MINUTES = 30
export const VOICE_OFF = 'Voice calls are off for this office. The owner can turn them on in Settings.'

// ── The switch ───────────────────────────────────────────────────────────────────────────────────

/** Voice is off unless a policy row says otherwise. */
export async function voiceEnabled(tx: Tx, locationId: string) {
  const policy = await tx.voicePolicy.findFirst({ where: { locationId }, select: { enabled: true, recordCalls: true, changedById: true } })
  return { enabled: !!policy?.enabled, recordCalls: !!policy?.enabled && !!policy?.recordCalls, enabledById: (policy?.enabled && policy?.changedById) || null }
}

/** Turn voice on or off for one office. Only the owner (canApproveAutonomy) may, and every change is audited with a reason. */
export async function setVoicePolicy(_root: unknown, args: { locationId: string; enabled: boolean; recordCalls?: boolean | null; reason?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canApproveAutonomy')
  assertLocation(locationIds, args.locationId)
  return run(context, actor, 'voice.set_policy', args, async uow => {
    const reason = requireText(args.reason, 'reason')
    const location = await uow.tx.location.findUnique({ where: { id: args.locationId }, select: { id: true, name: true } })
    if (!location) throw new DomainError(Codes.NOT_FOUND, 'Location not found.')
    const recordCalls = !!args.enabled && !!args.recordCalls
    await advisoryLock(uow.tx, `voice:${args.locationId}`)
    const before = await uow.tx.voicePolicy.findFirst({ where: { locationId: args.locationId } })
    const row = before
      ? await uow.tx.voicePolicy.update({ where: { id: before.id }, data: { enabled: !!args.enabled, recordCalls, changedById: uid(actor), changedAt: uow.now, version: { increment: 1 } } })
      : await uow.tx.voicePolicy.create({ data: { locationId: args.locationId, enabled: !!args.enabled, recordCalls, changedById: uid(actor), changedAt: uow.now } })
    uow.audit({
      eventType: args.enabled ? 'voice.enabled' : 'voice.disabled', entityType: 'VoicePolicy', entityId: row.id, actorUserId: uid(actor), reason,
      before: before ? { enabled: before.enabled, recordCalls: before.recordCalls } : { enabled: false, recordCalls: false }, after: { enabled: row.enabled, recordCalls: row.recordCalls, locationId: args.locationId },
    })
    return { policyId: row.id, enabled: row.enabled, recordCalls: row.recordCalls }
  })
}

// ── Manual call log ──────────────────────────────────────────────────────────────────────────────

/** Staff write down a call they took or made. No AI, no audio, nothing recorded; the words are theirs. */
export async function logManualCall(_root: unknown, args: { locationId: string; patientId?: string | null; direction: string; outcome: string; notes: string; durationSeconds?: number | null; callerNumber?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule', 'canMessagePatients')
  assertLocation(locationIds, args.locationId)
  return run(context, actor, 'call.log_manual', args, async uow => {
    if (!['inbound', 'outbound'].includes(args.direction)) throw new DomainError(Codes.INVALID_INPUT, 'Choose inbound or outbound.', { field: 'direction' })
    if (!(CALL_OUTCOMES as readonly string[]).includes(args.outcome)) throw new DomainError(Codes.INVALID_INPUT, 'Choose how the call ended.', { field: 'outcome' })
    const notes = requireText(args.notes, 'notes')
    const seconds = args.durationSeconds == null ? 0 : Number(args.durationSeconds)
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 6 * 3600) throw new DomainError(Codes.INVALID_INPUT, 'Enter the length of the call in whole seconds.', { field: 'durationSeconds' })
    if (args.patientId) await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const ref = await nextReference(uow.tx, 'CAL', uow.now)
    const call = await uow.tx.callRecord.create({
      data: {
        ref, locationId: args.locationId, patientId: args.patientId ?? null, direction: args.direction, adapter: 'manual', outcome: args.outcome, startedAt: uow.now, durationSeconds: seconds,
        summary: notes.slice(0, 200), notes, callerNumber: optionalText(args.callerNumber) ?? '', loggedById: uid(actor), recordingConsent: false,
      },
    })
    uow.audit({ eventType: 'call.logged', entityType: 'CallRecord', entityId: call.id, actorUserId: uid(actor), after: { adapter: 'manual', direction: call.direction, outcome: call.outcome, locationId: args.locationId } })
    return { callId: call.id, ref }
  })
}

/** A person closes the loop on a call that was handed over or left a request. A call that is missing or at another office is not found. */
export async function markCallFollowedUp(_root: unknown, args: { callId: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule', 'canMessagePatients')
  return run(context, actor, 'call.follow_up', args, async uow => {
    const call = await uow.tx.callRecord.findUnique({ where: { id: args.callId }, select: { id: true, locationId: true, followedUpAt: true, version: true } })
    if (!call || (locationIds !== null && (!call.locationId || !locationIds.includes(call.locationId)))) throw new DomainError(Codes.NOT_FOUND, 'Call not found.', { model: 'CallRecord' })
    if (call.followedUpAt) return { callId: call.id, already: true }
    await uow.tx.callRecord.update({ where: { id: call.id }, data: { followedUpAt: uow.now, followedUpById: uid(actor), version: { increment: 1 } } })
    uow.audit({ eventType: 'call.followed_up', entityType: 'CallRecord', entityId: call.id, actorUserId: uid(actor) })
    return { callId: call.id, already: false }
  })
}

// ── The voice agent ──────────────────────────────────────────────────────────────────────────────

/** The grants' source, so anyone reading AgentToolGrant sees where they came from and who enabled them. */
export const VOICE_GRANT_SOURCE = 'voice_receptionist_front_desk_ceiling'

/**
 * The voice agent: its own identity, owned by the practice owner, with exactly the Front Desk's grants.
 * A paused or revoked agent is returned as it is and gets no grants. Each grant it is given is an audited event naming the owner who turned voice on
 * (S1: the Front Desk ceiling stands in for grant approval; the source on each grant says so).
 */
export async function ensureVoiceAgent(tx: Tx, uow?: { audit: (e: any) => void }, enabling?: { userId: string | null; trigger: string }) {
  await ensureCatalogue(tx)
  const owner = await tx.user.findFirst({ where: { role: { name: 'Practice Owner' } }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  let agent = await tx.agentIdentity.findUnique({ where: { name: VOICE_AGENT_NAME } })
  if (!agent) {
    agent = await tx.agentIdentity.create({
      data: { name: VOICE_AGENT_NAME, purpose: 'Answers the phone for the front desk. It uses the same tools as the Front Desk Assistant and can only ask; a person approves anything that changes the schedule.', kind: 'rules_engine', status: 'active', ownerId: owner?.id ?? null },
    })
  }
  if (agent.status !== 'active') return agent
  for (const scope of VOICE_SCOPES) {
    const have = await tx.agentToolGrant.findFirst({ where: { agentId: agent.id, scope } })
    if (have) continue
    const grant = await tx.agentToolGrant.create({ data: { agentId: agent.id, scope, status: 'active', constraints: { source: VOICE_GRANT_SOURCE, enabledById: enabling?.userId ?? null, note: 'Front Desk Assistant ceiling, given when voice was turned on for an office.' } as never } })
    uow?.audit({ eventType: 'agent.grant_created', entityType: 'AgentToolGrant', entityId: grant.id, actorUserId: enabling?.userId ?? null, reason: 'Voice Receptionist: Front Desk ceiling', after: { agentId: agent.id, scope, status: 'active', source: VOICE_GRANT_SOURCE }, metadata: { trigger: enabling?.trigger ?? null } })
  }
  return agent
}

/** The agent as an actor: only grants that are active, and never more than the Front Desk's. */
export async function voiceActor(tx: Tx, agent: { id: string; ownerId?: string | null; status?: string | null }): Promise<Actor> {
  const current = await tx.agentIdentity.findUnique({ where: { id: agent.id }, select: { status: true } })
  if (current?.status !== 'active') return { kind: 'agent', agentId: agent.id, ownerUserId: agent.ownerId ?? null, name: VOICE_AGENT_NAME, scopes: new Set<string>() }
  const grants = await tx.agentToolGrant.findMany({ where: { agentId: agent.id, status: 'active', revokedAt: null }, select: { scope: true } })
  const allowed = new Set<string>(VOICE_SCOPES)
  return { kind: 'agent', agentId: agent.id, ownerUserId: agent.ownerId ?? null, name: VOICE_AGENT_NAME, scopes: new Set(grants.map((g: any) => g.scope).filter((s: string) => allowed.has(s))) }
}

const CLEANING = /clean|prophy|hygiene|recall/i

/** The Front Desk tools, bound to one call. Each takes nothing the caller said: every argument comes from the call's own state. */
function bindTools(uow: any, agent: Actor, state: { locationId: string; patientId: string | null; timeZone: string; agentRunId: string | null }) {
  let slot: { operatoryId: string; providerId: string | null; startsAt: string; typeId: string; label: string } | null = null
  let visit: { id: string; label: string } | null = null
  const proposals: string[] = []
  const propose = async (kind: 'booking' | 'confirm_appointment', payload: Record<string, unknown>, summary: string, target: { list: string; id: string }) => {
    const parsed = parsePayload(kind, payload)
    if (!parsed.ok) throw new DomainError(Codes.INVALID_INPUT, 'The suggestion was not valid.')
    const kindRow = await uow.tx.proposalKind.findUnique({ where: { key: kind } })
    const row = await uow.tx.proposal.create({
      data: {
        kind, payload: parsed.value as never, payloadHash: payloadHash({ kind, payload: parsed.value }), summary, expectedImpact: { source: 'phone_call' } as never, status: 'validated',
        validation: { checks: ['payload shape', 'Front Desk tool'], validatorVersion: kindRow?.validatorVersion ?? 'v1', at: uow.now.toISOString() } as never,
        proposedByAgentId: (agent as any).agentId, locationId: state.locationId, targetList: target.list, targetId: target.id,
        expiresAt: new Date(uow.now.getTime() + (kindRow?.defaultExpiryMinutes ?? 1440) * 60_000),
      },
    })
    auditCreate(uow, agent, 'Proposal', row.id, 'proposal.created', { kind, source: 'phone_call' }, { metadata: { proposedBy: VOICE_AGENT_NAME } })
    proposals.push(row.id)
    return row
  }

  const tools: CallTools = {
    async availability() {
      requireScope(agent, 'availability.read')
      const types = await uow.tx.appointmentType.findMany({ where: { isActive: true, onlineBookable: true, newPatientOnly: false }, orderBy: { name: 'asc' } })
      const type = types.find((t: any) => CLEANING.test(`${t.name} ${t.publicName} ${t.code} ${t.category}`)) ?? types[0]
      if (!type) return null
      const tomorrow = addDays(localDate(state.timeZone, uow.now), 1)
      const found = await availability(uow.tx, { locationId: state.locationId, typeId: type.id, fromDate: tomorrow, days: 14, patientId: state.patientId, onlineOnly: true, leadMinutes: 240, limit: 1 } as any)
      const first = found.slots[0]
      if (!first) return null
      slot = { operatoryId: first.operatoryId, providerId: first.providerId, startsAt: first.startsAt, typeId: type.id, label: humanInstant(state.timeZone, new Date(first.startsAt)) }
      return { label: slot.label }
    },
    async hold() {
      requireScope(agent, 'holds.create')
      if (!slot || !state.patientId) throw new DomainError(Codes.GUARD_FAILED, 'There is no offered time to hold.')
      await placeHold(uow, agent, { locationId: state.locationId, operatoryId: slot.operatoryId, typeId: slot.typeId, startsAt: slot.startsAt, providerId: slot.providerId, patientId: state.patientId, holderKind: 'agent_offer', holderRef: `agent:${(agent as any).agentId}`, minutes: HOLD_MINUTES, onlineOnly: true } as never)
    },
    async book() {
      requireScope(agent, 'propose:booking')
      if (!slot || !state.patientId) throw new DomainError(Codes.GUARD_FAILED, 'There is no offered time to book.')
      const row = await propose('booking', { patientId: state.patientId, locationId: state.locationId, operatoryId: slot.operatoryId, typeId: slot.typeId, providerId: slot.providerId, startsAt: slot.startsAt }, `Book ${slot.label}, asked for by phone`, { list: 'Patient', id: state.patientId })
      return { proposalId: row.id }
    },
    async confirm_find() {
      requireScope(agent, 'schedule.read')
      if (!state.patientId) return null
      const next = await uow.tx.appointment.findFirst({ where: { patientId: state.patientId, locationId: state.locationId, status: 'scheduled', startsAt: { gt: uow.now } }, orderBy: { startsAt: 'asc' }, select: { id: true, startsAt: true } })
      if (!next) return null
      visit = { id: next.id, label: humanInstant(state.timeZone, next.startsAt) }
      return { label: visit.label }
    },
    async confirm() {
      requireScope(agent, 'propose:confirm_appointment')
      if (!visit) throw new DomainError(Codes.GUARD_FAILED, 'There is no visit to confirm.')
      const row = await propose('confirm_appointment', { appointmentId: visit.id, method: 'phone' }, `Record the phone confirmation for ${visit.label}`, { list: 'Appointment', id: visit.id })
      return { proposalId: row.id }
    },
  }
  return { tools, proposals }
}

/** Dates of birth are checked, never stored: a caller turn that is a date of birth is kept as "[date of birth]". */
export const redactTranscript = (turns: { who: string; text: string }[]) => turns.map(t => (t.who === 'caller' && parseDob(t.text) ? { ...t, text: '[date of birth]' } : t))

const digitsOf = (value: string) => value.replace(/\D/g, '')

/** The patient a caller number belongs to at this office, only when exactly one patient does. */
async function matchCaller(tx: Tx, locationIds: string[], callerNumber: string) {
  const digits = digitsOf(callerNumber)
  if (digits.length < 7) return null
  const points = await tx.contactPoint.findMany({ where: { isActive: true, patientId: { not: null }, kind: { not: 'email' }, OR: [{ valueNormalized: { in: [digits, `+${digits}`, `+1${digits}`, digits.slice(-10)] } }, { value: callerNumber }] }, select: { patientId: true } })
  const ids: string[] = [...new Set<string>(points.map((p: any) => p.patientId as string))]
  if (ids.length !== 1) return null
  try { await assertPatientInScope(tx, locationIds, ids[0]) } catch { return null }
  return ids[0]
}

/** Outbound calls need the patient's AI-voice consent on a live phone contact. Nothing else stands in for it. */
export async function hasVoiceConsent(tx: Tx, patientId: string) {
  const grant = await tx.consentGrant.findFirst({ where: { purpose: 'ai_voice_outbound', channel: 'voice', status: 'granted', revokedAt: null, contactPoint: { patientId, isActive: true } }, orderBy: { grantedAt: 'desc' }, select: { id: true } })
  return !!grant
}

type RunInput = { locationId: string; direction: 'inbound' | 'outbound'; lines: readonly string[]; patientId: string | null; callerNumber: string; scenario: string; recordingAnswer: 'agree' | 'decline' | 'silent'; adapter: 'simulated'; actorForAudit: Actor }

/** One whole call, inside the caller's transaction. The only place a call is run. */
async function runCallIn(uow: any, input: RunInput) {
  const tx = uow.tx
  const location = await tx.location.findUnique({ where: { id: input.locationId }, include: { jurisdiction: { select: { rules: true } } } })
  if (!location) throw new DomainError(Codes.NOT_FOUND, 'Location not found.')
  // 1. Off unless the owner turned it on.
  const policy = await voiceEnabled(tx, input.locationId)
  if (!policy.enabled) throw new DomainError(Codes.GUARD_FAILED, VOICE_OFF, { field: 'locationId' })
  // 2. No outbound call without the patient's agreement to AI voice calls.
  if (input.direction === 'outbound') {
    if (!input.patientId) throw new DomainError(Codes.INVALID_INPUT, 'Choose the patient to call.', { field: 'patientId' })
    if (!(await hasVoiceConsent(tx, input.patientId))) {
      throw new DomainError(Codes.CONSENT_REQUIRED, 'This patient has not agreed to AI voice calls, so the call was not placed.', { field: 'patientId' })
    }
  }
  const patient = input.patientId ? await tx.patient.findUnique({ where: { id: input.patientId }, select: { id: true, firstName: true, preferredName: true, dateOfBirth: true, status: true } }) : null
  if (input.patientId && !patient) throw new DomainError(Codes.NOT_FOUND, 'Patient not found.')
  if (patient) assertBookablePatient(patient)

  const practice = await tx.practiceSettings.findUnique({ where: { id: 1 }, select: { displayName: true } })
  const dob = patient?.dateOfBirth ? new Date(patient.dateOfBirth).toISOString().slice(0, 10) : null
  const agentRow = await ensureVoiceAgent(tx, uow, { userId: policy.enabledById, trigger: input.actorForAudit.kind === 'user' ? `user:${input.actorForAudit.userId}` : input.actorForAudit.kind === 'system' ? `system:${input.actorForAudit.name}` : 'agent' })
  const agent = await voiceActor(tx, agentRow)
  const unavailable = agentRow.status === 'active' ? undefined : `the Voice Receptionist is ${agentRow.status === 'paused' ? 'paused' : 'turned off'}`
  const state = { locationId: input.locationId, patientId: patient?.id ?? null, timeZone: location.timeZone, agentRunId: null }
  const bound = bindTools(uow, agent, state)
  const voice = new SimulatedVoice(input.lines, input.recordingAnswer)

  const result: CallResult = await runCall({
    direction: input.direction, practiceName: practice?.displayName ?? 'our office', locationName: location.name, phone: location.phone ?? '', address: location.address ?? '', hours: hoursText(location.hours),
    patient: patient && dob ? { firstName: patient.preferredName || patient.firstName, dobIso: dob } : null,
    recording: { enabled: policy.recordCalls, mode: recordingModeOf(location.jurisdiction?.rules) }, lines: input.lines, unavailable,
  }, bound.tools, voice)

  // The disclosure must have been the first thing said. If it was not, nothing is kept.
  if (!result.disclosedFirst) throw new DomainError(Codes.GUARD_FAILED, 'The call did not open with the AI disclosure, so it was not saved.')

  const ref = await nextReference(tx, 'CAL', uow.now)
  // A paused or revoked agent did not run, so no AgentRun is written; the call record holds the hand-off.
  const run = unavailable ? null : await tx.agentRun.create({ data: { agentId: agentRow.id, model: 'scripted-simulation', status: 'completed', startedAt: uow.now, endedAt: uow.now, promptHash: payloadHash({ scenario: input.scenario }).slice(0, 16), toolCalls: result.toolCalls as never } })
  if (run && bound.proposals.length) await tx.proposal.updateMany({ where: { id: { in: bound.proposals } }, data: { agentRunId: run.id } })
  const recordingRef = result.recording.record ? simulatedTelephony.startRecording(ref) : null
  const call = await tx.callRecord.create({
    data: {
      ref, locationId: input.locationId, patientId: patient?.id ?? null, direction: input.direction, adapter: input.adapter, outcome: result.outcome, scenario: input.scenario, startedAt: uow.now,
      durationSeconds: result.transcript.length * 6, summary: result.summary, callerNumber: input.callerNumber, transcript: redactTranscript(result.transcript) as never, toolCalls: result.toolCalls as never,
      disclosedAt: uow.now, recordingConsent: result.recording.record, recordingRef: recordingRef ?? '', recordingBasis: result.recording.basis, agentRunId: run?.id ?? null, handoffReason: result.handoffReason,
      loggedById: input.actorForAudit.kind === 'user' ? input.actorForAudit.userId : null,
    },
  })
  uow.audit({
    eventType: 'call.completed', entityType: 'CallRecord', entityId: call.id, actorUserId: input.actorForAudit.kind === 'user' ? input.actorForAudit.userId : null,
    after: { adapter: input.adapter, direction: input.direction, outcome: result.outcome, locationId: input.locationId, proposals: bound.proposals.length, recorded: result.recording.record, handedOff: result.outcome === 'handed_off' },
  })
  return { callId: call.id, ref, outcome: result.outcome, handoffReason: result.handoffReason, disclosedFirst: result.disclosedFirst, recorded: result.recording.record, recordingBasis: result.recording.basis, proposalIds: bound.proposals, summary: result.summary }
}

/** Staff press "Run call simulation". The scripted caller is deterministic; the answer to the recording question is chosen by the person running it. */
export async function runCallSimulation(_root: unknown, args: { locationId: string; scenario: string; patientId?: string | null; recordingAnswer?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule')
  assertLocation(locationIds, args.locationId)
  const scenario = scenarioByKey(args.scenario)
  if (!scenario) throw new DomainError(Codes.INVALID_INPUT, 'Choose a call to simulate.', { field: 'scenario' })
  if (scenario.needsPatient && !args.patientId) throw new DomainError(Codes.INVALID_INPUT, 'Choose the patient this call is about.', { field: 'patientId' })
  const answer = args.recordingAnswer === 'agree' || args.recordingAnswer === 'decline' ? args.recordingAnswer : 'silent'
  return run(context, actor, 'voice.simulate', args, async uow => {
    if (args.patientId) await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const patient = args.patientId ? await uow.tx.patient.findUnique({ where: { id: args.patientId }, select: { dateOfBirth: true } }) : null
    const dob = patient?.dateOfBirth ? new Date(patient.dateOfBirth).toISOString().slice(0, 10) : null
    return runCallIn(uow, { locationId: args.locationId, direction: scenario.direction, lines: fillScenario(scenario, dob), patientId: scenario.needsPatient || scenario.direction === 'outbound' ? args.patientId ?? null : null, callerNumber: 'simulated', scenario: scenario.key, recordingAnswer: answer, adapter: 'simulated', actorForAudit: actor })
  })
}

/**
 * The webhooks port for an inbound call (interface only: no route is mounted and no provider is connected). It takes the raw body a provider would
 * post, turns it into a call event with the adapter, and runs the call inside this one request. The provider's event id is the idempotency key.
 */
export async function receiveInboundCall(db: any, raw: unknown, now = new Date()) {
  const event: InboundCallEvent | null = simulatedTelephony.parseInbound(raw)
  if (!event) throw new DomainError(Codes.INVALID_INPUT, 'That is not a call event.')
  const system: Actor = { kind: 'system', name: 'telephony.inbound' }
  const result = await command(db, { name: 'voice.inbound', actor: system, idempotencyKey: `inbound:${event.eventId}`, params: { eventId: event.eventId }, now }, async uow => {
    const matched = await matchCaller(uow.tx, [event.locationId], event.callerNumber)
    return runCallIn(uow, { locationId: event.locationId, direction: 'inbound', lines: event.utterances, patientId: matched, callerNumber: event.callerNumber, scenario: 'inbound_event', recordingAnswer: 'silent', adapter: 'simulated', actorForAudit: system })
  })
  return { replay: result.replay, ...(result.value as any) }
}

// ── Read model for the screens ───────────────────────────────────────────────────────────────────

export const voiceStatus = () => ({ ...adapterStatus(), manual: manualTelephony.label, scenarios: SCENARIOS.map(s => ({ key: s.key, label: s.label, direction: s.direction, needsPatient: s.needsPatient })), ceiling: FRONT_DESK.name })
