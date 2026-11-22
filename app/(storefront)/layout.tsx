import type { Metadata, Viewport } from 'next'
import { Header } from '@/features/storefront/components/Header'
import { Footer } from '@/features/storefront/components/Footer'
import { shell } from '@/features/storefront/lib/fonts'
import { loadSite } from '@/features/storefront/lib/site'

export const viewport: Viewport = { themeColor: '#f7f3ec', colorScheme: 'light' }

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const site = await loadSite()
  const base = (process.env.SMTP_STORE_LINK || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  const title = site ? `${site.practiceName}: family dental care` : 'Family dental care'
  const city = site ? site.locations.map(l => l.address?.city).filter(Boolean).join(' and ') : ''
  const description = site ? `Book a dental visit online at ${site.practiceName}${city ? ` in ${city}` : ''}. Cleanings, check-ups, emergencies and new patients.` : 'Book a dental visit online.'
  return {
    ...(base ? { metadataBase: new URL(base) } : {}),
    title: { absolute: title, template: site ? `%s | ${site.practiceName}` : '%s' },
    description,
    openGraph: { type: 'website', title, description, siteName: site?.practiceName, images: [{ url: '/storefront/hero.jpg', alt: 'A treatment room with a window onto the bay' }] },
    twitter: { card: 'summary_large_image', title, description, images: ['/storefront/hero.jpg'] },
  }
}

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const site = await loadSite()
  if (!site) {
    return (
      <main className={`${shell} grid place-items-center p-6`}>
        <p className="max-w-md text-center text-lg">Online booking is not open yet. Please call the office.</p>
      </main>
    )
  }
  return (
    <div className={shell}>
      <Header name={site.practiceName} phone={site.locations[0]?.phone} />
      {children}
      <Footer site={site} />
    </div>
  )
}
