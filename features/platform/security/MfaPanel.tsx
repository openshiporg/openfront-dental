'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changeMfa, type MfaChange } from './mfaActions';

type Step = { kind: 'idle' } | { kind: 'enrolling'; secret: string; uri: string } | { kind: 'codes'; codes: string[] };

/** Enrol, confirm, rotate recovery codes or turn off the second factor. Every change asks for the password. */
export function MfaPanel({ enrolled }: { enrolled: boolean }) {
  const router = useRouter();
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [step, setStep] = React.useState<Step>({ kind: 'idle' });
  const [error, setError] = React.useState('');
  const [pending, start] = React.useTransition();

  const run = (action: Parameters<typeof changeMfa>[0], after: (r: Extract<MfaChange, { ok: true }>) => void) => {
    setError('');
    start(async () => {
      const result = await changeMfa(action, password, code);
      if (!result.ok) { setError(result.error); return; }
      setCode('');
      after(result);
      // Codes are shown once; the session already ended, so the next step is signing in again.
      if (result.signedOut && !result.recoveryCodes?.length) { window.location.assign('/dashboard/signin'); return; }
      if (!result.signedOut) router.refresh();
    });
  };

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-muted-foreground">
        {enrolled
          ? 'Sign-in asks for a code from your authenticator app after your password. Changing the factor signs out your other sessions.'
          : 'Add a code from an authenticator app (any TOTP app) to your sign-in. Practices handling patient records should turn this on for every staff member.'}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="mfa-password">Current password</Label>
          <Input id="mfa-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1" />
        </div>
        {(enrolled || step.kind === 'enrolling') ? (
          <div>
            <Label htmlFor="mfa-code">{step.kind === 'enrolling' ? 'Code from the app' : 'Current code'}</Label>
            <Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={64} value={code} onChange={e => setCode(e.target.value)} className="mt-1" />
          </div>
        ) : null}
      </div>

      {step.kind === 'enrolling' ? (
        <div className="space-y-2 rounded-md border p-3 text-sm">
          <p>Add this key to your authenticator app, then enter the code it shows. The key expires in 10 minutes.</p>
          <code className="block break-all rounded bg-muted px-2 py-1 font-mono text-xs">{step.secret}</code>
          <details><summary className="cursor-pointer text-xs text-muted-foreground">Setup link (otpauth)</summary><code className="block break-all font-mono text-xs">{step.uri}</code></details>
        </div>
      ) : null}

      {step.kind === 'codes' ? (
        <div className="space-y-2 rounded-md border border-emerald-300 p-3 text-sm dark:border-emerald-800">
          <p className="font-medium">Recovery codes</p>
          <p className="text-muted-foreground">Each works once if you lose your device. They are shown only now; store them somewhere safe.</p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-xs">{step.codes.map(c => <li key={c}>{c}</li>)}</ul>
          <p className="text-muted-foreground">Your sessions were signed out. Sign in again with your password and a code.</p>
          <Button size="sm" onClick={() => window.location.assign('/dashboard/signin?from=/dashboard/platform/settings/security')}>I saved them: sign in again</Button>
        </div>
      ) : null}

      <div className={step.kind === 'codes' ? 'hidden' : 'flex flex-wrap gap-2'}>
        {!enrolled && step.kind !== 'enrolling' ? (
          <Button disabled={pending || !password} onClick={() => run('enrol', r => setStep({ kind: 'enrolling', secret: r.secret || '', uri: r.provisioningUri || '' }))}>Set up authenticator</Button>
        ) : null}
        {step.kind === 'enrolling' ? (
          <Button disabled={pending || !password || !code} onClick={() => run('confirm', r => setStep({ kind: 'codes', codes: r.recoveryCodes || [] }))}>Confirm and turn on</Button>
        ) : null}
        {enrolled ? (
          <>
            <Button variant="outline" disabled={pending || !password || !code} onClick={() => run('rotate_recovery', r => setStep({ kind: 'codes', codes: r.recoveryCodes || [] }))}>New recovery codes</Button>
            <Button variant="destructive" disabled={pending || !password || !code} onClick={() => { if (window.confirm('Turn off two-step verification? Your other sessions will be signed out.')) run('disable', () => setStep({ kind: 'idle' })); }}>Turn off</Button>
          </>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
