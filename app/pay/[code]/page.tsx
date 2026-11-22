import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { keystoneContext } from '@/features/keystone/context'
import { openPayLink } from '@/features/keystone/lib/payLink'
import { formatMinor } from '@/features/keystone/lib/money'
import { Brand } from '@/features/storefront/components/Brand'
import { shell } from '@/features/storefront/lib/fonts'
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
    <div className={shell}>
    <header className="border-b border-[#e4dccd]"><div className="mx-auto max-w-xl px-4 py-1"><Brand name={view.practiceName} /></div></header>
    <main className="mx-auto max-w-xl px-4 py-8">
      <p className="text-base text-[#4c5a58]">{view.locationName.startsWith(view.practiceName) ? view.locationName : `${view.practiceName}${view.locationName ? ` · ${view.locationName}` : ''}`}</p>
      <h1 className="mt-1 text-[2rem] font-semibold leading-tight text-[#0b4f4b]">Your statement</h1>
      <p className="text-base text-[#4c5a58]">Statement {view.ref} · due {day(view.dueDate)}</p>
      <section className="mt-5 border-l-4 border-[#3a9e98] bg-white/80 p-4">
        <p className="text-base text-[#4c5a58]">{owed > 0n ? 'Amount you owe' : 'Nothing is owed right now'}</p>
        <p className="text-[2.2rem] font-semibold leading-tight tabular-nums text-[#0b4f4b]">{formatMinor(owed)}</p>
        {owed > 0n && BigInt(view.statementAmountMinor) !== owed ? <p className="mt-1 text-sm text-[#4c5a58]">On this statement: {formatMinor(BigInt(view.statementAmountMinor))}. Payments since then are already taken off.</p> : null}
      </section>
      {view.lines.length ? (
        <section className="mt-5">
          <h2 className="text-lg font-medium text-[#0b4f4b]">What this covers</h2>
          <ul className="mt-2 divide-y divide-[#cfc6b4] border-y border-[#cfc6b4] text-base">
            {view.lines.map((l, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-2"><span className="min-w-0"><span className="block break-words">{l.description}</span><span className="text-sm text-[#4c5a58]">{day(l.date)}</span></span><span className="shrink-0 tabular-nums">{formatMinor(BigInt(l.owedMinor))}</span></li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="mt-2 text-base"><a className="inline-flex min-h-11 items-center underline decoration-[#3a9e98] decoration-2 underline-offset-4" href={`/api/pay/${encodeURIComponent(code)}/pdf`}>Open the printable statement (PDF)</a></p>
      {view.canPay ? <PayForm code={code} owedMinor={view.owedMinor} stripeKey={process.env.NEXT_PUBLIC_STRIPE_KEY ?? ''} /> : owed > 0n ? <p className="mt-6 text-base">Online payment is not available right now. Please call the office.</p> : null}
      <p className="mt-8 text-sm text-[#4c5a58]">Link good until {day(view.expiresAt.slice(0, 10))}. Your card number goes straight to our payment processor and is never stored by the office.</p>
    </main>
    </div>
  )
}
