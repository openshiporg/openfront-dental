import type { MetadataRoute } from 'next'

const base = () => (process.env.SMTP_STORE_LINK || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

/** Search engines see the patient site only: never the staff dashboard, a pay link or the API. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: ['/dashboard', '/pay', '/api', '/oauth', '/account'] }, ...(base() ? { sitemap: `${base()}/sitemap.xml` } : {}) }
}
