/*
 * Clearinghouse interface (INTEGRATIONS §1). Business code depends on this interface and the
 * registry in index.ts, never on a provider module. Phase 3 implements eligibility; claims, status,
 * ERA, attachments and enrolment arrive with Phase 4 and are declared here as capabilities only.
 */

export type AdapterMode = 'manual_export' | 'sandbox' | 'live'

export type Capabilities = {
  eligibility: boolean; claims: boolean; predeterminations: boolean; claimStatus: boolean
  era: boolean; attachments: boolean; enrollment: boolean; payerDirectory: boolean
}

export type AdapterCtx = { mode: AdapterMode; apiKey?: string; baseUrl?: string; timeoutMs?: number; fetch?: typeof fetch; signal?: AbortSignal }

export type EligibilityRequest = {
  /** The payer's id at this clearinghouse (Payer.adapterPayerIds[key]). */
  payerId: string
  providerNpi: string
  providerName: string
  subscriber: { memberId: string; firstName: string; lastName: string; dateOfBirth: string }
  /** Only when the payer cannot identify the patient by the subscriber's member id. */
  dependent?: { firstName: string; lastName: string; dateOfBirth: string }
  /** Service type code, "35" = dental care. */
  serviceTypeCode: string
  /** Stable per request so a retry is recognised (INTEGRATIONS §2.1). */
  controlNumber: string
}

export type RawBenefit = {
  code: string
  name?: string
  serviceTypeCodes: string[]
  timeQualifierCode?: string
  coverageLevelCode?: string
  inPlanNetwork?: boolean | null
  amount?: string
  percent?: string
  quantity?: string
  quantityQualifier?: string
  message?: string
}

export type EligibilityOutcome =
  | { kind: 'responded'; planActive: boolean | null; planName?: string; benefits: RawBenefit[]; raw: unknown }
  /** A payer or clearinghouse rejection (AAA). `fixable` tells staff whether editing the member data can help. */
  | { kind: 'rejected'; codes: { code: string; field?: string; message: string; fixable: boolean }[]; raw: unknown }
  | { kind: 'error_retryable'; message: string }
  /** The call may or may not have reached the payer. Never an assumed failure, never a duplicate. */
  | { kind: 'unknown'; message: string }

export type EligibilityResult = { outcome: EligibilityOutcome; requestHash: string; adapterKey: string; mode: AdapterMode }

/** Our own canonical claim, as frozen in a ClaimVersion. The member ID is not in it: the worker adds it at send time. */
export type ClaimLinePayload = { controlNumber: string; code: string; localCode: string; tooth: string; surfaces: string; dateOfService: string; chargeMinor: string; units: number }
export type ClaimPayload = {
  patientControlNumber: string
  frequency: 'original' | 'replacement' | 'void'
  kind: string
  payer: { id: string; name: string; adapterPayerId: string }
  billing: { legalName: string; npi: string; address: Record<string, string> }
  rendering: { name: { first: string; last: string }; npi: string; taxonomy: string }
  patient: { first: string; last: string; dateOfBirth: string; sex: string }
  subscriber: { first: string; last: string; dateOfBirth: string; relationship: string; memberIdLast4: string }
  placeOfServiceCode: string
  originalPayerClaimControlNumber?: string
  lines: ClaimLinePayload[]
  totalChargeMinor: string
}
export type ClaimRequest = { payload: ClaimPayload; memberId: string; idempotencyKey: string }

export type ClaimSubmitOutcome =
  | { kind: 'accepted'; correlationId: string; lineControlNumbers: string[]; raw: unknown }
  /** The clearinghouse refused the claim as written (a fix is needed before it can go). */
  | { kind: 'rejected'; errors: { code: string; message: string; field?: string }[]; raw: unknown }
  | { kind: 'error_retryable'; message: string }
  /** The call may have reached the payer. Never an assumed failure, never a blind resend. */
  | { kind: 'unknown'; message: string }

export type ClaimStatusOutcome =
  | { kind: 'found'; status: string; correlationId?: string }
  | { kind: 'not_found' }
  | { kind: 'unknown'; message: string }

export type RemittanceListItem = { transactionId: string; processedAt: string; transactionType: '835' | '277' | 'other' }

export interface ClearinghouseAdapter {
  key: string
  displayName: string
  capabilities: Capabilities
  /** A read: retry-safe. */
  checkEligibility(req: EligibilityRequest, ctx: AdapterCtx): Promise<EligibilityResult>
  /** Retry-safe within 24 hours for one idempotency key; after that, look the claim up instead of sending again. */
  submitClaim(req: ClaimRequest, ctx: AdapterCtx): Promise<ClaimSubmitOutcome>
  checkClaimStatus(patientControlNumber: string, payerId: string, ctx: AdapterCtx): Promise<ClaimStatusOutcome>
  /** Transactions processed after `since` (callers overlap the window by a day and drop duplicates). */
  listTransactions(since: Date, ctx: AdapterCtx): Promise<{ ok: true; items: RemittanceListItem[] } | { ok: false; message: string }>
  /** The 835 or 277CA body for one transaction, as the clearinghouse returned it. */
  fetchTransaction(transactionId: string, type: '835' | '277', ctx: AdapterCtx): Promise<{ ok: true; body: unknown } | { ok: false; message: string }>
}
