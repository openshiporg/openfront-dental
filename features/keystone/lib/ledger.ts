import { advisoryLock, type Tx } from './db'
import { DomainError, Codes } from './errors'
import { toJsonValue } from './canonical'

/*
 * The patient ledger (SCHEMA §10.2; DOMAIN I-L1…I-L4). Entries are immutable and signed (debit +, credit −).
 * A balance is only ever a sum of entries: `balanceCache` is a copy that can be rebuilt at any time and is
 * checked against the sum by the property test and the nightly rebuild.
 */

export const LEDGER_KIND_SIGN: Record<string, 'debit' | 'credit' | 'either'> = {
  charge: 'debit', finance_charge: 'debit', refund: 'debit',
  insurance_payment: 'credit', insurance_writeoff: 'credit', patient_payment: 'credit',
  insurance_adjustment: 'either', patient_adjustment: 'either', transfer_out: 'either', transfer_in: 'either', reversal: 'either',
}

export type AgingBuckets = { current: string; d31: string; d61: string; d91: string }
export type BalanceCache = { totalMinor: string; patientMinor: string; insurancePendingMinor: string; creditMinor: string; aging: AgingBuckets; entryCount: number }

const DAY = 86_400_000
const dayNumber = (date: Date) => Math.floor(date.getTime() / DAY)

/**
 * Pure: turn a list of entries into the cached balance. Credits are applied to the oldest debits first (I-L4),
 * and what is left of each debit is aged from its business date.
 */
export function computeBalance(entries: { amountMinor: bigint; businessDate: Date | null; kind: string }[], today: Date): BalanceCache {
  let total = 0n
  for (const e of entries) total += e.amountMinor
  const debits = entries.filter(e => e.amountMinor > 0n).sort((a, b) => (a.businessDate?.getTime() ?? 0) - (b.businessDate?.getTime() ?? 0))
  let credit = entries.filter(e => e.amountMinor < 0n).reduce((sum, e) => sum - e.amountMinor, 0n)
  const buckets = { current: 0n, d31: 0n, d61: 0n, d91: 0n }
  for (const d of debits) {
    const applied = credit < d.amountMinor ? credit : d.amountMinor
    credit -= applied
    const left = d.amountMinor - applied
    if (left === 0n) continue
    const age = d.businessDate ? dayNumber(today) - dayNumber(d.businessDate) : 0
    if (age > 90) buckets.d91 += left
    else if (age > 60) buckets.d61 += left
    else if (age > 30) buckets.d31 += left
    else buckets.current += left
  }
  return {
    totalMinor: total.toString(),
    patientMinor: (total > 0n ? total : 0n).toString(),
    insurancePendingMinor: '0',
    creditMinor: (total < 0n ? -total : 0n).toString(),
    aging: { current: buckets.current.toString(), d31: buckets.d31.toString(), d61: buckets.d61.toString(), d91: buckets.d91.toString() },
    entryCount: entries.length,
  }
}

/** Recomputes one account's cached balance from its entries, under the account's advisory lock. */
export async function rebuildBalance(tx: Tx, accountId: string, now: Date) {
  await advisoryLock(tx, `ledger:${accountId}`)
  const entries = await tx.ledgerEntry.findMany({ where: { accountId }, select: { amountMinor: true, businessDate: true, kind: true } })
  const cache = computeBalance(entries, now)
  await tx.guarantorAccount.update({ where: { id: accountId }, data: { balanceCache: toJsonValue(cache) as never, balanceRebuiltAt: now, version: { increment: 1 } } })
  return cache
}

export type PostInput = {
  accountId: string
  patientId: string | null
  kind: string
  amountMinor: bigint
  currencyCode: string
  businessDate: Date
  originalBusinessDate?: Date
  locationId: string
  providerId?: string | null
  chartEntryId?: string | null
  adjustmentId?: string | null
  reversesId?: string | null
  restatementId?: string | null
  paymentPostingId?: string | null
  claimId?: string | null
  paymentId?: string | null
  refundId?: string | null
  memo?: string
  postedById?: string | null
  isSynthetic?: boolean
}

/**
 * The only way a command appends to the ledger. It checks the sign (the database checks it again), writes the
 * row and refreshes the cache in the same transaction.
 */
/** I-L2: a closed day takes no new entries. The row is dated on the next open day and keeps the date it belongs to in originalBusinessDate. */
export async function openBusinessDate(tx: Tx, locationId: string, date: Date): Promise<Date> {
  let day = date
  for (let i = 0; i < 400; i++) {
    const closed = await tx.dayClose.findFirst({ where: { locationId, businessDate: day, status: 'closed' }, select: { id: true } })
    if (!closed) return day
    day = new Date(day.getTime() + 86_400_000)
  }
  throw new DomainError(Codes.GUARD_FAILED, 'Every day in the coming year is closed. Reopen a day first.')
}

export async function postEntry(tx: Tx, input: PostInput, now: Date) {
  if (input.amountMinor === 0n) throw new DomainError(Codes.INVALID_INPUT, 'An amount of zero cannot be posted.', { field: 'amountMinor' })
  const sign = LEDGER_KIND_SIGN[input.kind]
  if (!sign) throw new DomainError(Codes.INVALID_INPUT, 'Unknown ledger kind.')
  if ((sign === 'debit' && input.amountMinor < 0n) || (sign === 'credit' && input.amountMinor > 0n)) {
    throw new DomainError(Codes.INVALID_INPUT, sign === 'debit' ? 'That kind of entry adds to the balance.' : 'That kind of entry reduces the balance.', { field: 'amountMinor' })
  }
  const businessDate = input.restatementId ? input.businessDate : await openBusinessDate(tx, input.locationId, input.businessDate)
  const entry = await tx.ledgerEntry.create({
    data: {
      accountId: input.accountId, patientId: input.patientId, kind: input.kind, amountMinor: input.amountMinor, currencyCode: input.currencyCode,
      businessDate, originalBusinessDate: input.originalBusinessDate ?? input.businessDate, locationId: input.locationId,
      providerId: input.providerId ?? null, chartEntryId: input.chartEntryId ?? null, adjustmentId: input.adjustmentId ?? null,
      reversesId: input.reversesId ?? null, restatementId: input.restatementId ?? null, paymentPostingId: input.paymentPostingId ?? null, claimId: input.claimId ?? null, paymentId: input.paymentId ?? null, refundId: input.refundId ?? null, memo: input.memo ?? '', postedById: input.postedById ?? null, postedAt: now,
      isSynthetic: input.isSynthetic ?? false,
    },
  })
  await rebuildBalance(tx, input.accountId, now)
  return entry
}

/** Whole dollars and cents text ("12.50", "$1,200") to minor units; refuses anything else. */
export function parseMoney(text: unknown, field = 'amount'): bigint {
  const raw = String(text ?? '').trim().replace(/^\$/, '').replaceAll(',', '')
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(raw)) throw new DomainError(Codes.INVALID_INPUT, `Enter the ${field} in dollars and cents, like 125.00.`, { field })
  const [whole, cents = ''] = raw.split('.')
  const minor = BigInt(whole) * 100n + BigInt(cents.padEnd(2, '0'))
  if (minor <= 0n) throw new DomainError(Codes.INVALID_INPUT, `The ${field} must be more than zero.`, { field })
  return minor
}
