import { headers } from 'next/headers'
import { keystoneContext } from '@/features/keystone/context'
import { publicSite } from '@/features/keystone/mutations/public'
import type { Site } from './api'

/** The practice's published site, read through the same public booking API the booking form uses. */
export async function loadSite(): Promise<Site | null> {
  try {
    const row = await keystoneContext.prisma.storefrontSite.findFirst({ where: { isPublished: true }, orderBy: { createdAt: 'asc' }, select: { slug: true } })
    if (!row) return null
    const h = await headers()
    return (await publicSite(null, { slug: row.slug }, { prisma: keystoneContext.prisma, req: { headers: Object.fromEntries(h) } } as never)) as unknown as Site
  } catch {
    return null
  }
}
