#!/usr/bin/env node
/*
 * Phase 4 review r1 attacks, re-run against a live deploy. Prints only `CHECK PASS|FAIL <name>` lines and a summary; never
 * prints PHI, credentials or row contents.
 *
 *   DURL=https://dental.openship.org LOGINS=~/…/dental.json node scripts/attack-p4-r1.mjs [--write]
 *
 * LOGINS is a JSON file { email, password, staff: [{ name, email, password }] }: the owner, plus Kerry (Front Office, Tampa only)
 * and Jenna (Hygienist, Tampa). Read checks need no flag. `--write` also replays the reviewer's money attacks (B2 trace variants,
 * M1 second takeback); every one of them must be refused, so they post nothing — but each attempt is stored as a duplicate or
 * an exception remittance, which is why it is opt-in.
 */
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const BASE = process.env.DURL ?? 'https://dental.openship.org'
const logins = JSON.parse(readFileSync(String(process.env.LOGINS ?? '').replace(/^~/, process.env.HOME ?? ''), 'utf8'))
const WRITE = process.argv.includes('--write')
const STP = 'seed_loc_stp'
const TPA = 'seed_loc_tpa'
const STP_PATIENTS = ['seed_pt_0008', 'seed_pt_0009']
const STP_ACCOUNT = 'seed_acc_seed_gtr_0008'

let passed = 0
let failed = 0
const check = (name, ok) => { if (ok) passed += 1; else failed += 1; console.log(`CHECK ${ok ? 'PASS' : 'FAIL'} ${name}`) }

const person = who => {
  if (who === 'admin') return { email: logins.email, password: logins.password }
  const s = logins.staff.find(x => x.name.toLowerCase().includes(who))
  if (!s) throw new Error(`no login for ${who}`)
  return s
}

const jars = {}
async function call(path, body, who) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'apollo-require-preflight': 'true', cookie: jars[who] ?? '' }, body: JSON.stringify(body) })
  const set = r.headers.getSetCookie?.() ?? []
  if (set.length) jars[who] = set.map(c => c.split(';')[0]).join('; ')
  const text = await r.text()
  const line = text.split('\n').find(l => l.startsWith('data:'))
  try { return JSON.parse(line ? line.slice(5) : text) } catch { return { raw: text.slice(0, 200), status: r.status } }
}
const gql = (query, variables, who) => call('/api/graphql', { query, variables }, who)
async function login(who) {
  const { email, password } = person(who)
  const r = await gql('mutation($e:String!,$p:String!){authenticateUserWithPassword(email:$e,password:$p){__typename}}', { e: email, p: password }, who)
  return r?.data?.authenticateUserWithPassword?.__typename === 'UserAuthenticationWithPasswordSuccess'
}

const rows = r => (r?.data ? Object.values(r.data) : [])
const noErrors = r => !r?.errors?.length && !!r?.data
const deny = (r, test) => noErrors(r) && test(r.data)

async function readChecks(who) {
  const Q = (q, v) => gql(q, v, who)
  const stpWhere = `{ location: { id: { equals: "${STP}" } } }`
  check(`${who}: ledgerEntries at St. Petersburg = []`, deny(await Q(`{ a: ledgerEntries(where: ${stpWhere}) { id } }`), d => d.a.length === 0))
  check(`${who}: ledgerEntriesCount at St. Petersburg = 0`, deny(await Q(`{ c: ledgerEntriesCount(where: ${stpWhere}) }`), d => d.c === 0))
  for (const pt of STP_PATIENTS) {
    check(`${who}: ledgerEntries for out-of-scope patient ${pt} = []`, deny(await Q(`{ a: ledgerEntries(where: { patient: { id: { equals: "${pt}" } } }, orderBy: [{ amountMinor: desc }]) { id } c: ledgerEntriesCount(where: { patient: { id: { equals: "${pt}" } } }) }`), d => d.a.length === 0 && d.c === 0))
  }
  check(`${who}: every visible ledger entry is at Tampa and about a visible patient`, deny(await Q(`{ a: ledgerEntries(take: 500) { location { id } patient { id homeLocation { id } } } }`), d => d.a.every(e => e.location?.id === TPA && !STP_PATIENTS.includes(e.patient?.id ?? ''))))
  check(`${who}: OR / alias query for St. Petersburg rows = []`, deny(await Q(`{ x: ledgerEntries(where: { OR: [${stpWhere}, { patient: { homeLocation: { id: { equals: "${STP}" } } } }] }) { id } y: ledgerEntries(where: { patient: { id: { in: ${JSON.stringify(STP_PATIENTS)} } } }) { id } }`), d => d.x.length === 0 && d.y.length === 0))
  check(`${who}: guarantorAccounts ${STP_ACCOUNT} (balance) = []`, deny(await Q(`{ a: guarantorAccounts(where: { id: { equals: "${STP_ACCOUNT}" } }) { id balanceCache } one: guarantorAccount(where: { id: "${STP_ACCOUNT}" }) { id } }`), d => d.a.length === 0 && d.one === null))
  check(`${who}: guarantor account reached through a relation is not St. Petersburg`, deny(await Q(`{ a: ledgerEntries(take: 500) { account { id } } p: payments(take: 100) { account { id } } }`), d => [...d.a, ...d.p].every(e => e.account?.id !== STP_ACCOUNT)))
  check(`${who}: adjustmentRequests / ledgerNotes at St. Petersburg = 0`, deny(await Q(`{ a: adjustmentRequestsCount(where: ${stpWhere}) n: ledgerNotesCount(where: { entry: ${stpWhere} }) }`), d => d.a === 0 && d.n === 0))
  check(`${who}: remittances only for my claims`, deny(await Q(`{ r: remittances(take: 100) { claims { claim { location { id } } } duplicateOf { claims { claim { location { id } } } } } s: remittancesCount(where: { claims: { some: { claim: ${stpWhere} } } }) }`), d => d.s === 0 && d.r.every(x => [...x.claims, ...(x.duplicateOf?.claims ?? [])].every(c => c.claim?.location?.id === TPA))))
  check(`${who}: payments, statements, refunds, plans, deposits at St. Petersburg = 0`, deny(await Q(`{ a: paymentsCount(where: ${stpWhere}) b: statementsCount(where: ${stpWhere}) c: refundsCount(where: ${stpWhere}) d: paymentPlansCount(where: ${stpWhere}) e: depositBatchesCount(where: ${stpWhere}) f: depositLinesCount(where: { batch: ${stpWhere} }) }`), d => Object.values(d).every(n => n === 0)))
  check(`${who}: memberships at St. Petersburg = 0`, deny(await Q(`{ a: patientMembershipsCount(where: ${stpWhere}) b: membershipLedgerEntriesCount(where: { membership: ${stpWhere} }) }`), d => d.a === 0 && d.b === 0))
  check(`${who}: day/period closes and restatements at St. Petersburg = 0`, deny(await Q(`{ a: dayClosesCount(where: ${stpWhere}) b: periodClosesCount(where: ${stpWhere}) c: restatementsCount(where: { periodClose: ${stpWhere} }) }`), d => d.a === 0 && d.b === 0 && d.c === 0))
  check(`${who}: claims and their children at St. Petersburg = 0`, deny(await Q(`{ a: claimsCount(where: ${stpWhere}) b: remittanceClaimsCount(where: { claim: ${stpWhere} }) c: remittanceLinesCount(where: { remittanceClaim: { claim: ${stpWhere} } }) d: paymentPostingsCount(where: { remittanceClaim: { claim: ${stpWhere} } }) e: denialsCount(where: { claim: ${stpWhere} }) }`), d => Object.values(d).every(n => n === 0)))
  check(`${who}: credit balances / card tokens for the St. Petersburg family = 0`, deny(await Q(`{ a: creditBalancesCount(where: { account: { id: { equals: "${STP_ACCOUNT}" } } }) b: paymentMethodTokensCount(where: { account: { id: { equals: "${STP_ACCOUNT}" } } }) }`), d => d.a === 0 && d.b === 0))
  // MCP queryData takes no filter, only a bounded page, so it is checked on the lists small enough to fit in one page.
  for (const [operation, fields] of [['guarantorAccounts', 'id'], ['guarantorLinks', 'id patient { id }'], ['ledgerEntries', 'id location { id } patient { id }'], ['remittances', 'id claims { claim { location { id } } }']]) {
    const mcp = await call('/api/mcp-transport/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'queryData', arguments: { operation, fields, take: 100 } } }, who)
    const text = JSON.stringify(mcp)
    check(`${who}: MCP queryData ${operation} answered with no St. Petersburg row`, !!mcp?.result && !mcp.result.isError && !text.includes(STP) && !text.includes(STP_ACCOUNT) && !STP_PATIENTS.some(p => text.includes(p)))
  }
}

const EOB = 'mutation($p:ID!,$t:String!,$d:String,$m:String!,$c:[JSON!]!,$k:String!){ r: enterManualEob(payerId:$p, traceNumber:$t, paymentDate:$d, method:$m, claims:$c, idempotencyKey:$k) }'
const CLAIM1 = { claimRef: 'CLM-2026-000001', payerClaimNumber: 'HMD-78012', statusCode: '1', charge: '280.00', paidMinor: '12450', lines: [
  { lineControl: 'L01', code: 'D0150', chargeMinor: '11500', paidMinor: '8050', adjustments: [{ group: 'CO', reason: '45', amountMinor: '1150' }, { group: 'PR', reason: '2', amountMinor: '2300' }] },
  { lineControl: 'L02', code: 'D0274', chargeMinor: '4500', paidMinor: '0', adjustments: [{ group: 'CO', reason: '119', amountMinor: '4500' }] },
  { lineControl: 'L03', code: 'D1110', chargeMinor: '12000', paidMinor: '4400', adjustments: [{ group: 'CO', reason: '45', amountMinor: '2000' }, { group: 'PR', reason: '1', amountMinor: '5600' }] }] }
const net = async () => {
  const r = await gql('{ c: claims(where: { ref: { equals: "CLM-2026-000001" } }) { id } }', {}, 'admin')
  const id = r?.data?.c?.[0]?.id
  const e = await gql('query($id: ID!) { e: ledgerEntries(where: { claim: { id: { equals: $id } } }, take: 500) { amountMinor } }', { id }, 'admin')
  return (e?.data?.e ?? []).reduce((s, x) => s + BigInt(x.amountMinor), 0n)
}
const eob = (trace, claims) => gql(EOB, { p: 'seed_payer_harbor', t: trace, d: '2026-11-06', m: 'check', c: claims, k: `atk-${randomUUID()}` }, 'admin')
const result = r => r?.data?.r ?? null
const refused = r => !!r?.errors?.length || ['duplicate', 'exception'].includes(result(r)?.status)

async function writeChecks() {
  const before = await net()
  check('kerry: enterManualEob is refused (no permission)', !!(await gql(EOB, { p: 'seed_payer_harbor', t: 'CHK-71502', d: '2026-11-06', m: 'check', c: [CLAIM1], k: `atk-${randomUUID()}` }, 'kerry'))?.errors?.length)
  for (const trace of ['CHK-71502', ' CHK-71502 ', 'chk-71502', 'Chk 71502', 'CHK71502', 'chk_71502']) {
    const r = await eob(trace, [CLAIM1])
    check(`B2: trace ${JSON.stringify(trace)} is a duplicate of the posted payment`, result(r)?.status === 'duplicate' && result(r)?.claimsPosted === 0)
  }
  check('B2: a fresh trace on an already-paid claim does not post a second payment', refused(await eob(`CHK-ATK-${randomUUID().slice(0, 8)}`, [CLAIM1])))
  const tb = { claimRef: 'CLM-2026-000001', payerClaimNumber: 'HMD-78012', statusCode: '22', charge: '280.00', paidMinor: '-12450', lines: [] }
  // A real takeback on CLM-2026-000001 would correctly reverse ERA-5's live payment, so it is not replayed on a deploy;
  // the second-takeback case (M1) is proved in phase4.claims.db.test.ts. Here: a takeback with nothing to reverse.
  const bad = await eob(`CHK-ATK-TB-${randomUUID().slice(0, 8)}`, [{ ...tb, claimRef: 'CLM-2026-999999' }])
  check('M1: a takeback for a claim with nothing to reverse is not reported posted', refused(bad) && result(bad)?.claimsPosted !== 1)
  const nonconserving = JSON.parse(JSON.stringify(CLAIM1)); nonconserving.lines[0].paidMinor = '8051'
  check('a remittance line that does not balance posts nothing', refused(await eob(`CHK-ATK-NC-${randomUUID().slice(0, 8)}`, [nonconserving])))
  check('the claim ledger did not move', (await net()) === before)
}

const main = async () => {
  for (const who of ['admin', 'kerry', 'jenna']) check(`login ${who}`, await login(who))
  for (const who of ['kerry', 'jenna']) await readChecks(who)
  if (WRITE) await writeChecks()
  console.log(`CHECKS ${passed} passed, ${failed} failed`)
  process.exitCode = failed ? 1 : 0
}
main().catch(error => { console.log(`CHECK FAIL run: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1 })
