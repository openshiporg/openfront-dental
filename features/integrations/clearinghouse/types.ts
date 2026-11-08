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

export interface ClearinghouseAdapter {
  key: string
  displayName: string
  capabilities: Capabilities
  /** A read: retry-safe. */
  checkEligibility(req: EligibilityRequest, ctx: AdapterCtx): Promise<EligibilityResult>
}
