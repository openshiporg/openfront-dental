'use client'

import { useState } from 'react'
import { gql } from '../lib/api'

const field = 'h-11 w-full rounded-[3px] border border-[#cfc6b4] bg-white/90 px-3 text-base focus:border-[#3a9e98] focus:outline-none focus:ring-2 focus:ring-[#3a9e98]/30'
const TOKEN = 'portal-token'
type Appt = { id: string; startsAt: string; status: string; version: number; visit: string; location: string; locationPhone: string; timeZone: string; provider: string; canConfirm: boolean; canChange: boolean }
type Person = { patientId: string; name: string; relationship: string }

export function PortalSignIn() {
  const [step, setStep] = useState<'email' | 'code' | 'in'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [people, setPeople] = useState<Person[]>([])
  const [appts, setAppts] = useState<Record<string, Appt[]>>({})

  const auth = () => ({ 'x-portal-token': sessionStorage.getItem(TOKEN) ?? '' })
  async function load() {
    const me = await gql<{ portalMe: { people: Person[] } }>('{ portalMe }', {}, auth())
    setPeople(me.portalMe.people)
    const next: Record<string, Appt[]> = {}
    for (const p of me.portalMe.people) next[p.patientId] = (await gql<any>('query($p:ID!){ portalAppointments(patientId:$p) }', { p: p.patientId }, auth())).portalAppointments.appointments
    setAppts(next); setStep('in')
  }
  async function run(fn: () => Promise<void>) { setBusy(true); setMsg(''); try { await fn() } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) } }

  const when = (a: Appt) => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: a.timeZone, timeZoneName: 'short' }).format(new Date(a.startsAt)).replace(/\b(EST|EDT)\b/, 'ET')
  const act = (a: Appt, kind: 'Confirm' | 'Cancel') => run(async () => {
    await gql(`mutation($a:ID!,$v:Int,$k:String!){ portal${kind}(appointmentId:$a,expectedVersion:$v,idempotencyKey:$k) }`, { a: a.id, v: a.version, k: `${kind}-${a.id}-${a.version}` }, auth())
    await load()
  })

  if (step === 'in') {
    return (
      <div>
        <button className="min-h-11 underline" onClick={() => { sessionStorage.removeItem(TOKEN); setStep('email'); setCode('') }}>Sign out</button>
        {people.map(p => (
          <section key={p.patientId} className="mt-4">
            <h2 className="text-xl font-semibold text-[#0b4f4b]">{p.name}</h2>
            {(appts[p.patientId] ?? []).length ? (
              <ul className="mt-2 divide-y divide-[#cfc6b4] border-y border-[#cfc6b4]">
                {appts[p.patientId].map(a => (
                  <li key={a.id} className="py-3"><p className="text-lg">{when(a)}: {a.visit}</p><p className="text-sm">{a.location}{a.provider ? ` with ${a.provider}` : ''}. Status: {a.status.replace(/_/g, ' ')}</p>
                    <div className="mt-1 flex gap-4">
                      {a.canConfirm ? <button disabled={busy} className="min-h-11 underline decoration-[#3a9e98] decoration-2 underline-offset-4" onClick={() => act(a, 'Confirm')}>Confirm</button> : null}
                      {a.canChange ? <button disabled={busy} className="min-h-11 underline" onClick={() => act(a, 'Cancel')}>Cancel visit</button> : null}
                    </div></li>
                ))}
              </ul>
            ) : <p className="mt-2">No visits on file.</p>}
          </section>
        ))}
        {msg ? <p role="alert" className="mt-3 text-[#a5321b]">{msg}</p> : null}
      </div>
    )
  }
  return (
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); run(async () => {
      if (step === 'email') { await gql('mutation($e:String!){ portalRequestCode(email:$e) }', { e: email }); setStep('code'); setMsg('If that email has a patient account, a code is on its way.') }
      else { const d = await gql<{ portalSession: { token: string } }>('mutation($e:String!,$c:String!){ portalSession(email:$e,code:$c) }', { e: email, c: code }); sessionStorage.setItem(TOKEN, d.portalSession.token); await load() }
    }) }}>
      <div><label className="mb-1 block text-sm" htmlFor="ps-email">Email</label><input id="ps-email" type="email" required className={field} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" disabled={step === 'code'} /></div>
      {step === 'code' ? <div><label className="mb-1 block text-sm" htmlFor="ps-code">Six-digit code</label><input id="ps-code" inputMode="numeric" autoComplete="one-time-code" required className={field} value={code} onChange={e => setCode(e.target.value)} /></div> : null}
      {msg ? <p role="status">{msg}</p> : null}
      <button disabled={busy} className="min-h-12 bg-[#dc6244] px-6 text-lg font-medium text-white disabled:opacity-60">{step === 'email' ? 'Send my code' : 'Sign in'}</button>
    </form>
  )
}
