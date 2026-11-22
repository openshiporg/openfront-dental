'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { gql } from '../lib/api'

const field = 'h-11 w-full rounded-[3px] border border-[#cfc6b4] bg-white/90 px-3 text-base focus:border-[#3a9e98] focus:outline-none focus:ring-2 focus:ring-[#3a9e98]/30'
const TOKEN = 'portal-token'
type Appt = { id: string; startsAt: string; status: string; version: number; visit: string; location: string; locationPhone: string; timeZone: string; provider: string; canConfirm: boolean; canChange: boolean }
const STATUS: Record<string, string> = { scheduled: 'Booked, not yet confirmed', confirmed: 'Confirmed', arrived: 'Checked in', seated: 'In progress', ready_for_checkout: 'In progress', completed: 'Completed', cancelled: 'Cancelled', broken: 'Missed', no_show: 'Missed' }
type Person = { patientId: string; name: string; relationship: string }

/** First sign-in with no patient linked: name and birthday find the record that already has this email, or start a new one. */
function Register({ busy, run, auth, onDone }: { busy: boolean; run: (fn: () => Promise<void>) => Promise<void>; auth: () => Record<string, string>; onDone: () => void }) {
  const [f, setF] = useState({ firstName: '', lastName: '', dateOfBirth: '', phone: '' })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <form className="mt-5 space-y-3" onSubmit={e => { e.preventDefault(); run(async () => { await gql('mutation($a:String!,$b:String!,$d:String!,$p:String){ portalRegister(firstName:$a,lastName:$b,dateOfBirth:$d,phone:$p) }', { a: f.firstName, b: f.lastName, d: f.dateOfBirth, p: f.phone || null }, auth()); onDone() }) }}>
      <h2 className="text-xl font-semibold text-[#0b4f4b]">Tell us who you are</h2>
      <p className="text-base text-[#4c5a58]">If you have been to the office with this email, we find your record. If not, this starts one.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-sm" htmlFor="rg-first">First name</label><input id="rg-first" required autoComplete="given-name" className={field} value={f.firstName} onChange={set('firstName')} /></div>
        <div><label className="mb-1 block text-sm" htmlFor="rg-last">Last name</label><input id="rg-last" required autoComplete="family-name" className={field} value={f.lastName} onChange={set('lastName')} /></div>
        <div><label className="mb-1 block text-sm" htmlFor="rg-dob">Date of birth</label><input id="rg-dob" type="date" required autoComplete="bday" className={field} value={f.dateOfBirth} onChange={set('dateOfBirth')} /></div>
        <div><label className="mb-1 block text-sm" htmlFor="rg-phone">Mobile phone (optional)</label><input id="rg-phone" type="tel" autoComplete="tel" className={field} value={f.phone} onChange={set('phone')} /></div>
      </div>
      <button disabled={busy} className="min-h-12 w-full rounded-[3px] bg-[#dc6244] px-6 text-lg font-medium text-white hover:bg-[#c75537] disabled:opacity-60 sm:w-auto">{busy ? 'One moment' : 'Continue'}</button>
    </form>
  )
}

export function PortalSignIn() {
  const [step, setStep] = useState<'email' | 'code' | 'in'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [people, setPeople] = useState<Person[]>([])
  const [appts, setAppts] = useState<Record<string, Appt[]>>({})
  const [cancelling, setCancelling] = useState<string | null>(null)

  const auth = () => ({ 'x-portal-token': sessionStorage.getItem(TOKEN) ?? '' })
  async function load() {
    const me = await gql<{ portalMe: { people: Person[] } }>('{ portalMe }', {}, auth())
    setPeople(me.portalMe.people)
    const next: Record<string, Appt[]> = {}
    for (const p of me.portalMe.people) next[p.patientId] = (await gql<any>('query($p:ID!){ portalAppointments(patientId:$p) }', { p: p.patientId }, auth())).portalAppointments.appointments
    setAppts(next); setStep('in')
  }
  // Coming back in the same tab: the session from the emailed code is still good, so open the account straight away.
  useEffect(() => {
    if (!sessionStorage.getItem(TOKEN)) return
    setEmail(sessionStorage.getItem(`${TOKEN}-email`) ?? '')
    load().catch(() => sessionStorage.removeItem(TOKEN))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
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
                      {a.canChange && cancelling !== a.id ? <button disabled={busy} className="min-h-11 rounded-[3px] border border-[#9cc7c1] bg-white/90 px-5 disabled:opacity-60" onClick={() => setCancelling(a.id)}>Cancel visit</button> : null}
                      {cancelling === a.id ? (
                        <div role="group" aria-label="Cancel this visit?" className="flex w-full flex-wrap items-center gap-3 rounded-[3px] bg-[#ece5d6] p-3">
                          <p className="w-full text-base font-medium">Cancel this visit? The time goes back to other patients.</p>
                          <button disabled={busy} className="min-h-11 rounded-[3px] bg-[#a5321b] px-5 font-medium text-white disabled:opacity-60" onClick={() => { setCancelling(null); act(a, 'Cancel') }}>Yes, cancel it</button>
                          <button autoFocus className="min-h-11 rounded-[3px] border border-[#9cc7c1] bg-white/90 px-5" onClick={() => setCancelling(null)}>Keep my visit</button>
                        </div>) : null}
                    </div>) : null}</li>
                ))}
              </ul>
            ) : <p className="mt-2">No visits in the last year.</p>}
          </section>
        ))}
        {!people.length ? <Register busy={busy} onDone={() => run(load)} run={run} auth={auth} /> : null}
        {people.length ? <p className="mt-5"><Link href="/book" className="inline-flex min-h-11 items-center rounded-[3px] bg-[#dc6244] px-5 font-medium text-white hover:bg-[#c75537]">Book another visit</Link></p> : null}
        {msg ? <p role="alert" className="mt-3 text-[#a5321b]">{msg}</p> : null}
      </div>
    )
  }
  return (
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); run(async () => {
      if (step === 'email') { await gql('mutation($e:String!){ portalRequestCode(email:$e) }', { e: email }); setStep('code'); setMsg('We sent a six-digit code to that email. It works for 10 minutes.') }
      else { const d = await gql<{ portalSession: { token: string } }>('mutation($e:String!,$c:String!){ portalSession(email:$e,code:$c) }', { e: email, c: code }); sessionStorage.setItem(`${TOKEN}-email`, email); sessionStorage.setItem(TOKEN, d.portalSession.token); await load() }
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
      ) : <p className="text-base text-[#4c5a58]">We email you a six-digit code; there is no password. First time here? The same code creates your account.</p>}
    </form>
  )
}
