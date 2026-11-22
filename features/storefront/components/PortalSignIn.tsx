'use client'

import Link from 'next/link'
import { useState } from 'react'
import { gql } from '../lib/api'

const field = 'h-11 w-full rounded-[3px] border border-[#cfc6b4] bg-white/90 px-3 text-base focus:border-[#3a9e98] focus:outline-none focus:ring-2 focus:ring-[#3a9e98]/30'
const TOKEN = 'portal-token'
type Appt = { id: string; startsAt: string; status: string; version: number; visit: string; location: string; locationPhone: string; timeZone: string; provider: string; canConfirm: boolean; canChange: boolean }
const STATUS: Record<string, string> = { scheduled: 'Booked, not yet confirmed', confirmed: 'Confirmed', arrived: 'Checked in', seated: 'In progress', ready_for_checkout: 'In progress', completed: 'Completed', cancelled: 'Cancelled', broken: 'Missed', no_show: 'Missed' }
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
        <div className="flex items-center justify-between gap-4 border-b border-[#cfc6b4] pb-2"><p className="min-w-0 truncate text-base text-[#4c5a58]">{email}</p><button className="min-h-11 shrink-0 underline underline-offset-4" onClick={() => { sessionStorage.removeItem(TOKEN); setStep('email'); setCode(''); setMsg('') }}>Sign out</button></div>
        {people.map(p => (
          <section key={p.patientId} className="mt-5">
            <h2 className="text-xl font-semibold text-[#0b4f4b]">{p.name ? `${p.name}’s visits` : 'Your visits'}</h2>
            {(appts[p.patientId] ?? []).length ? (
              <ul className="mt-2 divide-y divide-[#cfc6b4] border-y border-[#cfc6b4]">
                {appts[p.patientId].map(a => (
                  <li key={a.id} className="py-4"><p className="text-lg font-medium">{when(a)}</p><p className="text-lg">{a.visit}</p><p className="text-base text-[#4c5a58]">{a.location}{a.provider ? ` with ${a.provider}` : ''}</p>
                    <p className="mt-1 text-base"><span className={`inline-block rounded-full px-2.5 py-0.5 text-sm ${a.status === 'confirmed' ? 'bg-[#dcebe6] text-[#0b4f4b]' : 'bg-[#ece5d6]'}`}>{STATUS[a.status] ?? a.status.replace(/_/g, ' ')}</span></p>
                    {a.canConfirm || a.canChange ? (
                    <div className="mt-3 flex flex-wrap gap-3">
                      {a.canConfirm ? <button disabled={busy} className="min-h-11 rounded-[3px] bg-[#0f6b66] px-5 font-medium text-white disabled:opacity-60" onClick={() => act(a, 'Confirm')}>Confirm visit</button> : null}
                      {a.canChange ? <button disabled={busy} className="min-h-11 rounded-[3px] border border-[#9cc7c1] bg-white/90 px-5 disabled:opacity-60" onClick={() => { if (window.confirm('Cancel this visit?')) act(a, 'Cancel') }}>Cancel visit</button> : null}
                    </div>) : null}</li>
                ))}
              </ul>
            ) : <p className="mt-2">No visits in the last year.</p>}
          </section>
        ))}
        {!people.length ? <p className="mt-4">No one is linked to this account yet. Please call the office.</p> : null}
        <p className="mt-5"><Link href="/book" className="inline-flex min-h-11 items-center rounded-[3px] bg-[#dc6244] px-5 font-medium text-white hover:bg-[#c75537]">Book another visit</Link></p>
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
      {step === 'code' ? <div><label className="mb-1 block text-sm" htmlFor="ps-code">Six-digit code</label><input id="ps-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus className={`${field} tracking-[0.3em] tabular-nums`} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></div> : null}
      {msg ? <p role="status">{msg}</p> : null}
      <button disabled={busy} className="min-h-12 w-full rounded-[3px] bg-[#dc6244] px-6 text-lg font-medium text-white hover:bg-[#c75537] disabled:opacity-60 sm:w-auto">{busy ? 'One moment' : step === 'email' ? 'Send my code' : 'Sign in'}</button>
      {step === 'code' ? (
        <p className="flex flex-wrap gap-x-6">
          <button type="button" disabled={busy} className="min-h-11 underline underline-offset-4" onClick={() => run(async () => { await gql('mutation($e:String!){ portalRequestCode(email:$e) }', { e: email }); setCode(''); setMsg('We sent a new code. The older one no longer works.') })}>Send a new code</button>
          <button type="button" disabled={busy} className="min-h-11 underline underline-offset-4" onClick={() => { setStep('email'); setCode(''); setMsg('') }}>Use a different email</button>
        </p>
      ) : <p className="text-base text-[#4c5a58]">We email you a six-digit code; there is no password. Your account is made when you book online with your email, or the office can add you.</p>}
    </form>
  )
}
