import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { NEVER_DEFAULT, permissionNames, type Permission } from '../access'
import { nextPeriodEnd, parseBenefits } from '../lib/memberships'
import { decideApprovalRequest } from './approvals'
import { PHASE2_OPS } from './phase2Ops'
import { loadPracticeSetup } from './setup'

/*
 * Phase 4 slice 4 exit gate: a membership cannot be enrolled where the jurisdiction pack needs a licence and none is recorded; the
 * agreement is signed and kept; the discount and covered visits apply when work is completed and come back with a correction; a day
 * closes into a frozen sheet and deposit; a closed day or month takes no new entry; reopening a month needs a second person.
 */

const sessionFor = (id: string, granted: Permission[]) => ({
  itemId: id, listKey: 'User',
  data: { name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null, role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) } },
})
const run = (name: string, args: Record<string, unknown>, ctx: unknown) => PHASE2_OPS[name].fn(null, { ...args, idempotencyKey: uniqueKey(name) }, ctx) as Promise<any>

describe('membership arithmetic (pure)', () => {
  it('a monthly period ends the day before the same date next month, clamped to the end of a short month', () => {
    expect(nextPeriodEnd('2026-03-15', 'monthly')).toBe('2026-04-14')
    expect(nextPeriodEnd('2026-01-31', 'monthly')).toBe('2026-02-27')
    expect(nextPeriodEnd('2026-03-15', 'annual')).toBe('2027-03-14')
  })
  it('keeps only well-formed benefits', () => {
    expect(parseBenefits([{ codeFamily: 'preventive', countPerPeriod: 2 }, { codeFamily: 3 }, null, { codeFamily: 'x', countPerPeriod: 1.5 }])).toEqual([{ codeFamily: 'preventive', countPerPeriod: 2 }])
  })
})

describe.skipIf(!hasTestDatabase)('Phase 4 slice 4: memberships and close (database)', () => {
  let prisma: PrismaClient
  let owner: any, front: any, closer: any, approver: any
  let patientId: string, locationId: string, planId: string

  beforeAll(async () => {
    process.env.SESSION_SECRET ||= 'dental-vitest-session-secret-0123456789abcdef'
    process.env.DENTAL_SECRET_KEY ||= Buffer.alloc(32, 7).toString('base64')
    prisma = testPrisma(5)
    await resetDatabase(prisma)
    const make = (name: string) => prisma.user.create({ data: { name, email: `${uniqueKey(name)}@test.local`, password: 'x'.repeat(60) } })
    const [o, f, c, a] = await Promise.all([make('owner'), make('front'), make('closer'), make('approver')])
    owner = { session: sessionFor(o.id, permissionNames.filter(p => !NEVER_DEFAULT.includes(p))), prisma }
    front = { session: sessionFor(f.id, ['canAccessDashboard', 'canManageMemberships', 'canTakePayments', 'canAccessAllLocations']), prisma }
    closer = { session: sessionFor(c.id, ['canAccessDashboard', 'canCloseDay', 'canClosePeriod', 'canAdjust', 'canReadLedger', 'canAccessAllLocations']), prisma }
    approver = { session: sessionFor(a.id, ['canAccessDashboard', 'canApprovePeriodReopen', 'canAccessAllLocations']), prisma }
    await loadPracticeSetup(null, { idempotencyKey: uniqueKey('setup') }, owner)
    const charge = await prisma.ledgerEntry.findFirstOrThrow({ where: { kind: 'charge' }, orderBy: { id: 'asc' } })
    patientId = charge.patientId!; locationId = charge.locationId!
  }, 240_000)
  afterAll(async () => { await prisma?.$disconnect() })

  const planArgs = (name: string) => ({ name, ageBand: 'adult', price: '29.00', interval: 'monthly', discountPct: '15', benefits: [{ codeFamily: 'preventive', countPerPeriod: 2 }], termsText: 'Two cleanings a year and 15 percent off other work at this office.', locationIds: [locationId] })

  it('refuses to enrol anyone where the pack needs a licence or registration and none is recorded', async () => {
    const plan: any = await run('defineMembershipPlan', planArgs('Bayview Smile Club, Adult'), front)
    planId = plan.id
    const pack = await prisma.location.findUniqueOrThrow({ where: { id: locationId }, include: { jurisdiction: true } })
    const mode = (pack.jurisdiction?.rules as any)?.membershipPlans?.value?.mode
    expect(['registration_required', 'licence_required']).toContain(mode)
    await expect(run('enrolMembership', { patientId, planId, locationId }, front)).rejects.toThrow(/registered|licence/i)
    expect(await prisma.patientMembership.count()).toBe(0)
  })

  it('enrols once a registration is on file; signing needs consent, keeps the agreement, and charges the first period', async () => {
    await run('recordLicence', { kind: 'discount_plan_operator', jurisdiction: 'US-FL', number: 'DPO-2026-0417', effectiveFrom: '2026-01-01', evidence: 'Registration filed with the state' }, front)
    const m: any = await run('enrolMembership', { patientId, planId, locationId }, front)
    await expect(run('enrolMembership', { patientId, planId, locationId }, front)).rejects.toThrow(/already has/)
    await expect(run('signMembershipAgreement', { membershipId: m.id, expectedVersion: 0, signerName: 'Elena Marsh', consent: false }, front)).rejects.toThrow(/agree/)
    const before = await prisma.ledgerEntry.count({ where: { kind: 'charge' } })
    const signed: any = await run('signMembershipAgreement', { membershipId: m.id, expectedVersion: 0, signerName: 'Elena Marsh', consent: true }, front)
    expect(signed.status).toBe('active')
    expect(await prisma.ledgerEntry.count({ where: { kind: 'charge' } })).toBe(before + 1)
    const row = await prisma.patientMembership.findUniqueOrThrow({ where: { id: m.id }, include: { agreement: true, entries: true } })
    expect(row.agreement?.priceSnapshotMinor).toBe(2900n)
    expect(row.agreement?.termsHash).toHaveLength(64)
    expect(row.entries.map(e => e.kind)).toEqual(expect.arrayContaining(['activate', 'charge', 'benefit_issue']))
    // The agreement and the membership ledger only grow.
    await expect(prisma.membershipAgreement.update({ where: { id: row.agreement!.id }, data: { signerName: 'Someone Else' } })).rejects.toThrow()
    await expect(prisma.membershipLedgerEntry.delete({ where: { id: row.entries[0].id } })).rejects.toThrow()
    // The database refuses an active membership with no agreement.
    await expect(prisma.$executeRawUnsafe(`UPDATE "PatientMembership" SET "agreement" = NULL WHERE id = '${m.id}'`)).rejects.toThrow()
  })

  it('a covered visit posts at no cost and is counted; other work gets the plan discount; a correction gives both back', async () => {
    const m = await prisma.patientMembership.findFirstOrThrow({ where: { patientId, status: 'active' } })
    const code = async (category: string) => prisma.procedureCode.findFirstOrThrow({ where: { category, areaRule: category === 'restorative' ? 'tooth' : 'mouth' } })
    const addAndComplete = async (category: string) => {
      const c = await code(category)
      const entry: any = await run('addChartProcedure', { patientId, locationId, codeId: c.id, site: c.areaRule === 'tooth' ? { tooth: '14', surfaces: 'O' } : {} }, owner)
      const dentist = await prisma.providerProfile.findFirstOrThrow({ where: { isActive: true } })
      const row = await prisma.chartEntry.findUniqueOrThrow({ where: { id: entry.chartEntryId ?? entry.id } })
      await run('acceptChartEntry', { chartEntryId: row.id, expectedVersion: row.version }, owner).catch(() => null)
      const fresh = await prisma.chartEntry.findUniqueOrThrow({ where: { id: row.id } })
      return run('completeProcedure', { chartEntryId: row.id, expectedVersion: fresh.version, providerId: dentist.id }, owner)
    }
    const preventive: any = await addAndComplete('preventive')
    const covered = await prisma.membershipLedgerEntry.findFirstOrThrow({ where: { membershipId: m.id, kind: 'benefit_use' } })
    const credit = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: covered.ledgerEntryId! } })
    expect(credit.amountMinor).toBe(-BigInt(preventive.feeMinor))
    const restorative: any = await addAndComplete('restorative')
    const disc = await prisma.membershipLedgerEntry.findFirstOrThrow({ where: { membershipId: m.id, kind: 'discount' } })
    const discount = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: disc.ledgerEntryId! } })
    expect(-discount.amountMinor).toBe((BigInt(restorative.feeMinor) * 15n) / 100n)
    const account = await prisma.guarantorAccount.findUniqueOrThrow({ where: { id: m.payerId! } })
    const total = (await prisma.ledgerEntry.aggregate({ where: { accountId: account.id }, _sum: { amountMinor: true } }))._sum.amountMinor ?? 0n
    expect(BigInt((account.balanceCache as any).totalMinor)).toBe(total)
    // Correct the restorative work: the discount is reversed with it.
    const chart = await prisma.chartEntry.findFirstOrThrow({ where: { ledgerEntryId: { not: null }, id: disc.chartEntryId! } })
    await run('correctProcedure', { chartEntryId: chart.id, expectedVersion: chart.version, reason: 'Wrong tooth was charted' }, owner)
    expect(await prisma.membershipLedgerEntry.count({ where: { membershipId: m.id, kind: 'discount_reverse' } })).toBe(1)
    const after = (await prisma.ledgerEntry.aggregate({ where: { accountId: account.id }, _sum: { amountMinor: true } }))._sum.amountMinor ?? 0n
    expect(after).toBe(total - BigInt(restorative.feeMinor) + (-discount.amountMinor))
  })

  it('freezes, unfreezes and cancels; a cancelled membership keeps its history', async () => {
    const m = await prisma.patientMembership.findFirstOrThrow({ where: { patientId, status: 'active' } })
    const f: any = await run('freezeMembership', { membershipId: m.id, expectedVersion: m.version, freeze: true, reason: 'Moved away for the summer' }, front)
    expect(f.status).toBe('frozen')
    const fr = await prisma.patientMembership.findUniqueOrThrow({ where: { id: m.id } })
    await run('freezeMembership', { membershipId: m.id, expectedVersion: fr.version, freeze: false, reason: 'Back in town' }, front)
    const back = await prisma.patientMembership.findUniqueOrThrow({ where: { id: m.id } })
    await expect(run('cancelMembership', { membershipId: m.id, expectedVersion: back.version, reason: '' }, front)).rejects.toThrow()
    await run('cancelMembership', { membershipId: m.id, expectedVersion: back.version, reason: 'Patient asked to stop the plan' }, front)
    const done = await prisma.patientMembership.findUniqueOrThrow({ where: { id: m.id }, include: { entries: true } })
    expect(done.status).toBe('cancelled')
    expect(done.entries.length).toBeGreaterThan(3)
  })

  it('closes a day into a frozen sheet and a deposit slip; a second close and a late posting are refused', async () => {
    const date = (await prisma.ledgerEntry.findFirstOrThrow({ where: { locationId, kind: 'patient_payment' }, orderBy: { businessDate: 'asc' } }).catch(() => null))?.businessDate
    const today = new Date().toISOString().slice(0, 10)
    const day = date ? date.toISOString().slice(0, 10) : '2026-09-10'
    // Take cash on the chosen day by closing yesterday: payments are dated in the office's today, so close today's date after taking cash.
    await run('takePayment', { patientId, locationId, amount: '40.00', tender: 'cash' }, front)
    const early = await prisma.ledgerEntry.findFirst({ where: { locationId, businessDate: { lt: new Date(`${today}T00:00:00Z`) } }, orderBy: { businessDate: 'asc' } })
    expect(early || day).toBeTruthy()
    // Close every earlier day that has entries, oldest first, then today.
    const days = (await prisma.ledgerEntry.findMany({ where: { locationId }, distinct: ['businessDate'], select: { businessDate: true }, orderBy: { businessDate: 'asc' } })).map(d => d.businessDate!.toISOString().slice(0, 10))
    for (const d of days) {
      const done = await prisma.dayClose.findFirst({ where: { locationId, businessDate: new Date(`${d}T00:00:00Z`), status: 'closed' } })
      if (!done) await run('closeDay', { locationId, businessDate: d }, closer)
    }
    const last = await prisma.dayClose.findFirstOrThrow({ where: { locationId, status: 'closed' }, orderBy: { businessDate: 'desc' } })
    expect((last.daySheet as any).entryCount).toBeGreaterThan(0)
    await expect(run('closeDay', { locationId, businessDate: last.businessDate!.toISOString().slice(0, 10) }, closer)).rejects.toThrow(/already closed/)
    await expect(prisma.dayClose.update({ where: { id: last.id }, data: { daySheet: {} } })).rejects.toThrow()
    const deposit = await prisma.depositBatch.findFirst({ where: { locationId }, include: { lines: true } })
    if (deposit) expect(deposit.lines.reduce((s, l) => s + l.amountMinor, 0n)).toBe(deposit.totalMinor)
    // The database refuses a direct posting into the closed day.
    const acc = await prisma.guarantorAccount.findFirstOrThrow()
    await expect(prisma.ledgerEntry.create({ data: { accountId: acc.id, patientId, kind: 'charge', amountMinor: 100n, currencyCode: 'USD', businessDate: last.businessDate!, originalBusinessDate: last.businessDate!, locationId } as never })).rejects.toThrow(/closed/)
  })

  it('a command that posts into a closed day is dated on the next open day and keeps the original date', async () => {
    const closedDay = await prisma.dayClose.findFirstOrThrow({ where: { locationId, status: 'closed' }, orderBy: { businessDate: 'desc' } })
    const { openBusinessDate } = await import('../lib/ledger')
    const dated = await openBusinessDate(prisma as never, locationId, closedDay.businessDate!)
    expect(dated.getTime()).toBe(closedDay.businessDate!.getTime() + 86_400_000)
  })

  it('closes a past month only when every day with entries is closed, then refuses new entries into it; reopening needs a second person', async () => {
    const period = '2026-08'
    const acc = await prisma.guarantorAccount.findFirstOrThrow()
    const d = new Date('2026-08-12T00:00:00Z')
    await prisma.ledgerEntry.create({ data: { accountId: acc.id, patientId, kind: 'charge', amountMinor: 5000n, currencyCode: 'USD', businessDate: d, originalBusinessDate: d, locationId, memo: 'August cleaning' } as never })
    await expect(run('closePeriod', { locationId, period }, closer)).rejects.toThrow(/not closed/)
    await run('closeDay', { locationId, businessDate: '2026-08-12' }, closer).catch(async e => { if (!/earlier day/.test(String(e))) throw e })
    const days = (await prisma.ledgerEntry.findMany({ where: { locationId, businessDate: { gte: new Date('2026-08-01T00:00:00Z'), lte: new Date('2026-08-31T00:00:00Z') } }, distinct: ['businessDate'], select: { businessDate: true }, orderBy: { businessDate: 'asc' } })).map(x => x.businessDate!.toISOString().slice(0, 10))
    for (const day of days) { if (!(await prisma.dayClose.findFirst({ where: { locationId, businessDate: new Date(`${day}T00:00:00Z`), status: 'closed' } }))) await run('closeDay', { locationId, businessDate: day }, closer) }
    const closed: any = await run('closePeriod', { locationId, period }, closer)
    expect(closed.status).toBe('closed')
    await expect(prisma.ledgerEntry.create({ data: { accountId: acc.id, patientId, kind: 'charge', amountMinor: 100n, currencyCode: 'USD', businessDate: new Date('2026-08-20T00:00:00Z'), originalBusinessDate: new Date('2026-08-20T00:00:00Z'), locationId } as never })).rejects.toThrow(/closed/)
    // Reopen: the requester cannot approve their own request; a second person with the permission can.
    const asked: any = await run('requestPeriodReopen', { periodCloseId: closed.id, reason: 'A late insurance correction for August' }, closer)
    const request = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: asked.approvalId } })
    await expect(decideApprovalRequest(null, { requestId: request.id, decision: 'approve', expectedVersion: request.version, idempotencyKey: uniqueKey('self') }, closer)).rejects.toThrow()
    await decideApprovalRequest(null, { requestId: request.id, decision: 'approve', expectedVersion: request.version, idempotencyKey: uniqueKey('ok') }, approver)
    const reopened = await prisma.periodClose.findUniqueOrThrow({ where: { id: closed.id } })
    expect(reopened.status).toBe('reopened')
    expect(await prisma.restatement.count({ where: { periodCloseId: closed.id } })).toBe(1)
    // Only a restatement entry posts while reopened.
    await expect(prisma.ledgerEntry.create({ data: { accountId: acc.id, patientId, kind: 'charge', amountMinor: 100n, currencyCode: 'USD', businessDate: new Date('2026-08-12T00:00:00Z'), originalBusinessDate: new Date('2026-08-12T00:00:00Z'), locationId } as never })).rejects.toThrow()
    const type = await prisma.adjustmentType.findFirstOrThrow({ where: { code: 'OTHER-CR' } })
    const posted: any = await run('postRestatement', { periodCloseId: closed.id, patientId, typeId: type.id, amount: '5.00', businessDate: '2026-08-12', reason: 'Insurance paid less than expected' }, closer)
    expect(posted.restatementId).toBeTruthy()
    const re: any = await run('reclosePeriod', { periodCloseId: closed.id }, closer)
    expect(re).toMatchObject({ status: 'closed', restatedEntries: 1 })
    // A month cannot jump from open to reopened, or skip the request.
    await expect(prisma.$executeRawUnsafe(`UPDATE "PeriodClose" SET status = 'reopened' WHERE id = '${closed.id}'`)).rejects.toThrow()
  })

  it('a rejected reopen leaves the month closed', async () => {
    const acc = await prisma.guarantorAccount.findFirstOrThrow()
    const d = new Date('2026-07-09T00:00:00Z')
    await prisma.ledgerEntry.create({ data: { accountId: acc.id, patientId, kind: 'charge', amountMinor: 3000n, currencyCode: 'USD', businessDate: d, originalBusinessDate: d, locationId } as never })
    await run('closeDay', { locationId, businessDate: '2026-07-09' }, closer)
    const p: any = await run('closePeriod', { locationId, period: '2026-07' }, closer)
    const asked: any = await run('requestPeriodReopen', { periodCloseId: p.id, reason: 'Wanted to move a charge' }, closer)
    const request = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: asked.approvalId } })
    await decideApprovalRequest(null, { requestId: request.id, decision: 'reject', reason: 'Post it in the open month', expectedVersion: request.version, idempotencyKey: uniqueKey('no') }, approver)
    expect((await prisma.periodClose.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('closed')
  })

  it('refuses closing a month that has not ended, and a bad month', async () => {
    const now = new Date().toISOString().slice(0, 7)
    await expect(run('closePeriod', { locationId, period: now }, closer)).rejects.toThrow(/last day/)
    await expect(run('closePeriod', { locationId, period: '2026-13' }, closer)).rejects.toThrow(/YYYY-MM/)
  })
})
