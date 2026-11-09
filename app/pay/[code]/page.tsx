import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { keystoneContext } from '@/features/keystone/context'
import { openPayLink } from '@/features/keystone/lib/payLink'
import { formatMinor } from '@/features/keystone/lib/money'
import { PayForm } from './PayForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Pay your statement', robots: { index: false, follow: false }, referrer: 'no-referrer' }

const day = (iso: string) => { const [y, m, d] = iso.split('-'); return `${m}/${d}/${y}` }

export default async function PayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  let view: Awaited<ReturnType<typeof openPayLink>>
  try {
    const { enforcePublicLimit } = await import('@/features/keystone/security/publicRateLimit')
    const { headers } = await import('next/headers')
    const h = await headers()
    await enforcePublicLimit(keystoneContext.prisma, { scope: 'paylink:view', req: { headers: Object.fromEntries(h) }, limits: { perClientPerHour: 60, perContactPerDay: 5, globalPerMinute: 240 } })
    view = await openPayLink(keystoneContext.prisma as never, code)
  } catch { notFound() }
  const owed = BigInt(view.owedMinor)
  return (
    <main className="mx-auto min-h-dvh max-w-xl px-5 py-8">
      <p className="text-sm text-neutral-600">{view.practiceName}{view.locationName ? ` · ${view.locationName}` : ''}</p>
      <h1 className="mt-1 text-2xl font-semibold">Your statement</h1>
      <p className="text-sm text-neutral-600">Statement {view.ref} · due {day(view.dueDate)}</p>
      <section className="mt-5 rounded-xl border border-neutral-200 p-4">
        <p className="text-sm text-neutral-600">{owed > 0n ? 'Amount you owe' : 'Nothing is owed right now'}</p>
        <p className="text-3xl font-semibold tabular-nums">{formatMinor(owed)}</p>
        {owed > 0n && BigInt(view.statementAmountMinor) !== owed ? <p className="mt-1 text-xs text-neutral-600">On this statement: {formatMinor(BigInt(view.statementAmountMinor))}. Payments since then are already taken off.</p> : null}
      </section>
      {view.lines.length ? (
        <section className="mt-5">
          <h2 className="text-sm font-medium">What this covers</h2>
          <ul className="mt-2 divide-y divide-neutral-200 text-sm">
            {view.lines.map((l, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-2"><span className="min-w-0"><span className="block break-words">{l.description}</span><span className="text-xs text-neutral-600">{day(l.date)}</span></span><span className="shrink-0 tabular-nums">{formatMinor(BigInt(l.owedMinor))}</span></li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="mt-4 text-sm"><a className="underline underline-offset-2" href={`/api/pay/${encodeURIComponent(code)}/pdf`}>Open the printable statement (PDF)</a></p>
      {view.canPay ? <PayForm code={code} owedMinor={view.owedMinor} stripeKey={process.env.NEXT_PUBLIC_STRIPE_KEY ?? ''} /> : owed > 0n ? <p className="mt-6 text-sm text-neutral-600">Online payment is not available right now. Please call the office.</p> : null}
      <p className="mt-8 text-xs text-neutral-500">Link good until {day(view.expiresAt.slice(0, 10))}. Your card number goes straight to our payment processor and is never stored by the office.</p>
    </main>
  )
}
