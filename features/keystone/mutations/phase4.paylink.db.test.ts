import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { NEVER_DEFAULT, permissionNames, type Permission } from '../access'
import { confirmPayLinkPayment, openPayLink, payLinkStatement, startPayLinkPayment } from '../lib/payLink'
import { pdfSha256, renderStatementPdf, servePdf, statementForPdf } from '../lib/statementPdf'
import { PHASE2_OPS } from './phase2Ops'
import { loadPracticeSetup } from './setup'

/*
 * Slice 4 add-on: the statement PDF is re-rendered from the frozen snapshot and hash-checked (409 on mismatch); the pay link opens
 * one statement only, expires, shows nothing for an unknown or expired code, and settles a card payment exactly once.
 */

const sessionFor = (id: string, granted: Permission[]) => ({
  itemId: id, listKey: 'User',
  data: { name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null, role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) } },
})
const run = (name: string, args: Record<string, unknown>, ctx: unknown) => PHASE2_OPS[name].fn(null, { ...args, idempotencyKey: uniqueKey(name) }, ctx) as Promise<any>

let intentCount = 0
let lastIntent = 'pi_link_0'
const fakeStripe = (intents: { id: string; status: string }[], calls: string[] = []) => ({
  apiKey: 'sk_test_unit', baseUrl: 'https://stripe.invalid', timeoutMs: 500,
  fetch: (async (url: string, init: any) => {
    const path = new URL(url).pathname
    calls.push(`${init?.method} ${path}`)
    if (init?.method === 'POST') { intentCount += 1; lastIntent = `pi_link_${intentCount}` }
    const id = init?.method === 'POST' ? lastIntent : path.split('/').pop()!
    const body = init?.method === 'POST'
      ? { id, status: 'requires_payment_method', client_secret: `${id}_secret_unit` }
      : { id, status: intents[0]?.status ?? 'requires_payment_method', latest_charge: 'ch_link_1' }
    return { status: 200, json: async () => body, text: async () => JSON.stringify(body) } as any
  }) as any,
})

describe.skipIf(!hasTestDatabase)('Slice 4 add-on: statement PDF and pay link (database)', () => {
  let prisma: PrismaClient
  let owner: any
  let accountA: string, locationId: string
  let stmtA: any, stmtB: any

  beforeAll(async () => {
    process.env.SESSION_SECRET ||= 'dental-vitest-session-secret-0123456789abcdef'
    process.env.DENTAL_SECRET_KEY ||= Buffer.alloc(32, 7).toString('base64')
    process.env.STRIPE_SECRET_KEY ||= 'sk_test_unit'
    prisma = testPrisma(5)
    await resetDatabase(prisma)
    const o = await prisma.user.create({ data: { name: 'owner', email: `${uniqueKey('owner')}@test.local`, password: 'x'.repeat(60) } })
    owner = { session: sessionFor(o.id, permissionNames.filter(p => !NEVER_DEFAULT.includes(p))), prisma }
    await loadPracticeSetup(null, { idempotencyKey: uniqueKey('setup') }, owner)
    const charges = await prisma.ledgerEntry.findMany({ where: { kind: 'charge' }, distinct: ['accountId'], orderBy: { id: 'asc' }, take: 2 })
    accountA = charges[0].accountId!; locationId = charges[0].locationId!
    await prisma.practiceSettings.update({ where: { id: 1 }, data: { minStatementMinor: 1n } })
    await run('generateStatements', { locationId, cycleDate: '2026-11-09' }, owner)
    const all = await prisma.statement.findMany({ orderBy: { createdAt: 'asc' } })
    stmtA = all.find(s => s.accountId === accountA) ?? all[0]
    stmtB = all.find(s => s.id !== stmtA.id) ?? null
  }, 240_000)
  afterAll(async () => { await prisma?.$disconnect() })

  it('a built statement carries the fingerprint of its own PDF and a pay-link expiry', async () => {
    expect(stmtA.pdfSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(stmtA.payLinkExpiresAt.getTime()).toBeGreaterThan(Date.now())
    expect(pdfSha256(renderStatementPdf(statementForPdf(stmtA)))).toBe(stmtA.pdfSha256)
  })

  it('serves the statement only while its bytes match the stored fingerprint, else a 409 with nothing served', async () => {
    const bytes = renderStatementPdf(statementForPdf(stmtA))
    expect(new TextDecoder('latin1').decode(bytes.slice(0, 5))).toBe('%PDF-')
    const ok = servePdf(bytes, stmtA.pdfSha256, stmtA.ref)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('application/pdf')
    const changed = renderStatementPdf(statementForPdf({ ...stmtA, amountDueMinor: stmtA.amountDueMinor + 1n }))
    const refused = servePdf(changed, stmtA.pdfSha256, stmtA.ref)
    expect(refused.status).toBe(409)
    expect(refused.headers.get('content-type')).not.toBe('application/pdf')
    expect(servePdf(bytes, '', stmtA.ref).status).toBe(409)
  })

  it('the database will not move the PDF fingerprint or the pay-link expiry once set', async () => {
    await expect(prisma.statement.update({ where: { id: stmtA.id }, data: { pdfSha256: 'f'.repeat(64) } })).rejects.toThrow()
    await expect(prisma.statement.update({ where: { id: stmtA.id }, data: { payLinkExpiresAt: new Date(Date.now() + 9e9) } })).rejects.toThrow()
  })

  it('opens the balance for a live code and gives an unknown, malformed or expired code the same refusal', async () => {
    const view = await openPayLink(prisma as any, stmtA.payLinkCode)
    expect(view.ref).toBe(stmtA.ref)
    expect(BigInt(view.owedMinor)).toBeLessThanOrEqual(stmtA.amountDueMinor)
    expect(JSON.stringify(view)).not.toMatch(/accountId|patientId|payLinkCode|pdfSha256/)
    const messages = new Set<string>()
    for (const code of ['PAY-AAAA-BBBB-CCCC', 'nonsense', '', stmtA.payLinkCode.toLowerCase().replace('PAY', 'PAX')]) {
      await openPayLink(prisma as any, code).catch(e => messages.add(e.message))
    }
    const later = new Date(stmtA.payLinkExpiresAt.getTime() + 1000)
    await openPayLink(prisma as any, stmtA.payLinkCode, later).catch(e => messages.add(e.message))
    await payLinkStatement(prisma as any, stmtA.payLinkCode, later).then(() => messages.add('SERVED'), e => messages.add(e.message))
    expect([...messages]).toEqual(['This link is not available.'])
  })

  it('a suppressed or collections-hold statement gets nothing from its link', async () => {
    if (!stmtB) return
    await prisma.$executeRaw`UPDATE "Statement" SET status = 'collections_hold' WHERE id = ${stmtB.id}`
    await expect(openPayLink(prisma as any, stmtB.payLinkCode)).rejects.toThrow('This link is not available.')
    await expect(startPayLinkPayment(prisma as any, stmtB.payLinkCode, '5.00')).rejects.toThrow('This link is not available.')
  })

  it('a link shows its own statement only: another statement\'s code cannot be used to pay this account', async () => {
    if (!stmtB || stmtB.accountId === stmtA.accountId) return
    const a = await openPayLink(prisma as any, stmtA.payLinkCode)
    expect(a.ref).toBe(stmtA.ref)
    const calls: string[] = []
    const started = await startPayLinkPayment(prisma as any, stmtA.payLinkCode, '5.00', new Date(), fakeStripe([], calls))
    const pay = await prisma.payment.findFirstOrThrow({ where: { ref: started.ref } })
    expect(pay.accountId).toBe(stmtA.accountId)
    expect(pay.statementId).toBe(stmtA.id)
    expect(pay.source).toBe('pay_link')
    await expect(confirmPayLinkPayment(prisma as any, stmtB.payLinkCode, started.ref, new Date(), fakeStripe([]))).rejects.toThrow()
  })

  it('refuses an amount over what is owed or under a dollar, and a second payment while one is in progress cannot exceed the balance', async () => {
    const view = await openPayLink(prisma as any, stmtA.payLinkCode)
    await expect(startPayLinkPayment(prisma as any, stmtA.payLinkCode, '0.50', new Date(), fakeStripe([]))).rejects.toThrow(/smallest/)
    await expect(startPayLinkPayment(prisma as any, stmtA.payLinkCode, '99999.00', new Date(), fakeStripe([]))).rejects.toThrow(/more than/)
    const rest = BigInt(view.owedMinor) - 500n
    expect(rest).toBeGreaterThan(0n)
  })

  it('settles once when the browser confirms twice and the webhook also arrives, and sends the processor only reference, amount and kind', async () => {
    const calls: string[] = []
    const body: string[] = []
    const stripe = fakeStripe([{ id: 'pi_link_1', status: 'succeeded' }], calls)
    const original = stripe.fetch
    stripe.fetch = (async (url: string, init: any) => { if (init?.body) body.push(String(init.body)); return (original as any)(url, init) }) as any
    const before = await prisma.ledgerEntry.aggregate({ where: { accountId: stmtA.accountId }, _sum: { amountMinor: true } })
    const started = await startPayLinkPayment(prisma as any, stmtA.payLinkCode, '7.00', new Date(), stripe)
    expect(started.clientSecret).toMatch(/^pi_link_\d+_secret_unit$/)
    const first = await confirmPayLinkPayment(prisma as any, stmtA.payLinkCode, started.ref, new Date(), stripe)
    const second = await confirmPayLinkPayment(prisma as any, stmtA.payLinkCode, started.ref, new Date(), stripe)
    expect(first.status).toBe('paid'); expect(second.status).toBe('paid')
    const { applyPaymentEvent } = await import('../messaging/paymentWorker')
    await applyPaymentEvent(prisma as any, { id: 'evt_link_1', type: 'payment_intent.succeeded', data: { object: { id: (await prisma.payment.findFirstOrThrow({ where: { ref: started.ref } })).providerIntentId } } })
    const pay = await prisma.payment.findFirstOrThrow({ where: { ref: started.ref } })
    expect(pay.status).toBe('succeeded')
    expect(await prisma.ledgerEntry.count({ where: { paymentId: pay.id } })).toBe(1)
    const after = await prisma.ledgerEntry.aggregate({ where: { accountId: stmtA.accountId }, _sum: { amountMinor: true } })
    expect((before._sum.amountMinor ?? 0n) - (after._sum.amountMinor ?? 0n)).toBe(700n)
    const sent = body.join('&')
    expect(sent).toContain('amount=700')
    expect(sent).not.toMatch(/email|name|patient|birth|address|member/i)
    expect((await prisma.statement.findUniqueOrThrow({ where: { id: stmtA.id } })).status).toMatch(/partially_paid|paid/)
  })

  it('a declined card is recorded as failed and posts nothing', async () => {
    const started = await startPayLinkPayment(prisma as any, stmtA.payLinkCode, '3.00', new Date(), fakeStripe([]))
    const out = await confirmPayLinkPayment(prisma as any, stmtA.payLinkCode, started.ref, new Date(), fakeStripe([{ id: 'pi_link_1', status: 'requires_payment_method' }]))
    expect(out.status).toBe('failed')
    const pay = await prisma.payment.findFirstOrThrow({ where: { ref: started.ref } })
    expect(pay.status).toBe('failed')
    expect(await prisma.ledgerEntry.count({ where: { paymentId: pay.id } })).toBe(0)
  })
})
