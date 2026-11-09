import { appendAuditEvents, type AuditInput } from './audit'
import { TRANSACTION_OPTIONS, type Db, type Tx } from './db'
import { log } from './log'

/**
 * One business transaction: state changes, ledger postings and the audit events commit together or not at all (SM§0).
 * No network I/O happens inside. An external call (card processor, clearinghouse) is registered with `after` and runs
 * once, straight after the commit, in the same request. If it never completes, the row it belongs to stays in its
 * waiting state and `runPendingWork` (messaging/worker.ts) picks it up from an admin action. There is no queue table.
 */
export class UnitOfWork {
  readonly audits: AuditInput[] = []
  readonly afterCommit: (() => Promise<unknown>)[] = []
  constructor(readonly tx: Tx, readonly now: Date, readonly requestId: string | null, readonly db: Db) {}
  audit(event: AuditInput) {
    this.audits.push({ requestId: this.requestId, ...event })
  }
  /** Run this after the transaction commits. A failure is logged and never undoes the committed work. */
  after(effect: () => Promise<unknown>) {
    this.afterCommit.push(effect)
  }
}

export async function runInTransaction<T>(db: Db, work: (uow: UnitOfWork) => Promise<T>, options: { requestId?: string | null; now?: Date } = {}): Promise<T> {
  let uowRef: UnitOfWork | null = null
  const result = await db.$transaction(async tx => {
    const uow = new UnitOfWork(tx, options.now ?? new Date(), options.requestId ?? null, db)
    uowRef = uow
    const value = await work(uow)
    // Last: the chain lock is held only for the final moments of the transaction.
    await appendAuditEvents(tx, uow.audits, uow.now)
    return value
  }, TRANSACTION_OPTIONS)
  // Tests turn this off so they can call each step with a fake processor.
  if (process.env.DENTAL_INLINE_EFFECTS !== 'off') {
    for (const effect of (uowRef as UnitOfWork | null)?.afterCommit ?? []) {
      try { await effect() } catch (error) { log.error('after-commit step failed', { error }) }
    }
  }
  return result
}
