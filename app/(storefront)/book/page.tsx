import { BookingPanel } from '@/features/storefront/components/BookingPanel'
import { loadSite } from '@/features/storefront/lib/site'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Book a visit' }

export default async function BookPage() {
  const site = await loadSite()
  if (!site) return null
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-10">
      <h1 className="mb-6 text-[2.4rem] font-semibold leading-tight text-[#0b4f4b]">Book a visit</h1>
      <BookingPanel site={site} />
    </main>
  )
}
