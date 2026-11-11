import { assertInferenceAllowed, type ProviderForGuard } from './inferenceGuard'

/**
 * InferenceAdapter (I-AI5). Every model call goes through `infer`, which loads the registered provider,
 * applies the PHI guard BEFORE any network call, then hands the request to the adapter registered for
 * that provider's kind. Tests register a stub; no real call is made from tests or from this module's guard.
 */

export type InferenceRequest = { system: string; messages: { role: 'user' | 'assistant'; content: string }[]; carriesPhi: boolean; maxTokens?: number }
export type InferenceResult = { text: string; model: string; tokens?: { input?: number; output?: number } }
export interface InferenceAdapter { key: string; complete(provider: { key: string; endpoint: string; model: string }, request: InferenceRequest): Promise<InferenceResult> }

const adapters = new Map<string, InferenceAdapter>()
export const registerInferenceAdapter = (adapter: InferenceAdapter) => { adapters.set(adapter.key, adapter) }
export const unregisterInferenceAdapter = (key: string) => { adapters.delete(key) }

/** OpenRouter: chat completions over HTTPS. Registered by default; it is used only for providers a person set up (kind no_phi). */
const openRouter: InferenceAdapter = {
  key: 'openrouter',
  async complete(provider, request) {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) throw new Error('No model key is set up.')
    const response = await fetch(`${provider.endpoint || 'https://openrouter.ai/api/v1'}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: provider.model, max_tokens: request.maxTokens ?? 300, messages: [{ role: 'system', content: request.system }, ...request.messages] }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new Error('The model did not answer.')
    const body: any = await response.json()
    return { text: String(body?.choices?.[0]?.message?.content ?? ''), model: provider.model, tokens: { input: body?.usage?.prompt_tokens, output: body?.usage?.completion_tokens } }
  },
}
registerInferenceAdapter(openRouter)

export type ProviderRow = ProviderForGuard & { endpoint: string; model: string; kind: string; baa?: { status: string; expiresOn?: Date | string | null } | null }

/** Guard first, network second. `adapterKey` picks the adapter; the provider row says whether PHI may reach it. */
export async function infer(provider: ProviderRow, adapterKey: string, request: InferenceRequest, now = new Date()): Promise<InferenceResult> {
  assertInferenceAllowed(provider, request.carriesPhi, now)
  const adapter = adapters.get(adapterKey)
  if (!adapter) throw new Error('No adapter is registered for this provider.')
  return adapter.complete({ key: provider.key, endpoint: provider.endpoint, model: provider.model }, request)
}
