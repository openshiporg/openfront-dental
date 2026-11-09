import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { graphql } from 'graphql'
import { getContext } from '@keystone-6/core/context'
import * as PrismaModule from '@prisma/client'
import { NEVER_DEFAULT, permissionNames, type Permission } from '../access'

/*
 * Phase 4 review r1, B1, as the reviewer ran it: a Front Office user who works only in Tampa read St. Petersburg ledger entries,
 * a St. Petersburg family's balance, and every remittance. Every money list is now filtered by office and by the patient (and
 * family) it is about, on lists, counts, relation fields and OR/alias queries alike. MCP queryData runs the same GraphQL session.
 */

const TPA = 'seed_loc_tpa'
const STP = 'seed_loc_stp'
const FRONT: Permission[] = ['canAccessDashboard', 'canSeeOtherPeople', 'canReadSchedule', 'canReadDemographics', 'canManagePatients', 'canManageSchedule', 'canMessagePatients', 'canTakePayments', 'canVerifyBenefits', 'canReadInsurance', 'canReadLedger', 'canCloseDay']
const sessionOf = (granted: Permission[], locations: string[] | 'all') => ({
  itemId: 'money-scope-user', listKey: 'User',
  data: {
    name: 'Kerry Walsh', email: 'kerry@test.local', kind: 'staff', accessExpiresAt: null,
    role: { id: 'r', name: 'Front Office', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])), canAccessAllLocations: locations === 'all' },
    assignments: locations === 'all' ? [] : locations.map(id => ({ location: { id }, role: null, startsOn: null, endsOn: null })),
  },
})

const TEST_DATABASE_URL = process.env.DENTAL_TEST_DATABASE_URL ?? ''
const hasTestDatabase = /^postgres(ql)?:\/\//.test(TEST_DATABASE_URL) && /[?&]schema=vitest\b/.test(TEST_DATABASE_URL)

describe('money lists are scoped to my offices and my patients (B1)', { skip: !hasTestDatabase }, () => {
  let context: any
  let prisma: any
  const ids: Record<string, string> = {}
  before(async () => {
    const url = new URL(TEST_DATABASE_URL); url.searchParams.set('connection_limit', '3')
    process.env.DATABASE_URL = url.toString()
    process.env.SESSION_SECRET ||= 'dental-node-test-session-secret-0123456789abcdef'
    process.env.DENTAL_SECRET_KEY ||= Buffer.alloc(32, 7).toString('base64')
    const config = (await import('../index')).default
    context = getContext(config, PrismaModule)
    prisma = context.prisma
    const { resetDatabase } = await import('../../../tests/helpers/db')
    await resetDatabase(prisma)
    const { loadPracticeSetup } = await import('../mutations/setup')
    const owner = { session: sessionOf(permissionNames.filter(p => !NEVER_DEFAULT.includes(p)), 'all'), prisma }
    const admin = await prisma.user.create({ data: { name: 'owner', email: `owner-${Date.now()}@test.local`, password: 'x'.repeat(60) } })
    owner.session.itemId = admin.id
    await loadPracticeSetup(null, { idempotencyKey: `setup-${Date.now()}` }, owner)
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')
    const patient = async (name: string, home: string) => {
      const p = await prisma.patient.create({ data: { chartNumber: `SCOPE-${name}-${Date.now()}`, firstName: name, lastName: 'Scope', dateOfBirth: new Date('1980-01-01T00:00:00Z'), sexAssignedAtBirth: 'unknown', homeLocationId: home, status: 'active' } })
      const g = await prisma.guarantor.create({ data: { patientId: p.id } })
      await prisma.guarantorLink.create({ data: { patientId: p.id, guarantorId: g.id, relationship: 'self', status: 'active' } })
      const a = await prisma.guarantorAccount.create({ data: { ref: `ACC-${name}-${Date.now()}`, guarantorId: g.id, balanceCache: { totalMinor: '5000' } } })
      return { patient: p.id, guarantor: g.id, account: a.id }
    }
    const entry = (who: { patient: string; account: string }, location: string) => prisma.ledgerEntry.create({ data: { accountId: who.account, patientId: who.patient, kind: 'finance_charge', amountMinor: 5000n, currencyCode: 'USD', businessDate: today, originalBusinessDate: today, locationId: location, memo: 'scope test' } })
    const tampa = await patient('Tampa', TPA)
    const pete = await patient('Pete', STP)
    ids.tampaAccount = tampa.account; ids.peteAccount = pete.account; ids.petePatient = pete.patient
    ids.tampaEntry = (await entry(tampa, TPA)).id
    ids.peteEntry = (await entry(pete, STP)).id
    // a St. Petersburg patient seen once at Tampa: the row is at Tampa, but the patient is not mine
    ids.peteAtTampa = (await entry(pete, TPA)).id
    await prisma.ledgerNote.create({ data: { entryId: ids.peteEntry, text: 'note on a St. Pete entry' } })
    await prisma.adjustmentRequest.create({ data: { accountId: pete.account, patientId: pete.patient, locationId: STP, amountMinor: 100n, reason: 'scope', status: 'requested' } }).catch(() => undefined)
  })
  after(async () => { await context?.prisma?.$disconnect() })

  const run = async (session: unknown, source: string) => {
    const ctx = context.withSession(session)
    const r = await graphql({ schema: ctx.graphql.schema, source, contextValue: ctx })
    assert.equal(r.errors, undefined, String(r.errors?.[0]?.message))
    return JSON.parse(JSON.stringify(r.data)) as any
  }
  const kerry = () => sessionOf(FRONT, [TPA])

  it('ledger entries: no St. Petersburg row, no row about a St. Petersburg patient, in lists, counts, OR and aliases', async () => {
    const d = await run(kerry(), `{
      all: ledgerEntries(take: 500) { id location { id } patient { id } }
      n: ledgerEntriesCount
      stp: ledgerEntries(where: { location: { id: { equals: "${STP}" } } }) { id }
      stpN: ledgerEntriesCount(where: { location: { id: { equals: "${STP}" } } })
      pt: ledgerEntries(where: { patient: { id: { equals: "${ids.petePatient}" } } }) { id }
      or: ledgerEntries(where: { OR: [{ id: { equals: "${ids.peteEntry}" } }, { id: { equals: "${ids.peteAtTampa}" } }] }) { id }
      one: ledgerEntry(where: { id: "${ids.peteEntry}" }) { id }
    }`)
    const seen = new Set(d.all.map((e: any) => e.id))
    assert.ok(seen.has(ids.tampaEntry))
    assert.ok(!seen.has(ids.peteEntry) && !seen.has(ids.peteAtTampa))
    assert.ok(d.all.every((e: any) => e.location?.id === TPA && e.patient?.id !== ids.petePatient))
    assert.equal(d.n, d.all.length)
    const total = (await run(sessionOf(FRONT, 'all'), '{ ledgerEntriesCount }')).ledgerEntriesCount
    assert.ok(total >= d.n + 2)
    assert.deepEqual([d.stp, d.stpN, d.pt, d.or, d.one], [[], 0, [], [], null])
  })

  it('guarantor accounts and guarantors: a St. Petersburg family balance is not visible, by id, list, count or relation', async () => {
    const d = await run(kerry(), `{
      a: guarantorAccounts(where: { id: { equals: "${ids.peteAccount}" } }) { id balanceCache }
      n: guarantorAccountsCount
      one: guarantorAccount(where: { id: "${ids.peteAccount}" }) { id }
      viaEntry: ledgerEntries(take: 100) { account { id } }
      g: guarantorsCount
    }`)
    assert.deepEqual(d.a, [])
    assert.equal(d.one, null)
    assert.ok(d.n >= 1)
    assert.ok(d.viaEntry.every((e: any) => e.account?.id !== ids.peteAccount))
    const all = await run(sessionOf(FRONT, 'all'), `{ guarantorAccountsCount }`)
    assert.ok(all.guarantorAccountsCount > d.n, 'the all-locations reader sees more accounts')
  })

  it('notes, adjustments, closes, remittances and their children follow the same rule', async () => {
    const d = await run(kerry(), `{
      notes: ledgerNotesCount
      adj: adjustmentRequestsCount(where: { location: { id: { equals: "${STP}" } } })
      dc: dayClosesCount(where: { location: { id: { equals: "${STP}" } } })
      pc: periodClosesCount(where: { location: { id: { equals: "${STP}" } } })
      rs: restatementsCount(where: { periodClose: { location: { id: { equals: "${STP}" } } } })
      rem: remittancesCount(where: { claims: { some: { claim: { location: { id: { equals: "${STP}" } } } } } })
      pay: paymentsCount(where: { location: { id: { equals: "${STP}" } } })
    }`)
    assert.deepEqual(d, { notes: 0, adj: 0, dc: 0, pc: 0, rs: 0, rem: 0, pay: 0 })
  })

  it('a reader with every office still sees everything', async () => {
    const d = await run(sessionOf(FRONT, 'all'), `{ e: ledgerEntries(where: { id: { in: ["${ids.tampaEntry}", "${ids.peteEntry}", "${ids.peteAtTampa}"] } }) { id } notes: ledgerNotesCount a: guarantorAccount(where: { id: "${ids.peteAccount}" }) { id } }`)
    assert.equal(d.e.length, 3)
    assert.equal(d.notes, 1)
    assert.equal(d.a?.id, ids.peteAccount)
  })

  it('a reader with no office sees no money at all', async () => {
    const d = await run(sessionOf(FRONT, []), `{ a: ledgerEntriesCount b: guarantorAccountsCount c: remittancesCount d: paymentsCount }`)
    assert.deepEqual(d, { a: 0, b: 0, c: 0, d: 0 })
  })
})
