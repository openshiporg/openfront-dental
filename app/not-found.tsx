import Link from 'next/link'
import { connection } from 'next/server'
import { Header } from '@/features/storefront/components/Header'
import { Footer } from '@/features/storefront/components/Footer'
import { shell } from '@/features/storefront/lib/fonts'
import { loadSite } from '@/features/storefront/lib/site'

export const metadata = { title: 'Page not found' }

export default async function NotFound() {
  // Rendered per request: at build time there is no database, so a prebuilt copy has no practice name, header or footer.
  await connection()
  const site = await loadSite()
  const phone = site?.locations[0]?.phone
  return (
    <div className={`${shell} flex flex-col`}>
      {site ? <Header name={site.practiceName} phone={phone} /> : null}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-14 sm:px-10">
        <h1 className="text-[2.4rem] font-semibold leading-tight text-[#0b4f4b]">We can’t find that page.</h1>
        <p className="mt-3 text-lg">The link may be old or mistyped. You can book a visit or go back to the start.</p>
        <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/book" className="inline-flex min-h-12 items-center rounded-[3px] bg-[#dc6244] px-6 text-lg font-medium text-white hover:bg-[#c75537]">Book a visit</Link>
          <Link href="/" className="inline-flex min-h-12 items-center text-lg underline decoration-[#3a9e98] decoration-2 underline-offset-4">Home</Link>
          {phone ? <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="inline-flex min-h-12 items-center text-lg underline underline-offset-4">Call {phone}</a> : null}
        </p>
      </main>
      {site ? <Footer site={site} /> : null}
    </div>
  )
}
