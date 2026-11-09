import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { NEVER_DEFAULT, permissionNames, type Permission } from '../access'
import { parseStediEra, lineConserves } from '../lib/era'
import { runClaimSubmit, pollRemittances, importEraBody } from '../messaging/claimWorker'
import { PHASE2_OPS } from './phase2Ops'
import { loadPracticeSetup } from './setup'

/*
 * Phase 4 slice 2 exit gate: a claim is built from posted work, scrubbed, released (frozen) and sent exactly once; a remittance
 * posts exactly once, balances to the cent, and a repeat of the same payment trace posts nothing. All data here is made up, and
 * every insurance-shaped code is generated at test time.
 */

const sessionFor = (id: string, granted: Permission[]) => ({
  itemId: id, listKey: 'User',
  data: { name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null, role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) }, assignments: [] },
})
const run = (name: string, args: Record<string, unknown>, ctx: unknown) => PHASE2_OPS[name].fn(null, { ...args, idempotencyKey: uniqueKey(name) }, ctx) as Promise<any>

/** A 835 report in Stedi's JSON shape, built at test time from the claim's own numbers. */
const eraFor = (claim: { patientControlNumber: string; lines: { lineControlNumber: string; feeMinor: bigint; code: string }[] }, options: { trace: string; paid: (fee: bigint) => bigint; writeOff: (fee: bigint) => bigint; patient?: (fee: bigint) => bigint; status?: string }) => {
  const dollars = (n: bigint) => `${n < 0n ? '-' : ''}${(n < 0n ? -n : n) / 100n}.${String((n < 0n ? -n : n) % 100n).padStart(2, '0')}`
  const lines = claim.lines.map(l => {
    const paid = options.paid(l.feeMinor); const co = options.writeOff(l.feeMinor); const pr = options.patient?.(l.feeMinor) ?? 0n
    const adjustments = [
      ...(co ? [{ claimAdjustmentGroupCode: 'CO', adjustmentReasonCode1: '45', adjustmentAmount1: dollars(co) }] : []),
      ...(pr ? [{ claimAdjustmentGroupCode: 'PR', adjustmentReasonCode1: '2', adjustmentAmount1: dollars(pr) }] : []),
    ]
    return { lineItemControlNumber: l.lineControlNumber, servicePaymentInformation: { adjudicatedProcedureCode: l.code, lineItemChargeAmount: dollars(l.feeMinor), lineItemProviderPaymentAmount: dollars(paid) }, serviceAdjustments: adjustments }
  })
  const total = claim.lines.reduce((s, l) => s + options.paid(l.feeMinor), 0n)
  const charge = claim.lines.reduce((s, l) => s + l.feeMinor, 0n)
  return {
    transactions: [{
      financialInformation: { paymentMethodCode: 'ACH', totalActualProviderPaymentAmount: dollars(total), checkIssueOrEFTEffectiveDate: '20261110' },
      paymentAndRemitReassociationDetails: { checkOrEFTTraceNumber: options.trace },
      payer: { name: 'Harbor Mutual Dental' },
      detailInfo: [{ paymentInfo: [{ claimPaymentInfo: { patientControlNumber: claim.patientControlNumber, claimStatusCode: options.status ?? '1', totalClaimChargeAmount: dollars(charge), claimPaymentAmount: dollars(total), patientResponsibilityAmount: dollars(claim.lines.reduce((s, l) => s + (options.patient?.(l.feeMinor) ?? 0n), 0n)), payerClaimControlNumber: `PCN-${options.trace}` }, serviceLines: lines }] }],
    }],
  }
}

describe('ERA parsing (pure)', () => {
  it('reads amounts as exact minor units and checks each line balances', () => {
    const [era] = parseStediEra(eraFor({ patientControlNumber: 'CLM-X', lines: [{ lineControlNumber: 'L01', feeMinor: 12000n, code: 'X' }] }, { trace: 'T1', paid: f => (f * 8n) / 10n, writeOff: f => f / 10n, patient: f => f / 10n }))
    const line = era.claims[0].lines[0]
    expect(line.chargeMinor).toBe(12000n)
    expect(line.paidMinor).toBe(9600n)
    expect(line.adjustments.map(a => a.amountMinor)).toEqual([1200n, 1200n])
    expect(lineConserves(line)).toBe(true)
    expect(lineConserves({ ...line, paidMinor: 9601n })).toBe(false)
  })
})

describe.skipIf(!hasTestDatabase)('Phase 4 slice 2: claims and remittances (database)', () => {
  let prisma: PrismaClient
  let owner: any
  let biller: any
  let front: any
  let patientId: string
  let locationId: string
  let coverageId: string
  let providerId: string
  let codes: { of: any; theirs: any }[] = []
  const fetchOk = (async (url: string, init: RequestInit) => {
    const { recordedFetch } = await import('../../integrations/clearinghouse/recorded')
    return recordedFetch(url as never, init)
  }) as unknown as typeof fetch

  const makeEntry = async (index: number, extra: Record<string, unknown> = {}) => {
    const { of } = codes[index]
    const fee = BigInt(of.fee)
    return prisma.chartEntry.create({ data: { patientId, locationId, kind: 'procedure', area: 'mouth', codeId: of.id, status: 'posted', source: 'staff', providerId, dateOfService: new Date('2026-11-02T00:00:00Z'), originalServiceDate: new Date('2026-11-02T00:00:00Z'), feeMinor: fee, units: 1, ...extra } })
  }
  const build = async (entryIds: string[]) => {
    const made = await run('buildClaim', { patientId, coverageId, locationId, chartEntryIds: entryIds }, biller)
    return prisma.claim.findUniqueOrThrow({ where: { id: made.id }, include: { lines: { orderBy: { lineControlNumber: 'asc' } } } })
  }
  const toSent = async (entryIds: string[]) => {
    let claim = await build(entryIds)
    await run('scrubClaim', { claimId: claim.id, expectedVersion: claim.version }, biller)
    claim = await prisma.claim.findUniqueOrThrow({ where: { id: claim.id }, include: { lines: { orderBy: { lineControlNumber: 'asc' } } } })
    expect(claim.status).toBe('ready')
    await run('releaseClaim', { claimId: claim.id, expectedVersion: claim.version }, biller)
    await runClaimSubmit(prisma as never, claim.id, { fetch: fetchOk })
    return prisma.claim.findUniqueOrThrow({ where: { id: claim.id }, include: { lines: { orderBy: { lineControlNumber: 'asc' } } } })
  }
  const entriesOf = async (accountPatient: string) => prisma.ledgerEntry.findMany({ where: { patientId: accountPatient }, orderBy: { createdAt: 'asc' } })

  beforeAll(async () => {
    process.env.SESSION_SECRET ||= 'dental-vitest-session-secret-0123456789abcdef'
    process.env.DENTAL_SECRET_KEY ||= Buffer.alloc(32, 7).toString('base64')
    prisma = testPrisma(4)
    await resetDatabase(prisma)
    const make = (name: string) => prisma.user.create({ data: { name, email: `${uniqueKey(name)}@test.local`, password: 'x'.repeat(60) } })
    const [o, b, f] = await Promise.all([make('owner'), make('biller'), make('front')])
    owner = { session: sessionFor(o.id, permissionNames.filter(p => !NEVER_DEFAULT.includes(p))), prisma }
    biller = { session: sessionFor(b.id, ['canAccessDashboard', 'canManageClaims', 'canSubmitClaims', 'canPostRemittances', 'canOverrideScrub', 'canReadInsurance', 'canReadLedger', 'canAccessAllLocations']), prisma }
    front = { session: sessionFor(f.id, ['canAccessDashboard', 'canAccessAllLocations']), prisma }
    await loadPracticeSetup(null, { idempotencyKey: uniqueKey('setup') }, owner)
    const coverage = await prisma.coverage.findFirstOrThrow({ where: { ordinal: 'primary', status: 'active', subscriber: { plan: { payer: { name: 'Harbor Mutual Dental' } } } } })
    coverageId = coverage.id; patientId = coverage.patientId!
    locationId = (await prisma.location.findFirstOrThrow({ where: { isActive: true } })).id
    providerId = (await prisma.providerProfile.findFirstOrThrow({ where: { isActive: true, npiType1: { not: null } } })).id
    await prisma.patient.update({ where: { id: patientId }, data: { homeLocationId: locationId } })
    const all = await prisma.procedureCode.findMany({ where: { codeSystem: { key: 'OF' }, areaRule: 'mouth' }, orderBy: { code: 'asc' } })
    for (const of of all.slice(0, 8)) {
      const fee = (await prisma.fee.findFirst({ where: { codeId: of.id } }))?.amountMinor ?? 5000n
      const cross = await prisma.procedureCodeCrosswalk.findFirst({ where: { localCodeId: of.id, status: 'confirmed' }, include: { targetCode: true } })
      codes.push({ of: { ...of, fee }, theirs: cross?.targetCode })
    }
  }, 300_000)
  afterAll(async () => { await prisma?.$disconnect() })

  it('shows the sample crosswalk and enrollment, and keeps literal insurance codes out of the source', () => {
    expect(codes.length).toBeGreaterThan(3)
    expect(codes[0].theirs?.code).toMatch(/^D9\d{3}$/)
  })

  it('refuses a claim to someone without the claims permission', async () => {
    const entry = await makeEntry(0)
    await expect(run('buildClaim', { patientId, coverageId, locationId, chartEntryIds: [entry.id] }, front)).rejects.toThrow(/permission/)
  })

  it('builds from posted work only, scrubs clean, and a release freezes the version and sends once', async () => {
    const planned = await makeEntry(1, { status: 'planned' })
    await expect(run('buildClaim', { patientId, coverageId, locationId, chartEntryIds: [planned.id] }, biller)).rejects.toThrow(/no finished, unbilled work/i)
    const posted = await makeEntry(2)
    const sent = await toSent([posted.id])
    expect(sent.status).toBe('acknowledged')
    expect(sent.lines[0].codeId).toBe(codes[2].theirs.id)
    const version = await prisma.claimVersion.findFirstOrThrow({ where: { claimId: sent.id } })
    expect(version.payload).not.toHaveProperty('memberId')
    expect(JSON.stringify(version.payload)).not.toMatch(/SUM-4401-A/)
    // a second delivery of the same send does nothing
    expect(await runClaimSubmit(prisma as never, sent.id, { fetch: fetchOk })).toEqual({ skipped: true })
    // the same work cannot be billed on a second claim to the same coverage
    await expect(run('buildClaim', { patientId, coverageId, locationId, chartEntryIds: [posted.id] }, biller)).rejects.toThrow(/no finished, unbilled work/i)
  })

  it('the database refuses to edit a frozen version, delete a claim, or claim a sent state with no version', async () => {
    const version = await prisma.claimVersion.findFirstOrThrow()
    await expect(prisma.claimVersion.update({ where: { id: version.id }, data: { payloadHash: 'x' } })).rejects.toThrow(/append-only/)
    const claim = await prisma.claim.findFirstOrThrow()
    await expect(prisma.claim.delete({ where: { id: claim.id } })).rejects.toThrow(/append-only|no-delete|cannot be deleted/i)
    const entry = await makeEntry(3)
    const draft = await build([entry.id])
    await expect(prisma.claim.update({ where: { id: draft.id }, data: { status: 'released' } })).rejects.toThrow(/Claim_frozen_version/)
  })

  it('blocks a claim whose procedure has no confirmed insurance code, and an override needs its own permission and a reason', async () => {
    const odd = await prisma.procedureCode.create({ data: { codeSystemId: (await prisma.codeSystem.findFirstOrThrow({ where: { key: 'OF' } })).id, code: 'OF-X900', nomenclature: 'Unmatched office procedure', patientFriendlyName: 'Special visit', category: 'diagnostic', areaRule: 'mouth', isSynthetic: true } })
    const entry = await prisma.chartEntry.create({ data: { patientId, locationId, kind: 'procedure', area: 'mouth', codeId: odd.id, status: 'posted', source: 'staff', providerId, dateOfService: new Date('2026-11-02T00:00:00Z'), feeMinor: 4000n, units: 1 } })
    const claim = await build([entry.id])
    const scrubbed = await run('scrubClaim', { claimId: claim.id, expectedVersion: claim.version }, biller)
    expect(scrubbed.status).toBe('scrubbed')
    expect(scrubbed.findings.some((f: any) => f.kind === 'crosswalk_required')).toBe(true)
    const row = await prisma.claim.findUniqueOrThrow({ where: { id: claim.id } })
    await expect(run('overrideScrub', { claimId: claim.id, expectedVersion: row.version, reason: '' }, owner)).rejects.toThrow(/reason/i)
    const noPerm = { session: sessionFor('nop', ['canAccessDashboard', 'canManageClaims', 'canAccessAllLocations']), prisma }
    await expect(run('overrideScrub', { claimId: claim.id, expectedVersion: row.version, reason: 'Payer accepts the office code for this visit' }, noPerm)).rejects.toThrow(/permission/)
    await run('overrideScrub', { claimId: claim.id, expectedVersion: row.version, reason: 'Payer accepts the office code for this visit' }, biller)
    expect((await prisma.claim.findUniqueOrThrow({ where: { id: claim.id } })).status).toBe('ready')
    await run('voidClaim', { claimId: claim.id, expectedVersion: row.version + 1, reason: 'Created for a different visit' }, biller)
  })

  it('a timed-out send is unknown, never lost; a refused one is rejected with the clearinghouse’s words', async () => {
    const entry = await makeEntry(4)
    let claim = await build([entry.id])
    await run('scrubClaim', { claimId: claim.id, expectedVersion: claim.version }, biller)
    claim = await prisma.claim.findUniqueOrThrow({ where: { id: claim.id }, include: { lines: true } })
    await run('releaseClaim', { claimId: claim.id, expectedVersion: claim.version }, biller)
    const hang = (async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }) }) as unknown as typeof fetch
    await runClaimSubmit(prisma as never, claim.id, { fetch: hang })
    expect((await prisma.claim.findUniqueOrThrow({ where: { id: claim.id } })).status).toBe('submission_unknown')
    const refuse = (async () => new Response(JSON.stringify({ status: 'ERROR', errors: [{ code: '33', description: 'Subscriber coverage is not active on the date of service.' }] }), { status: 400 })) as unknown as typeof fetch
    const second = await makeEntry(5)
    let other = await build([second.id])
    await run('scrubClaim', { claimId: other.id, expectedVersion: other.version }, biller)
    other = await prisma.claim.findUniqueOrThrow({ where: { id: other.id }, include: { lines: true } })
    await run('releaseClaim', { claimId: other.id, expectedVersion: other.version }, biller)
    await runClaimSubmit(prisma as never, other.id, { fetch: refuse })
    expect((await prisma.claim.findUniqueOrThrow({ where: { id: other.id } })).status).toBe('rejected')
    const ack = await prisma.claimAcknowledgement.findFirstOrThrow({ where: { claimId: other.id } })
    expect(JSON.stringify(ack.errors)).toMatch(/not active/)
  })

  it('posts a remittance once: payment, contract write-off and patient share balance the account, and the same trace posts nothing', async () => {
    const entry = await makeEntry(6)
    const sent = await toSent([entry.id])
    const before = await entriesOf(patientId)
    const report = eraFor({ patientControlNumber: sent.patientControlNumber, lines: sent.lines.map(l => ({ lineControlNumber: l.lineControlNumber, feeMinor: l.feeMinor, code: 'X' })) }, { trace: `TRC-${uniqueKey('t')}`, paid: f => (f * 6n) / 10n, writeOff: f => f / 5n, patient: f => f / 5n })
    const first = await importEraBody(prisma as never, report, { externalId: uniqueKey('tx'), adapterKey: 'stedi' })
    expect(first.results[0]).toMatchObject({ status: 'posted', claimsPosted: 1, duplicate: false })
    const after = await entriesOf(patientId)
    const fresh = after.slice(before.length)
    expect(fresh.map(e => e.kind).sort()).toEqual(['insurance_payment', 'insurance_writeoff'])
    const fee = sent.lines[0].feeMinor
    expect(fresh.find(e => e.kind === 'insurance_payment')!.amountMinor).toBe(-(fee * 6n) / 10n)
    expect(fresh.find(e => e.kind === 'insurance_writeoff')!.amountMinor).toBe(-(fee / 5n))
    const claim = await prisma.claim.findUniqueOrThrow({ where: { id: sent.id } })
    expect(claim.status).toBe('adjudicated')
    expect(claim.adjudicationOutcome).toBe('paid')
    // the same payment trace again, under a different transaction id: stored as a duplicate, nothing posted
    const again = await importEraBody(prisma as never, report, { externalId: uniqueKey('tx'), adapterKey: 'stedi' })
    expect(again.results[0]).toMatchObject({ status: 'duplicate', duplicate: true, claimsPosted: 0 })
    expect((await entriesOf(patientId)).length).toBe(after.length)
    // the account cache still equals the sum
    const account = await prisma.guarantorAccount.findFirstOrThrow({ where: { from_LedgerEntry_account: { some: { patientId } } } })
    const total = (await prisma.ledgerEntry.aggregate({ where: { accountId: account.id }, _sum: { amountMinor: true } }))._sum.amountMinor ?? 0n
    expect(BigInt((account.balanceCache as any).totalMinor)).toBe(total)
  })

  it('a remittance line that does not balance posts nothing and waits as an exception', async () => {
    const entry = await makeEntry(7)
    const sent = await toSent([entry.id])
    const before = (await entriesOf(patientId)).length
    const report: any = eraFor({ patientControlNumber: sent.patientControlNumber, lines: sent.lines.map(l => ({ lineControlNumber: l.lineControlNumber, feeMinor: l.feeMinor, code: 'X' })) }, { trace: `TRC-${uniqueKey('u')}`, paid: f => f / 2n, writeOff: f => f / 4n })
    const result = await importEraBody(prisma as never, report, { externalId: uniqueKey('tx'), adapterKey: 'stedi' })
    expect(result.results[0]).toMatchObject({ status: 'exception', claimsPosted: 0, claimsHeld: 1 })
    expect((await entriesOf(patientId)).length).toBe(before)
    const line = await prisma.remittanceLine.findFirstOrThrow({ where: { conservationOk: false } })
    expect(line.conservationOk).toBe(false)
    await expect(prisma.$executeRawUnsafe(`UPDATE "RemittanceLine" SET "conservationOk" = true WHERE id = '${line.id}'`)).rejects.toThrow(/append-only|only the first link|conservation/i)
    expect((await prisma.claim.findUniqueOrThrow({ where: { id: sent.id } })).status).toBe('acknowledged')
  })

  it('the database allows one live posting per remittance claim and refuses a remittance line that lies about balancing', async () => {
    const posting = await prisma.paymentPosting.findFirstOrThrow({ where: { status: 'posted' } })
    await expect(prisma.paymentPosting.create({ data: { remittanceId: posting.remittanceId, remittanceClaimId: posting.remittanceClaimId, status: 'posted' } })).rejects.toThrow(/PaymentPosting_once_key|Unique constraint/)
    const rc = await prisma.remittanceClaim.findFirstOrThrow()
    await expect(prisma.remittanceLine.create({ data: { remittanceClaimId: rc.id, code: 'X', lineControlNumber: 'L99', chargeMinor: 1000n, paidMinor: 500n, adjustmentsTotalMinor: 100n, conservationOk: true } })).rejects.toThrow(/RemittanceLine_conservation/)
  })

  it('a payer takeback reverses the earlier posting entry for entry', async () => {
    const entry = await makeEntry(0, { dateOfService: new Date('2026-11-03T00:00:00Z') })
    const sent = await toSent([entry.id])
    const lines = sent.lines.map(l => ({ lineControlNumber: l.lineControlNumber, feeMinor: l.feeMinor, code: 'X' }))
    await importEraBody(prisma as never, eraFor({ patientControlNumber: sent.patientControlNumber, lines }, { trace: `TRC-${uniqueKey('p')}`, paid: f => (f * 7n) / 10n, writeOff: f => (f * 3n) / 10n }), { externalId: uniqueKey('tx'), adapterKey: 'stedi' })
    const mid = await prisma.ledgerEntry.aggregate({ where: { claimId: sent.id }, _sum: { amountMinor: true } })
    expect(mid._sum.amountMinor).toBe(-sent.lines[0].feeMinor)
    // A reversal reports the original amounts negated, so every line still balances.
    const negated = lines.map(l => ({ ...l, feeMinor: -l.feeMinor }))
    const back: any = eraFor({ patientControlNumber: sent.patientControlNumber, lines: negated }, { trace: `TRC-${uniqueKey('r')}`, paid: f => (f * 7n) / 10n, writeOff: f => (f * 3n) / 10n, status: '22' })
    const result = await importEraBody(prisma as never, back, { externalId: uniqueKey('tx'), adapterKey: 'stedi' })
    expect(result.results[0]).toMatchObject({ status: 'posted', claimsPosted: 1, claimsHeld: 0 })
    const claim = await prisma.claim.findUniqueOrThrow({ where: { id: sent.id } })
    expect(claim.recouped).toBe(true)
    const net = await prisma.ledgerEntry.aggregate({ where: { claimId: sent.id }, _sum: { amountMinor: true } })
    expect(net._sum.amountMinor).toBe(0n)
    const reversals = await prisma.ledgerEntry.findMany({ where: { claimId: sent.id, kind: 'reversal' } })
    expect(reversals).toHaveLength(2)
    expect((await prisma.paymentPosting.findMany({ where: { remittanceClaim: { claimId: sent.id } }, orderBy: { createdAt: 'asc' } })).map(p => p.status)).toEqual(['reversed', 'posted'])
  })

  it('r1 M1: a second takeback matches its own original, never an earlier takeback, and with nothing to reverse it is refused', async () => {
    const entry = await makeEntry(3, { dateOfService: new Date('2026-11-06T00:00:00Z') })
    const sent = await toSent([entry.id])
    const lines = sent.lines.map(l => ({ lineControlNumber: l.lineControlNumber, feeMinor: l.feeMinor, code: 'X' }))
    const negated = lines.map(l => ({ ...l, feeMinor: -l.feeMinor }))
    const pay = () => eraFor({ patientControlNumber: sent.patientControlNumber, lines }, { trace: `TRC-${uniqueKey('p')}`, paid: f => (f * 7n) / 10n, writeOff: f => (f * 3n) / 10n })
    const back = () => eraFor({ patientControlNumber: sent.patientControlNumber, lines: negated }, { trace: `TRC-${uniqueKey('r')}`, paid: f => (f * 7n) / 10n, writeOff: f => (f * 3n) / 10n, status: '22' })
    const net = async () => (await prisma.ledgerEntry.aggregate({ where: { claimId: sent.id }, _sum: { amountMinor: true } }))._sum.amountMinor ?? 0n
    const fee = sent.lines[0].feeMinor
    await importEraBody(prisma as never, pay(), { externalId: uniqueKey('tx'), adapterKey: 'stedi' })
    expect(await net()).toBe(-fee)
    // a second ordinary payment on a claim already paid is held, not posted
    const twice = await importEraBody(prisma as never, pay(), { externalId: uniqueKey('tx'), adapterKey: 'stedi' })
    expect(twice.results[0]).toMatchObject({ status: 'exception', claimsPosted: 0 })
    expect(await net()).toBe(-fee)
    // first takeback reverses the payment
    const first = await importEraBody(prisma as never, back(), { externalId: uniqueKey('tx'), adapterKey: 'stedi' })
    expect(first.results[0]).toMatchObject({ status: 'posted', claimsPosted: 1 })
    expect(await net()).toBe(0n)
    // second takeback: nothing left to reverse, so it is refused (held), and nothing moves
    const second = await importEraBody(prisma as never, back(), { externalId: uniqueKey('tx'), adapterKey: 'stedi' })
    expect(second.results[0]).toMatchObject({ status: 'exception', claimsPosted: 0, claimsHeld: 1 })
    expect(await net()).toBe(0n)
    // the payer pays again, then takes that back: the takeback reverses the new payment, not the old takeback
    const again = await importEraBody(prisma as never, pay(), { externalId: uniqueKey('tx'), adapterKey: 'stedi' })
    expect(again.results[0]).toMatchObject({ status: 'posted', claimsPosted: 1 })
    expect(await net()).toBe(-fee)
    const third = await importEraBody(prisma as never, back(), { externalId: uniqueKey('tx'), adapterKey: 'stedi' })
    expect(third.results[0]).toMatchObject({ status: 'posted', claimsPosted: 1 })
    expect(await net()).toBe(0n)
    const postings = await prisma.paymentPosting.findMany({ where: { remittanceClaim: { claimId: sent.id } }, orderBy: { createdAt: 'asc' }, include: { entries: true, remittanceClaim: true } })
    // pay(reversed), takeback(posted, 2 reversals), pay(reversed), takeback(posted, 2 reversals)
    expect(postings.map(p => [p.status, p.remittanceClaim?.claimStatusCode, p.entries.length])).toEqual([['reversed', '1', 2], ['posted', '22', 2], ['reversed', '1', 2], ['posted', '22', 2]])
    // every reversal points at a distinct original entry
    const reversed = (await prisma.ledgerEntry.findMany({ where: { claimId: sent.id, kind: 'reversal' } })).map(e => e.reversesId)
    expect(new Set(reversed).size).toBe(reversed.length)
  })

  it('r1 B2: a trace that differs only in case, spaces or dashes is the same payment, and the database holds one per payer', async () => {
    const entry = await makeEntry(4, { dateOfService: new Date('2026-11-07T00:00:00Z') })
    const sent = await toSent([entry.id])
    const payerId = (await prisma.payer.findFirstOrThrow({ where: { name: 'Harbor Mutual Dental' } })).id
    const fee = sent.lines[0].feeMinor
    const base = uniqueKey('k').replace(/[^a-z0-9]/gi, '').toUpperCase()
    const eob = (trace: string) => run('enterManualEob', { payerId, traceNumber: trace, paymentDate: '2026-11-12', method: 'check', claims: [{ claimRef: sent.patientControlNumber, statusCode: '1', charge: `${fee / 100n}.${String(fee % 100n).padStart(2, '0')}`, paidMinor: (fee / 2n).toString(), lines: [{ lineControl: 'L01', code: 'X', chargeMinor: fee.toString(), paidMinor: (fee / 2n).toString(), adjustments: [{ group: 'CO', reason: '45', amountMinor: (fee - fee / 2n).toString() }] }] }] }, biller)
    expect(await eob(`CHK-${base}`)).toMatchObject({ status: 'posted', claimsPosted: 1 })
    for (const variant of [`chk-${base.toLowerCase()}`, ` CHK ${base} `, `CHK${base}`, `c.h.k-${base}`]) {
      expect(await eob(variant)).toMatchObject({ status: 'duplicate', claimsPosted: 0, duplicate: true })
    }
    expect((await prisma.ledgerEntry.aggregate({ where: { claimId: sent.id }, _sum: { amountMinor: true } }))._sum.amountMinor).toBe(-fee)
    const first = await prisma.remittance.findFirstOrThrow({ where: { traceNumber: `CHK-${base}` } })
    await expect(prisma.remittance.create({ data: { ref: uniqueKey('ERA'), payerId, source: 'manual_eob', traceNumber: `chk-${base.toLowerCase()}`, paymentMethod: 'check', status: 'posted' } })).rejects.toThrow(/Remittance_payer_trace_key|Unique constraint/)
    expect(first.status).toBe('posted')
  })

  it('r1 m1: a payment row cannot be rewritten or moved backwards at the database', async () => {
    const accountId = (await prisma.guarantorAccount.findFirstOrThrow()).id
    const pay = await prisma.payment.create({ data: { ref: uniqueKey('PAY'), accountId, patientId, locationId, amountMinor: 1000n, tender: 'cash', source: 'front_desk', status: 'initiated' } })
    await expect(prisma.payment.create({ data: { ref: uniqueKey('PAY'), accountId, patientId, locationId, amountMinor: 1000n, tender: 'cash', source: 'front_desk', status: 'succeeded' } })).rejects.toThrow(/Payment_starts_initiated/)
    await expect(prisma.payment.update({ where: { id: pay.id }, data: { amountMinor: 1n } })).rejects.toThrow(/Payment_frozen/)
    await expect(prisma.payment.update({ where: { id: pay.id }, data: { tender: 'card' } })).rejects.toThrow(/Payment_frozen/)
    await expect(prisma.payment.update({ where: { id: pay.id }, data: { accountId: null } })).rejects.toThrow(/Payment_frozen/)
    await prisma.payment.update({ where: { id: pay.id }, data: { providerIntentId: 'pi_x', status: 'requires_action' } })
    await expect(prisma.payment.update({ where: { id: pay.id }, data: { providerIntentId: 'pi_y' } })).rejects.toThrow(/Payment_frozen/)
    await expect(prisma.payment.update({ where: { id: pay.id }, data: { status: 'initiated' } })).rejects.toThrow(/Payment_status_forward_only/)
    await prisma.payment.update({ where: { id: pay.id }, data: { status: 'failed' } })
    await expect(prisma.payment.update({ where: { id: pay.id }, data: { status: 'unknown' } })).rejects.toThrow(/Payment_status_forward_only/)
  })

  it('a denied line opens a denial once, mapped to a work category; a worker can appeal it and record the outcome', async () => {
    const entry = await makeEntry(1, { dateOfService: new Date('2026-11-04T00:00:00Z') })
    const sent = await toSent([entry.id])
    const lines = sent.lines.map(l => ({ lineControlNumber: l.lineControlNumber, feeMinor: l.feeMinor, code: 'X' }))
    const denied: any = eraFor({ patientControlNumber: sent.patientControlNumber, lines }, { trace: `TRC-${uniqueKey('d')}`, paid: () => 0n, writeOff: () => 0n, status: '4' })
    const line = denied.transactions[0].detailInfo[0].paymentInfo[0].serviceLines[0]
    line.serviceAdjustments = [{ claimAdjustmentGroupCode: 'CO', adjustmentReasonCode1: '151', adjustmentAmount1: `${sent.lines[0].feeMinor / 100n}.${String(sent.lines[0].feeMinor % 100n).padStart(2, '0')}` }]
    await importEraBody(prisma as never, denied, { externalId: uniqueKey('tx'), adapterKey: 'stedi' })
    const denial = await prisma.denial.findFirstOrThrow({ where: { claimId: sent.id } })
    expect(denial).toMatchObject({ carc: '151', preventableClass: 'frequency', status: 'open' })
    const started = await run('startDenialWork', { denialId: denial.id, expectedVersion: denial.version }, biller)
    expect(started.status).toBe('working')
    const filed = await run('fileAppeal', { denialId: denial.id, expectedVersion: denial.version + 1, letter: 'The earlier cleaning was more than six months ago and the plan allows two a year.', via: 'portal' }, biller)
    expect(filed.level).toBe(1)
    expect((await prisma.claim.findUniqueOrThrow({ where: { id: sent.id } })).status).toBe('appealed')
    const appeal = await prisma.appeal.findFirstOrThrow({ where: { denialId: denial.id } })
    await run('recordAppealOutcome', { appealId: appeal.id, expectedVersion: appeal.version, outcome: 'upheld' }, biller)
    expect((await prisma.claim.findUniqueOrThrow({ where: { id: sent.id } })).status).toBe('appeal_decided')
  })

  it('the poll lists remittances, skips ones already applied, and leaves a one-day overlap', async () => {
    const calls: string[] = []
    const poll = (async (url: string) => { calls.push(String(url)); return new Response(JSON.stringify({ items: [] }), { status: 200 }) }) as unknown as typeof fetch
    const first = await pollRemittances(prisma as never, new Date('2026-11-10T12:00:00Z'), { fetch: poll }, { minIntervalMs: 0 })
    expect(first.polled).toBe(0)
    const second = await pollRemittances(prisma as never, new Date('2026-11-10T12:05:00Z'), { fetch: poll })
    expect(second).toMatchObject({ skipped: 'not_due' })
    await pollRemittances(prisma as never, new Date('2026-11-10T13:00:00Z'), { fetch: poll }, { minIntervalMs: 0 })
    const since = new URL(calls[calls.length - 1]).searchParams.get('startDateTime')!
    expect(Date.parse(since)).toBeLessThanOrEqual(Date.parse('2026-11-10T12:00:00Z') - 86_400_000)
  })

  it('hand-entered explanations of benefits go through the same posting code', async () => {
    const entry = await makeEntry(2, { dateOfService: new Date('2026-11-05T00:00:00Z') })
    const sent = await toSent([entry.id])
    const fee = sent.lines[0].feeMinor
    const result = await run('enterManualEob', { payerId: (await prisma.payer.findFirstOrThrow({ where: { name: 'Harbor Mutual Dental' } })).id, traceNumber: `CHK-${uniqueKey('c')}`, paymentDate: '2026-11-12', method: 'check', claims: [{ claimRef: sent.patientControlNumber, payerClaimNumber: 'PCN-9', statusCode: '1', charge: `${fee / 100n}.${String(fee % 100n).padStart(2, '0')}`, paidMinor: (fee / 2n).toString(), lines: [{ lineControl: 'L01', code: 'X', chargeMinor: fee.toString(), paidMinor: (fee / 2n).toString(), adjustments: [{ group: 'CO', reason: '45', amountMinor: (fee - fee / 2n).toString() }] }] }] }, biller)
    expect(result).toMatchObject({ status: 'posted', claimsPosted: 1 })
  })
})
