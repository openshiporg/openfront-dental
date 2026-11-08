import { z } from 'zod'
import { eligibilityRequestHash } from './canonical'
import { describeAaa } from './errors'
import type { ClearinghouseAdapter, EligibilityOutcome, RawBenefit } from './types'

/*
 * Stedi eligibility (INTEGRATIONS §2.1): POST {base}/2026-06-01/eligibility-check, JSON in, JSON out.
 * Sandbox mode only in this build: the key is a Stedi test key and the base URL is injected (a
 * recorded-fixture fake in tests). A timeout or a dropped connection is `unknown`: the request may
 * have reached the payer, so it is reconciled by a re-query with the same request hash, never
 * treated as rejected and never duplicated. The response is parsed with Zod; unknown fields are
 * kept in `raw`.
 */

export const STEDI_BASE = 'https://healthcare.us.stedi.com'
export const STEDI_ELIGIBILITY_PATH = '/2026-06-01/eligibility-check'

const benefitSchema = z.object({
  code: z.string(),
  name: z.string().optional(),
  serviceTypeCodes: z.array(z.string()).default([]),
  timeQualifierCode: z.string().optional(),
  coverageLevelCode: z.string().optional(),
  inPlanNetworkIndicatorCode: z.string().optional(),
  benefitAmount: z.string().optional(),
  benefitPercent: z.string().optional(),
  benefitQuantity: z.string().optional(),
  quantityQualifier: z.string().optional(),
  additionalInformation: z.array(z.object({ description: z.string().optional() })).optional(),
}).passthrough()

const responseSchema = z.object({
  planStatus: z.array(z.object({ statusCode: z.string().optional(), status: z.string().optional(), planDetails: z.string().optional() }).passthrough()).optional(),
  benefitsInformation: z.array(benefitSchema).optional(),
  errors: z.array(z.object({ code: z.string(), description: z.string().optional(), field: z.string().optional(), followupAction: z.string().optional() }).passthrough()).optional(),
}).passthrough()

export function buildStediBody(req: Parameters<ClearinghouseAdapter['checkEligibility']>[0]) {
  return {
    controlNumber: req.controlNumber,
    tradingPartnerServiceId: req.payerId,
    provider: { organizationName: req.providerName, npi: req.providerNpi },
    subscriber: { memberId: req.subscriber.memberId, firstName: req.subscriber.firstName, lastName: req.subscriber.lastName, dateOfBirth: req.subscriber.dateOfBirth.replaceAll('-', '') },
    ...(req.dependent ? { dependents: [{ firstName: req.dependent.firstName, lastName: req.dependent.lastName, dateOfBirth: req.dependent.dateOfBirth.replaceAll('-', '') }] } : {}),
    encounter: { serviceTypeCodes: [req.serviceTypeCode] },
  }
}

export function parseStediResponse(body: unknown): EligibilityOutcome {
  const parsed = responseSchema.safeParse(body)
  if (!parsed.success) return { kind: 'unknown', message: 'The response could not be read. It will be re-checked.' }
  const data = parsed.data
  if (data.errors?.length) {
    const codes = data.errors.map(e => { const d = describeAaa(e.code, e.description); return { code: e.code, field: e.field, message: d.message, fixable: d.fixable } })
    const retryable = data.errors.every(e => describeAaa(e.code).retryable)
    return retryable ? { kind: 'error_retryable', message: codes[0].message } : { kind: 'rejected', codes, raw: body }
  }
  const status = data.planStatus?.[0]?.statusCode
  const benefits: RawBenefit[] = (data.benefitsInformation ?? []).map(b => ({
    code: b.code, name: b.name, serviceTypeCodes: b.serviceTypeCodes, timeQualifierCode: b.timeQualifierCode, coverageLevelCode: b.coverageLevelCode,
    inPlanNetwork: b.inPlanNetworkIndicatorCode === 'Y' ? true : b.inPlanNetworkIndicatorCode === 'N' ? false : null,
    amount: b.benefitAmount, percent: b.benefitPercent, quantity: b.benefitQuantity, quantityQualifier: b.quantityQualifier,
    message: b.additionalInformation?.map(a => a.description).filter(Boolean).join(' '),
  }))
  const active = benefits.some(b => b.code === '1') ? true : benefits.some(b => ['6', '7', '8'].includes(b.code)) ? false : status === '1' ? true : null
  return { kind: 'responded', planActive: active, planName: data.planStatus?.[0]?.planDetails, benefits, raw: body }
}

export const stediAdapter: ClearinghouseAdapter = {
  key: 'stedi',
  displayName: 'Stedi (sandbox)',
  capabilities: { eligibility: true, claims: false, predeterminations: false, claimStatus: false, era: false, attachments: false, enrollment: false, payerDirectory: false },
  async checkEligibility(req, ctx) {
    const requestHash = eligibilityRequestHash(req, 'stedi')
    const done = (outcome: EligibilityOutcome) => ({ outcome, requestHash, adapterKey: 'stedi', mode: ctx.mode })
    if (ctx.mode === 'live') return done({ kind: 'error_retryable', message: 'Live Stedi is not enabled in this build.' })
    if (!ctx.apiKey) return done({ kind: 'error_retryable', message: 'The Stedi sandbox key is not configured.' })
    const doFetch = ctx.fetch ?? fetch
    const signal = ctx.signal ?? AbortSignal.timeout(ctx.timeoutMs ?? 15_000)
    let response: Response
    try {
      response = await doFetch(`${ctx.baseUrl ?? STEDI_BASE}${STEDI_ELIGIBILITY_PATH}`, {
        method: 'POST', signal, headers: { 'content-type': 'application/json', authorization: ctx.apiKey }, body: JSON.stringify(buildStediBody(req)),
      })
    } catch {
      return done({ kind: 'unknown', message: 'The payer did not answer in time. The check may have been received; it will be re-checked, not repeated.' })
    }
    if (response.status === 429 || response.status >= 500) return done(response.status >= 502 && response.status <= 504 ? { kind: 'unknown', message: 'The clearinghouse did not complete the request.' } : { kind: 'error_retryable', message: 'The clearinghouse is busy. Try again shortly.' })
    if (response.status === 401 || response.status === 403) return done({ kind: 'error_retryable', message: 'The clearinghouse key was refused.' })
    let body: unknown
    try { body = await response.json() } catch { return done({ kind: 'unknown', message: 'The response could not be read.' }) }
    if (!response.ok) {
      const parsed = parseStediResponse(body)
      return done(parsed.kind === 'responded' ? { kind: 'error_retryable', message: 'The clearinghouse refused the request.' } : parsed)
    }
    return done(parseStediResponse(body))
  },
}
