import { notFound } from 'next/navigation'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import type { Permission } from '@/features/keystone/access'
import { PLATFORM_PAGE_PERMISSIONS, type GatedPage } from './pageAccess'

/** Staff reads go through the signed-in session, so list access rules still apply. */
export async function q<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const r = await keystoneClient<T>(query, variables)
  if (!r.success) throw new Error(r.error)
  return r.data as T
}

/** Whether the signed-in role holds at least one of these permissions (for pages whose queries would otherwise be refused). */
export async function holdsAny(names: readonly Permission[]): Promise<boolean> {
  try {
    const d: any = await q(`{ authenticatedItem { ... on User { role { ${names.join(' ')} } } } }`)
    const role = d.authenticatedItem?.role
    return names.some((n) => role?.[n] === true)
  } catch {
    return false
  }
}

/** A screen the role has no use for is not there (P6 r1 B5): 404, the same set the sidebar uses. Call before any data query. */
export async function requirePage(page: GatedPage): Promise<void> {
  if (!(await holdsAny(PLATFORM_PAGE_PERMISSIONS[page]))) notFound()
}

/** The practice's default time zone (PracticeSettings.defaultTimeZone); each location also has its own. */
export async function practiceTimeZone(): Promise<string> {
  try {
    const d: any = await q(`{ practiceSettings { defaultTimeZone } }`)
    return d.practiceSettings?.defaultTimeZone || 'America/New_York'
  } catch {
    return 'America/New_York'
  }
}
