import active from './fixtures/eligibility-active.json'
import activeEvergreen from './fixtures/eligibility-active-evergreen.json'
import inactive from './fixtures/eligibility-inactive.json'
import aaa75 from './fixtures/eligibility-aaa-75.json'
import aaa42 from './fixtures/eligibility-aaa-42.json'

/**
 * Test double only (never imported by the app): answers the eligibility call from fixtures keyed by member id,
 * with no network and no key.
 * Member ids ending SUM-4405-E behave like a payer that never answers. Each active member is one payer's answer:
 * SUM-4401-A is Harbor's (Summit PPO Plus), EVG-5501-K is Evergreen's own (different maximum, deductible and percentages),
 * so a secondary never shows the primary's benefits.
 */
export const RECORDED_MEMBERS: Record<string, unknown> = {
  'SUM-4401-A': active, 'SUM-4402-B': inactive, 'SUM-4403-C': aaa75, 'SUM-4404-D': aaa42, 'EVG-5501-K': activeEvergreen,
}

/** Claim submission, status and report calls in the recorded responses. Member SUM-4402-B is refused as inactive; SUM-4405-E never answers; SUM-4406-F fails upstream. */
function recordedClaimCall(url: string, init: RequestInit) {
  const method = String(init.method ?? 'GET')
  if (url.includes('/dental-claims/submission')) {
    const body = JSON.parse(String(init.body))
    const member = String(body.subscriber?.memberId ?? '')
    if (member === 'SUM-4405-E') throw Object.assign(new Error('timeout'), { name: 'TimeoutError' })
    if (member === 'SUM-4406-F') return new Response('{}', { status: 504 })
    if (member === 'SUM-4402-B') return new Response(JSON.stringify({ status: 'ERROR', errors: [{ code: '33', description: 'Subscriber coverage is not active on the date of service.', location: 'subscriber.memberId' }] }), { status: 400 })
    const lines = (body.claimInformation?.serviceLines ?? []).map((l: any) => ({ lineItemControlNumber: l.providerControlNumber }))
    return new Response(JSON.stringify({ status: 'SUCCESS', claimReference: { correlationId: `rec-${String(body.claimInformation?.patientControlNumber ?? '').toLowerCase()}`, patientControlNumber: body.claimInformation?.patientControlNumber, serviceLines: lines } }), { status: 200 })
  }
  if (url.includes('/claimstatus/')) return new Response(JSON.stringify({ claims: [{ claimStatus: { statusCategoryCode: 'F1' } }] }), { status: 200 })
  if (url.includes('/polling/transactions')) return new Response(JSON.stringify({ items: [] }), { status: 200 })
  if (url.includes('/reports/v2/')) return new Response('{}', { status: 404 })
  void method
  return null
}

export const recordedFetch = (async (url: string, init: RequestInit) => {
  const claimCall = recordedClaimCall(String(url), init)
  if (claimCall) return claimCall
  const body = JSON.parse(String(init.body))
  const member = String(body.subscriber?.memberId ?? '')
  if (member === 'SUM-4405-E') throw Object.assign(new Error('timeout'), { name: 'TimeoutError' })
  if (member === 'SUM-4406-F') return new Response('{}', { status: 504 })
  return new Response(JSON.stringify(RECORDED_MEMBERS[member] ?? aaa75), { status: 200 })
}) as unknown as typeof fetch
