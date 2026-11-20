import type { Metadata } from 'next'
import { Figtree, Tektur } from 'next/font/google'
import { Header } from '@/features/storefront/components/Header'
import { Footer } from '@/features/storefront/components/Footer'
import { loadSite } from '@/features/storefront/lib/site'

const body = Figtree({ subsets: ['latin'], variable: '--font-sf-body' })
const brand = Tektur({ subsets: ['latin'], variable: '--font-sf-brand', weight: ['400', '600'] })

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const site = await loadSite()
  return { title: { absolute: site ? `${site.practiceName}: family dental care` : 'Family dental care', template: site ? `%s | ${site.practiceName}` : '%s' }, description: 'Book a visit online. Family dental care.' }
}

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const site = await loadSite()
  if (!site) {
    return (
      <main className={`${body.variable} ${brand.variable} grid min-h-dvh place-items-center bg-[#f7f3ec] p-6 font-[family-name:var(--font-sf-body)] text-[#1b2b2a]`}>
        <p className="max-w-md text-center text-lg">Online booking is not open yet. Please call the office.</p>
      </main>
    )
  }
  return (
    <div className={`${body.variable} ${brand.variable} min-h-dvh bg-[#f7f3ec] font-[family-name:var(--font-sf-body)] text-[#1b2b2a] antialiased`}>
      <Header name={site.practiceName} />
      {children}
      <Footer site={site} />
    </div>
  )
}
