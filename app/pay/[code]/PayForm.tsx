'use client'

import { useEffect, useRef, useState } from 'react'

declare global { interface Window { Stripe?: (key: string) => any } }

const loadStripe = () => new Promise<void>((resolve, reject) => {
  if (window.Stripe) return resolve()
  const s = document.createElement('script')
  s.src = 'https://js.stripe.com/v3/'
  s.onload = () => resolve()
  s.onerror = () => reject(new Error('The card form could not load. Check your connection and try again.'))
  document.head.appendChild(s)
})

const dollars = (minor: string) => { const n = BigInt(minor); return `${n / 100n}.${String(n % 100n).padStart(2, '0')}` }

export function PayForm({ code, owedMinor, stripeKey }: { code: string; owedMinor: string; stripeKey: string }) {
  const [amount, setAmount] = useState(dollars(owedMinor))
  const [step, setStep] = useState<'amount' | 'card' | 'working' | 'paid' | 'failed'>('amount')
  const [message, setMessage] = useState('')
  const [paidMinor, setPaidMinor] = useState('')
  const mount = useRef<HTMLDivElement>(null)
  const stripe = useRef<any>(null)
  const elements = useRef<any>(null)
  const [payRef, setPayRef] = useState('')
  const payRefNow = useRef('')

  async function post(path: string, body: unknown) {
    const res = await fetch(`/api/pay/${encodeURIComponent(code)}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || 'Something went wrong. Nothing was charged.')
    return json
  }

  async function begin() {
    setMessage('')
    setStep('working')
    try {
      await loadStripe()
      const started = await post('start', { amount })
      payRefNow.current = started.ref; setPayRef(started.ref)
      stripe.current = window.Stripe!(stripeKey)
      elements.current = stripe.current.elements({ clientSecret: started.clientSecret })
      setStep('card')
    } catch (e) { setMessage((e as Error).message); setStep('amount') }
  }

  useEffect(() => {
    if (step === 'card' && mount.current && elements.current) elements.current.create('payment', { layout: 'tabs' }).mount(mount.current)
  }, [step])

  async function pay() {
    setStep('working'); setMessage('')
    const result = await stripe.current.confirmPayment({ elements: elements.current, redirect: 'if_required' })
    if (result.error) { setMessage(result.error.message || 'The card was declined.'); setStep('card'); return }
    try {
      for (let i = 0; i < 6; i++) {
        const done = await post('confirm', { ref: payRefNow.current })
        if (done.status === 'paid') { setPaidMinor(done.amountMinor); setStep('paid'); return }
        if (done.status === 'failed') { setMessage(done.message); setStep('failed'); return }
        await new Promise(r => setTimeout(r, 1500))
      }
      setMessage('Your payment is still being confirmed. You do not need to pay again; the office will see it shortly.'); setStep('failed')
    } catch (e) { setMessage((e as Error).message); setStep('failed') }
  }

  if (step === 'paid') return <section className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4" role="status"><p className="font-medium">Thank you. Your payment of ${dollars(paidMinor)} went through.</p><p className="mt-1 text-sm text-neutral-700">Reference {payRef}. You can close this page.</p></section>
  return (
    <section className="mt-6">
      {step === 'amount' || (step === 'working' && !payRef) ? (
        <div className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="pay-amount">Amount to pay</label>
          <div className="flex items-center gap-2"><span aria-hidden>$</span><input id="pay-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className="h-11 w-full rounded-lg border border-neutral-300 px-3 text-base tabular-nums" /></div>
          <button type="button" disabled={step === 'working'} onClick={begin} className="h-11 w-full rounded-lg bg-neutral-900 px-4 text-base font-medium text-white disabled:opacity-60">{step === 'working' ? 'One moment' : 'Continue to card'}</button>
        </div>
      ) : (
        <div className="space-y-3">
          <div ref={mount} />
          <button type="button" disabled={step === 'working'} onClick={pay} className="h-11 w-full rounded-lg bg-neutral-900 px-4 text-base font-medium text-white disabled:opacity-60">{step === 'working' ? 'Paying' : `Pay $${amount}`}</button>
        </div>
      )}
      {message ? <p role="alert" className="mt-3 break-words text-sm text-red-700">{message}</p> : null}
    </section>
  )
}
