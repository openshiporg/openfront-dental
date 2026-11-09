import { randomUUID } from 'node:crypto'
import type { Db } from '../lib/db'
import { acquireLease, releaseLease } from '../lib/lease'
import { log } from '../lib/log'
import { drainOutbox, type ClaimedMessage, type OutboxHandlers } from '../lib/outbox'
import { expireHolds, sweepNoShows } from '../mutations/scheduling'
import { adapterFor } from './adapters'
import { messagingHandlers } from './dispatch'
import { claimHandlers, pollRemittances, settleStaleClaims } from './claimWorker'
import { eligibilityHandlers, settleStaleChecks } from './eligibilityWorker'

/*
 * The Phase 1 background worker: one tick drains the outbox (confirmation dispatch, outbound
 * messages, staff notifications) and runs the schedule jobs (hold expiry, the no-show sweep).
 * Each job holds a named lease so two app instances never run it at once. Run it on a schedule:
 *   tsx features/keystone/messaging/run-worker.ts  (Railway cron, or a loop in the worker service).
 */

const STAFF_NOTIFY_KINDS = new Set(['appointment.booked', 'appointment.completed', 'schedule.open_time', 'online_booking', 'patient_reply'])

function staffHandlers(db: Db): OutboxHandlers {
  return {
    'notify.staff': async (message: ClaimedMessage) => {
      const payload = (message.payload ?? {}) as { kind?: string; locationId?: string }
      if (!payload.kind || !STAFF_NOTIFY_KINDS.has(payload.kind)) return
      // Front-desk users at the location get an in-app notification; no patient detail in the payload.
      const recipients = await db.user.findMany({
        where: { role: { canManageSchedule: true }, ...(payload.locationId ? { OR: [{ role: { canAccessAllLocations: true } }, { assignments: { some: { locationId: payload.locationId } } }] } : {}) },
        select: { id: true },
        take: 50,
      })
      for (const r of recipients) {
        await db.notification.create({ data: { recipientId: r.id, channel: 'in_app', template: payload.kind, payload: { aggregateType: message.aggregateType, aggregateId: message.aggregateId, locationId: payload.locationId ?? null } as never, status: 'pending' } })
      }
    },
    'notify.approval': async () => undefined,
    'message.send': async (message: ClaimedMessage) => {
      const payload = (message.payload ?? {}) as { kind?: string; to?: string; channel?: 'email' | 'sms'; code?: string }
      if (!payload.to) return
      const adapter = adapterFor(payload.channel === 'sms' ? 'sms' : 'email')
      const body = payload.kind === 'portal_code'
        ? `Your sign-in code is ${payload.code}. It expires in 10 minutes. If you didn't ask for it, ignore this message.`
        : payload.kind === 'opt_out_ack'
          ? 'You will no longer receive text messages from this office. Reply START to resubscribe.'
          : payload.kind === 'help_reply'
            ? 'Reply STOP to stop messages, or call the office for help.'
            : ''
      if (!body) return
      const result = await adapter.send({ to: payload.to, channel: payload.channel === 'sms' ? 'sms' : 'email', subject: payload.kind === 'portal_code' ? 'Your sign-in code' : 'Message from your dental office', body, purpose: 'transactional', idempotencyKey: message.dedupeKey })
      if (result.status === 'failed') throw new Error(`send failed via ${result.adapterKey}`)
    },
  }
}

export function phase1Handlers(db: Db): OutboxHandlers {
  return { ...staffHandlers(db), ...messagingHandlers(db), ...eligibilityHandlers(db), ...claimHandlers(db) }
}

export async function runWorkerTick(db: Db, options: { workerId?: string; now?: () => Date } = {}) {
  const workerId = options.workerId ?? `worker-${randomUUID()}`
  const clock = options.now ?? (() => new Date())
  const summary: Record<string, unknown> = {}
  const jobs: [string, () => Promise<unknown>][] = [
    ['job:expire-holds', () => expireHolds(db, clock())],
    ['job:no-show-sweep', () => sweepNoShows(db, clock())],
    ['job:stale-checks', () => settleStaleChecks(db, clock())],
    ['job:stale-claims', () => settleStaleClaims(db, clock())],
    ['job:era-fetch', () => pollRemittances(db, clock())],
    ['job:outbox', () => drainOutbox(db, { workerId, handlers: phase1Handlers(db), now: clock })],
  ]
  for (const [key, run] of jobs) {
    const lease = await acquireLease(db, key, workerId, 120_000, clock())
    if (!lease) {
      summary[key] = 'held_elsewhere'
      continue
    }
    try {
      summary[key] = await run()
    } catch (error) {
      log.error('worker job failed', { job: key, error })
      summary[key] = 'failed'
    } finally {
      await releaseLease(db, lease, clock())
    }
  }
  return summary
}
