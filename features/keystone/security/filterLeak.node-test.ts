import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { graphql, parse, specifiedRules, validate } from 'graphql'
import { getContext } from '@keystone-6/core/context'
import * as PrismaModule from '@prisma/client'
import { permissionNames, type Permission } from '../access'
import { queryLimitsRule, MAX_QUERY_DEPTH } from './queryLimits'
import { buildSelection, SelectionError } from '../mcp/selection'

/*
 * Review r2 finding 2, as GraphQL, as the reviewer ran it: a Front Office reader (no canReadClinical) could not read
 * OutsideHistory.codeText or TreatmentPlan.title, but could filter and sort on them. Every hidden field is now neither
 * filterable nor orderable for a reader who cannot see it; lists are bounded; depth is bounded; MCP rebuilds selections.
 */

const FRONT: Permission[] = ['canAccessDashboard', 'canSeeOtherPeople', 'canReadSchedule', 'canReadDemographics', 'canManagePatients', 'canManageSchedule', 'canMessagePatients', 'canTakePayments', 'canVerifyBenefits', 'canReadInsurance', 'canReadLedger']
const sessionOf = (granted: Permission[]) => ({
  itemId: 'filter-leak-user', listKey: 'User',
  data: { name: 'Kerry Walsh', email: 'kerry@test.local', kind: 'staff', accessExpiresAt: null, role: { id: 'r', name: 'Front Office', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) }, assignments: [], allLocations: true },
})

// Needs the migrated scratch `vitest` schema (DENTAL_TEST_DATABASE_URL); skipped without it, never faked.
const TEST_DATABASE_URL = process.env.DENTAL_TEST_DATABASE_URL ?? ''
const hasTestDatabase = /^postgres(ql)?:\/\//.test(TEST_DATABASE_URL) && /[?&]schema=vitest\b/.test(TEST_DATABASE_URL)

describe('hidden fields cannot be filtered or sorted (GraphQL)', { skip: !hasTestDatabase }, () => {
  let context: any
  before(async () => {
    const url = new URL(TEST_DATABASE_URL); url.searchParams.set('connection_limit', '2')
    process.env.DATABASE_URL = url.toString()
    process.env.SESSION_SECRET ||= 'dental-node-test-session-secret-0123456789abcdef'
    const config = (await import('../index')).default
    context = getContext(config, PrismaModule)
  })
  after(async () => { await context?.prisma?.$disconnect() })

  const run = async (session: unknown, source: string) => {
    const ctx = context.withSession(session)
    return graphql({ schema: ctx.graphql.schema, source, contextValue: ctx })
  }
  const message = (r: any) => String(r.errors?.[0]?.message ?? '')

  for (const selection of [
    'outsideHistoriesCount(where: { codeText: { contains: "Seaside" } })',
    'outsideHistories(orderBy: { codeText: asc }, take: 5) { id }',
    'treatmentPlansCount(where: { title: { contains: "Clean" } })',
    'treatmentPlans(orderBy: { title: asc }, take: 5) { id }',
  ]) {
    it(`Front Office without clinical access: ${selection} is refused`, async () => {
      const r = await run(sessionOf(FRONT), `{ ${selection} }`)
      assert.ok(r.errors?.length, `expected a refusal, got ${JSON.stringify(r.data)}`)
      assert.match(message(r), /filter|order|Access denied|not allowed|Cannot query/i)
    })
  }

  it('a reader who can see the field can still filter and sort on it', async () => {
    const r = await run(sessionOf([...FRONT, 'canReadClinical']), '{ outsideHistoriesCount(where: { codeText: { contains: "Seaside" } }) outsideHistories(orderBy: { codeText: asc }, take: 1) { id } }')
    assert.equal(r.errors, undefined, message(r))
  })

  it('the hidden-field gate is the read gate: a field nobody may read is filterable by nobody', async () => {
    const lists = context.graphql.schema
    // memberIdHash is in the insurance tier; a reader with list access but without the tier cannot filter on it
    const noTier = await run(sessionOf(['canAccessDashboard', 'canVerifyBenefits'] as Permission[]), '{ subscribersCount(where: { memberIdLast4: { equals: "401A" } }) }')
    assert.ok(noTier.errors?.length, JSON.stringify(noTier.data))
    assert.ok(lists)
  })

  it('member ID secrets are never filterable', async () => {
    const r = await run(sessionOf([...permissionNames] as Permission[]), '{ subscribersCount(where: { memberIdSecret: { id: { equals: "x" } } }) }')
    assert.ok(r.errors?.length)
  })

  it('every list is bounded: take above maxTake is refused', async () => {
    const r = await run(sessionOf([...FRONT, 'canReadClinical']), '{ estimates(take: 100000) { id } }')
    assert.match(message(r), /maxTake|limit/i)
  })

  it('queries deeper than the limit fail validation', () => {
    const deep = `{ estimates(take: 1) { ${'coverage { verifications(take: 1) { '.repeat(6)} id ${'} } '.repeat(6)} } }`
    const errors = validate(context.graphql.schema, parse(deep), [...specifiedRules, queryLimitsRule])
    assert.match(errors.map(e => e.message).join(' '), new RegExp(`limit is ${MAX_QUERY_DEPTH}`))
  })

  it('MCP queryData: the reviewer\'s injection is refused, and selections are rebuilt with no arguments', () => {
    const schema = context.graphql.schema
    assert.throws(() => buildSelection(schema, 'outsideHistories', '__typename } a: outsideHistories(where:{codeText:{contains:"Seaside"}}, orderBy:{codeText:asc}) { id dateOfService'), SelectionError)
    assert.throws(() => buildSelection(schema, 'outsideHistories', 'id patient(where: {}) { id }'), SelectionError)
    assert.throws(() => buildSelection(schema, 'outsideHistories', 'id ...on OutsideHistory { codeText }'), SelectionError)
    assert.throws(() => buildSelection(schema, 'estimates', 'coverage { verifications { coverage { verifications { id } } } }'), /at most 3 levels/)
    assert.equal(buildSelection(schema, 'treatmentPlanVersions', 'id items { id }').selection, 'id items(take: 50) { id }')
  })
})
