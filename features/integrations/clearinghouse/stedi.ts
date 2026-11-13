import { z } from 'zod'
import { eligibilityRequestHash } from './canonical'
import { describeAaa } from './errors'
import type { AdapterCtx, ClaimRequest, ClaimSubmitOutcome, ClearinghouseAdapter, EligibilityOutcome, RawBenefit } from './types'

/*
 * Stedi eligibility (INTEGRATIONS §2.1): POST {base}/2026-06-01/eligibility-check, JSON in, JSON out.
 * The key comes from the connected installation (or STEDI_API_KEY) and the base URL from its config. A timeout or a dropped connection is `unknown`: the request may
 * have reached the payer, so it is reconciled by a re-query with the same request hash, never
 * treated as rejected and never duplicated. The response is parsed with Zod; unknown fields are
 * kept in `raw`.
 */

export const STEDI_BASE = 'https://healthcare.us.stedi.com'
export const STEDI_ELIGIBILITY_PATH = '/2026-06-01/eligibility-check'
export const STEDI_DENTAL_CLAIMS_PATH = '/2024-04-01/dental-claims/submission'
export const STEDI_CLAIM_STATUS_PATH = '/2024-04-01/change/medicalnetwork/claimstatus/v2'
export const STEDI_POLL_PATH = '/2024-04-01/polling/transactions'
export const stediReportPath = (id: string, type: '835' | '277') => `/2024-04-01/change/medicalnetwork/reports/v2/${encodeURIComponent(id)}/${type}`

const yyyymmdd = (date: string) => date.replaceAll('-', '')
/** Minor units to the decimal text Stedi expects, with no floating point. */
export const decimalOf = (minor: string | bigint) => { const m = BigInt(minor); const abs = m < 0n ? -m : m; return `${m < 0n ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}` }

/** Our canonical claim to Stedi's dental claim JSON (INTEGRATIONS §2.3). Teeth and surfaces ride on each service line. */
export function buildStediClaimBody(req: ClaimRequest) {
  const c = req.payload
  return {
    usageIndicator: 'T',
    tradingPartnerServiceId: c.payer.adapterPayerId,
    tradingPartnerName: c.payer.name,
    submitter: { organizationName: c.billing.legalName, contactInformation: { name: c.billing.legalName, phoneNumber: '0000000000' } },
    billing: { providerType: 'BillingProvider', organizationName: c.billing.legalName, npi: c.billing.npi, address: { address1: c.billing.address.line1 ?? '', city: c.billing.address.city ?? '', state: c.billing.address.state ?? '', postalCode: (c.billing.address.postal ?? '').replace(/\D/g, '') } },
    subscriber: { memberId: req.memberId, firstName: c.subscriber.first, lastName: c.subscriber.last, dateOfBirth: yyyymmdd(c.subscriber.dateOfBirth), paymentResponsibilityLevelCode: 'P' },
    ...(c.subscriber.relationship !== 'self' ? { dependent: { firstName: c.patient.first, lastName: c.patient.last, dateOfBirth: yyyymmdd(c.patient.dateOfBirth), gender: c.patient.sex === 'female' ? 'F' : c.patient.sex === 'male' ? 'M' : 'U', relationshipToSubscriberCode: '19' } } : {}),
    claimInformation: {
      claimFilingCode: 'FI', patientControlNumber: c.patientControlNumber, claimChargeAmount: decimalOf(c.totalChargeMinor), placeOfServiceCode: c.placeOfServiceCode,
      claimFrequencyCode: c.frequency === 'original' ? '1' : c.frequency === 'replacement' ? '7' : '8', signatureIndicator: 'Y', planParticipationCode: 'A', benefitsAssignmentCertificationIndicator: 'Y', releaseInformationCode: 'Y',
      ...(c.originalPayerClaimControlNumber ? { claimSupplementalInformation: { payerClaimControlNumber: c.originalPayerClaimControlNumber } } : {}),
      serviceLines: c.lines.map(l => ({
        serviceDate: yyyymmdd(l.dateOfService), providerControlNumber: l.controlNumber,
        renderingProvider: { npi: c.rendering.npi, taxonomyCode: c.rendering.taxonomy, firstName: c.rendering.name.first, lastName: c.rendering.name.last },
        dentalService: { procedureCode: l.code, lineItemChargeAmount: decimalOf(l.chargeMinor), procedureCount: l.units, placeOfServiceCode: c.placeOfServiceCode },
        ...(l.tooth ? { teethInformation: [{ toothCode: l.tooth, ...(l.surfaces ? { toothSurfaceCodes: l.surfaces.split('') } : {}) }] } : {}),
      })),
    },
  }
}

export async function stediSubmitClaim(req: ClaimRequest, ctx: AdapterCtx): Promise<ClaimSubmitOutcome> {
  if (ctx.mode === 'live') return { kind: 'error_retryable', message: 'Live Stedi is not enabled in this build.' }
  if (!ctx.apiKey) return { kind: 'error_retryable', message: 'No Stedi clearinghouse key is connected. Verify by phone or the payer portal.' }
  const doFetch = ctx.fetch ?? fetch
  let response: Response
  try {
    response = await doFetch(`${ctx.baseUrl ?? STEDI_BASE}${STEDI_DENTAL_CLAIMS_PATH}`, {
      method: 'POST', signal: ctx.signal ?? AbortSignal.timeout(ctx.timeoutMs ?? 20_000),
      headers: { 'content-type': 'application/json', authorization: ctx.apiKey, 'idempotency-key': req.idempotencyKey }, body: JSON.stringify(buildStediClaimBody(req)),
    })
  } catch {
    // The request may have been received. Not an assumed failure, never a blind resend.
    return { kind: 'unknown', message: 'The clearinghouse did not answer in time. The claim may have been received.' }
  }
  if (response.status === 401 || response.status === 403) return { kind: 'error_retryable', message: 'The clearinghouse key was refused.' }
  if (response.status === 429) return { kind: 'error_retryable', message: 'The clearinghouse is busy. It will be tried again.' }
  if (response.status >= 500) return { kind: 'unknown', message: 'The clearinghouse did not complete the request. The claim may have been received.' }
  let body: any
  try { body = await response.json() } catch { return { kind: 'unknown', message: 'The response could not be read. The claim may have been received.' } }
  if (response.ok && body?.status === 'SUCCESS') {
    return { kind: 'accepted', correlationId: String(body.claimReference?.correlationId ?? ''), lineControlNumbers: (body.claimReference?.serviceLines ?? []).map((l: any) => String(l.lineItemControlNumber ?? '')), raw: body }
  }
  const errors = [...(body?.errors ?? []), ...(body?.failure ? [body.failure] : [])].map((e: any) => ({ code: String(e.code ?? ''), message: String(e.description ?? e.message ?? 'The clearinghouse refused the claim.').slice(0, 300), field: e.location ? String(e.location) : undefined }))
  return { kind: 'rejected', errors: errors.length ? errors : [{ code: 'rejected', message: 'The clearinghouse refused the claim.' }], raw: body }
}

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
  displayName: 'Stedi clearinghouse',
  capabilities: { eligibility: true, claims: true, predeterminations: false, claimStatus: true, era: true, attachments: false, enrollment: false, payerDirectory: false },
  async checkEligibility(req, ctx) {
    const requestHash = eligibilityRequestHash(req, 'stedi')
    const done = (outcome: EligibilityOutcome) => ({ outcome, requestHash, adapterKey: 'stedi', mode: ctx.mode })
    if (ctx.mode === 'live') return done({ kind: 'error_retryable', message: 'Live Stedi is not enabled in this build.' })
    if (!ctx.apiKey) return done({ kind: 'error_retryable', message: 'No Stedi clearinghouse key is connected. Verify by phone or the payer portal.' })
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
  submitClaim: stediSubmitClaim,
  async checkClaimStatus(patientControlNumber, payerId, ctx) {
    if (!ctx.apiKey) return { kind: 'unknown', message: 'No Stedi clearinghouse key is connected. Verify by phone or the payer portal.' }
    try {
      const response = await (ctx.fetch ?? fetch)(`${ctx.baseUrl ?? STEDI_BASE}${STEDI_CLAIM_STATUS_PATH}`, {
        method: 'POST', signal: ctx.signal ?? AbortSignal.timeout(ctx.timeoutMs ?? 20_000), headers: { 'content-type': 'application/json', authorization: ctx.apiKey },
        body: JSON.stringify({ tradingPartnerServiceId: payerId, encounter: { submittedAmount: '0' }, patientControlNumber }),
      })
      if (!response.ok) return { kind: 'unknown', message: 'The status lookup did not complete.' }
      const body: any = await response.json()
      const status = body?.claims?.[0]?.claimStatus?.statusCategoryCode ?? body?.claimStatus?.statusCategoryCode
      return status ? { kind: 'found', status: String(status), correlationId: body?.meta?.traceId } : { kind: 'not_found' }
    } catch { return { kind: 'unknown', message: 'The status lookup did not complete.' } }
  },
  async listTransactions(since, ctx) {
    if (!ctx.apiKey) return { ok: false, message: 'No Stedi clearinghouse key is connected. Verify by phone or the payer portal.' }
    try {
      const items: { transactionId: string; processedAt: string; transactionType: '835' | '277' | 'other' }[] = []
      let token = ''
      for (let page = 0; page < 20; page += 1) {
        const url = new URL(`${ctx.baseUrl ?? STEDI_BASE}${STEDI_POLL_PATH}`)
        url.searchParams.set('startDateTime', since.toISOString()); url.searchParams.set('pageSize', '100')
        if (token) url.searchParams.set('pageToken', token)
        const response = await (ctx.fetch ?? fetch)(url.toString(), { method: 'GET', signal: ctx.signal ?? AbortSignal.timeout(ctx.timeoutMs ?? 20_000), headers: { authorization: ctx.apiKey } })
        if (!response.ok) return { ok: false, message: 'The clearinghouse did not list transactions.' }
        const body: any = await response.json()
        for (const t of body.items ?? []) {
          const type = String(t.x12?.metadata?.transaction?.transactionSetIdentifier ?? t.transactionType ?? '')
          items.push({ transactionId: String(t.transactionId), processedAt: String(t.processedAt ?? ''), transactionType: type === '835' ? '835' : type === '277' ? '277' : 'other' })
        }
        token = String(body.nextPageToken ?? '')
        if (!token) break
      }
      return { ok: true, items }
    } catch { return { ok: false, message: 'The clearinghouse did not list transactions.' } }
  },
  async fetchTransaction(transactionId, type, ctx) {
    if (!ctx.apiKey) return { ok: false, message: 'No Stedi clearinghouse key is connected. Verify by phone or the payer portal.' }
    try {
      const response = await (ctx.fetch ?? fetch)(`${ctx.baseUrl ?? STEDI_BASE}${stediReportPath(transactionId, type)}`, { method: 'GET', signal: ctx.signal ?? AbortSignal.timeout(ctx.timeoutMs ?? 20_000), headers: { authorization: ctx.apiKey } })
      if (!response.ok) return { ok: false, message: 'The report could not be fetched.' }
      return { ok: true, body: await response.json() }
    } catch { return { ok: false, message: 'The report could not be fetched.' } }
  },
}
