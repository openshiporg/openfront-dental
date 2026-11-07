'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { runCommand } from '../../actions/commands';
import { pillClass } from '../../components/ActionButton';

const input = 'h-9 w-full rounded-md border bg-background px-3 text-sm';

/**
 * Register a patient. The server checks for an existing record first (same birth date plus a similar
 * name or a shared phone/email) and refuses with the candidates; the desk either opens that record or
 * confirms this is a different person, which is recorded in the audit trail.
 */
export function NewPatientForm({ locations }: { locations: { id: string; code: string }[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  const [duplicate, setDuplicate] = React.useState(false);
  const key = React.useRef<{ key: string; body: string } | null>(null);
  const form = React.useRef<HTMLFormElement>(null);

  const submit = (acknowledgeDuplicates: boolean) => {
    if (!form.current) return;
    const f = new FormData(form.current);
    const v = (name: string) => String(f.get(name) ?? '').trim();
    const contacts = [
      ...(v('mobile') ? [{ kind: 'mobile', value: v('mobile'), isPrimary: true }] : []),
      ...(v('email') ? [{ kind: 'email', value: v('email'), isPrimary: true }] : []),
    ];
    const data = {
      firstName: v('firstName'), lastName: v('lastName'), preferredName: v('preferredName') || undefined, dateOfBirth: v('dateOfBirth'),
      sexAssignedAtBirth: v('sex') || undefined, preferredLanguage: v('language') || undefined, homeLocationId: v('homeLocationId'), contacts,
    };
    const variables = { data, acknowledgeDuplicates: acknowledgeDuplicates || undefined };
    const body = JSON.stringify(variables);
    if (key.current?.body !== body) key.current = { key: `registerPatient:${crypto.randomUUID()}`, body };
    const idempotencyKey = key.current.key;
    setError('');
    start(async () => {
      const r = await runCommand('registerPatient', variables, idempotencyKey, ['/dashboard/platform/patients']);
      if (!r.ok) {
        setError(r.error);
        setDuplicate(/existing patient/i.test(r.error));
        return;
      }
      key.current = null;
      const id = (r.data as { patientId?: string } | undefined)?.patientId;
      router.push(id ? `/dashboard/platform/patients/${id}` : '/dashboard/platform/patients');
    });
  };

  return (
    <form ref={form} className="space-y-3" onSubmit={(e) => { e.preventDefault(); setDuplicate(false); submit(false); }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm"><span className="font-medium">First name *</span><input name="firstName" required className={input} /></label>
        <label className="space-y-1 text-sm"><span className="font-medium">Last name *</span><input name="lastName" required className={input} /></label>
        <label className="space-y-1 text-sm"><span className="font-medium">Preferred name</span><input name="preferredName" className={input} /></label>
        <label className="space-y-1 text-sm"><span className="font-medium">Date of birth *</span><input name="dateOfBirth" type="date" required className={input} /></label>
        <label className="space-y-1 text-sm"><span className="font-medium">Sex assigned at birth</span>
          <select name="sex" className={input} defaultValue="unknown"><option value="unknown">Not recorded</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select>
        </label>
        <label className="space-y-1 text-sm"><span className="font-medium">Preferred language</span>
          <select name="language" className={input} defaultValue="en"><option value="en">English</option><option value="es">Spanish</option><option value="vi">Vietnamese</option><option value="ht">Haitian Creole</option><option value="pt">Portuguese</option></select>
        </label>
        <label className="space-y-1 text-sm"><span className="font-medium">Mobile</span><input name="mobile" type="tel" placeholder="(813) 555-0100" className={input} /></label>
        <label className="space-y-1 text-sm"><span className="font-medium">Email</span><input name="email" type="email" className={input} /></label>
        <label className="space-y-1 text-sm"><span className="font-medium">Home location *</span>
          <select name="homeLocationId" required className={input}>{locations.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}</select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex rounded-lg bg-muted p-1"><button type="submit" disabled={pending} className={pillClass}>{pending ? 'Working' : 'Register patient'}</button></span>
        {duplicate ? <span className="inline-flex rounded-lg bg-muted p-1"><button type="button" disabled={pending} className={pillClass} onClick={() => submit(true)}>This is a different person: register</button></span> : null}
      </div>
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      <p className="text-xs text-muted-foreground">Texts and emails need consent; record it on the patient page once registered.</p>
    </form>
  );
}
