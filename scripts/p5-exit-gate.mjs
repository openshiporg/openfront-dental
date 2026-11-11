// Phase 5 exit gate through the app's own API, as real people. Prints PASS/FAIL per item.
// Usage: BASE=<url> LOGINS=<json { "<name>": { email, password } }> node scripts/p5-exit-gate.mjs
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
const BASE = process.env.BASE, L = JSON.parse(fs.readFileSync(process.env.LOGINS, 'utf8'))
const jars = {}
async function gql(who, query, variables = {}) {
  const r = await fetch(BASE + '/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json', 'apollo-require-preflight': 'true', cookie: jars[who] ?? '' }, body: JSON.stringify({ query, variables }) })
  const t = await r.text(); try { return JSON.parse(t) } catch { return { errors: [{ message: `HTTP ${r.status} ${t.slice(0, 120)}` }] } }
}
async function login(who) {
  const r = await fetch(BASE + '/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json', 'apollo-require-preflight': 'true' }, body: JSON.stringify({ query: 'mutation($e:String!,$p:String!){authenticateUserWithPassword(email:$e,password:$p){... on UserAuthenticationWithPasswordSuccess{sessionToken}}}', variables: { e: L[who].email, p: L[who].password } }) })
  const j = await r.json(); const tok = j.data?.authenticateUserWithPassword?.sessionToken
  if (!tok) throw new Error('sign-in failed for ' + who); jars[who] = 'keystonejs-session=' + tok
}
const key = () => 'p5-' + randomUUID()
let bad = 0
const check = (name, ok, note = '') => { if (!ok) bad++; console.log(`CHECK ${name}: ${ok ? 'PASS' : 'FAIL'} ${note}`) }
const msg = r => r.errors?.[0]?.message ?? ''
const code = r => r.errors?.[0]?.extensions?.code ?? ''
const people = Object.keys(L)
for (const w of people) await login(w)
const runChecks = w => gql(w, 'mutation($k:String!){runSignalChecks(idempotencyKey:$k)}', { k: key() })
const home = w => gql(w, '{aiHome}')

// 4. checks twice add no duplicates
const a = people[0]
const r1 = await runChecks(a); check('run checks (first)', !r1.errors, msg(r1))
const h1 = (await home(a)).data?.aiHome
const n1 = h1?.signals?.length ?? -1
const r2 = await runChecks(a); check('run checks (second)', !r2.errors, msg(r2))
const h2 = (await home(a)).data?.aiHome
check('running the checks twice adds no duplicate signals', n1 >= 0 && h2?.signals?.length === n1, `${n1} then ${h2?.signals?.length}`)

// 1. never-autonomous policy refused at the API
for (const kind of ['refund_request', 'write_off_request', 'payment_plan_offer']) {
  const r = await gql(a, 'mutation($k:String!,$m:String!,$i:String!){setAutonomyPolicy(kind:$k,mode:$m,idempotencyKey:$i)}', { k: kind, m: 'carry_out_low_risk', i: key() })
  check(`never-autonomous ${kind} refused at the API`, !!r.errors && !r.data?.setAutonomyPolicy, `${code(r)} ${msg(r).slice(0, 90)}`)
}

// 2. owner can't approve own agent's proposal
const props = (h2?.proposals ?? []).filter(p => p.status === 'proposed' || p.status === 'validated')
let owned = null, approvedBy = null, target = null
for (const p of props) {
  for (const w of people) {
    const r = await gql(w, 'mutation($p:ID!,$v:Int!,$i:String!){decideProposal(proposalId:$p,decision:"approve",expectedVersion:$v,idempotencyKey:$i)}', { p: p.id, v: p.version, i: key() })
    if (code(r) === 'SELF_APPROVAL' || /you own/i.test(msg(r))) { owned = w; target = p; break }
  }
  if (owned) break
}
check("an agent's owner can't approve its own agent's proposal", !!owned, owned ? `refused for ${owned}` : 'no refusal seen')

// 3. audit trace signal -> proposal -> decision -> receipt -> outcome, by another person
if (target) {
  for (const w of people.filter(x => x !== owned)) {
    const cur = (await home(w)).data?.aiHome?.proposals?.find(p => p.id === target.id)
    const r = await gql(w, 'mutation($p:ID!,$v:Int!,$i:String!){decideProposal(proposalId:$p,decision:"approve",expectedVersion:$v,idempotencyKey:$i)}', { p: target.id, v: cur?.version ?? target.version, i: key() })
    if (!r.errors) { approvedBy = w; break }
  }
  const after = (await home(approvedBy ?? a)).data?.aiHome?.proposals?.find(p => p.id === target.id)
  const t = after?.trace
  check('trace: signal', !!t?.signal, t?.signal)
  check('trace: decision', (t?.decision?.length ?? 0) > 0, JSON.stringify(t?.decision?.map(d => d.by)))
  check('trace: command receipt', !!t?.receipt, JSON.stringify(t?.receipt)?.slice(0, 80))
  check('trace: outcome', !!after?.outcome, JSON.stringify(after?.outcome)?.slice(0, 100))
  const au = await gql(approvedBy ?? a, '{ auditEvents(where:{ entityId:{equals:"' + target.id + '"} }, take: 20){ eventType } }')
  check('audit rows for the proposal', !au.errors && (au.data?.auditEvents?.length ?? 0) > 0, au.errors ? 'audit list not readable by this person: ' + msg(au).slice(0, 60) : `${au.data.auditEvents.map(e => e.eventType).join(', ')}`)
} else check('trace (needs a proposal)', false, 'none available')

// 5. publicChat with PHI, no_phi provider
const site = (await gql(a, '{ storefrontSites(take:1, where:{isPublished:{equals:true}}){ slug } }')).data?.storefrontSites?.[0]?.slug
const chat = await gql(a, 'query($s:String!,$m:JSON!){publicChat(slug:$s,messages:$m)}', { s: site ?? 'bayview', m: [{ role: 'user', content: 'Hi, my name is Jordan Pell, date of birth 03/14/1984, and my crown on tooth 14 hurts. What should I do?' }] })
const reply = chat.data?.publicChat?.reply ?? ''
check('publicChat with PHI is refused (told to call the office)', /call the office/i.test(reply) && !/jordan|pell|1984/i.test(reply), reply.slice(0, 120) + (chat.errors ? ' ' + msg(chat) : ''))
const ok = await gql(a, 'query($s:String!,$m:JSON!){publicChat(slug:$s,messages:$m)}', { s: site ?? 'bayview', m: [{ role: 'user', content: 'What are your opening hours?' }] })
check('publicChat without PHI answers', !!ok.data?.publicChat?.reply, (ok.data?.publicChat?.reply ?? msg(ok)).slice(0, 100))
console.log(`CHECK exit gate: ${bad ? 'FAIL' : 'PASS'} (${bad} failed)`)
process.exit(bad ? 1 : 0)
