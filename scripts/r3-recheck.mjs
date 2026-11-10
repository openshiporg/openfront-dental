// Phase 4 r3 narrow re-check (R3-1, R3-2, R3-5). Prints only `CHECK <name>: PASS/FAIL` lines; never row contents, PHI or credentials.
// Usage: R3_BASE=<url> R3_LOGINS=<json file { "<role>": { "email", "password" } }, kept outside the repo> node scripts/r3-recheck.mjs [r31-full|r31-live|r32|r35 ...]
//   r31-full  builds its own claim (claim, denial, appeal filed, then decided): local or QA databases only.
//   r31-live  the reviewer's case on live CLM-2026-000003 (appeal filed, still pending): a copy of the original ERA must be held;
//             anything that posts is taken back at once with an exact takeback, so balances end at baseline.
//   r32       relation filters through Restatement.entries and ChartEntry.ledgerEntry, as Tampa-only and St. Pete-only roles.
//   r35       the audit page as a role without audit access: link hidden, direct visit shows not-allowed, a bad item id is 404.
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'

const BASE = process.env.R3_BASE
const people = JSON.parse(fs.readFileSync(process.env.R3_LOGINS, 'utf8'))
const parts = process.argv.slice(2).length ? process.argv.slice(2) : ['r32', 'r35']
let pass = 0, fail = 0
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`CHECK ${name}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` (${detail})` : ''}`) }
const jars = {}
async function gql(who, query, variables = {}) {
  const r = await fetch(BASE + '/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json', 'apollo-require-preflight': 'true', cookie: jars[who] ?? '' }, body: JSON.stringify({ query, variables }) })
  const set = r.headers.getSetCookie?.() ?? []
  if (set.length) jars[who] = set.map(c => c.split(';')[0]).join('; ')
  return r.json().catch(() => ({ errors: [{ message: `HTTP ${r.status}` }] }))
}
const login = who => gql(who, 'mutation($e:String!,$p:String!){authenticateUserWithPassword(email:$e,password:$p){__typename}}', { e: people[who].email, p: people[who].password })
const key = () => 'r3c-' + randomUUID()
const op = async (who, name, args) => {
  const sig = Object.keys(args).map(k => `${k}: $${k}`).join(', ')
  const types = { claimId: 'ID!', patientId: 'ID!', coverageId: 'ID!', locationId: 'ID!', chartEntryIds: '[ID!]', expectedVersion: 'Int!', denialId: 'ID!', appealId: 'ID!', letter: 'String!', via: 'String!', outcome: 'String!', payerId: 'ID!', traceNumber: 'String!', paymentDate: 'String', method: 'String!', claims: '[JSON!]!' }
  const decl = Object.keys(args).map(k => `$${k}: ${types[k]}`).join(', ')
  const r = await gql(who, `mutation(${decl}, $idempotencyKey: String!) { r: ${name}(${sig}, idempotencyKey: $idempotencyKey) }`, { ...args, idempotencyKey: key() })
  if (r.errors?.length) return { error: r.errors[0].extensions?.code ?? 'ERROR', message: String(r.errors[0].message).slice(0, 120) }
  return r.data.r
}
const money = n => `${n / 100n}.${String(n % 100n).padStart(2, '0')}`

// ---------- R3-1 ----------
const eobClaim = (ref, lines, statusCode = '1') => {
  const charge = lines.reduce((s, l) => s + l.charge, 0n)
  const paid = lines.reduce((s, l) => s + l.paid, 0n)
  return { claimRef: ref, statusCode, charge: money(charge), paidMinor: String(paid), lines: lines.map(l => ({ lineControl: l.lc, code: l.code, chargeMinor: String(l.charge), paidMinor: String(l.paid), adjustments: l.adj.map(([group, reason, amount]) => ({ group, reason, amountMinor: String(amount) })) })) }
}
const takeback = (ref, paid, charge) => ({ claimRef: ref, statusCode: '22', charge: money(charge), paidMinor: String(-paid), lines: [] })
const eob = async (payerId, trace, claim) => op('owner', 'enterManualEob', { payerId, traceNumber: trace, paymentDate: '2026-11-10', method: 'check', claims: [claim] })
const balanceOf = async patientId => {
  // the family account the patient's entries post to: its cached balance against the sum of all of its entries
  const d = await gql('owner', 'query($p: ID!) { ledgerEntries(where: { patient: { id: { equals: $p } } }, take: 1) { account { id balanceCache } } }', { p: patientId })
  const account = d.data?.ledgerEntries?.[0]?.account
  if (!account) return { sum: 0n, cache: null }
  const all = await gql('owner', 'query($a: ID!) { ledgerEntries(where: { account: { id: { equals: $a } } }, take: 1000) { amountMinor } }', { a: account.id })
  const sum = (all.data?.ledgerEntries ?? []).reduce((s, e) => s + BigInt(e.amountMinor), 0n)
  return { sum, cache: account.balanceCache?.totalMinor ?? null }
}
const claimLedger = async claimId => ((await gql('owner', 'query($c: ID!) { ledgerEntries(where: { claim: { id: { equals: $c } } }, take: 1000) { amountMinor } }', { c: claimId })).data?.ledgerEntries ?? []).reduce((s, e) => s + BigInt(e.amountMinor), 0n)
const livePayments = async claimId => (await gql('owner', 'query($c: ID!) { paymentPostings(where: { claim: { id: { equals: $c } }, kind: { equals: "payment" }, status: { equals: "posted" } }) { id round paidMinor } }', { c: claimId })).data?.paymentPostings ?? []

async function r31Full() {
  await login('owner')
  const harbor = (await gql('owner', '{ payers(where: { name: { equals: "Harbor Mutual Dental" } }) { id } }')).data?.payers?.[0]?.id
  // a Tampa patient with active primary coverage and two posted, unclaimed procedures
  const cov = (await gql('owner', '{ coverages(where: { ordinal: { equals: "primary" }, status: { equals: "active" } }, take: 20) { id patient { id homeLocation { id } } } }')).data?.coverages ?? []
  // fresh billable work: complete two planned procedures per covered patient (QA databases only; a repeat run would otherwise run out)
  const provider = (await gql('owner', '{ providerProfiles(where: { isActive: { equals: true } }, take: 1) { id } }')).data?.providerProfiles?.[0]?.id
  for (const c of cov) {
    const planned = (await gql('owner', 'query($p: ID!, $l: ID!) { chartEntries(where: { patient: { id: { equals: $p } }, location: { id: { equals: $l } }, kind: { equals: "procedure" }, status: { in: ["planned", "accepted"] } }, take: 2) { id version } }', { p: c.patient.id, l: c.patient.homeLocation.id })).data?.chartEntries ?? []
    if (planned.length < 2) continue
    for (const e of planned) await gql('owner', 'mutation($c: ID!, $v: Int!, $pr: ID!, $k: String!) { completeProcedure(chartEntryId: $c, expectedVersion: $v, providerId: $pr, idempotencyKey: $k) }', { c: e.id, v: e.version, pr: provider, k: key() })
  }
  // try candidates until one claim is accepted by the (sandbox) clearinghouse
  const claimQ = 'query($c: ID!) { claim(where: { id: $c }) { id ref status version patientControlNumber lines(orderBy: { lineControlNumber: asc }) { lineControlNumber feeMinor } } }'
  let claim = null, patientId = null
  for (const c of cov) {
    const q = 'query($p: ID!, $l: ID!) { chartEntries(where: { patient: { id: { equals: $p } }, location: { id: { equals: $l } }, status: { equals: "posted" }, kind: { equals: "procedure" } }, take: 50) { id } claimLines(where: { claim: { patient: { id: { equals: $p } }, status: { not: { equals: "voided" } } } }, take: 500) { chartEntry { id } } }'
    const d = (await gql('owner', q, { p: c.patient.id, l: c.patient.homeLocation.id })).data
    const used = new Set((d?.claimLines ?? []).map(l => l.chartEntry?.id))
    const entries = (d?.chartEntries ?? []).filter(e => !used.has(e.id))
    if (entries.length < 2) continue
    const built = await op('owner', 'buildClaim', { patientId: c.patient.id, coverageId: c.id, locationId: c.patient.homeLocation.id, chartEntryIds: entries.slice(0, 2).map(e => e.id) })
    if (built?.error) { if (process.env.R3_DEBUG) console.log('build', built.error, built.message); continue }
    let cl = (await gql('owner', claimQ, { c: built.id })).data.claim
    await op('owner', 'scrubClaim', { claimId: cl.id, expectedVersion: cl.version })
    cl = (await gql('owner', claimQ, { c: built.id })).data.claim
    if (cl.status !== 'ready') await op('owner', 'overrideScrub', { claimId: cl.id, expectedVersion: cl.version, reason: 'r3 re-check' })
    cl = (await gql('owner', claimQ, { c: built.id })).data.claim
    await op('owner', 'releaseClaim', { claimId: cl.id, expectedVersion: cl.version })
    for (let i = 0; i < 20; i++) { cl = (await gql('owner', claimQ, { c: built.id })).data.claim; if (!['released', 'submitted'].includes(cl.status)) break; await new Promise(r => setTimeout(r, 1500)) }
    if (process.env.R3_DEBUG) console.log('candidate', cl.status, cl.lines.length)
    if (cl.status === 'acknowledged' && cl.lines.length === 2) { claim = cl; patientId = c.patient.id; break }
  }
  check('R3-1 setup: a two-line claim sent and acknowledged', !!harbor && !!claim)
  if (!claim) return
  const payer = (await gql('owner', 'query($c: ID!) { claim(where: { id: $c }) { coverage { subscriber { plan { payer { id } } } } } }', { c: claim.id })).data?.claim?.coverage?.subscriber?.plan?.payer?.id ?? harbor
  const [l1, l2] = claim.lines.map(l => ({ lc: l.lineControlNumber, charge: BigInt(l.feeMinor), code: 'X' }))
  // the original: line 1 denied (frequency, CO-151, a contractual write-off), line 2 paid 80% with a 20% contract write-off: both charges leave the balance
  const original = eobClaim(claim.patientControlNumber, [{ ...l1, paid: 0n, adj: [['CO', '151', l1.charge]] }, { ...l2, paid: (l2.charge * 8n) / 10n, adj: [['CO', '45', l2.charge - (l2.charge * 8n) / 10n]] }])
  const start = await balanceOf(patientId)
  const first = await eob(payer, `R3C-${randomUUID().slice(0, 8)}`, original)
  const afterFirst = await balanceOf(patientId)
  check('R3-1 original remittance posts once', first?.status === 'posted' && start.sum - afterFirst.sum === l1.charge + l2.charge, `${first?.status ?? first?.error} delta=${start.sum - afterFirst.sum} l1=${l1.charge} l2=${l2.charge}`)
  const denial = (await gql('owner', 'query($c: ID!) { denials(where: { claim: { id: { equals: $c } } }) { id version } }', { c: claim.id })).data?.denials?.[0]
  await op('owner', 'startDenialWork', { denialId: denial.id, expectedVersion: denial.version })
  const filed = await op('owner', 'fileAppeal', { denialId: denial.id, expectedVersion: denial.version + 1, letter: 'Re-check appeal letter.', via: 'portal' })
  check('R3-1 setup: appeal filed (pending)', !filed?.error, filed?.error ?? '')
  // byte-identical re-send of the original, new trace, appeal still pending: held, balance unchanged
  const copy1 = await eob(payer, `R3C-${randomUUID().slice(0, 8)}`, original)
  const afterCopy1 = await balanceOf(patientId)
  check('R3-1 identical re-send with a filed appeal is held', copy1?.status === 'exception' && afterCopy1.sum === afterFirst.sum, `${copy1?.status ?? copy1?.error} delta=${afterCopy1.sum - afterFirst.sum}`)
  const appeal = (await gql('owner', 'query($d: ID!) { appeals(where: { denial: { id: { equals: $d } } }) { id version } }', { d: denial.id })).data?.appeals?.[0]
  await op('owner', 'recordAppealOutcome', { appealId: appeal.id, expectedVersion: appeal.version, outcome: 'overturned' })
  // after the appeal is decided: the original copied again is still held
  const copy2 = await eob(payer, `R3C-${randomUUID().slice(0, 8)}`, original)
  const afterCopy2 = await balanceOf(patientId)
  check('R3-1 identical re-send after the appeal is decided is held', copy2?.status === 'exception' && afterCopy2.sum === afterFirst.sum, `${copy2?.status ?? copy2?.error}`)
  // the payer's genuine post-appeal payment for the overturned line: posts once
  const supplemental = () => eobClaim(claim.patientControlNumber, [{ ...l1, paid: (l1.charge * 8n) / 10n, adj: [['CO', '45', l1.charge - (l1.charge * 8n) / 10n]] }])
  const genuine = await eob(payer, `R3C-${randomUUID().slice(0, 8)}`, supplemental())
  const afterGenuine = await balanceOf(patientId)
  check('R3-1 genuine post-appeal payment posts', genuine?.status === 'posted' && afterCopy2.sum - afterGenuine.sum === l1.charge, `${genuine?.status ?? genuine?.error}`)
  const again = await eob(payer, `R3C-${randomUUID().slice(0, 8)}`, supplemental())
  const afterAgain = await balanceOf(patientId)
  check('R3-1 genuine post-appeal payment posts only once', again?.status === 'exception' && afterAgain.sum === afterGenuine.sum, `${again?.status ?? again?.error}`)
  check('R3-1 two live payments, one per adjudication', (await livePayments(claim.id)).length === 2)
  check('R3-1 cache = sum of ledger', String(afterAgain.sum) === String(afterAgain.cache), `${afterAgain.sum}/${afterAgain.cache}`)
}

async function r31Live() {
  // The reviewer's exact case on live: CLM-2026-000003 (one appeal filed, still pending), the original Harbor ERA (scripts/m3.mjs).
  await login('owner')
  const harbor = 'seed_payer_harbor'
  const ref = 'CLM-2026-000003'
  const claim = (await gql('owner', 'query($r: String!) { claims(where: { ref: { equals: $r } }) { id patient { id } } }', { r: ref })).data?.claims?.[0]
  if (!claim) return check('R3-1 live setup: claim', false)
  // the original ERA as the reviewer sent it: line 1 denied (CO-151), lines 2-4 paid 80% with a 20% contract write-off; codes and fees come from the claim
  const lines = (await gql('owner', 'query($c: ID!) { claimLines(where: { claim: { id: { equals: $c } } }, orderBy: { lineControlNumber: asc }) { lineControlNumber feeMinor code { code } } }', { c: claim.id })).data?.claimLines ?? []
  const L3 = lines.map((l, i) => { const charge = BigInt(l.feeMinor); const paid = i === 0 ? 0n : (charge * 8n) / 10n; return [l.lineControlNumber, l.code?.code ?? '', charge, paid, [['CO', i === 0 ? '151' : '45', charge - paid]]] })
  const original = eobClaim(ref, L3.map(([lc, code, charge, paid, adj]) => ({ lc, code, charge, paid, adj })))
  const pending = (await gql('owner', 'query($c: ID!) { appeals(where: { denial: { claim: { id: { equals: $c } } } }) { outcome } }', { c: claim.id })).data?.appeals ?? []
  check('R3-1 live: the claim has a filed appeal, still pending', pending.length > 0 && pending.every(a => a.outcome === 'pending'))
  const b0 = await balanceOf(claim.patient.id)
  const live0 = await livePayments(claim.id)
  const r = await eob(harbor, `R3C-${randomUUID().slice(0, 8)}`, original)
  const b1 = await balanceOf(claim.patient.id)
  const held = r?.status === 'exception' && b1.sum === b0.sum
  check('R3-1 live: identical re-send with a filed appeal is held, balance unchanged', held, `${r?.status ?? r?.error} delta=${b1.sum - b0.sum}`)
  if (r?.status === 'posted') {
    // undo at once: the exact takeback of what just posted
    const tb = await eob(harbor, `R3C-${randomUUID().slice(0, 8)}-TB`, takeback(ref, L3.reduce((t, l) => t + l[3], 0n), L3.reduce((t, l) => t + l[2], 0n)))
    const b2 = await balanceOf(claim.patient.id)
    check('R3-1 live cleanup: exact takeback restores the balance', tb?.status === 'posted' && b2.sum === b0.sum, `${tb?.status ?? tb?.error}`)
  }
  const bEnd = await balanceOf(claim.patient.id)
  check('R3-1 live: live payments unchanged', (await livePayments(claim.id)).length === live0.length)
  check('R3-1 live: cache = sum of ledger', String(bEnd.sum) === String(bEnd.cache), `${bEnd.sum}/${bEnd.cache}`)
}

// ---------- R3-2 ----------
async function r32() {
  // ids come from the owner (all offices); each single-office role then asks the two oracles about the other office.
  await login('owner')
  const d = (await gql('owner', `{
    tpa: patients(where: { homeLocation: { id: { equals: "seed_loc_tpa" } } }, take: 1, orderBy: { chartNumber: asc }) { id lastName }
    stp: patients(where: { homeLocation: { id: { equals: "seed_loc_stp" } } }, take: 1, orderBy: { chartNumber: asc }) { id lastName }
    tpaLedger: ledgerEntries(where: { location: { id: { equals: "seed_loc_tpa" } } }, take: 1) { id account { id } }
    stpLedger: ledgerEntries(where: { location: { id: { equals: "seed_loc_stp" } } }, take: 1) { id account { id } }
  }`)).data
  const roles = Object.keys(people).filter(r => ['kerry', 'jenna', 'vivian', 'grace', 'priya'].includes(r))
  const office = { kerry: 'tpa', jenna: 'tpa', vivian: 'stp', grace: 'stp', priya: 'stp' }
  for (const role of roles) {
    const lr = await login(role)
    if (!JSON.stringify(lr).includes('Success')) { check(`R3-2 ${role} sign-in`, false); continue }
    const theirs = office[role] === 'tpa' ? 'stp' : 'tpa'
    const pt = d[theirs][0]; const le = d[`${theirs}Ledger`][0]
    const probes = {
      'restatement entries by patient id': `restatementsCount(where: { entries: { some: { patient: { id: { equals: "${pt?.id}" } } } } })`,
      'restatement entries by name prefix': `restatementsCount(where: { entries: { some: { patient: { lastName: { startsWith: "${(pt?.lastName ?? 'A').slice(0, 1)}" } } } } })`,
      'restatement entries by date of birth': `restatementsCount(where: { entries: { some: { patient: { dateOfBirth: { lt: "2100-01-01" } } } } })`,
      'restatement entries by amount': `restatementsCount(where: { entries: { some: { amountMinor: { lt: "0" } } } })`,
      'chart ledger row by id': `chartEntriesCount(where: { ledgerEntry: { id: { equals: "${le?.id}" } } })`,
      'chart ledger row by account': `chartEntriesCount(where: { ledgerEntry: { account: { id: { equals: "${le?.account?.id}" } } } })`,
      'chart ledger row by kind': `chartEntriesCount(where: { ledgerEntry: { kind: { equals: "charge" } } })`,
    }
    for (const [name, sel] of Object.entries(probes)) {
      const r = await gql(role, `{ n: ${sel} }`)
      // refused, or nothing counted: either way no other-office row is confirmed
      const recovered = !r.errors?.length && Number(r.data?.n ?? 0) > 0
      check(`R3-2 ${role}: ${name} recovers nothing`, !recovered)
    }
    // the relations still read, filtered: no other-office ledger row through a chart entry or a restatement
    const reads = await gql(role, '{ chartEntries(take: 200) { ledgerEntry { location { id } } } restatements(take: 50) { entries { location { id } } } }')
    const mine = office[role] === 'tpa' ? 'seed_loc_tpa' : 'seed_loc_stp'
    const seen = [...(reads.data?.chartEntries ?? []).map(c => c.ledgerEntry?.location?.id), ...(reads.data?.restatements ?? []).flatMap(r => r.entries.map(e => e.location?.id))].filter(Boolean)
    check(`R3-2 ${role}: relation reads show only my office`, !reads.errors?.length ? seen.every(l => l === mine) : true)
  }
}

// ---------- R3-5 ----------
// Sidebar groups start collapsed: open every group, then collect the platform links the role is shown.
async function sidebarLinks(p) {
  await p.goto(BASE + '/dashboard', { waitUntil: 'load', timeout: 90000 })
  await p.waitForSelector('a[href*="/dashboard/platform/"]', { timeout: 60000 }).catch(() => null)
  for (const g of ['Clinical', 'Billing', 'Front desk', 'Practice']) await p.getByRole('button', { name: g, exact: true }).first().click({ timeout: 5000 }).catch(() => null)
  await p.waitForTimeout(1000)
  return p.evaluate(() => [...document.querySelectorAll('a')].map(a => a.getAttribute('href') ?? '').filter(h => h.includes('/platform/')))
}

async function r35() {
  const { chromium } = await import('/Users/junaid/Code/vibeghost/vibeghost/node_modules/playwright/index.mjs')
  const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
  for (const role of Object.keys(people).filter(r => ['kerry', 'jenna', 'vivian'].includes(r))) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true }); const p = await ctx.newPage()
    await p.goto(BASE + '/dashboard/signin'); await p.fill('input[name=email]', people[role].email); await p.fill('input[name=password]', people[role].password)
    await Promise.all([p.waitForURL(u => !u.pathname.includes('signin'), { timeout: 30000 }), p.click('button[type=submit]')]).catch(() => null)
    const links = await sidebarLinks(p)
    // the groups opened (the security settings link sits in the same group as the audit log), and the audit link is not there
    check(`R3-5 ${role}: audit link hidden in the sidebar`, links.some(h => h.includes('/platform/settings/security')) && !links.some(h => /\/platform\/audit\b/.test(h)))
    const r = await p.goto(BASE + '/dashboard/platform/audit', { waitUntil: 'load', timeout: 90000 })
    const txt = await p.evaluate(() => document.body.innerText)
    check(`R3-5 ${role}: direct visit shows not-allowed`, r?.status() === 200 && /not allowed to view the audit log/i.test(txt) && !/something went wrong/i.test(txt), String(r?.status()))
    const bad = await p.goto(BASE + '/dashboard/audit-events/nope123', { waitUntil: 'load', timeout: 90000 })
    check(`R3-5 ${role}: bad audit id is 404`, bad?.status() === 404, String(bad?.status()))
    await ctx.close()
  }
  // a role with audit access still sees the page
  const ctx = await b.newContext({ ignoreHTTPSErrors: true }); const p = await ctx.newPage()
  await p.goto(BASE + '/dashboard/signin'); await p.fill('input[name=email]', people.owner.email); await p.fill('input[name=password]', people.owner.password)
  await Promise.all([p.waitForURL(u => !u.pathname.includes('signin'), { timeout: 30000 }), p.click('button[type=submit]')]).catch(() => null)
  const links = await sidebarLinks(p)
  const r = await p.goto(BASE + '/dashboard/platform/audit', { waitUntil: 'load', timeout: 90000 })
  const txt = await p.evaluate(() => document.body.innerText)
  check('R3-5 owner: audit link shown and the log loads', links.some(h => /\/platform\/audit\b/.test(h)) && r?.status() === 200 && /chain/i.test(txt) && !/not allowed/i.test(txt))
  await b.close()
}

for (const part of parts) {
  if (part === 'r31-full') await r31Full()
  else if (part === 'r31-live') await r31Live()
  else if (part === 'r32') await r32()
  else if (part === 'r35') await r35()
}
console.log(`SUMMARY pass=${pass} fail=${fail}`)
