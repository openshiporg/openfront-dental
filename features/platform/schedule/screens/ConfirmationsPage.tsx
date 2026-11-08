import Link from 'next/link';
import { chartLabel } from '../../lib/format';
import { q } from '../../lib/server';
import { when, label, title } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Tabs, TitleLine } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { addDays, isDate, localToday, shortDay } from '../lib/day';

/**
 * Confirmations for the next days (SM§2, C12): every booked visit with its reminder attempts and
 * the consent state that decides whether a reminder can go out at all. Reminders that couldn't be
 * sent (no consent, quiet hours, manual-export channel) show why, so the desk knows whom to call.
 */
export default async function ConfirmationsPage({ searchParams }: { searchParams?: Promise<{ date?: string; loc?: string }> }) {
  const sp = (await searchParams) ?? {};
  const meta = await q<any>(`{ locations(where: { isActive: { equals: true } }, orderBy: { code: asc }) { id code name timeZone } }`);
  const location = meta.locations.find((l: any) => l.id === sp.loc) ?? meta.locations[0];
  if (!location) return <Page title="Confirmations"><Empty>No locations yet.</Empty></Page>;
  const tz = location.timeZone;
  const today = localToday(tz);
  const from = isDate(sp.date) ? sp.date : addDays(today, 1);
  const to = addDays(from, 2);
  const data = await q<any>(`query Conf($loc: ID!, $from: CalendarDay!, $to: CalendarDay!) {
    appointments(where: { location: { id: { equals: $loc } }, localDate: { gte: $from, lte: $to }, status: { in: ["scheduled", "confirmed"] } }, orderBy: { startsAt: asc }, take: 500) {
      id ref status version startsAt confirmationMethod confirmedAt type { name } operatory { code }
      patient { id chartNumber firstName lastName preferredName contactPoints(where: { isActive: { equals: true } }) { kind value consentGrants(where: { status: { equals: "granted" }, purpose: { equals: "appointment_reminders" } }) { channel } } }
      confirmations(orderBy: { scheduledFor: asc }) { channel status scheduledFor suppressedReason }
    }
  }`, { loc: location.id, from, to });
  const appts = data.appointments as any[];
  const unconfirmed = appts.filter((a) => a.status === 'scheduled');
  const base = '/dashboard/platform/schedule/confirmations';
  return (
    <Page title="Confirmations" crumbs={[{ label: 'Schedule', href: '/dashboard/platform/schedule' }]}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs active={location.id} items={meta.locations.map((l: any) => ({ key: l.id, label: l.code, href: `${base}?loc=${l.id}&date=${from}` }))} />
        <div className="flex items-center gap-2 text-sm">
          <Link className="rounded-md border px-2.5 py-1 hover:bg-muted" href={`${base}?loc=${location.id}&date=${addDays(from, -3)}`}>←</Link>
          <span className="font-medium">{shortDay(from)} – {shortDay(to)}</span>
          <Link className="rounded-md border px-2.5 py-1 hover:bg-muted" href={`${base}?loc=${location.id}&date=${addDays(from, 3)}`}>→</Link>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{unconfirmed.length} of {appts.length} visits not yet confirmed.</p>
      <Section title="Not confirmed">
        {unconfirmed.length ? unconfirmed.map((a) => <ConfirmRow key={a.id} a={a} tz={tz} />) : <Empty>Everyone in these days has confirmed.</Empty>}
      </Section>
      <Section title="Confirmed">
        {appts.filter((a) => a.status === 'confirmed').map((a) => <ConfirmRow key={a.id} a={a} tz={tz} />)}
      </Section>
    </Page>
  );
}

function ConfirmRow({ a, tz }: { a: any; tz: string }) {
  const name = a.patient ? `${a.patient.preferredName || a.patient.firstName} ${a.patient.lastName}` : 'Patient';
  const phones = (a.patient?.contactPoints ?? []).filter((c: any) => c.kind !== 'email');
  const consents = new Set((a.patient?.contactPoints ?? []).flatMap((c: any) => c.consentGrants.map((g: any) => g.channel)));
  const attempts = a.confirmations as any[];
  const why = attempts.find((c) => c.suppressedReason)?.suppressedReason;
  return (
    <Row>
      <div className="min-w-0 flex-1 space-y-0.5">
        <TitleLine status={a.status}><Link href={`/dashboard/platform/schedule?date=${a.startsAt.slice(0, 10)}&appt=${a.id}`} className="font-medium hover:underline">{name}</Link><span className="font-mono text-xs text-muted-foreground">{chartLabel(a.patient?.chartNumber)}</span></TitleLine>
        <div><Meta>{when(a.startsAt, tz, 'day')}, {when(a.startsAt, tz, 'time')} · {a.type?.name} · {a.operatory?.code}</Meta></div>
        <div><Meta>
          {phones.length ? `Call ${phones[0].value}` : 'No phone on file'} · reminders by {consents.size ? [...consents].map((c) => label(String(c))).join(', ') : 'nobody (no consent)'}
          {attempts.length ? ` · ${attempts.map((c) => `${title(c.channel)} ${label(c.status)}`).join(', ')}` : ''}{why ? ` · held back: ${label(why)}` : ''}
        </Meta></div>
        {a.status === 'confirmed' ? <Meta>Confirmed {a.confirmedAt ? when(a.confirmedAt, tz, 'dayTime') : ''} by {label(a.confirmationMethod)}</Meta> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {a.status === 'scheduled' ? <ActionButton op="confirmAppointment" vars={{ appointmentId: a.id, expectedVersion: a.version, method: 'phone' }} paths={['/dashboard/platform/schedule/confirmations']}>Confirmed by phone</ActionButton> : null}
      </div>
    </Row>
  );
}
