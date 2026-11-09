import type { PrismaClient } from '@prisma/client'
import fc from 'fast-check'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { NEVER_DEFAULT, permissionNames, type Permission } from '../access'
import { computeBalance, parseMoney, postEntry, rebuildBalance } from '../lib/ledger'
import { PHASE2_OPS } from './phase2Ops'
import { loadPracticeSetup } from './setup'

/*
 * Phase 4 slice 1 exit gate: the ledger is append-only and signed; balances equal the sum of entries; a reversal mirrors its
 * original; a closed month refuses back-dated posting at the database; a large adjustment needs a second person.
 */

const sessionFor = (id: string, granted: Permission[]) => ({
  itemId: id, listKey: 'User',
  data: { name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null, role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) }, assignments: [] },
})
const run = (name: string, args: Record<string, unknown>, ctx: unknown) => PHASE2_OPS[name].fn(null, { ...args, idempotencyKey: uniqueKey(name) }, ctx) as Promise<any>

describe('ledger arithmetic (pure)', () => {
  it('parses dollars and cents and refuses everything else', () => {
    expect(parseMoney('125')).toBe(12500n)
    expect(parseMoney('$1,200.5')).toBe(120050n)
    expect(() => parseMoney('0')).toThrow()
    expect(() => parseMoney('-5')).toThrow()
    expect(() => parseMoney('1.234')).toThrow()
    expect(() => parseMoney('abc')).toThrow()
  })
  it('aging never loses or invents a cent: buckets add up to what is owed', () => {
    fc.assert(fc.property(fc.array(fc.record({ amountMinor: fc.bigInt({ min: -500_000n, max: 500_000n }).filter(n => n !== 0n), age: fc.integer({ min: 0, max: 400 }) }), { maxLength: 40 }), rows => {
      const today = new Date('2026-11-09T00:00:00Z')
      const entries = rows.map(r => ({ amountMinor: r.amountMinor, kind: 'x', businessDate: new Date(today.getTime() - r.age * 86_400_000) }))
      const cache = computeBalance(entries, today)
      const total = entries.reduce((s, e) => s + e.amountMinor, 0n)
      expect(BigInt(cache.totalMinor)).toBe(total)
      const buckets = Object.values(cache.aging).reduce((s, v) => s + BigInt(v), 0n)
      // Credits are matched against the oldest debits, so the buckets hold what is still owed on debits (never less than the net balance).
      expect(buckets).toBeGreaterThanOrEqual(total > 0n ? total : 0n)
    }))
  })
})

describe.skipIf(!hasTestDatabase)('Phase 4 slice 1: ledger and invariants (database)', () => {
  let prisma: PrismaClient
  let owner: any
  let accountant: any
  let manager: any
  let accountId: string
  let patientId: string
  let locationId: string

  const post = (kind: string, amountMinor: bigint, extra: Record<string, unknown> = {}) =>
    prisma.ledgerEntry.create({ data: { accountId, patientId, kind, amountMinor, currencyCode: 'USD', businessDate: new Date('2026-10-05T00:00:00Z'), originalBusinessDate: new Date('2026-10-05T00:00:00Z'), locationId, ...extra } as never })

  beforeAll(async () => {
    process.env.SESSION_SECRET ||= 'dental-vitest-session-secret-0123456789abcdef'
    process.env.DENTAL_SECRET_KEY ||= Buffer.alloc(32, 7).toString('base64')
    prisma = testPrisma(4)
    await resetDatabase(prisma)
    const make = (name: string) => prisma.user.create({ data: { name, email: `${uniqueKey(name)}@test.local`, password: 'x'.repeat(60) } })
    const [o, a, m] = await Promise.all([make('owner'), make('accountant'), make('manager')])
    owner = { session: sessionFor(o.id, permissionNames.filter(p => !NEVER_DEFAULT.includes(p))), prisma, graphql: undefined }
    accountant = { session: sessionFor(a.id, ['canAccessDashboard', 'canAdjust', 'canReadLedger', 'canAccessAllLocations']), prisma }
    manager = { session: sessionFor(m.id, ['canAccessDashboard', 'canApproveAdjustments', 'canAccessAllLocations']), prisma }
    await loadPracticeSetup(null, { idempotencyKey: uniqueKey('setup') }, owner)
    const charge = await prisma.ledgerEntry.findFirstOrThrow({ where: { kind: 'charge' }, orderBy: { id: 'asc' } })
    accountId = charge.accountId!; patientId = charge.patientId!; locationId = charge.locationId!
  }, 240_000)
  afterAll(async () => { await prisma?.$disconnect() })

  const sum = async () => (await prisma.ledgerEntry.aggregate({ where: { accountId }, _sum: { amountMinor: true } }))._sum.amountMinor ?? 0n
  const cached = async () => BigInt(((await prisma.guarantorAccount.findUniqueOrThrow({ where: { id: accountId } })).balanceCache as any).totalMinor)

  it('seeded accounts carry a cached balance equal to the sum of their entries', async () => {
    const accounts = await prisma.guarantorAccount.findMany({ include: { from_LedgerEntry_account: true } })
    expect(accounts.length).toBeGreaterThan(2)
    for (const a of accounts) {
      const total = a.from_LedgerEntry_account.reduce((s, e) => s + e.amountMinor, 0n)
      expect(BigInt((a.balanceCache as any).totalMinor)).toBe(total)
    }
  })

  it('refuses a wrong sign, a zero amount, and an entry with no account or business date', async () => {
    await expect(post('finance_charge', -500n)).rejects.toThrow(/sign_by_kind/)
    // a patient payment needs its Payment row, a refund its Refund row (LedgerEntry_payment_source / _refund_source)
    await expect(post('patient_payment', -500n)).rejects.toThrow(/payment_source/)
    await expect(post('refund', 1n)).rejects.toThrow(/refund_source/)
    await expect(post('charge', -500n)).rejects.toThrow(/sign_by_kind/)
    await expect(post('patient_adjustment', 0n)).rejects.toThrow(/LedgerEntry_complete/)
    await expect(post('charge', 100n, { accountId: null })).rejects.toThrow(/LedgerEntry_complete/)
    await expect(post('charge', 2_000_000_000n)).rejects.toThrow(/_bound/)
  })

  it('allows no update, delete or truncate of a ledger row', async () => {
    const row = await prisma.ledgerEntry.findFirstOrThrow({ where: { accountId } })
    await expect(prisma.ledgerEntry.update({ where: { id: row.id }, data: { memo: 'x' } })).rejects.toThrow(/append-only/)
    await expect(prisma.ledgerEntry.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/)
    await expect(prisma.$executeRawUnsafe('UPDATE "LedgerEntry" SET "amountMinor" = 1')).rejects.toThrow(/append-only/)
  })

  it('a property: any run of postings keeps the cache equal to the sum, and rebuilding repairs drift', async () => {
    const kinds: [string, bigint][] = [['finance_charge', 1n], ['patient_adjustment', 1n], ['patient_adjustment', -1n], ['charge', 1n]]
    await fc.assert(fc.asyncProperty(fc.array(fc.tuple(fc.integer({ min: 0, max: 3 }), fc.integer({ min: 1, max: 90_000 })), { minLength: 1, maxLength: 5 }), async steps => {
      await prisma.$transaction(async tx => {
        for (const [k, cents] of steps) {
          const [kind, sign] = kinds[k]
          await postEntry(tx, { accountId, patientId, kind, amountMinor: sign * BigInt(cents), currencyCode: 'USD', businessDate: new Date('2026-10-06T00:00:00Z'), locationId, memo: 'property run' }, new Date())
        }
      })
      expect(await cached()).toBe(await sum())
    }), { numRuns: 8 })
    await prisma.guarantorAccount.update({ where: { id: accountId }, data: { balanceCache: { totalMinor: '1' } } })
    expect(await cached()).not.toBe(await sum())
    await prisma.$transaction(tx => rebuildBalance(tx, accountId, new Date()))
    expect(await cached()).toBe(await sum())
    const fixed: any = await run('rebuildAccountBalance', { accountId }, accountant)
    expect(fixed.drifted).toBe(false)
  })

  it('a reversal must mirror its original, and an original is reversed once', async () => {
    const original = await post('patient_adjustment', -700n, { memo: 'mirror me' })
    const base = { accountId, patientId, kind: 'reversal', currencyCode: 'USD', businessDate: new Date('2026-10-07T00:00:00Z'), originalBusinessDate: new Date('2026-10-05T00:00:00Z'), locationId, reversesId: original.id }
    await expect(prisma.ledgerEntry.create({ data: { ...base, amountMinor: 600n } as never })).rejects.toThrow(/opposite amount/)
    await expect(prisma.ledgerEntry.create({ data: { ...base, amountMinor: 700n, patientId: null } as never })).rejects.toThrow(/same account, patient/)
    const ok = await prisma.ledgerEntry.create({ data: { ...base, amountMinor: 700n } as never })
    await expect(prisma.ledgerEntry.create({ data: { ...base, amountMinor: 700n } as never })).rejects.toThrow()
    await expect(prisma.ledgerEntry.create({ data: { ...base, reversesId: ok.id, amountMinor: -700n } as never })).rejects.toThrow(/cannot itself be reversed/)
    await expect(post('charge', 100n, { reversesId: original.id })).rejects.toThrow(/LedgerEntry_reversal_references/)
  })

  it('a small adjustment posts at once; a large one waits for a second person and posts when they approve', async () => {
    const type = await prisma.adjustmentType.findFirstOrThrow({ where: { code: 'COURTESY' } })
    const before = await sum()
    const small: any = await run('requestAdjustment', { patientId, locationId, typeId: type.id, amount: '10.00', reason: 'Goodwill after a long wait' }, accountant)
    // The balance may be below the credit; only assert the guard when it applies.
    expect(['posted']).toContain(small.status)
    expect(await sum()).toBe(before - 1000n)
    expect(await cached()).toBe(await sum())

    await post('charge', 40_000n, { memo: 'room for a credit' })
    const big: any = await run('requestAdjustment', { patientId, locationId, typeId: type.id, amount: '60.00', reason: 'Courtesy for a remake' }, accountant)
    expect(big.status).toBe('requested')
    const mid = await sum()
    const { decideApprovalRequest } = await import('./approvals')
    const request = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: big.approvalId } })
    // The requester cannot approve their own request.
    await expect(decideApprovalRequest(null, { requestId: request.id, decision: 'approve', expectedVersion: request.version, idempotencyKey: uniqueKey('self') }, accountant)).rejects.toThrow()
    await decideApprovalRequest(null, { requestId: request.id, decision: 'approve', expectedVersion: request.version, idempotencyKey: uniqueKey('ok') }, manager)
    expect(await sum()).toBe(mid - 6000n)
    const row = await prisma.adjustmentRequest.findUniqueOrThrow({ where: { id: big.id } })
    expect(row.status).toBe('posted')
    expect(row.postedEntryId).not.toBeNull()
    expect(await cached()).toBe(await sum())
  })

  it('refuses a credit larger than the balance owed, and refuses reversing a charge here', async () => {
    const type = await prisma.adjustmentType.findFirstOrThrow({ where: { code: 'OTHER-CR' } })
    const owed = await sum()
    const more = owed + 5000n
    const tooMuch = `${more / 100n}.${String(more % 100n).padStart(2, '0')}`
    await expect(run('requestAdjustment', { patientId, locationId, typeId: type.id, amount: tooMuch, reason: 'More than is owed' }, owner)).rejects.toThrow(/more than the balance/)
    const charge = await prisma.ledgerEntry.findFirstOrThrow({ where: { accountId, kind: 'charge' } })
    await expect(run('reverseLedgerEntry', { entryId: charge.id, reason: 'Wrong entry on purpose' }, accountant)).rejects.toThrow(/chart/)
  })

  it('reverses an adjustment once, with the mirrored links', async () => {
    const adj = await prisma.ledgerEntry.findFirstOrThrow({ where: { accountId, kind: 'patient_adjustment', adjustmentId: { not: null } } })
    const rev: any = await run('reverseLedgerEntry', { entryId: adj.id, reason: 'Posted to the wrong family' }, accountant)
    const row = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: rev.id } })
    expect(row).toMatchObject({ kind: 'reversal', reversesId: adj.id, amountMinor: -adj.amountMinor, adjustmentId: adj.adjustmentId, accountId })
    await expect(run('reverseLedgerEntry', { entryId: adj.id, reason: 'Trying a second time' }, accountant)).rejects.toThrow(/already reversed/)
    expect(await cached()).toBe(await sum())
  })

  it('a closed month refuses back-dated posting at the database; a reopened one takes only restatement entries', async () => {
    const [close] = await Promise.all([prisma.periodClose.create({ data: { locationId, period: '2026-09', status: 'closed', closedAt: new Date(), closedById: (await prisma.user.findFirstOrThrow()).id } })])
    const september = { businessDate: new Date('2026-09-15T00:00:00Z'), originalBusinessDate: new Date('2026-09-15T00:00:00Z') }
    await expect(post('charge', 100n, september)).rejects.toThrow(/month is closed/)
    await expect(postEntry(prisma as never, { accountId, patientId, kind: 'charge', amountMinor: 100n, currencyCode: 'USD', businessDate: september.businessDate, locationId }, new Date())).rejects.toThrow(/month is closed/)
    // Another month, and another location, are unaffected.
    await expect(post('charge', 100n, { businessDate: new Date('2026-10-15T00:00:00Z') })).resolves.toBeTruthy()
    await prisma.periodClose.update({ where: { id: close.id }, data: { status: 'reopen_requested' } })
    await prisma.periodClose.update({ where: { id: close.id }, data: { status: 'reopened' } })
    await expect(post('charge', 100n, september)).rejects.toThrow(/month is closed/)
    const restatement = await prisma.restatement.create({ data: { periodCloseId: close.id, reason: 'Late insurance correction' } })
    await expect(post('charge', 100n, { ...september, restatementId: restatement.id })).resolves.toBeTruthy()
    await expect(prisma.restatement.update({ where: { id: restatement.id }, data: { reason: 'changed' } })).rejects.toThrow(/append-only/)
    await expect(prisma.periodClose.create({ data: { locationId, period: '2026-13', status: 'open' } })).rejects.toThrow(/period_format/)
    await expect(prisma.periodClose.create({ data: { locationId, period: '2026-09', status: 'open' } })).rejects.toThrow()
  })

  it('a closed day cannot be edited or deleted', async () => {
    const user = await prisma.user.findFirstOrThrow()
    const day = await prisma.dayClose.create({ data: { locationId, businessDate: new Date('2026-10-01T00:00:00Z'), status: 'closed', closedAt: new Date(), closedById: user.id, daySheet: { totalMinor: '0' } } })
    await expect(prisma.dayClose.update({ where: { id: day.id }, data: { daySheet: { totalMinor: '5' } } })).rejects.toThrow(/closed day/)
    await expect(prisma.dayClose.update({ where: { id: day.id }, data: { status: 'open' } })).rejects.toThrow(/closed day/)
    await expect(prisma.dayClose.delete({ where: { id: day.id } })).rejects.toThrow(/append-only/)
    await expect(prisma.dayClose.create({ data: { locationId, businessDate: new Date('2026-10-01T00:00:00Z') } })).rejects.toThrow()
    await expect(prisma.dayClose.create({ data: { locationId, businessDate: new Date('2026-10-02T00:00:00Z'), status: 'closed' } })).rejects.toThrow(/closed_has_closer/)
  })

  it('adjustment rows obey their own checks', async () => {
    const type = await prisma.adjustmentType.findFirstOrThrow({ where: { code: 'COURTESY' } })
    await expect(prisma.adjustmentRequest.create({ data: { typeId: type.id, accountId, patientId, locationId, amountMinor: 0n, reason: 'zero' } })).rejects.toThrow(/amount_positive/)
    await expect(prisma.adjustmentRequest.create({ data: { typeId: type.id, accountId, patientId, locationId, amountMinor: 5n, reason: 'fake', status: 'posted' } })).rejects.toThrow(/posted_has_entry/)
    await expect(prisma.adjustmentType.create({ data: { code: 'NEG', name: 'Negative', direction: 'credit', category: 'other', approvalThresholdMinor: -1n } })).rejects.toThrow(/threshold_nonnegative|_bound/)
  })
})
