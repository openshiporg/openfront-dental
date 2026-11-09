import active from './fixtures/eligibility-active.json'
import activeEvergreen from './fixtures/eligibility-active-evergreen.json'
import inactive from './fixtures/eligibility-inactive.json'
import aaa75 from './fixtures/eligibility-aaa-75.json'
import aaa42 from './fixtures/eligibility-aaa-42.json'

/**
 * The recorded Stedi sandbox transport: answers the eligibility call from fixtures keyed by member id,
 * with no network and no key. The sandbox installation of the sample practice uses it (INTEGRATIONS §2.2).
 * Member ids ending SUM-4405-E behave like a payer that never answers. Each active member is one payer's answer:
 * SUM-4401-A is Harbor's (Summit PPO Plus), EVG-5501-K is Evergreen's own (different maximum, deductible and percentages),
 * so a secondary never shows the primary's benefits.
 */
export const RECORDED_MEMBERS: Record<string, unknown> = {
  'SUM-4401-A': active, 'SUM-4402-B': inactive, 'SUM-4403-C': aaa75, 'SUM-4404-D': aaa42, 'EVG-5501-K': activeEvergreen,
}

export const recordedFetch = (async (_url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body))
  const member = String(body.subscriber?.memberId ?? '')
  if (member === 'SUM-4405-E') throw Object.assign(new Error('timeout'), { name: 'TimeoutError' })
  if (member === 'SUM-4406-F') return new Response('{}', { status: 504 })
  return new Response(JSON.stringify(RECORDED_MEMBERS[member] ?? aaa75), { status: 200 })
}) as unknown as typeof fetch
