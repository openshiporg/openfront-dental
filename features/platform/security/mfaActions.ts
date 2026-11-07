'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sanitizeDashboardRedirect } from '@/features/dashboard/lib/security';
import { secretGraphql } from '@/features/platform/lib/secretGraphql';

// adapted from openfront-hotel@0a75ba4 features/platform/guest-governance/mfaActions.ts
const SESSION_COOKIE = 'keystonejs-session';
const cookieOptions = { secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', httpOnly: true, maxAge: 60 * 60 * 12 };

export async function completeMfa(_previous: { message: string }, form: FormData) {
  const from = sanitizeDashboardRedirect(form.get('from'));
  try {
    const response = await secretGraphql<{ verifyMfa: { sessionToken?: string } }>(
      'mutation($code:String!,$recovery:Boolean){ verifyMfa(code:$code,recovery:$recovery) }',
      { code: String(form.get('code') || '').trim(), recovery: form.get('recovery') === 'on' },
    );
    if (!response.success) return { message: response.error };
    const token = response.data.verifyMfa?.sessionToken;
    if (!token) return { message: 'Verification did not issue a session. Sign in again.' };
    (await cookies()).set(SESSION_COOKIE, token, cookieOptions);
  } catch {
    return { message: 'Verification failed. Sign in again.' };
  }
  redirect(from);
}

export type MfaChange =
  | { ok: true; secret?: string; provisioningUri?: string; recoveryCodes?: string[]; signedOut?: boolean; enrolled?: boolean }
  | { ok: false; error: string };

export async function changeMfa(action: 'enrol' | 'confirm' | 'rotate_recovery' | 'disable', password: string, code: string, recovery = false): Promise<MfaChange> {
  const response = await secretGraphql<{ manageMfa: any }>(
    'mutation($action:String!,$password:String!,$code:String,$recovery:Boolean){ manageMfa(action:$action,password:$password,code:$code,recovery:$recovery) }',
    { action, password, code: code || null, recovery },
  );
  if (!response.success) return { ok: false, error: response.error };
  const result = response.data.manageMfa ?? {};
  if (result.signedOut) (await cookies()).delete(SESSION_COOKIE);
  return { ok: true, ...result };
}
