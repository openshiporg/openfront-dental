import { headers } from 'next/headers';

import { getAuthHeaders } from '@/features/dashboard/lib/cookies';
import type { KeystoneResponse } from '@/features/dashboard/lib/keystoneClient';
import { getServerGraphQLTarget } from '@/features/dashboard/lib/getBaseUrl';

const FAILURE = 'The request could not be completed.';

/**
 * Operations that carry a password or one-time code. Same staff session as keystoneClient, but sent
 * over the internal endpoint and never logged, because the shared client's error log can include
 * request details. Errors return only their public message and code.
 * adapted from openfront-hotel@0a75ba4 features/platform/lib/secretGraphql.ts
 */
export async function secretGraphql<T = any>(query: string, variables: Record<string, unknown>, sessionToken?: string): Promise<KeystoneResponse<T>> {
  try {
    const incoming = await headers().catch(() => null);
    const { endpoint, fetch: internalFetch } = await getServerGraphQLTarget(incoming);
    const response = await (internalFetch ?? fetch)(endpoint, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json', ...(sessionToken ? { Cookie: `keystonejs-session=${sessionToken}` } : await getAuthHeaders()) },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json().catch(() => null) as { data?: T; errors?: { message?: string; extensions?: { code?: string } }[] } | null;
    if (payload?.errors?.length) {
      const first = payload.errors[0];
      const code = first?.extensions?.code;
      const safe = code && /^[A-Z_]+$/.test(code) ? first?.message || FAILURE : FAILURE;
      return { success: false, error: safe, errors: payload.errors.map(e => ({ message: e.message, code: e.extensions?.code })) };
    }
    if (!payload?.data) return { success: false, error: FAILURE };
    return { success: true, data: payload.data };
  } catch {
    return { success: false, error: FAILURE };
  }
}
