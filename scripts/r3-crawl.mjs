// r3 crawl gate: every dashboard page as each role, the storefront and public pages, plus a missing id per list. Prints only PASS/FAIL.
// Usage: CRAWL_BASE=<url> CRAWL_LOGINS=<json file { "<role>": { "email", "password" } }, kept outside the repo> node scripts/r3-crawl.mjs [roles...]
// The logins file must include "owner" (used to find one record id per list). FAIL = HTTP 5xx/0 or an error card; a missing id must be 404.
// An unreadable record (another office's patient, a list the role cannot read) may be 404 or a not-allowed page, never a 500.
import fs from 'node:fs'
import { chromium } from '/Users/junaid/Code/vibeghost/vibeghost/node_modules/playwright/index.mjs'

const BASE = process.env.CRAWL_BASE
const people = JSON.parse(fs.readFileSync(process.env.CRAWL_LOGINS, 'utf8'))
const roles = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(people)
const gql = async (query, cookie) => (await fetch(BASE + '/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json', 'apollo-require-preflight': 'true', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ query }) })).json()
const o = people.owner
const auth = await (await fetch(BASE + '/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json', 'apollo-require-preflight': 'true' }, body: JSON.stringify({ query: 'mutation($e:String!,$p:String!){authenticateUserWithPassword(email:$e,password:$p){... on UserAuthenticationWithPasswordSuccess{sessionToken}}}', variables: { e: o.email, p: o.password } }) })).json()
const cookie = 'keystonejs-session=' + auth.data?.authenticateUserWithPassword?.sessionToken
const meta = (await gql('{keystone{adminMeta{lists{key path listQueryName}}}}', cookie)).data?.keystone?.adminMeta?.lists
if (!meta) { console.log('CHECK crawl setup: FAIL'); process.exit(1) }

const platform = ['approvals', 'assistant', 'audit', 'claims', 'close', 'codes', 'fees', 'forms', 'insurance', 'memberships', 'patients', 'payments', 'remittances',
  'schedule', 'schedule/asap', 'schedule/booking-requests', 'schedule/confirmations', 'settings/locations', 'settings/security', 'verifications']
const pages = ['/dashboard', ...platform.map(s => '/dashboard/platform/' + s)]
const expect404 = new Set()
const ids = (await gql('{ patients(take: 200, orderBy: { chartNumber: asc }) { id homeLocation { id } } claims(take: 2) { id } }', cookie)).data ?? {}
const pts = [ids.patients?.find(p => p.homeLocation?.id === 'seed_loc_tpa'), ids.patients?.find(p => p.homeLocation?.id === 'seed_loc_stp')].filter(Boolean)
for (const p of pts) for (const sub of ['', '/chart', '/insurance', '/ledger']) pages.push(`/dashboard/platform/patients/${p.id}${sub}`)
for (const c of ids.claims ?? []) pages.push(`/dashboard/platform/claims/${c.id}`)
for (const bad of ['/dashboard/platform/patients/nope123', '/dashboard/platform/claims/nope123']) { pages.push(bad); expect404.add(bad) }
for (const l of meta) {
  pages.push('/dashboard/' + l.path)
  const row = (await gql(`{${l.listQueryName}(take:1){id}}`, cookie)).data?.[l.listQueryName]?.[0]
  if (row) pages.push(`/dashboard/${l.path}/${row.id}`)
  const bad = `/dashboard/${l.path}/nope123`; pages.push(bad); expect404.add(bad)
}

const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
let bad = 0, total = 0
const broken = /something went wrong|application error|server-side exception|internal server error|this page could not be loaded|QUERY_TOO_BROAD/i
for (const role of roles) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true }); let p = await ctx.newPage()
  await p.goto(BASE + '/dashboard/signin'); await p.fill('input[name=email]', people[role].email); await p.fill('input[name=password]', people[role].password)
  const signedIn = await Promise.all([p.waitForURL(u => !u.pathname.includes('signin'), { timeout: 30000 }), p.click('button[type=submit]')]).then(() => true, () => false)
  if (!signedIn) { bad++; console.log(`CHECK ${role} sign-in: FAIL`); await ctx.close(); continue }
  let n = 0, f = 0
  for (const path of pages) {
    let r = await p.goto(BASE + path, { waitUntil: 'load', timeout: 90000 }).catch(() => null)
    // A status 0 is a slow load or a crashed tab, not a server answer: open a fresh tab and fetch it once more.
    if (!r) { await p.close().catch(() => null); p = await ctx.newPage(); r = await p.goto(BASE + path, { waitUntil: 'load', timeout: 120000 }).catch(() => null) }
    await p.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null) // some list pages keep a request open; the load status decides
    const txt = await p.evaluate(() => document.body.innerText).catch(() => '')
    const http = r?.status() ?? 0
    const ok = http > 0 && http < 500 && !broken.test(txt) && (!expect404.has(path) || http === 404)
    n++; total++; if (!ok) { f++; bad++; console.log(`CHECK ${role} ${path}: FAIL (${http})`) }
  }
  console.log(`CHECK ${role} dashboard: ${f ? 'FAIL' : 'PASS'} (${n} loads, ${f} failed)`)
  await ctx.close()
}
const pc = await b.newContext({ ignoreHTTPSErrors: true }); const pp = await pc.newPage(); let pf = 0
for (const path of ['/', '/pay/not-a-real-link-0000', '/dashboard/signin', '/dashboard/reset', '/dashboard/platform/claims']) {
  const r = await pp.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => null)
  const txt = await pp.evaluate(() => document.body.innerText).catch(() => '')
  if (!(r && r.status() < 500 && !broken.test(txt))) { pf++; bad++; console.log(`CHECK public ${path}: FAIL (${r?.status() ?? 0})`) }
}
console.log(`CHECK public: ${pf ? 'FAIL' : 'PASS'}`)
await b.close()
console.log(`CHECK crawl all: ${bad ? 'FAIL' : 'PASS'} (${total} dashboard loads x ${roles.length} roles, ${bad} failed)`)
