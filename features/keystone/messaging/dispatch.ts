import { randomUUID } from 'node:crypto'
import { systemActor } from '../lib/actor'
import { transition } from '../lib/cas'
import { command } from '../lib/command'
import type { Db } from '../lib/db'
import { parsePackRules } from '../lib/jurisdiction'
import type { ClaimedMessage, OutboxHandlers } from '../lib/outbox'
import { humanInstant, localTime } from '../lib/time'
import type { UnitOfWork } from '../lib/unitOfWork'
import { inQuietHours } from '../scheduling/engine'
import { adapterFor, keywordOf, renderTemplate, type MessagingAdapter } from './adapters'
import { confirmIn } from '../mutations/scheduling'

/*
 * Confirmation and message dispatch (SM§2.3, SM§11; INTEGRATIONS §6; catalog C12).
 * The checks run again at send time, not only when the reminder was queued:
 *   the appointment is still active and unconfirmed, the contact is still active, an active consent
 *   grant covers this channel × purpose × address, and it is not quiet hours where the patient is.
 * Quiet hours defer the message to the end of the window; a missing consent suppresses it.
 * Network I/O (the adapter call) happens outside the transaction; the result is recorded in a second one.
 */

const actor = systemActor('confirmation-dispatch')
const RETRY_QUIET_MS = 15 * 60_000

type Prepared =
  | { kind: 'skip'; reason: string }
  | { kind: 'defer'; until: Date }
  | { kind: 'send'; messageId: string; to: string; channel: 'email' | 'sms'; subject: string; body: string; purpose: string; isSynthetic: boolean }

/** Step 1 (transaction): recheck everything, render, and create the queued Message. */
async function prepare(uow: UnitOfWork, attemptId: string, now: Date): Promise<Prepared> {
  const attempt = await uow.tx.confirmationAttempt.findUnique({
    where: { id: attemptId },
    include: { appointment: { include: { location: { include: { jurisdiction: true } }, patient: true } }, contactPoint: true },
  })
  if (!attempt || attempt.status !== 'scheduled') return { kind: 'skip', reason: 'not_scheduled' }
  const appt = attempt.appointment
  const suppress = async (reason: string) => {
    await transition(uow, { model: 'ConfirmationAttempt', id: attempt.id, from: ['scheduled'], to: 'suppressed', actor, eventType: 'confirmation.suppressed', data: { suppressedReason: reason, attemptedAt: now }, metadata: { reason } })
    return { kind: 'skip' as const, reason }
  }
  if (!appt || appt.status !== 'scheduled') return suppress(appt?.status === 'confirmed' ? 'already_confirmed' : 'appointment_closed')
  const contact = attempt.contactPoint
  if (!contact || !contact.isActive) return suppress('no_contact')
  const channel = attempt.channel === 'email' ? 'email' : 'sms'
  const grant = await uow.tx.consentGrant.findFirst({ where: { contactPointId: contact.id, channel, purpose: 'appointment_reminders', status: 'granted' } })
  if (!grant) return suppress(attempt.channel === 'sms' ? 'no_consent' : 'no_consent')
  const timeZone = appt.location?.timeZone ?? 'America/New_York'
  let quiet = { start: '20:00', end: '08:00' }
  try {
    if (appt.location?.jurisdiction?.rules) {
      const rules = parsePackRules(appt.location.jurisdiction.rules)
      quiet = { start: rules.consent.value.quietHoursStart, end: rules.consent.value.quietHoursEnd }
    }
  } catch {
    // Unparseable pack: keep the conservative default window.
  }
  if (inQuietHours(localTime(timeZone, now), quiet.start, quiet.end)) return { kind: 'defer', until: new Date(now.getTime() + RETRY_QUIET_MS) }

  const template = await uow.tx.messageTemplate.findFirst({ where: { key: 'appointment.reminder', channel, status: 'active' }, orderBy: { templateVersion: 'desc' } })
  // phiLevel clinical never goes by SMS or email (I-X3); reminders are minimal by design.
  if (template && template.phiLevel === 'clinical') return suppress('template_phi_level')
  const vars = {
    patient: { preferredName: appt.patient?.preferredName || appt.patient?.firstName || '' },
    appointment: { when: humanInstant(timeZone, appt.startsAt) },
    location: { name: appt.location?.name ?? '', phone: appt.location?.phone ?? '' },
  }
  const body = template ? renderTemplate(template.body, vars) : `Hi ${vars.patient.preferredName}, this is a reminder of your visit at ${vars.location.name} on ${vars.appointment.when}. Reply C to confirm or call ${vars.location.phone} to change it.`
  const subject = template?.subject ? renderTemplate(template.subject, vars) : `Your appointment on ${vars.appointment.when}`
  let conversation = await uow.tx.conversation.findFirst({ where: { patientId: appt.patientId, contactPointId: contact.id, channel, status: { not: 'closed' } } })
  conversation ??= await uow.tx.conversation.create({ data: { patientId: appt.patientId, contactPointId: contact.id, channel, status: 'open' } })
  const message = await uow.tx.message.create({
    data: { conversationId: conversation.id, direction: 'outbound', channel, templateId: template?.id ?? null, toAddress: contact.valueNormalized, subject: channel === 'email' ? subject : '', body, purpose: 'appointment_reminders', status: 'queued', isSynthetic: appt.isSynthetic },
  })
  await uow.tx.confirmationAttempt.update({ where: { id: attempt.id }, data: { messageId: message.id } })
  return { kind: 'send', messageId: message.id, to: contact.valueNormalized, channel, subject, body, purpose: 'appointment_reminders', isSynthetic: appt.isSynthetic }
}

/** Step 3 (transaction): record what the provider said. accepted stays accepted until a receipt. */
async function record(uow: UnitOfWork, attemptId: string, messageId: string, result: Awaited<ReturnType<MessagingAdapter['send']>>, now: Date) {
  const status = result.status === 'accepted' ? 'accepted' : result.status === 'queued_manual' ? 'queued' : 'failed'
  await uow.tx.message.update({ where: { id: messageId }, data: { status, adapterKey: result.adapterKey, adapterMode: result.adapterMode, providerMessageId: result.providerMessageId, sentAt: result.status === 'accepted' ? now : null, suppressedReason: result.error ?? '', version: { increment: 1 } } })
  if (result.status !== 'failed') {
    await transition(uow, { model: 'ConfirmationAttempt', id: attemptId, from: ['scheduled'], to: 'sent', actor, eventType: 'confirmation.sent', data: { attemptedAt: now }, metadata: { adapterKey: result.adapterKey, adapterMode: result.adapterMode } })
  } else {
    uow.audit({ eventType: 'confirmation.send_failed', entityType: 'ConfirmationAttempt', entityId: attemptId, after: { adapterKey: result.adapterKey } })
  }
  return status
}

export class DeferError extends Error {}

/** Outbox handler for confirmation.dispatch. Idempotent: a replay finds the attempt no longer scheduled. */
export async function dispatchConfirmation(db: Db, attemptId: string, options: { now?: () => Date; adapter?: (channel: 'email' | 'sms', isSynthetic: boolean) => MessagingAdapter } = {}) {
  const clock = options.now ?? (() => new Date())
  // A deferral throws inside the transaction, so no receipt is stored and the retry re-checks everything.
  const prepared = await command(db, { name: 'confirmation.prepare', actor, idempotencyKey: `confirmation-prepare:${attemptId}`, params: { attemptId } }, async uow => {
    const result = await prepare(uow, attemptId, clock())
    if (result.kind === 'defer') throw new DeferError(`quiet hours: retry after ${result.until.toISOString()}`)
    return result
  })
  const step = prepared.value
  if (step.kind === 'skip') return { status: 'suppressed', reason: step.reason }
  const adapter = options.adapter ? options.adapter(step.channel, step.isSynthetic) : adapterFor(step.channel, { isSynthetic: step.isSynthetic })
  const sent = await adapter.send({ to: step.to, channel: step.channel, subject: step.subject, body: step.body, purpose: step.purpose, idempotencyKey: `msg-${step.messageId}` })
  // A failed send is recorded under its own key, so the retry's outcome is recorded too.
  const recordKey = sent.status === 'failed' ? `confirmation-record:${attemptId}:failed:${randomUUID()}` : `confirmation-record:${attemptId}`
  const recorded = await command(db, { name: 'confirmation.record', actor, idempotencyKey: recordKey, params: { attemptId, messageId: step.messageId } }, uow => record(uow, attemptId, step.messageId, sent, clock()))
  if (sent.status === 'failed') throw new Error(`send failed via ${sent.adapterKey}`)
  return { status: recorded.value, adapterKey: sent.adapterKey, adapterMode: sent.adapterMode }
}

/**
 * Inbound SMS/email reply (INTEGRATIONS §6). STOP/START/HELP are handled first and acknowledged;
 * "C" confirms the most recent pending reminder for that address; anything else opens a task for the
 * front desk. The system never cancels an appointment from free text (SM§2.3).
 */
export async function handleInbound(db: Db, input: { channel: 'sms' | 'email'; from: string; body: string; providerMessageId: string; now?: Date }) {
  const keyword = keywordOf(input.body)
  return command(db, { name: 'message.inbound', actor, idempotencyKey: `inbound:${input.providerMessageId}`, params: { from: input.from, providerMessageId: input.providerMessageId } }, async uow => {
    const contacts = await uow.tx.contactPoint.findMany({ where: { valueNormalized: input.from, isActive: true }, select: { id: true, patientId: true } })
    const conversation = contacts[0] ? await uow.tx.conversation.findFirst({ where: { contactPointId: contacts[0].id, channel: input.channel }, orderBy: { updatedAt: 'desc' } }) : null
    await uow.tx.message.create({ data: { conversationId: conversation?.id ?? null, direction: 'inbound', channel: input.channel, toAddress: '', body: input.body.slice(0, 2000), purpose: 'reply', status: 'received', providerMessageId: input.providerMessageId } })
    if (keyword === 'stop') {
      const ids = contacts.map(c => c.id)
      const revoked = await uow.tx.consentGrant.updateMany({ where: { contactPointId: { in: ids }, channel: input.channel, status: 'granted' }, data: { status: 'revoked', revokedAt: uow.now, revokeReason: 'opt_out_keyword', version: { increment: 1 } } })
      for (const id of ids) uow.audit({ eventType: 'consent.opt_out', entityType: 'ContactPoint', entityId: id, after: { channel: input.channel, revoked: revoked.count } })
      uow.emit({ topic: 'message.send', aggregateType: 'ContactPoint', aggregateId: ids[0] ?? input.from, payload: { kind: 'opt_out_ack', to: input.from, channel: input.channel }, dedupeKey: `opt_out_ack:${input.providerMessageId}` })
      return { handled: 'stop', revoked: revoked.count }
    }
    if (keyword === 'start') {
      // START restores reminders only where a grant existed before the opt-out, and flags it for reconfirmation.
      const restored = await uow.tx.consentGrant.updateMany({ where: { contactPointId: { in: contacts.map(c => c.id) }, channel: input.channel, status: 'revoked', revokeReason: 'opt_out_keyword', purpose: 'appointment_reminders' }, data: { status: 'granted', revokedAt: null, revokeReason: '', needsReconfirmation: true, grantedAt: uow.now, version: { increment: 1 } } }).catch(() => ({ count: 0 }))
      return { handled: 'start', restored: restored.count }
    }
    if (keyword === 'help') {
      uow.emit({ topic: 'message.send', aggregateType: 'ContactPoint', aggregateId: contacts[0]?.id ?? input.from, payload: { kind: 'help_reply', to: input.from, channel: input.channel }, dedupeKey: `help_reply:${input.providerMessageId}` })
      return { handled: 'help' }
    }
    if (keyword === 'confirm' && contacts.length) {
      const attempt = await uow.tx.confirmationAttempt.findFirst({ where: { contactPointId: { in: contacts.map(c => c.id) }, status: 'sent', appointment: { status: 'scheduled', startsAt: { gt: uow.now } } }, orderBy: { scheduledFor: 'desc' } })
      if (attempt) {
        await confirmIn(uow, actor, attempt.appointmentId!, 'sms_reply')
        await transition(uow, { model: 'ConfirmationAttempt', id: attempt.id, from: ['sent'], to: 'replied_confirm', actor, eventType: 'confirmation.replied' })
        return { handled: 'confirm', appointmentId: attempt.appointmentId }
      }
    }
    const attempt = contacts.length ? await uow.tx.confirmationAttempt.findFirst({ where: { contactPointId: { in: contacts.map(c => c.id) }, status: 'sent' }, orderBy: { scheduledFor: 'desc' } }) : null
    if (attempt) await transition(uow, { model: 'ConfirmationAttempt', id: attempt.id, from: ['sent'], to: 'replied_other', actor, eventType: 'confirmation.replied' })
    uow.emit({ topic: 'notify.staff', aggregateType: 'Conversation', aggregateId: conversation?.id ?? input.providerMessageId, payload: { kind: 'patient_reply', channel: input.channel }, dedupeKey: `notify.staff:reply:${input.providerMessageId}` })
    return { handled: 'task' }
  })
}

/** Handlers the outbox worker registers for Phase 1 topics. */
export function messagingHandlers(db: Db): OutboxHandlers {
  return {
    'confirmation.dispatch': async (message: ClaimedMessage) => {
      await dispatchConfirmation(db, String((message.payload as any)?.attemptId ?? message.aggregateId))
    },
  }
}
