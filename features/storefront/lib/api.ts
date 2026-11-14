export async function gql<T = any>(query: string, variables: Record<string, unknown> = {}, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch('/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ query, variables }) })
  const json = await res.json().catch(() => ({}))
  if (json.errors?.length) throw new Error(json.errors[0].message || 'Something went wrong. Please try again.')
  if (!res.ok) throw new Error('Something went wrong. Please try again.')
  return json.data as T
}

export type VisitType = { id: string; name: string; category: string; minutes: number | null; newPatientOnly: boolean }
export type SiteLocation = {
  id: string; name: string; phone: string; timeZone: string
  address: { line1?: string; line2?: string; city?: string; state?: string; postal?: string } | null
  hours: Record<string, [string, string][]> | null
  onlineBooking: { newPatientAllowed: boolean; requireInsuranceCapture: boolean; visitTypes: VisitType[] } | null
}
export type Site = { slug: string; practiceName: string; providers: { id: string; name: string; kind: string; specialty: string }[]; locations: SiteLocation[] }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const clock = (value: string) => {
  const [h, m] = value.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

/** "Mon–Thu 7:30 AM–5:00 PM, Fri 7:30 AM–1:00 PM" from the location's weekly hours. */
export function hoursLines(hours: SiteLocation['hours']): string[] {
  const rows = [1, 2, 3, 4, 5, 6, 0].map(d => ({ d, text: (hours?.[String(d)] ?? []).map(([a, b]) => `${clock(a)}–${clock(b)}`).join(', ') })).filter(r => r.text)
  const out: { from: number; to: number; text: string }[] = []
  for (const r of rows) {
    const last = out[out.length - 1]
    if (last && last.text === r.text && (last.to + 1) % 7 === r.d) last.to = r.d
    else out.push({ from: r.d, to: r.d, text: r.text })
  }
  return out.map(g => `${g.from === g.to ? DAYS[g.from] : `${DAYS[g.from]}–${DAYS[g.to]}`} ${g.text}`)
}

const zone = (s: string) => s.replace(/\b(EST|EDT)\b/, 'ET').replace(/\b(CST|CDT)\b/, 'CT').replace(/\b(MST|MDT)\b/, 'MT').replace(/\b(PST|PDT)\b/, 'PT')
export const zoneLabel = (timeZone: string, at = new Date()) => zone(new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).format(at)).split(' ').pop() ?? ''
export const timeLabel = (iso: string, timeZone: string) =>
  zone(new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone, timeZoneName: 'short' }).format(new Date(iso)))

export const dayLabel = (localDate: string) => {
  const [y, m, d] = localDate.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

export const addressLine = (a: SiteLocation['address']) => [a?.line1, a?.line2].filter(Boolean).join(', ') + (a?.city ? `, ${a.city}, ${a.state ?? ''} ${a.postal ?? ''}` : '')
