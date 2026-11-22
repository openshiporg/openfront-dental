import { cache } from 'react'
import { keystoneContext } from '@/features/keystone/context'
import { readSite } from '@/features/keystone/mutations/public'
import type { Site } from './api'

/** The practice's published site. Read once per request (the layout and the page share it) and never counted against the booking limits. */
export const loadSite = cache(async (): Promise<Site | null> => {
  try {
    const row = await keystoneContext.prisma.storefrontSite.findFirst({ where: { isPublished: true }, orderBy: { createdAt: 'asc' }, select: { slug: true } })
    if (!row) return null
    return (await readSite({ prisma: keystoneContext.prisma } as never, row.slug)) as unknown as Site
  } catch {
    return null
  }
})
