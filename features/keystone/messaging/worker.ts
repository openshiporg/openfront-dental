import { randomUUID } from 'node:crypto'
import type { Db } from '../lib/db'
import { acquireLease, releaseLease } from '../lib/lease'
import { log } from '../lib/log'
import { expireHolds, sweepNoShows } from '../mutations/scheduling'
import { pollRemittances, settleStaleClaims } from './claimWorker'
import { paymentJobs } from './paymentWorker'
import { settleStaleChecks } from './eligibilityWorker'

/*
 * Pending work, run when a person asks for it (the "Run pending work" command) and never on a timer or from a separate
 * service: hold expiry, the no-show sweep, stale checks and claims, the remittance poll, payment reconciliation, plan
 * installments, overdue statements and membership renewals. Each job holds a named lease so two requests never run it at once.
 * Every step is idempotent, so running it twice, or not for a week, is safe.
 */
export async function runPendingWork(db: Db, options: { workerId?: string; now?: () => Date } = {}) {
  const workerId = options.workerId ?? `request-${randomUUID()}`
  const clock = options.now ?? (() => new Date())
  const summary: Record<string, unknown> = {}
  const jobs: [string, () => Promise<unknown>][] = [
    ['job:expire-holds', () => expireHolds(db, clock())],
    ['job:no-show-sweep', () => sweepNoShows(db, clock())],
    ['job:stale-checks', () => settleStaleChecks(db, clock())],
    ['job:stale-claims', () => settleStaleClaims(db, clock())],
    ['job:era-fetch', () => pollRemittances(db, clock())],
    ...paymentJobs(db, clock),
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
      log.error('pending work step failed', { job: key, error })
      summary[key] = 'failed'
    } finally {
      await releaseLease(db, lease, clock())
    }
  }
  return summary
}
