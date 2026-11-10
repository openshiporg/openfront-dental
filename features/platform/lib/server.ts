import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

/** Staff reads go through the signed-in session, so list access rules still apply. */
export async function q<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const r = await keystoneClient<T>(query, variables)
  if (!r.success) throw new Error(r.error)
  return r.data as T
}

/** Whether the signed-in role holds at least one of these permissions (for pages whose queries would otherwise be refused). */
export async function holdsAny(names: 'canReadAudit'[]): Promise<boolean> {
  try {
    const d: any = await q(`{ authenticatedItem { ... on User { role { ${names.join(' ')} } } } }`)
    const role = d.authenticatedItem?.role
    return names.some((n) => role?.[n] === true)
  } catch {
    return false
  }
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
