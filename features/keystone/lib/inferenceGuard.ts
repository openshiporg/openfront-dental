// I-AI5: PHI reaches an inference provider only when it is registered self_hosted or baa_hosted with
// an active BAA on file. Everything else (OpenRouter and similar, kind no_phi) is refused with
// INFERENCE_PHI_BLOCKED before any network call. Pure function: callers load the provider row.
import { DomainError, Codes } from './errors'

export type InferenceProviderKind = 'self_hosted' | 'baa_hosted' | 'no_phi'

export type ProviderForGuard = {
  key: string
  kind: InferenceProviderKind | string
  isActive: boolean
  baa?: { status: string; expiresOn?: Date | string | null } | null
}

export function providerAllowsPhi(provider: ProviderForGuard, now = new Date()) {
  if (!provider.isActive) return false
  if (provider.kind === 'self_hosted') return true
  if (provider.kind !== 'baa_hosted') return false
  const baa = provider.baa
  if (!baa || baa.status !== 'active') return false
  if (baa.expiresOn && new Date(baa.expiresOn).getTime() <= now.getTime()) return false
  return true
}

/** Throws INFERENCE_PHI_BLOCKED unless the call carries no PHI or the provider may receive PHI. */
export function assertInferenceAllowed(provider: ProviderForGuard, carriesPhi: boolean, now = new Date()) {
  if (!provider.isActive) throw new DomainError(Codes.INFERENCE_PHI_BLOCKED, `Inference provider ${provider.key} is not active.`)
  if (carriesPhi && !providerAllowsPhi(provider, now)) {
    throw new DomainError(
      Codes.INFERENCE_PHI_BLOCKED,
      provider.kind === 'no_phi'
        ? `Inference provider ${provider.key} is registered as no-PHI. Configure a self-hosted model or a provider with a signed BAA for this task.`
        : `Inference provider ${provider.key} has no active BAA on file.`,
    )
  }
}
