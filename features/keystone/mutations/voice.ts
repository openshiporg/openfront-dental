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
import { PhoneVoice, parseInboundEvent, type InboundCallEvent } from '../lib/voiceAdapters'
import { VOICE_AGENT_NAME, VOICE_SCOPES, hoursText, parseDob, runCall, type CallResult, type CallTools } from '../lib/voicePure'
import { readSecret, storeSecret } from '../lib/secretBox'
import { connectNumber, normalizeNumber } from '../../integrations/voice/twilio'
import { availability, createAppointment, placeHold, confirmIn } from './scheduling'
import { assertBookablePatient, assertLocation, assertPatientInScope, optionalText, requireText, staff, type Ctx } from './shared'

/*
 * Phase 7 commands: the voice receptionist, behind telephony adapters.
 *
 * A call happens only inside one of these requests: Twilio posts a turn of a real phone call to /api/voice/twilio/<office>, signed.
 * Nothing dials, nothing sends, nothing waits on a timer. The agent uses the Front Desk's tools through the proposal path; it has no
 * write path of its own. A call is replayed from the words heard so far on every turn and written once, when it ends.
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

/** Thrown to roll a turn back: the caller has more to say, so nothing from this replay is kept. */
export class CallContinues extends Error { constructor(readonly said: string[]) { super('call continues') } }

type RunInput = { locationId: string; utterances: readonly string[]; final: boolean; patientId: string | null; callerNumber: string; actorForAudit: Actor }

/** One whole call, inside the caller's transaction. The only place a call is run. */
async function runCallIn(uow: any, input: RunInput) {
  const tx = uow.tx
  const location = await tx.location.findUnique({ where: { id: input.locationId }, include: { jurisdiction: { select: { rules: true } } } })
  if (!location) throw new DomainError(Codes.NOT_FOUND, 'Location not found.')
  // 1. Off unless the owner turned it on.
  const policy = await voiceEnabled(tx, input.locationId)
  if (!policy.enabled) throw new DomainError(Codes.GUARD_FAILED, VOICE_OFF, { field: 'locationId' })
  const patient = input.patientId ? await tx.patient.findUnique({ where: { id: input.patientId }, select: { id: true, firstName: true, preferredName: true, dateOfBirth: true, status: true } }) : null
  if (patient) {
    try { assertBookablePatient(patient) } catch { /* a caller whose chart cannot be booked is treated as not matched */ }
  }
  const matched = patient && patient.status === 'active' ? patient : null

  const practice = await tx.practiceSettings.findUnique({ where: { id: 1 }, select: { displayName: true } })
  const dob = matched?.dateOfBirth ? new Date(matched.dateOfBirth).toISOString().slice(0, 10) : null
  const agentRow = await ensureVoiceAgent(tx, uow, { userId: policy.enabledById, trigger: input.actorForAudit.kind === 'user' ? `user:${input.actorForAudit.userId}` : input.actorForAudit.kind === 'system' ? `system:${input.actorForAudit.name}` : 'agent' })
  const agent = await voiceActor(tx, agentRow)
  const unavailable = agentRow.status === 'active' ? undefined : `the Voice Receptionist is ${agentRow.status === 'paused' ? 'paused' : 'turned off'}`
  const state = { locationId: input.locationId, patientId: matched?.id ?? null, timeZone: location.timeZone, agentRunId: null }
  const bound = bindTools(uow, agent, state)
  const voice = new PhoneVoice(input.utterances, input.final)

  // Call recording is not offered: nothing records audio, so the receptionist never asks about it.
  const result: CallResult = await runCall({
    direction: 'inbound', practiceName: practice?.displayName ?? 'our office', locationName: location.name, phone: location.phone ?? '', address: location.address ?? '', hours: hoursText(location.hours),
    patient: matched && dob ? { firstName: matched.preferredName || matched.firstName, dobIso: dob } : null,
    recording: { enabled: false, mode: recordingModeOf(location.jurisdiction?.rules) }, lines: input.utterances, unavailable,
  }, bound.tools, voice)

  // The caller has more to say: say the agent's latest words, keep nothing.
  if (result.awaitingCaller) {
    const lastCaller = result.transcript.map(t => t.who).lastIndexOf('caller')
    throw new CallContinues(result.transcript.slice(lastCaller + 1).filter(t => t.who === 'agent').map(t => t.text))
  }
  // The disclosure must have been the first thing said. If it was not, nothing is kept.
  if (!result.disclosedFirst) throw new DomainError(Codes.GUARD_FAILED, 'The call did not open with the AI disclosure, so it was not saved.')

  const ref = await nextReference(tx, 'CAL', uow.now)
  // A paused or revoked agent did not run, so no AgentRun is written; the call record holds the hand-off.
  const run = unavailable ? null : await tx.agentRun.create({ data: { agentId: agentRow.id, model: 'front-desk-rules', status: 'completed', startedAt: uow.now, endedAt: uow.now, promptHash: payloadHash({ call: ref }).slice(0, 16), toolCalls: result.toolCalls as never } })
  if (run && bound.proposals.length) await tx.proposal.updateMany({ where: { id: { in: bound.proposals } }, data: { agentRunId: run.id } })
  const call = await tx.callRecord.create({
    data: {
      ref, locationId: input.locationId, patientId: matched?.id ?? null, direction: 'inbound', adapter: 'twilio', outcome: result.outcome, startedAt: uow.now,
      durationSeconds: result.transcript.length * 6, summary: result.summary, callerNumber: input.callerNumber, transcript: redactTranscript(result.transcript) as never, toolCalls: result.toolCalls as never,
      disclosedAt: uow.now, recordingConsent: false, recordingRef: '', recordingBasis: result.recording.basis, agentRunId: run?.id ?? null, handoffReason: result.handoffReason,
    },
  })
  uow.audit({
    eventType: 'call.completed', entityType: 'CallRecord', entityId: call.id, actorUserId: null,
    after: { adapter: 'twilio', direction: 'inbound', outcome: result.outcome, locationId: input.locationId, proposals: bound.proposals.length, handedOff: result.outcome === 'handed_off' },
  })
  const said = result.transcript.slice(result.transcript.map(t => t.who).lastIndexOf('caller') + 1).filter(t => t.who === 'agent').map(t => t.text)
  return { callId: call.id, ref, outcome: result.outcome, handoffReason: result.handoffReason, disclosedFirst: result.disclosedFirst, recorded: false, recordingBasis: result.recording.basis, proposalIds: bound.proposals, summary: result.summary, said }
}

export type InboundTurn = { done: false; said: string[] } | ({ done: true; replay: boolean; said: string[] } & Record<string, any>)

/**
 * One turn of a real phone call (the Twilio route calls this after checking the signature). `utterances` is everything the caller has said so far.
 * While the caller may say more, nothing is written and the agent's next words come back. When the call ends, it is written once, keyed by
 * the provider's call id, so a redelivered webhook never runs a call twice.
 */
export async function receiveInboundCall(db: any, raw: unknown, now = new Date()): Promise<InboundTurn> {
  const event: InboundCallEvent | null = parseInboundEvent(raw)
  if (!event) throw new DomainError(Codes.INVALID_INPUT, 'That is not a call event.')
  const system: Actor = { kind: 'system', name: 'telephony.inbound' }
  try {
    const result = await command(db, { name: 'voice.inbound', actor: system, idempotencyKey: `inbound:${event.eventId}`, params: { eventId: event.eventId }, now }, async uow => {
      const matched = await matchCaller(uow.tx, [event.locationId], event.callerNumber)
      return runCallIn(uow, { locationId: event.locationId, utterances: event.utterances, final: event.final !== false, patientId: matched, callerNumber: event.callerNumber, actorForAudit: system })
    })
    return { done: true, replay: result.replay, ...(result.value as any) }
  } catch (error) {
    if (error instanceof CallContinues) return { done: false, said: error.said }
    throw error
  }
}

// ── Connecting a phone number ────────────────────────────────────────────────────────────────────

const appUrl = () => String(process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
export const voiceWebhookUrl = (locationId: string) => `${appUrl()}/api/voice/twilio/${encodeURIComponent(locationId)}`

/** The Twilio line connected for one office, with its auth token, for the webhook route. Null when none is connected. */
export async function voiceLine(tx: Tx, locationId: string) {
  const row = await tx.adapterInstallation.findFirst({ where: { area: 'voice', adapterKey: 'twilio', status: 'live', config: { path: ['locationId'], equals: locationId } }, orderBy: { createdAt: 'desc' } })
  if (!row?.secretId) return null
  const config = (row.config ?? {}) as { accountSid?: string; phoneNumber?: string; voiceUrl?: string }
  return { id: row.id as string, accountSid: String(config.accountSid ?? ''), phoneNumber: String(config.phoneNumber ?? ''), voiceUrl: String(config.voiceUrl ?? ''), authToken: await readSecret(tx, row.secretId) }
}

/** Settings › Locations: connect a Twilio number to one office. Twilio is asked first; nothing is saved unless it confirms the account and the number. */
export async function connectPhoneNumber(_root: unknown, args: { locationId: string; accountSid: string; authToken: string; phoneNumber: string; baaSignedOn: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageAdapters')
  assertLocation(locationIds, args.locationId)
  const accountSid = requireText(args.accountSid, 'accountSid').trim()
  const authToken = requireText(args.authToken, 'authToken').trim()
  if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid)) throw new DomainError(Codes.INVALID_INPUT, 'The Account SID starts with AC and is 34 characters.', { field: 'accountSid' })
  const number = normalizeNumber(args.phoneNumber)
  if (!number) throw new DomainError(Codes.INVALID_INPUT, 'Enter the phone number like +18135550100.', { field: 'phoneNumber' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(args.baaSignedOn ?? ''))) throw new DomainError(Codes.INVALID_INPUT, 'Enter the date the agreement with Twilio (the BAA) was signed.', { field: 'baaSignedOn' })
  if (!appUrl()) throw new DomainError(Codes.GUARD_FAILED, 'The app address is not set, so Twilio cannot be pointed at this app.')
  const voiceUrl = voiceWebhookUrl(args.locationId)
  const { idempotencyKey, authToken: _secret, ...params } = args
  const checked = await connectNumber({ accountSid, authToken, phoneNumber: number, voiceUrl })
  if (!checked.ok) throw new DomainError(Codes.GUARD_FAILED, checked.message, { field: 'accountSid' })
  return run(context, actor, 'voice.connect_number', { ...params, idempotencyKey }, async uow => {
    const location = await uow.tx.location.findUnique({ where: { id: args.locationId }, select: { id: true, name: true } })
    if (!location) throw new DomainError(Codes.NOT_FOUND, 'Location not found.')
    await advisoryLock(uow.tx, `voice-line:${args.locationId}`)
    await uow.tx.adapterInstallation.updateMany({ where: { area: 'voice', adapterKey: 'twilio', status: 'live', config: { path: ['locationId'], equals: args.locationId } }, data: { status: 'suspended' } })
    const baa = await uow.tx.businessAssociate.create({ data: { name: 'Twilio', service: 'voice', baaSignedOn: new Date(`${args.baaSignedOn}T00:00:00Z`), status: 'active' } })
    const secret = await storeSecret(uow.tx, 'voice.twilio.authToken', authToken)
    const row = await uow.tx.adapterInstallation.create({
      data: { area: 'voice', adapterKey: 'twilio', displayName: `Twilio ${number}`, mode: 'live', status: 'live', secretId: secret.id, handlesPhi: true, baaId: baa.id, lastVerifiedAt: uow.now,
        config: { locationId: args.locationId, accountSid, phoneNumber: number, numberSid: checked.numberSid, voiceUrl } as never, verificationReceipt: { at: uow.now.toISOString(), account: checked.accountName } as never },
    })
    uow.audit({ eventType: 'voice.number_connected', entityType: 'AdapterInstallation', entityId: row.id, actorUserId: uid(actor), after: { locationId: args.locationId, phoneNumber: number, provider: 'twilio' } })
    return { installationId: row.id, phoneNumber: number }
  })
}

/** Stop answering calls on a connected number. The line stays on the Twilio account; this app stops taking its calls. */
export async function disconnectPhoneNumber(_root: unknown, args: { locationId: string; reason?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageAdapters')
  assertLocation(locationIds, args.locationId)
  return run(context, actor, 'voice.disconnect_number', args, async uow => {
    const reason = requireText(args.reason, 'reason')
    const rows = await uow.tx.adapterInstallation.findMany({ where: { area: 'voice', adapterKey: 'twilio', status: 'live', config: { path: ['locationId'], equals: args.locationId } }, select: { id: true } })
    for (const row of rows) {
      await uow.tx.adapterInstallation.update({ where: { id: row.id }, data: { status: 'suspended', version: { increment: 1 } } })
      uow.audit({ eventType: 'voice.number_disconnected', entityType: 'AdapterInstallation', entityId: row.id, actorUserId: uid(actor), reason, after: { locationId: args.locationId } })
    }
    return { disconnected: rows.length }
  })
}

// ── Read model for the screens ───────────────────────────────────────────────────────────────────

/** Which offices have a phone number connected (number only, no credentials). Readable by the people who read calls. */
export async function voiceConnections(_root: unknown, _args: unknown, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule', 'canMessagePatients', 'canManageAdapters')
  const rows = await context.prisma.adapterInstallation.findMany({ where: { area: 'voice', adapterKey: 'twilio', status: 'live' }, select: { config: true } })
  const lines = rows.map((r: any) => r.config as { locationId?: string; phoneNumber?: string }).filter((c: any) => c?.locationId && (locationIds === null || locationIds.includes(c.locationId))).map((c: any) => ({ locationId: c.locationId, phoneNumber: c.phoneNumber ?? '' }))
  return { connected: lines.length > 0, lines }
}
