'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { runCommand } from '../actions/commands';
import { pillClass } from './ActionButton';

const key = (op: string) => `${op}:${crypto.randomUUID()}`;

function save(name: string, type: string, parts: BlobPart[]) {
  const url = URL.createObjectURL(new Blob(parts, { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Runs a command whose answer is a file (text or base64) and saves it. Nothing is sent anywhere. */
export function DownloadButton({ op, vars, children, paths }: { op: string; vars: Record<string, unknown>; children: React.ReactNode; paths?: string[] }) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  const [note, setNote] = React.useState('');
  const router = useRouter();
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button type="button" disabled={pending} className={cn(pillClass, 'min-h-11')} onClick={() => {
        setError(''); setNote('');
        start(async () => {
          const r = await runCommand(op, vars, key(op), paths);
          if (!r.ok) { setError(r.error); return; }
          const d = r.data as { fileName: string; mimeType: string; text?: string; base64?: string; rows?: number };
          save(d.fileName, d.mimeType, [d.base64 ? fromBase64(d.base64) : (d.text ?? '')]);
          setNote(`Saved ${d.fileName}.`);
          router.refresh();
        });
      }}>{pending ? 'Working' : children}</button>
      {error ? <span role="alert" className="max-w-xs break-words text-xs text-red-600">{error}</span> : null}
      {note ? <span className="text-xs text-emerald-700">{note}</span> : null}
    </span>
  );
}

/** Runs a command whose answer is a message, shows it, and copies it. The practice pastes it into its own phone or email. */
export function CopyMessageButton({ op, vars, children, paths }: { op: string; vars: Record<string, unknown>; children: React.ReactNode; paths?: string[] }) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const router = useRouter();
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button type="button" disabled={pending} className={cn(pillClass, 'min-h-11')} onClick={() => {
        setError(''); setCopied(false);
        start(async () => {
          const r = await runCommand(op, vars, key(op), paths);
          if (!r.ok) { setError(r.error); return; }
          const text = String((r.data as { message?: string })?.message ?? '');
          setMessage(text);
          try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* the text is on screen to copy by hand */ }
          router.refresh();
        });
      }}>{pending ? 'Working' : children}</button>
      {error ? <span role="alert" className="max-w-xs break-words text-xs text-red-600">{error}</span> : null}
      {message ? <span className="block max-w-md break-words rounded-md bg-muted p-2 text-sm">{message}{copied ? <span className="mt-1 block text-xs text-emerald-700">Copied.</span> : null}</span> : null}
    </span>
  );
}

type Preview = { patients?: { importable?: number; problems?: number; alreadyKnown?: number }; ref?: string };

/** Read a file, show what it holds, and stop. Nothing is created until a second person approves. */
export function ImportPreviewForm({ locations, paths }: { locations: { id: string; name: string }[]; paths: string[] }) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  const [done, setDone] = React.useState('');
  const router = useRouter();
  const [intent] = React.useState(() => key('previewImport'));
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const file = form.get('file') as File | null;
      if (!file || !file.size) { setError('Choose a file first.'); return; }
      setError(''); setDone('');
      start(async () => {
        const content = await file.text();
        const r = await runCommand('previewImport', { source: String(form.get('source')), fileName: file.name, content, locationId: String(form.get('locationId')) }, `${intent}:${content.length}`, paths);
        if (!r.ok) { setError(r.error); return; }
        const d = r.data as { ref?: string; preview?: Preview };
        setDone(`Read ${d.ref}: ${d.preview?.patients?.importable ?? 0} patients can be imported.`);
        router.refresh();
      });
    }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm"><span className="block font-medium">Where the file came from</span>
          <select name="source" className="h-11 w-full rounded-md border bg-background px-3 text-sm"><option value="open_dental">Open Dental export</option><option value="generic_csv">Spreadsheet (CSV)</option></select></label>
        <label className="space-y-1 text-sm"><span className="block font-medium">Office</span>
          <select name="locationId" className="h-11 w-full rounded-md border bg-background px-3 text-sm">{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="space-y-1 text-sm"><span className="block font-medium">File</span>
          <input name="file" type="file" accept=".json,.csv,text/csv,application/json" className="block min-h-11 w-full text-sm" /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex rounded-lg bg-muted p-1"><button type="submit" disabled={pending} className={cn(pillClass, 'min-h-11')}>{pending ? 'Reading' : 'Read the file'}</button></span>
        {error ? <span role="alert" className="max-w-xl break-words text-sm text-red-600">{error}</span> : null}
        {done ? <span className="text-sm text-emerald-700">{done}</span> : null}
      </div>
    </form>
  );
}

/** Applies an approved import one chunk per request until it is done. Pressing it again after a stop carries on where it left off. */
export function ApplyImportButton({ batchId, paths, children }: { batchId: string; paths: string[]; children: React.ReactNode }) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  const [progress, setProgress] = React.useState('');
  const router = useRouter();
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button type="button" disabled={pending} className={cn(pillClass, 'min-h-11')} onClick={() => {
        setError('');
        start(async () => {
          for (let i = 0; i < 200; i += 1) {
            const r = await runCommand('applyImportChunk', { batchId }, key('applyImportChunk'), paths);
            if (!r.ok) { setError(r.error); break; }
            const d = r.data as { done?: boolean; cursor?: number; total?: number };
            setProgress(d.total ? `${d.cursor} of ${d.total} patients` : '');
            if (d.done) break;
          }
          router.refresh();
        });
      }}>{pending ? 'Importing' : children}</button>
      {progress ? <span className="text-xs text-muted-foreground">{progress}</span> : null}
      {error ? <span role="alert" className="max-w-xs break-words text-xs text-red-600">{error}</span> : null}
    </span>
  );
}
