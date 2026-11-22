import type { MetadataRoute } from 'next'

export const dynamic = 'force-dynamic'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.SMTP_STORE_LINK || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  if (!base) return []
  return [{ url: `${base}/`, changeFrequency: 'weekly', priority: 1 }, { url: `${base}/book`, changeFrequency: 'daily', priority: 0.9 }]
}
