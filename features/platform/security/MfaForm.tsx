'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/features/dashboard/components/Logo';
import { completeMfa } from './mfaActions';

/** Second sign-in step, in the same frame as the dashboard sign-in page.
 * adapted from openfront-hotel@0a75ba4 features/platform/guest-governance/MfaForm.tsx */
export default function MfaForm({ from }: { from: string }) {
  const [state, action, pending] = useActionState(completeMfa, { message: '' });
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center space-x-1.5"><Logo aria-hidden="true" /></div>
        <h1 className="mt-6 text-lg font-semibold text-foreground">Verify your sign-in</h1>
        <p className="mt-2 text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app, or one unused recovery code.</p>
        <form action={action} className="mt-8 space-y-4">
          <input type="hidden" name="from" value={from} />
          <div>
            <Label htmlFor="mfa-code" className="text-sm font-medium text-foreground">Authenticator or recovery code</Label>
            <Input id="mfa-code" name="code" autoComplete="one-time-code" inputMode="text" required maxLength={64} autoFocus className="mt-2 bg-muted/40" />
          </div>
          <Label className="flex items-center gap-2 text-sm font-normal text-foreground">
            <input name="recovery" type="checkbox" />
            Use a recovery code
          </Label>
          <Button type="submit" className="w-full py-2 font-medium" disabled={pending} aria-disabled={pending}>
            {pending ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" /> : 'Verify sign-in'}
          </Button>
          {state.message ? <p role="alert" className="text-sm text-red-600 dark:text-red-500">{state.message}</p> : null}
        </form>
        <p className="mt-6 text-sm text-muted-foreground">
          Wrong account?
          <Link href="/dashboard/signin" className="ml-1 font-medium text-primary hover:text-primary/90">Start sign-in again</Link>
        </p>
      </div>
    </div>
  );
}
