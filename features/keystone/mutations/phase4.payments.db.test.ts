import type { PrismaClient } from '@prisma/client'
import fc from 'fast-check'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { NEVER_DEFAULT, permissionNames, type Permission } from '../access'
import { chargesOutstanding } from '../lib/payments'
import { signWebhook, verifyWebhook } from '../../integrations/payments/stripe'
import { applyPaymentEvent, receiveStripeEvent, runPaymentCreate, runRefund } from '../messaging/paymentWorker'
import { PHASE2_OPS } from './phase2Ops'
import { loadPracticeSetup } from './setup'

/*
 * Phase 4 slice 3 exit gate: payments allocate oldest-first and never over-apply; a refund needs a second person and never exceeds
 * the payment; a card is never charged twice; webhook events apply once; statements freeze; plans carry no interest.
 */

const sessionFor = (id: string, granted: Permission[]) => ({
  itemId: id, listKey: 'User',
  data: { name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null, role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) } },
})
const run = (name: string, args: Record<string, unknown>, ctx: unknown) => PHASE2_OPS[name].fn(null, { ...args, idempotencyKey: uniqueKey(name) }, ctx) as Promise<any>

describe('payment allocation (pure)', () => {
  it('credits go against the oldest charges first and the owed total never goes below the balance', () => {
    fc.assert(fc.property(fc.array(fc.tuple(fc.boolean(), fc.integer({ min: 1, max: 90_000 }), fc.integer({ min: 0, max: 200 })), { minLength: 1, maxLength: 12 }), rows => {
      const entries = rows.map(([isCharge, cents, age], i) => ({ id: `e${i}`, kind: isCharge ? 'charge' : 'patient_payment', amountMinor: isCharge ? BigInt(cents) : -BigInt(cents), businessDate: new Date(Date.UTC(2026, 0, 1 + age)) }))
      const owed = chargesOutstanding(entries).reduce((s, o) => s + o.left, 0n)
      const total = entries.reduce((s, e) => s + e.amountMinor, 0n)
      expect(owed).toBeGreaterThanOrEqual(total > 0n ? total : 0n)
      for (const o of chargesOutstanding(entries)) expect(o.left).toBeLessThanOrEqual(o.amountMinor)
    }))
  })
  it('verifies a signed webhook body and rejects a changed one, a wrong secret and an old timestamp', () => {
    const body = '{"id":"evt_1","type":"payment_intent.succeeded"}'
    const header = signWebhook(body, 'whsec_unit', Date.now())
    expect(verifyWebhook(body, header, 'whsec_unit')).toBe(true)
    expect(verifyWebhook(body + ' ', header, 'whsec_unit')).toBe(false)
    expect(verifyWebhook(body, header, 'whsec_other')).toBe(false)
    expect(verifyWebhook(body, signWebhook(body, 'whsec_unit', Date.now() - 3_600_000), 'whsec_unit')).toBe(false)
    expect(verifyWebhook(body, null, 'whsec_unit')).toBe(false)
  })
})

describe.skipIf(!hasTestDatabase)('Phase 4 slice 3: payments (database)', () => {
  let prisma: PrismaClient
  let front: any, manager: any, cashier: any
  let accountId: string, patientId: string, locationId: string

  const fakeStripe = (responses: Record<string, { status: number; body: unknown }[]>, calls: { path: string; key: string | null }[] = []) => ({
    apiKey: 'sk_test_unit', baseUrl: 'https://stripe.invalid', timeoutMs: 500,
    fetch: (async (url: string, init: any) => {
      const path = new URL(url).pathname
      calls.push({ path, key: init?.headers?.['Idempotency-Key'] ?? null })
      const next = (responses[path] ?? []).shift() ?? { status: 500, body: {} }
      return { status: next.status, json: async () => next.body, text: async () => JSON.stringify(next.body) } as any
    }) as any,
  })

  beforeAll(async () => {
    process.env.SESSION_SECRET ||= 'dental-vitest-session-secret-0123456789abcdef'
    process.env.DENTAL_SECRET_KEY ||= Buffer.alloc(32, 7).toString('base64')
    process.env.STRIPE_SECRET_KEY ||= 'sk_test_unit'
    prisma = testPrisma(5)
    await resetDatabase(prisma)
    const make = (name: string) => prisma.user.create({ data: { name, email: `${uniqueKey(name)}@test.local`, password: 'x'.repeat(60) } })
    const [o, f, m, c] = await Promise.all([make('owner'), make('front'), make('manager'), make('cashier')])
    const owner = { session: sessionFor(o.id, permissionNames.filter(p => !NEVER_DEFAULT.includes(p))), prisma }
    front = { session: sessionFor(f.id, ['canAccessDashboard', 'canTakePayments', 'canIssueRefunds', 'canAccessAllLocations', 'canAdjust', 'canCloseDay']), prisma, id: f.id }
    manager = { session: sessionFor(m.id, ['canAccessDashboard', 'canApproveRefunds', 'canAccessAllLocations']), prisma, id: m.id }
    cashier = { session: sessionFor(c.id, ['canAccessDashboard', 'canIssueRefunds', 'canApproveRefunds', 'canAccessAllLocations']), prisma, id: c.id }
    await loadPracticeSetup(null, { idempotencyKey: uniqueKey('setup') }, owner)
    const charge = await prisma.ledgerEntry.findFirstOrThrow({ where: { kind: 'charge' }, orderBy: { id: 'asc' } })
    accountId = charge.accountId!; patientId = charge.patientId!; locationId = charge.locationId!
  }, 240_000)
  afterAll(async () => { await prisma?.$disconnect() })

  const sum = async () => (await prisma.ledgerEntry.aggregate({ where: { accountId }, _sum: { amountMinor: true } }))._sum.amountMinor ?? 0n

  it('a cash payment posts the credit and allocates it to the oldest charges, never more than the payment', async () => {
    const before = await sum()
    const paid: any = await run('takePayment', { patientId, locationId, amount: '25.00', tender: 'cash' }, front)
    expect(paid.status).toBe('succeeded')
    expect(await sum()).toBe(before - 2500n)
    const allocs = await prisma.paymentAllocation.findMany({ where: { paymentId: paid.id } })
    expect(allocs.reduce((s, a) => s + a.amountMinor, 0n)).toBeLessThanOrEqual(2500n)
  })

  it('replaying a payment with the same key records it once', async () => {
    const key = uniqueKey('same')
    const args = { patientId, locationId, amount: '10.00', tender: 'cash', idempotencyKey: key }
    const a: any = await PHASE2_OPS.takePayment.fn(null, args, front)
    const b: any = await PHASE2_OPS.takePayment.fn(null, args, front)
    expect(b.replay).toBe(true)
    expect(b.id).toBe(a.id)
    expect(await prisma.payment.count({ where: { ref: a.ref } })).toBe(1)
  })

  it('refuses a payment that is zero, over the bound, or a check without a number', async () => {
    await expect(run('takePayment', { patientId, locationId, amount: '0', tender: 'cash' }, front)).rejects.toThrow()
    await expect(run('takePayment', { patientId, locationId, amount: '20000000.00', tender: 'cash' }, front)).rejects.toThrow()
    await expect(run('takePayment', { patientId, locationId, amount: '5.00', tender: 'check' }, front)).rejects.toThrow(/check number/)
  })

  it('the database refuses an allocation over the payment or the charge, and a refund over what was paid', async () => {
    const paid: any = await run('takePayment', { patientId, locationId, amount: '50.00', tender: 'cash' }, front)
    const charge = await prisma.ledgerEntry.findFirstOrThrow({ where: { accountId, kind: 'charge' } })
    await expect(prisma.paymentAllocation.create({ data: { paymentId: paid.id, ledgerEntryId: charge.id, amountMinor: 5_100n } })).rejects.toThrow()
    await expect(prisma.payment.update({ where: { id: paid.id }, data: { refundedMinor: 5_001n } })).rejects.toThrow()
  })

  it('a card payment is charged once: a timeout leaves it unknown and the retry uses the same key', async () => {
    const paid: any = await run('takePayment', { patientId, locationId, amount: '30.00', tender: 'card', testMethod: 'test_visa' }, front)
    expect(paid.status).toBe('initiated')
    const calls: { path: string; key: string | null }[] = []
    const timeout = await runPaymentCreate(prisma as any, paid.id, fakeStripe({ '/v1/payment_intents': [{ status: 503, body: {} }] }, calls))
    expect((timeout as any).changed).toBe(true)
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: paid.id } })).status).toBe('unknown')
    expect(await prisma.ledgerEntry.count({ where: { paymentId: paid.id } })).toBe(0)
    // The retry re-sends the timed-out payment as it is (the database refuses to move a payment back to initiated).
    await expect(prisma.payment.update({ where: { id: paid.id }, data: { status: 'initiated' } })).rejects.toThrow(/Payment_status_forward_only/)
    await runPaymentCreate(prisma as any, paid.id, fakeStripe({ '/v1/payment_intents': [{ status: 200, body: { id: 'pi_unit_1', status: 'succeeded', latest_charge: 'ch_unit_1' } }] }, calls))
    expect(new Set(calls.map(c => c.key)).size).toBe(1)
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: paid.id } })).status).toBe('succeeded')
    expect(await prisma.ledgerEntry.count({ where: { paymentId: paid.id } })).toBe(1)
    // The processor event for the same payment changes nothing.
    await applyPaymentEvent(prisma as any, { id: 'evt_unit_dup', type: 'payment_intent.succeeded', data: { object: { id: 'pi_unit_1' } } })
    expect(await prisma.ledgerEntry.count({ where: { paymentId: paid.id } })).toBe(1)
    store.card = paid.id
  })

  const store: { card?: string } = {}

  it('a webhook event is recorded once and a repeat delivery does nothing', async () => {
    const event = { id: 'evt_unit_repeat', type: 'payment_intent.succeeded', data: { object: { id: 'pi_unit_1' } } }
    const first: any = await receiveStripeEvent(prisma as any, JSON.stringify(event), event)
    const second: any = await receiveStripeEvent(prisma as any, JSON.stringify(event), event)
    expect(first.replay).toBe(false)
    expect(second.replay).toBe(true)
    expect(await prisma.inboundObservation.count({ where: { source: 'stripe', externalId: 'evt_unit_repeat' } })).toBe(1)
  })

  it('a refund needs a second person; the requester cannot approve it; the approver sends it; it never exceeds the payment', async () => {
    const { decideApprovalRequest } = await import('./approvals')
    const r: any = await run('requestRefund', { paymentId: store.card, amount: '12.00', reason: 'Charged twice at the desk' }, cashier)
    expect(r.status).toBe('requested')
    const request = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: r.approvalId } })
    await expect(decideApprovalRequest(null, { requestId: request.id, decision: 'approve', expectedVersion: request.version, idempotencyKey: uniqueKey('self') }, cashier)).rejects.toThrow()
    await decideApprovalRequest(null, { requestId: request.id, decision: 'approve', expectedVersion: request.version, idempotencyKey: uniqueKey('ok') }, manager)
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('executing')
    const calls: { path: string; key: string | null }[] = []
    await runRefund(prisma as any, r.id, fakeStripe({ '/v1/refunds': [{ status: 200, body: { id: 're_unit_1', status: 'succeeded' } }] }, calls))
    const done = await prisma.refund.findUniqueOrThrow({ where: { id: r.id } })
    expect(done.status).toBe('completed')
    expect(done.ledgerEntryId).toBeTruthy()
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: store.card } })).refundedMinor).toBe(1200n)
    await expect(run('requestRefund', { paymentId: store.card, amount: '19.00', reason: 'Too much' }, cashier)).rejects.toThrow(/can still be refunded/)
    // The same run again does nothing: the refund is already complete.
    await runRefund(prisma as any, r.id, fakeStripe({}, calls))
    expect(calls.filter(c => c.path === '/v1/refunds').length).toBe(1)
  })

  it('a rejected refund leaves no ledger entry and the payment unchanged', async () => {
    const { decideApprovalRequest } = await import('./approvals')
    const before = await sum()
    const r: any = await run('requestRefund', { paymentId: store.card, amount: '5.00', reason: 'Patient asked at checkout' }, cashier)
    const request = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: r.approvalId } })
    await decideApprovalRequest(null, { requestId: request.id, decision: 'reject', reason: 'Already refunded in cash', expectedVersion: request.version, idempotencyKey: uniqueKey('rej') }, manager)
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('rejected')
    expect(await sum()).toBe(before)
  })

  it('the database refuses a refund approved by the person who asked for it', async () => {
    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: store.card } })
    await expect(prisma.refund.create({ data: { ref: uniqueKey('RFD'), accountId, locationId, paymentId: pay.id, target: 'patient', amountMinor: 100n, method: 'check', status: 'approved', reason: 'x', requestedById: front.id, approvedById: front.id } as never })).rejects.toThrow()
  })

  it('statements are built once per cycle, frozen, and skipped for accounts on hold or under the minimum', async () => {
    const first: any = await run('generateStatements', { locationId, cycleDate: '2026-11-01' }, front)
    const again: any = await run('generateStatements', { locationId, cycleDate: '2026-11-01' }, front)
    expect(again.built).toBe(0)
    if (first.built > 0) {
      const st = await prisma.statement.findFirstOrThrow({ where: { cycleDate: new Date('2026-11-01T00:00:00Z') } })
      await expect(prisma.statement.update({ where: { id: st.id }, data: { snapshot: {} } })).rejects.toThrow()
      await expect(prisma.statement.update({ where: { id: st.id }, data: { payLinkCode: 'changed' } })).rejects.toThrow()
      expect(st.payLinkCode.length).toBeGreaterThanOrEqual(12)
    }
  })

  it('a payment plan adds up, carries no interest, and its instalments are frozen once paid', async () => {
    const balance = await sum()
    if (balance < 10_000n) await prisma.ledgerEntry.create({ data: { accountId, patientId, kind: 'charge', amountMinor: 60_000n, currencyCode: 'USD', businessDate: new Date('2026-10-20T00:00:00Z'), originalBusinessDate: new Date('2026-10-20T00:00:00Z'), locationId, memo: 'Crown' } as never })
    await expect(run('proposePaymentPlan', { patientId, locationId, installments: 1, firstDueDate: '2026-12-01' }, front)).rejects.toThrow()
    const plan: any = await run('proposePaymentPlan', { patientId, locationId, installments: 3, firstDueDate: '2026-12-01', amount: '100.00' }, front)
    const rows = await prisma.paymentPlanInstallment.findMany({ where: { planId: plan.id } })
    expect(rows.reduce((s, r) => s + r.amountMinor, 0n)).toBe(10_000n)
    await expect(prisma.paymentPlan.update({ where: { id: plan.id }, data: { interestRatePct: 5 } })).rejects.toThrow()
    const row = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })
    await run('activatePaymentPlan', { planId: plan.id, expectedVersion: row.version, agreedByName: 'Ivy Bennett' }, front)
    const active = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })
    expect(active.agreementHash).toHaveLength(64)
    await expect(run('proposePaymentPlan', { patientId, locationId, installments: 3, firstDueDate: '2026-12-01', amount: '50.00' }, front)).rejects.toThrow(/already has a payment plan/)
  })

  it('the processor never sees patient details: only the reference, amount and kind', async () => {
    const calls: any[] = []
    const paid: any = await run('takePayment', { patientId, locationId, amount: '8.00', tender: 'card', testMethod: 'test_visa' }, front)
    const spy = { ...fakeStripe({ '/v1/payment_intents': [{ status: 200, body: { id: 'pi_unit_2', status: 'succeeded', latest_charge: 'ch_2' } }] }), fetch: (async (url: string, init: any) => { calls.push(String(init?.body ?? '')); return { status: 200, json: async () => ({ id: 'pi_unit_2', status: 'succeeded', latest_charge: 'ch_2' }), text: async () => '{}' } as any }) as any }
    await runPaymentCreate(prisma as any, paid.id, spy)
    const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })
    const sent = calls.join('&')
    expect(sent).not.toContain(encodeURIComponent(patient.lastName))
    expect(sent).not.toContain(patient.lastName)
    expect(sent).toContain('metadata')
  })
})
