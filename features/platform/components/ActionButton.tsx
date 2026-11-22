'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { runCommand } from '../actions/commands';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

/** A disclosure's summary line, tall enough to tap. */
export const summaryClass = 'flex min-h-11 cursor-pointer items-center text-sm font-medium';

export function PillTrack({ children, className }: { children: React.ReactNode; className?: string }) {
  // An empty track is a stray grey dot: render nothing when no action applies.
  if (!React.Children.toArray(children).some(Boolean)) return null;
  return <div className={cn('inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1', className)}>{children}</div>;
}

/** At least 44px tall: the touch-target floor. */
export const pillClass = 'inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-md bg-background px-3 text-sm font-medium shadow-sm transition disabled:opacity-50';

const newKey = (op: string) => `${op}:${crypto.randomUUID()}`;

/**
 * Runs one named command. The idempotency key is made once per intent and kept until the command
 * succeeds, so retrying after a timeout replays the first result instead of acting twice.
 */
export function ActionButton({ op, vars, children, paths, confirm, ask, onDone, className }: {
  op: string; vars: Record<string, unknown>; children: React.ReactNode; paths?: string[]; confirm?: string;
  /** Prompt for a reason; the answer goes in vars.reason. */
  ask?: string;
  onDone?: (data: unknown) => void; className?: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const key = React.useRef<{ key: string; body: string } | null>(null);
  const run = (answer?: string) => {
    setError('');
    const variables = answer !== undefined ? { ...vars, reason: answer } : vars;
    const body = JSON.stringify(variables);
    // Same intent, same key; a changed reason or target is a new intent.
    if (key.current?.body !== body) key.current = { key: newKey(op), body };
    const idempotencyKey = key.current.key;
    start(async () => {
      const r = await runCommand(op, variables, idempotencyKey, paths);
      if (!r.ok) setError(r.error);
      else { key.current = null; setReason(''); onDone?.(r.data); router.refresh(); }
    });
  };
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button type="button" disabled={pending} className={cn(pillClass, className)} onClick={() => (confirm || ask ? setOpen(true) : run())}>
        {pending ? 'Working' : children}
      </button>
      {error ? <span role="alert" className="max-w-xs break-words text-xs text-red-600">{error}</span> : null}
      {confirm || ask ? (
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
            <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); run(ask ? reason.trim() : undefined); }} className="grid gap-4">
              <AlertDialogHeader>
                <AlertDialogTitle>{children}</AlertDialogTitle>
                <AlertDialogDescription>{[confirm, ask].filter(Boolean).join(' ')}</AlertDialogDescription>
              </AlertDialogHeader>
              {ask ? <textarea autoFocus aria-label={ask} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full rounded-md border bg-background px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" /> : null}
              <AlertDialogFooter>
                <AlertDialogCancel type="button" className="min-h-11">Go back</AlertDialogCancel>
                <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">{children}</button>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </span>
  );
}
