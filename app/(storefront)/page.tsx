import Image from 'next/image'
import Link from 'next/link'
import { keystoneContext } from '@/features/keystone/context'
import { BookingPanel } from '@/features/storefront/components/BookingPanel'
import { addressLine, hoursLines, zoneLabel } from '@/features/storefront/lib/api'
import { loadSite } from '@/features/storefront/lib/site'

export const dynamic = 'force-dynamic'

const h2 = 'text-[2rem] font-semibold leading-tight text-[#0b4f4b] sm:text-[2.6rem]'
const dollars = (minor: bigint) => `$${minor / 100n}${minor % 100n ? `.${String(minor % 100n).padStart(2, '0')}` : ''}`

export default async function Home() {
  const site = await loadSite()
  if (!site) return null
  const plans = await keystoneContext.prisma.membershipPlan.findMany({ where: { status: 'active' }, orderBy: { priceMinor: 'desc' }, select: { id: true, name: true, ageBand: true, priceMinor: true, interval: true, discountPct: true, includedBenefits: true } }).catch(() => [])
  const first = site.locations[0]
  const visits = new Map<string, { name: string; minutes: number | null }>()
  for (const l of site.locations) for (const t of l.onlineBooking?.visitTypes ?? []) if (!visits.has(t.name)) visits.set(t.name, { name: t.name, minutes: t.minutes })
  const dentists = site.providers.filter(p => p.kind === 'dentist')
  const team = site.providers.filter(p => p.kind !== 'dentist')
  const extras = (Array.isArray((site as unknown as { services?: unknown }).services) ? ((site as unknown as { services: { name?: string }[] }).services) : []).map(s => s?.name).filter((n): n is string => Boolean(n))
  const city = site.locations.map(l => l.address?.city).filter(Boolean).join(' and ')

  return (
    <main>
      <section className="relative isolate overflow-hidden border-b border-[#e4dccd]">
        <div className="absolute inset-y-0 right-0 -z-20 hidden w-[62%] lg:block">
          <Image src="/storefront/hero.jpg" alt="" fill priority sizes="62vw" className="object-cover object-[55%_62%]" />
        </div>
        <div className="absolute inset-0 -z-10 hidden bg-gradient-to-r from-[#f7f3ec] from-[42%] to-[#f7f3ec]/0 to-[62%] lg:block" aria-hidden />
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-10 lg:py-10">
          <div className="lg:max-w-[56%]">
            <h1 className="hidden text-[3.4rem] font-semibold leading-[1.05] tracking-tight text-[#0b4f4b] lg:block xl:text-[4.2rem]">Cleanings, without the wait.</h1>
            <p className="hidden text-xl lg:mt-2 lg:block">Family dental care in {city || 'your neighborhood'}.</p>
            {first ? (
              <p className="mt-3 hidden flex-wrap gap-x-6 gap-y-1 lg:flex">
                <a href={`tel:${first.phone.replace(/[^\d+]/g, '')}`} className="underline underline-offset-2">{first.phone}</a>
                <span><strong className="font-medium">Hours</strong> {hoursLines(first.hours).join(', ')} {zoneLabel(first.timeZone)}</span>
              </p>
            ) : null}
            <div className="lg:mt-6"><BookingPanel site={site} /></div>
          </div>
          <div className="mt-8 grid grid-cols-[1.1fr_1fr] items-end gap-4 lg:hidden">
            <div><h1 className="text-[1.9rem] font-semibold leading-tight text-[#0b4f4b]">Cleanings, without the wait.</h1>
              <p className="mt-2 text-lg">Family dental care in {city || 'your neighborhood'}.</p>
              <Link href="/book" className="mt-3 inline-flex min-h-11 items-center bg-[#dc6244] px-5 font-medium text-white">Book a visit</Link></div>
            <Image src="/storefront/hero.jpg" alt="A treatment room with a window onto the bay" width={600} height={450} className="h-full max-h-56 w-full object-cover" />
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-[1440px] gap-12 px-4 py-12 sm:px-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <section id="visits" aria-labelledby="visits-h" className="scroll-mt-20">
          <h2 id="visits-h" className={h2}>Our visits</h2>
          <ul className="mt-5 divide-y divide-[#cfc6b4] border-y border-[#cfc6b4] text-lg">
            {[...visits.values()].map(v => (
              <li key={v.name} className="flex min-h-12 items-center justify-between gap-4 py-2"><span>{v.name}</span><span className="shrink-0 text-[#4c5a58]">{v.minutes ? `${v.minutes} min` : ''}</span></li>
            ))}
            {extras.map(n => <li key={n} className="flex min-h-12 items-center justify-between gap-4 py-2"><span>{n}</span><span className="shrink-0 text-[#4c5a58]">Varies</span></li>)}
          </ul>
          <p className="mt-3 text-base"><Link href="/book" className="underline decoration-[#3a9e98] decoration-2 underline-offset-4">See open times and book</Link></p>
        </section>

        <section id="dentists" aria-labelledby="dentists-h" className="scroll-mt-20">
          <h2 id="dentists-h" className={h2}>Our dentists</h2>
          <div className="mt-5 grid grid-cols-2 gap-4">
            {dentists.slice(0, 2).map((d, i) => (
              <figure key={d.id}>
                <Image src={`/storefront/dentist-${i + 1}.jpg`} alt={d.name} width={600} height={450} className="aspect-[4/3] w-full object-cover" />
                <figcaption className="mt-2 text-lg font-semibold text-[#0b4f4b]">{d.name}</figcaption>
              </figure>
            ))}
          </div>
          {dentists.length > 2 || team.length ? <p className="mt-4 text-base">Also on our team: {[...dentists.slice(2), ...team].map(p => p.name).join(', ')}.</p> : null}
        </section>
      </div>

      <div className="mx-auto grid max-w-[1440px] gap-12 px-4 pb-12 sm:px-10 lg:grid-cols-2 lg:gap-16">
        <section id="insurance" aria-labelledby="ins-h" className="scroll-mt-20">
          <h2 id="ins-h" className={h2}>Insurance</h2>
          <p className="mt-3 text-lg">Add your carrier and member ID when you book. The office checks your benefits before your visit and tells you what to expect.</p>
        </section>
        <section id="smile-club" aria-labelledby="club-h" className="scroll-mt-20">
          <h2 id="club-h" className={h2}>{plans.length ? 'Smile Club' : 'No insurance?'}</h2>
          {plans.length ? (
            <ul className="mt-3 space-y-2 text-lg">
              {plans.map(p => <li key={p.id}><strong className="font-semibold">{p.name}: {dollars(p.priceMinor)}/{p.interval === 'year' ? 'year' : 'month'}</strong>{Array.isArray(p.includedBenefits) && p.includedBenefits.length ? `. ${(p.includedBenefits as { label?: string; name?: string }[]).map(b => b.label ?? b.name).filter(Boolean).join(', ')}` : ''}{Number(p.discountPct) ? `, ${Number(p.discountPct)}% off other treatment` : ''}</li>)}
            </ul>
          ) : <p className="mt-3 text-lg">Ask the office about a membership plan for patients without insurance.</p>}
        </section>
      </div>

      <section id="locations" aria-labelledby="loc-h" className="mx-auto max-w-[1440px] scroll-mt-20 px-4 pb-14 sm:px-10">
        <h2 id="loc-h" className={h2}>Our locations</h2>
        <ul className="mt-5 grid gap-x-16 divide-y divide-[#cfc6b4] border-y border-[#cfc6b4] md:grid-cols-2 md:divide-y-0">
          {site.locations.map(l => (
            <li key={l.id} className="py-4 text-lg">
              <p className="font-semibold text-[#0b4f4b]">{l.name.replace(`${site.practiceName} — `, '')}</p>
              <p>{addressLine(l.address)}</p>
              <p><a href={`tel:${l.phone.replace(/[^\d+]/g, '')}`} className="underline underline-offset-2">{l.phone}</a></p>
              {hoursLines(l.hours).map(t => <p key={t} className="text-base text-[#4c5a58]">{t} {zoneLabel(l.timeZone)}</p>)}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
