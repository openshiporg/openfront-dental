'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { runCommand } from '../../actions/commands';

declare global { interface Window { Stripe?: (key: string) => any } }

const loadStripe = () => new Promise<void>((resolve, reject) => {
  if (window.Stripe) return resolve();
  const s = document.createElement('script');
  s.src = 'https://js.stripe.com/v3/';
  s.onload = () => resolve();
  s.onerror = () => reject(new Error('The card form could not load. Check the connection and try again.'));
  document.head.appendChild(s);
});

/**
 * Take a card at the front desk. The card number is typed into Stripe's own field and goes straight to Stripe; this app only ever sees the
 * payment's reference and result. The payment is recorded first, the processor opens an intent, the form confirms it, then it is settled once.
 */
export function CardPayment({ patientId, locationId, stripeKey, paths }: { patientId: string; locationId: string; stripeKey: string; paths: string[] }) {
  const router = useRouter();
  const [amount, setAmount] = React.useState('');
  const [step, setStep] = React.useState<'amount' | 'card' | 'working' | 'done'>('amount');
  const [message, setMessage] = React.useState('');
  const [ref, setRef] = React.useState('');
  const mount = React.useRef<HTMLDivElement>(null);
  const stripe = React.useRef<any>(null);
  const elements = React.useRef<any>(null);
  const paymentId = React.useRef('');
  const key = React.useRef('');

  async function begin() {
    setMessage(''); setStep('working');
    try {
      if (!key.current) key.current = `card-${crypto.randomUUID()}`;
      await loadStripe();
      const made = await runCommand('takePayment', { patientId, locationId, amount, tender: 'card', newCard: true }, key.current, paths);
      if (!made.ok) throw new Error(made.error);
      const data = made.data as { id: string; ref: string };
      paymentId.current = data.id; setRef(data.ref);
      // The processor is asked right after the payment is recorded; give it a moment.
      let body: any = {};
      for (let i = 0; i < 8; i++) {
        const res = await fetch(`/api/payments/${data.id}/card`, { cache: 'no-store' });
        body = await res.json().catch(() => ({}));
        if (res.ok) break;
        if (res.status !== 409 || i === 7) throw new Error(body.error || 'The card form could not start. Nothing was charged.');
        await new Promise((r) => setTimeout(r, 1000));
      }
      stripe.current = window.Stripe!(stripeKey);
      elements.current = stripe.current.elements({ clientSecret: body.clientSecret });
      setStep('card');
    } catch (e) { setMessage((e as Error).message); setStep('amount'); key.current = ''; }
  }

  React.useEffect(() => {
    if (step === 'card' && mount.current && elements.current) elements.current.create('payment', { layout: 'tabs' }).mount(mount.current);
  }, [step]);

  async function pay() {
    setStep('working'); setMessage('');
    const result = await stripe.current.confirmPayment({ elements: elements.current, redirect: 'if_required' });
    if (result.error) { setMessage(result.error.message || 'The card was declined.'); setStep('card'); return; }
    try {
      for (let i = 0; i < 6; i++) {
        const res = await fetch(`/api/payments/${paymentId.current}/card`, { method: 'POST', cache: 'no-store' });
        const done = await res.json().catch(() => ({}));
        if (done.status === 'paid') { setStep('done'); router.refresh(); return; }
        if (done.status === 'failed') { setMessage(done.message || 'The card was declined.'); setStep('amount'); key.current = ''; return; }
        await new Promise((r) => setTimeout(r, 1500));
      }
      setMessage('The payment is still being confirmed. Do not take it again; check the account in a minute.'); setStep('amount');
    } catch (e) { setMessage((e as Error).message); setStep('amount'); }
  }

  if (step === 'done') return <p className="text-sm" role="status">Card payment {ref} went through.</p>;
  return (
    <div className="max-w-sm space-y-2">
      {step === 'card' || (step === 'working' && ref) ? (
        <>
          <div ref={mount} />
          <button type="button" disabled={step === 'working'} onClick={pay} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">{step === 'working' ? 'Paying' : `Pay $${amount}`}</button>
        </>
      ) : (
        <>
          <label className="block text-sm font-medium" htmlFor="card-amount">Amount in dollars</label>
          <input id="card-amount" inputMode="decimal" placeholder="50.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 w-full rounded-md border px-3 text-sm tabular-nums" />
          <button type="button" disabled={step === 'working' || !amount.trim()} onClick={begin} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">{step === 'working' ? 'One moment' : 'Continue to card'}</button>
        </>
      )}
      {message ? <p className="text-sm text-red-700" role="alert">{message}</p> : null}
    </div>
  );
}
