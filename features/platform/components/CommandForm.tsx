'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { runCommand } from '../actions/commands';
import { pillClass } from './ActionButton';

export type FieldSpec =
  | { name: string; label: string; kind: 'text' | 'date' | 'email' | 'tel' | 'datetime' | 'password' | 'number'; required?: boolean; placeholder?: string; defaultValue?: string; hint?: string }
  | { name: string; label: string; kind: 'textarea'; required?: boolean; placeholder?: string; defaultValue?: string; hint?: string }
  | { name: string; label: string; kind: 'select'; options: { value: string; label: string }[]; required?: boolean; defaultValue?: string; hint?: string }
  | { name: string; label: string; kind: 'checkbox'; defaultValue?: boolean; hint?: string };

type Values = Record<string, string | boolean>;

/**
 * Named ways to turn form values into command variables (nesting, type conversion). Server screens
 * pick one by name, since a function can't cross from a server component into this client one.
 */
const SHAPES = {
  /** ASAP entry: a chart number, one optional preferred weekday window. */
  asapEntry: (v: Values) => ({
    patientId: `chart:${v.chart}`,
    locationId: v.locationId,
    appointmentTypeId: v.appointmentTypeId || undefined,
    preferredWindows: v.weekday ? [{ weekday: Number(v.weekday), from: v.from || '08:00', to: v.to || '17:00' }] : [],
    note: v.note || undefined,
  }),
  /** Merge proposal: the record to fold in, by chart number. */
  mergeByChart: (v: Values) => ({ mergedId: `chart:${v.mergedId}`, reason: v.reason }),
  /** Chart a procedure or condition: tooth and surfaces become the `site` argument. */
  chartSite: (v: Values) => ({ codeId: v.codeId || undefined, conditionId: v.conditionId || undefined, status: v.status || undefined, site: { tooth: v.tooth, surfaces: v.surfaces, quadrant: v.quadrant || undefined, arch: v.arch || undefined } }),
  /** Whole-mouth or arch work: no tooth. */
  chartMouth: (v: Values) => ({ codeId: v.codeId, status: v.status || undefined, site: { arch: v.arch || undefined, quadrant: v.quadrant || undefined } }),
  /** Paper explanation of benefits for a one-line claim: dollars become exact minor units. */
  manualEob: (v: Values) => {
    const minor = (t: unknown) => { const m = /^\s*\$?(\d+)(?:\.(\d{1,2}))?\s*$/.exec(String(t ?? '')); if (!m) throw new Error('Enter amounts like 84.00'); return BigInt(m[1]) * 100n + BigInt((m[2] ?? '').padEnd(2, '0') || '0'); };
    const charge = minor(v.charge), paid = minor(v.paid), writeOff = v.writeOff ? minor(v.writeOff) : charge - paid;
    return { payerId: v.payerId, traceNumber: v.traceNumber, paymentDate: v.paymentDate || undefined, method: v.method, claims: [{ claimRef: v.claimRef, charge: String(v.charge), paidMinor: paid.toString(), lines: [{ lineControl: 'L01', code: '', chargeMinor: charge.toString(), paidMinor: paid.toString(), adjustments: writeOff > 0n ? [{ group: 'CO', reason: '45', amountMinor: writeOff.toString() }] : [] }] }] };
  },
  /** Payment plan proposal: the number of payments is an integer; empty money stays unset. */
  planDollars: (v: Values) => ({ amount: v.amount || undefined, downPayment: v.downPayment || undefined, installments: Number(v.installments), firstDueDate: v.firstDueDate }),
  /** Code import: pasted CSV text (header row first) becomes the row list. */
  csvRows: (v: Values) => {
    const lines = String(v.csv).split(/\r?\n/).filter((l) => l.trim());
    const head = (lines.shift() ?? '').split(',').map((h) => h.trim());
    return { systemKey: v.systemKey, label: v.label, editionYear: Number(v.editionYear), fileName: v.fileName || 'pasted.csv', rows: lines.map((l) => Object.fromEntries(l.split(',').map((c, i) => [head[i], c.trim()]))) };
  },
  /** Perio entry for one tooth: three buccal and three lingual numbers become six site measurements. */
  perioRow: (v: Values) => {
    const nums = (t: unknown) => String(t ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
    const bleed = new Set(String(v.bleeding ?? '').toUpperCase().split(/[\s,]+/).filter(Boolean));
    const out: Record<string, unknown>[] = [];
    const add = (sites: string[], depths: number[], margins: number[]) => sites.forEach((site, i) => { if (depths[i] !== undefined) out.push({ tooth: v.tooth, site, probingDepthMm: depths[i], gingivalMarginMm: margins[i], bleeding: bleed.has(site) }); });
    add(['MB', 'B', 'DB'], nums(v.depths), nums(v.margins));
    add(['ML', 'L', 'DL'], nums(v.lingualDepths), nums(v.lingualMargins));
    return { measurements: out };
  },
  /** Plan acceptance: one checkbox per item (named item_<id>) becomes the selected list. */
  acceptItems: (v: Values) => ({ selectedItemIds: Object.entries(v).filter(([k, on]) => k.startsWith('item_') && on).map(([k]) => k.slice(5)), signer: v.signer, signerName: v.signerName, password: v.password }),
  /** New plan: one checkbox per diagnosed entry (named entry_<id>). */
  planFromEntries: (v: Values) => ({ title: v.title, chartEntryIds: Object.entries(v).filter(([k, on]) => k.startsWith('entry_') && on).map(([k]) => k.slice(6)) }),
  /** Fee entry: dollars become whole minor units. */
  feeDollars: (v: Values) => ({ codeId: v.codeId, amountMinor: String(Math.round(Number(String(v.dollars).replace(/[$,]/g, '')) * 100)) }),
  /** Signed form: the signer attests; no extra answers are collected at the desk. */
  signForm: (v: Values) => ({ data: { recordedAt: 'in_office' }, signerName: v.signerName, signerRole: v.signerRole, password: v.password, witnessUserId: v.witnessUserId || undefined }),
  /** Medical history answers: every field is a question key. */
  historyAnswers: (v: Values) => ({ answers: Object.fromEntries(Object.entries(v)) }),
  /** Statement that blood-pressure style numbers are numbers. */
  vitals: (v: Values) => ({ systolic: v.systolic ? Number(v.systolic) : undefined, diastolic: v.diastolic ? Number(v.diastolic) : undefined, pulse: v.pulse ? Number(v.pulse) : undefined, asaClass: v.asaClass || undefined }),
} satisfies Record<string, (v: Values) => Record<string, unknown>>;
export type CommandShape = keyof typeof SHAPES;

const inputClass = 'h-9 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * A small form for one named command. `shape` names how field values become the command variables
 * (see SHAPES); without it the values are sent as they are. The idempotency key is made once per distinct submission and reused
 * on retry, so a lost response never books or creates twice.
 */
export function CommandForm({ op, fields, shape, submitLabel, paths, onDoneHref, fixed, className, columns = 2 }: {
  op: string; fields: FieldSpec[]; submitLabel: string; paths?: string[];
  shape?: CommandShape;
  /** Navigate here after success; `{id}` is replaced with data.id when the command returns one. */
  onDoneHref?: string;
  fixed?: Record<string, unknown>; className?: string; columns?: 1 | 2 | 3;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  const [done, setDone] = React.useState('');
  const key = React.useRef<{ key: string; body: string } | null>(null);
  return (
    <form
      className={cn('min-w-0 space-y-4', className)}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const values: Values = {};
        for (const f of fields) values[f.name] = f.kind === 'checkbox' ? form.get(f.name) === 'on' : String(form.get(f.name) ?? '').trim();
        const variables = { ...(fixed ?? {}), ...(shape ? SHAPES[shape](values) : values) };
        const body = JSON.stringify(variables);
        if (key.current?.body !== body) key.current = { key: `${op}:${crypto.randomUUID()}`, body };
        const idempotencyKey = key.current.key;
        setError('');
        setDone('');
        start(async () => {
          const r = await runCommand(op, variables, idempotencyKey, paths);
          if (!r.ok) { setError(r.error); return; }
          key.current = null;
          const data = r.data as { id?: string; patientId?: string; appointmentId?: string } | undefined;
          const id = data?.patientId ?? data?.appointmentId ?? data?.id;
          if (onDoneHref) router.push(onDoneHref.replace('{id}', id ?? ''));
          else { setDone('Saved.'); router.refresh(); }
        });
      }}
    >
      <div className={cn('grid gap-3', columns === 1 ? 'grid-cols-1' : columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3')}>
        {fields.map((f) => (
          <label key={f.name} className={cn('min-w-0 space-y-1 text-sm', (f.kind === 'textarea' || f.kind === 'checkbox') && 'sm:col-span-full')}>
            {f.kind === 'checkbox' ? (
              <span className="flex items-start gap-2"><input type="checkbox" name={f.name} defaultChecked={f.defaultValue} className="mt-0.5" /><span>{f.label}</span></span>
            ) : (
              <>
                <span className="block font-medium">{f.label}{'required' in f && f.required ? <span className="text-red-600"> *</span> : null}</span>
                {f.kind === 'textarea' ? (
                  <textarea name={f.name} required={f.required} placeholder={f.placeholder} defaultValue={f.defaultValue} rows={3} className={cn(inputClass, 'h-auto py-2')} />
                ) : f.kind === 'select' ? (
                  <select name={f.name} required={f.required} defaultValue={f.defaultValue} className={inputClass}>
                    {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input name={f.name} type={f.kind === 'datetime' ? 'datetime-local' : f.kind} required={f.required} placeholder={f.placeholder} defaultValue={f.defaultValue} className={inputClass} />
                )}
              </>
            )}
            {f.hint ? <span className="block text-xs text-muted-foreground">{f.hint}</span> : null}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex rounded-lg bg-muted p-1"><button type="submit" disabled={pending} className={pillClass}>{pending ? 'Working' : submitLabel}</button></span>
        {error ? <span role="alert" className="max-w-xl break-words text-sm text-red-600">{error}</span> : null}
        {done ? <span className="text-sm text-emerald-700">{done}</span> : null}
      </div>
    </form>
  );
}
