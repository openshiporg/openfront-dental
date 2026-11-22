'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { addressLine, dayLabel, gql, timeLabel, type Site } from '../lib/api'

type Slot = { startsAt: string; operatoryId: string; providerId: string | null; localDate: string }
type Done = { publicRef: string; startsAt: string; locationName: string; timeZone: string; visit: string; address: string; phone: string; email: string }

const AVAIL = `query($slug:String!,$locationId:ID,$typeId:ID!,$fromDate:String!){ publicAvailability(slug:$slug,locationId:$locationId,typeId:$typeId,fromDate:$fromDate,days:14) }`
const HOLD = `mutation($slug:String!,$locationId:ID,$typeId:ID!,$operatoryId:ID!,$startsAt:String!,$providerId:ID,$k:String!){ publicHoldSlot(slug:$slug,locationId:$locationId,typeId:$typeId,operatoryId:$operatoryId,startsAt:$startsAt,providerId:$providerId,idempotencyKey:$k) }`
const SUBMIT = `mutation($slug:String!,$holdId:ID!,$holdToken:String!,$contact:JSON!,$intake:JSON,$ins:JSON,$k:String!){ publicSubmitBooking(slug:$slug,holdId:$holdId,holdToken:$holdToken,contact:$contact,intake:$intake,insuranceCapture:$ins,idempotencyKey:$k) }`

const field = 'h-11 w-full rounded-[3px] border border-[#cfc6b4] bg-white/90 px-3 text-base text-[#1b2b2a] focus:border-[#3a9e98] focus:outline-none focus:ring-2 focus:ring-[#3a9e98]/30'
const label = 'mb-1 block text-sm text-[#1b2b2a]'
const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

export function BookingPanel({ site }: { site: Site }) {
  const bookable = site.locations.filter(l => l.onlineBooking)
  const [patientType, setPatientType] = useState<'new' | 'existing'>('new')
  const [locationId, setLocationId] = useState(bookable[0]?.id ?? '')
  const location = bookable.find(l => l.id === locationId)
  const types = useMemo(() => (location?.onlineBooking?.visitTypes ?? []).filter(t => patientType === 'new' || !t.newPatientOnly), [location, patientType])
  const [typeId, setTypeId] = useState('')
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [day, setDay] = useState('')
  const [picked, setPicked] = useState<Slot | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Done | null>(null)
  const [noInsurance, setNoInsurance] = useState(false)
  const hold = useRef<{ holdId: string; holdToken: string; key: string } | null>(null)
  const submitKey = useRef(uid())
  const form = useRef<HTMLFormElement>(null)

  useEffect(() => { if (!types.some(t => t.id === typeId)) setTypeId(types[0]?.id ?? '') }, [types, typeId])
  useEffect(() => {
    setPicked(null); hold.current = null; setSlots(null); setError('')
    if (!typeId || !locationId) return
    let live = true
    const today = new Date().toISOString().slice(0, 10)
    gql<{ publicAvailability: { slots: Slot[] } }>(AVAIL, { slug: site.slug, locationId, typeId, fromDate: today })
      .then(d => {
        if (!live) return
        const seen = new Set<string>()
        const list = d.publicAvailability.slots.filter(s => (seen.has(s.startsAt) ? false : (seen.add(s.startsAt), true)))
        setSlots(list); setDay(list[0]?.localDate ?? '')
      })
      .catch(e => { if (live) { setSlots([]); setError(e.message) } })
    return () => { live = false }
  }, [site.slug, locationId, typeId])

  const days = useMemo(() => [...new Set((slots ?? []).map(s => s.localDate))], [slots])
  const daySlots = (slots ?? []).filter(s => s.localDate === day).slice(0, 8)
  const tz = location?.timeZone ?? 'America/New_York'
  const tomorrow = useMemo(() => new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: tz }), [tz])
  const dayName = (d: string) => (d === tomorrow ? `Tomorrow, ${dayLabel(d)}` : dayLabel(d))
  const kind = types.find(t => t.id === typeId)

  async function choose(slot: Slot) {
    setError(''); setBusy(true)
    try {
      const key = uid()
      const d = await gql<{ publicHoldSlot: { holdId: string; holdToken: string | null } }>(HOLD, { slug: site.slug, locationId, typeId, operatoryId: slot.operatoryId, startsAt: slot.startsAt, providerId: slot.providerId, k: key })
      if (!d.publicHoldSlot.holdToken) throw new Error('Please pick the time again.')
      hold.current = { holdId: d.publicHoldSlot.holdId, holdToken: d.publicHoldSlot.holdToken, key }
      setPicked(slot)
      setTimeout(() => form.current?.querySelector<HTMLInputElement>('#bk-first')?.focus(), 50)
    } catch (e) { setError((e as Error).message); setPicked(null) } finally { setBusy(false) }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!hold.current || !picked) return
    const f = new FormData(e.currentTarget)
    const v = (n: string) => String(f.get(n) ?? '').trim()
    setBusy(true); setError('')
    try {
      const carrier = v('carrier'), memberId = v('memberId')
      const ins = noInsurance ? { hasInsurance: false } : carrier || memberId ? { hasInsurance: true, carrier, memberId, dateOfBirth: v('dateOfBirth') } : null
      const d = await gql<{ publicSubmitBooking: { publicRef: string; startsAt: string; locationName: string } }>(SUBMIT, {
        slug: site.slug, holdId: hold.current.holdId, holdToken: hold.current.holdToken, k: submitKey.current,
        contact: { firstName: v('firstName'), lastName: v('lastName'), dateOfBirth: v('dateOfBirth'), email: v('email') || null, phone: v('phone') || null, smsConsent: f.get('sms') === 'on', emailReminders: true },
        intake: { patientType, visitType: kind?.name ?? '' }, ins,
      })
      setDone({ ...d.publicSubmitBooking, timeZone: tz, visit: kind?.name ?? '', address: addressLine(location?.address ?? null), phone: location?.phone ?? '', email: v('email') })
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  if (!bookable.length) return <p className="text-base">Online booking is not open yet. Please call the office.</p>
  if (done) {
    return (
      <div role="status" className="border-l-4 border-[#3a9e98] bg-white/80 p-5">
        <h2 className="text-2xl font-semibold text-[#0b4f4b]">You are booked.</h2>
        <p className="mt-2 text-lg font-medium">{new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: done.timeZone }).format(new Date(done.startsAt))} {timeLabel(done.startsAt, done.timeZone).split(' ').pop()}</p>
        <p className="text-lg">{[done.visit, done.locationName.replace(`${site.practiceName} — `, '')].filter(Boolean).join(' · ')}</p>
        {done.address ? <p className="text-base text-[#4c5a58]">{done.address}</p> : null}
        <p className="mt-3">Your reference is <strong>{done.publicRef}</strong>. Keep it: the office will ask for it if you call.</p>
        <p className="mt-1">{done.email ? 'To confirm or cancel online, sign in with the email you booked with.' : `To change this visit, call ${done.phone}.`}</p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
          {done.email ? <Link href="/account/sign-in" className="inline-flex min-h-11 items-center rounded-[3px] bg-[#dc6244] px-5 font-medium text-white hover:bg-[#c75537]">Patient sign in</Link> : null}
          {done.phone ? <a href={`tel:${done.phone.replace(/[^\d+]/g, '')}`} className="inline-flex min-h-11 items-center underline underline-offset-4">Call {done.phone}</a> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="text-[#1b2b2a]">
      <div role="tablist" aria-label="Patient type" className="flex gap-8">
        {([['new', 'New patient'], ['existing', 'Existing patient']] as const).map(([k, t]) => (
          <button key={k} role="tab" aria-selected={patientType === k} type="button" onClick={() => setPatientType(k)}
            className={`min-h-11 border-b-[3px] text-lg ${patientType === k ? 'border-[#3a9e98] font-medium text-[#0b4f4b]' : 'border-[#3a9e98]/40 text-[#1b2b2a]'}`}>{t}</button>
        ))}
      </div>

      <h2 className="mt-5 text-xl font-medium text-[#0b4f4b]">1. Pick a visit and a time</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_1.7fr]">
        <div><label className={label} htmlFor="bk-loc">Location</label>
          <select id="bk-loc" className={field} value={locationId} onChange={e => setLocationId(e.target.value)}>{bookable.map(l => <option key={l.id} value={l.id}>{l.name.replace(`${site.practiceName} — `, '')}</option>)}</select></div>
        <div><label className={label} htmlFor="bk-type">Visit type</label>
          <select id="bk-type" className={field} value={typeId} onChange={e => setTypeId(e.target.value)}>{types.map(t => <option key={t.id} value={t.id}>{t.name}{t.minutes ? ` (${t.minutes} min)` : ''}</option>)}</select></div>
      </div>

      <div className="mt-4" aria-live="polite">
        {slots === null ? <p>Looking for open times…</p> : !daySlots.length ? <p>No open times online for this visit right now. Please call {location?.phone}.</p> : (
          <>
            <p className="flex flex-wrap items-center gap-x-3"><span>Open times:</span>
              {days.length > 1 ? <select aria-label="Day" className="h-11 rounded-[3px] border border-[#cfc6b4] bg-white/90 px-2" value={day} onChange={e => { setDay(e.target.value); setPicked(null) }}>{days.slice(0, 14).map(d => <option key={d} value={d}>{dayName(d)}</option>)}</select> : <span>{dayName(day)}</span>}
              <span>({location?.name.replace(`${site.practiceName} — `, '')})</span></p>
            <ul className="mt-2 grid grid-cols-2 gap-2 min-[30rem]:grid-cols-4">
              {daySlots.map(s => (
                <li key={s.startsAt}>
                  <button type="button" disabled={busy} onClick={() => choose(s)} aria-pressed={picked?.startsAt === s.startsAt}
                    className={`flex min-h-12 w-full items-center justify-center rounded-[3px] border px-2 text-base tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3a9e98] disabled:opacity-60 ${picked?.startsAt === s.startsAt ? 'border-[#0f6b66] bg-[#0f6b66] font-semibold text-white' : 'border-[#9cc7c1] bg-white/90 text-[#0b4f4b] hover:border-[#0f6b66]'}`}>
                    {timeLabel(s.startsAt, tz)}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <form ref={form} onSubmit={submit} className="mt-6 bg-[#dcebe6] p-3 sm:bg-transparent sm:p-0">
        <h2 className="text-xl font-medium text-[#0b4f4b]">2. Check my insurance</h2>
        <p className="mt-1 text-sm">The office checks your benefits before the visit.</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div><label className={label} htmlFor="bk-carrier">Carrier</label><input id="bk-carrier" name="carrier" disabled={noInsurance} className={field} autoComplete="off" /></div>
          <div><label className={label} htmlFor="bk-member">Member ID</label><input id="bk-member" name="memberId" disabled={noInsurance} className={field} autoComplete="off" /></div>
        </div>
        <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3"><input type="checkbox" className="size-6 shrink-0 accent-[#0f6b66]" checked={noInsurance} onChange={e => setNoInsurance(e.target.checked)} />I don’t have dental insurance</label>

        {picked ? (
          <>
        <h2 className="mt-5 text-xl font-medium text-[#0b4f4b]">3. Your details</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div><label className={label} htmlFor="bk-first">First name</label><input id="bk-first" name="firstName" required autoComplete="given-name" className={field} /></div>
          <div><label className={label} htmlFor="bk-last">Last name</label><input id="bk-last" name="lastName" required autoComplete="family-name" className={field} /></div>
          <div><label className={label} htmlFor="bk-dob">Date of birth</label><input id="bk-dob" name="dateOfBirth" type="date" required autoComplete="bday" className={field} /></div>
          <div><label className={label} htmlFor="bk-phone">Mobile phone</label><input id="bk-phone" name="phone" type="tel" autoComplete="tel" className={field} /></div>
          <div className="sm:col-span-2"><label className={label} htmlFor="bk-email">Email</label><input id="bk-email" name="email" type="email" autoComplete="email" className={field} aria-describedby="bk-email-hint" /><p id="bk-email-hint" className="mt-1 text-sm text-[#4c5a58]">Add your email to confirm or cancel this visit online.</p></div>
        </div>
        <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3"><input type="checkbox" name="sms" className="size-6 shrink-0 accent-[#0f6b66]" />Text me appointment reminders</label>
        {error ? <p role="alert" className="mt-2 text-[#a5321b]">{error}</p> : null}
        <button disabled={busy || !picked} className="mt-3 min-h-12 w-full rounded-[3px] bg-[#dc6244] px-6 text-lg font-medium text-white hover:bg-[#c75537] disabled:opacity-60 sm:w-auto">{busy ? 'One moment' : picked ? `Book ${timeLabel(picked.startsAt, tz)}` : 'Pick a time above to book'}</button>
          </>
        ) : null}
      </form>
      {!picked && error ? <p role="alert" className="mt-2 text-[#a5321b]">{error}</p> : null}
    </div>
  )
}
