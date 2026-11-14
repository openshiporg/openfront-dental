import { cache } from 'react'
import { headers } from 'next/headers'
import { keystoneContext } from '@/features/keystone/context'
import { publicSite } from '@/features/keystone/mutations/public'
import type { Site } from './api'

/** The practice's published site, read through the same public booking API the booking form uses. */
/** Cached per request: the layout and the page share one public-API call, so a page view counts once against the client limit. */
export const loadSite = cache(async (): Promise<Site | null> => {
  try {
    const row = await keystoneContext.prisma.storefrontSite.findFirst({ where: { isPublished: true }, orderBy: { createdAt: 'asc' }, select: { slug: true } })
    if (!row) return null
    const h = await headers()
    return (await publicSite(null, { slug: row.slug }, { prisma: keystoneContext.prisma, req: { headers: Object.fromEntries(h) } } as never)) as unknown as Site
  } catch {
    return null
  }
})
