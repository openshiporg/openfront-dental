import Link from 'next/link';
import { q, practiceTimeZone } from '../../lib/server';
import { when, label } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Status, Tabs } from '../../components/ui';
import { NewPatientForm } from '../components/NewPatientForm';

const PAGE = 50;
const STATUSES = ['active', 'prospect', 'inactive', 'archived', 'deceased'];

/**
 * Patients: search by name, chart number, date of birth (YYYY-MM-DD) or phone/email; filter by
 * status. Results come from the signed-in session, so a desk user sees only patients of their
 * locations, and names only with the demographics tier.
 */
export default async function PatientsPage({ searchParams }: { searchParams?: Promise<{ q?: string; status?: string; page?: string; new?: string }> }) {
  const sp = (await searchParams) ?? {};
  const term = String(sp.q ?? '').trim().slice(0, 80);
  const status = STATUSES.includes(String(sp.status)) ? String(sp.status) : 'active';
  const page = Math.max(0, Number.parseInt(String(sp.page ?? '0'), 10) || 0);
  const or: unknown[] = [];
  if (term) {
    const digits = term.replace(/\D/g, '');
    or.push({ lastName: { contains: term, mode: 'insensitive' } }, { firstName: { contains: term, mode: 'insensitive' } }, { preferredName: { contains: term, mode: 'insensitive' } }, { chartNumber: { contains: term.toUpperCase() } });
    if (/^\d{4}-\d{2}-\d{2}$/.test(term)) or.push({ dateOfBirth: { equals: term } });
    if (term.includes('@')) or.push({ contactPoints: { some: { valueNormalized: { equals: term.toLowerCase() } } } });
    else if (digits.length >= 7) or.push({ contactPoints: { some: { valueNormalized: { contains: digits } } } });
  }
  const where = { status: { equals: status }, ...(or.length ? { OR: or } : {}) };
  const [data, tz] = await Promise.all([
    q<any>(`query Patients($where: PatientWhereInput!, $skip: Int!, $take: Int!) {
      patients(where: $where, orderBy: [{ lastName: asc }, { firstName: asc }], skip: $skip, take: $take) {
        id chartNumber firstName lastName preferredName dateOfBirth status preferredLanguage lastVisitOn homeLocation { code } family { name }
        alertsCount(where: { endedAt: { equals: null } })
      }
      count: patientsCount(where: $where)
      ${STATUSES.map((s) => `${s}: patientsCount(where: { status: { equals: "${s}" } })`).join('\n')}
      locations(where: { isActive: { equals: true } }, orderBy: { code: asc }) { id code }
    }`, { where, skip: page * PAGE, take: PAGE }),
    practiceTimeZone(),
  ]);
  const href = (patch: Record<string, string | number | undefined>) => {
    const next: Record<string, string | number | undefined> = { q: term || undefined, status, page: undefined, ...patch };
    const qs = Object.entries(next).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
    return `/dashboard/platform/patients${qs ? `?${qs}` : ''}`;
  };
  return (
    <Page title="Patients">
      <form className="flex max-w-xl flex-wrap gap-2" action="/dashboard/platform/patients">
        <input type="hidden" name="status" value={status} />
        <input name="q" defaultValue={term} placeholder="Name, chart #, DOB (YYYY-MM-DD), phone or email" className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" />
        <button className="h-9 rounded-md border px-3 text-sm hover:bg-muted" type="submit">Search</button>
      </form>
      <Tabs active={status} items={STATUSES.map((s) => ({ key: s, label: label(s), href: href({ status: s }), count: data[s] }))} />
      <Section title={term ? `${data.count} found` : `${data.count} ${label(status)}`} aside={<Link href={href({ new: '1' })} className="text-sm font-medium hover:underline">New patient</Link>}>
        {sp.new ? <div className="mb-4 rounded-lg border p-4"><NewPatientForm locations={data.locations} /></div> : null}
        {data.patients.length ? data.patients.map((p: any) => (
          <Row key={p.id} href={`/dashboard/platform/patients/${p.id}`}>
            <div className="min-w-0">
              <div className="font-medium">{p.lastName}, {p.preferredName || p.firstName}{p.alertsCount ? <span className="ml-1 text-red-600" title="Medical alerts">⚠</span> : null}</div>
              <Meta>{p.chartNumber} · born {p.dateOfBirth} · {p.homeLocation?.code}{p.family ? ` · ${p.family.name}` : ''}{p.preferredLanguage && p.preferredLanguage !== 'en' ? ` · ${p.preferredLanguage.toUpperCase()}` : ''}</Meta>
            </div>
            <div className="flex items-center gap-3"><Meta>{p.lastVisitOn ? `Last visit ${when(`${p.lastVisitOn}T12:00:00Z`, tz, 'day')}` : 'No visits yet'}</Meta><Status value={p.status} /></div>
          </Row>
        )) : <Empty>No patients match.</Empty>}
        <div className="flex gap-3 pt-2 text-sm">
          {page > 0 ? <Link className="hover:underline" href={href({ page: page - 1 })}>← Previous</Link> : null}
          {(page + 1) * PAGE < data.count ? <Link className="hover:underline" href={href({ page: page + 1 })}>Next →</Link> : null}
        </div>
      </Section>
    </Page>
  );
}
