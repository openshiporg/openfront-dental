import Link from 'next/link';
import { q } from '../../lib/server';
import { officeName, zoneLabel } from '../../lib/format';
import { Page, Section, Row, Meta, Empty } from '../../components/ui';

/** Practice settings: the practice's name and rules, with the way in to offices and sign-in security. */
export default async function SettingsPage() {
  const d: any = await q(`{
    practiceSettings { displayName legalName defaultTimeZone scheduleUnitMinutes lateCancelHours noShowAfterMinutes inactiveAfterMonths recallLeadDays sessionHours requireStaffMfa }
    locations(where: { isActive: { equals: true } }, orderBy: { code: asc }) { id name phone timeZone }
  }`).catch(() => ({}));
  const s = d.practiceSettings;
  const locations = (d.locations ?? []) as any[];
  const go = 'flex min-h-12 items-center justify-between gap-3 border-b py-2 text-sm font-medium last:border-b-0 hover:bg-muted/40';
  return (
    <Page title="Practice settings">
      <Section title="Practice">
        {s ? (
          <div>
            <Row><span>Name patients see</span><Meta>{s.displayName}</Meta></Row>
            <Row><span>Legal name</span><Meta>{s.legalName}</Meta></Row>
            <Row><span>Time zone</span><Meta>{zoneLabel(s.defaultTimeZone)}</Meta></Row>
          </div>
        ) : <Empty>Practice details are not set yet.</Empty>}
      </Section>
      {s ? (
        <Section title="Schedule rules">
          <Row><span>Schedule step</span><Meta>{s.scheduleUnitMinutes} minutes</Meta></Row>
          <Row><span>Late cancellation</span><Meta>Inside {s.lateCancelHours} hours of the visit</Meta></Row>
          <Row><span>No-show</span><Meta>{s.noShowAfterMinutes} minutes after the start time</Meta></Row>
          <Row><span>Recall notice</span><Meta>{s.recallLeadDays} days before a visit is due</Meta></Row>
          <Row><span>Patient marked inactive</span><Meta>After {s.inactiveAfterMonths} months without a visit</Meta></Row>
        </Section>
      ) : null}
      <Section title="Offices" aside={<Link href="/dashboard/platform/settings/locations" className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 md:min-h-0">Chairs, hours and visit types</Link>}>
        {locations.length ? locations.map((l) => (
          <Link key={l.id} href={`/dashboard/platform/settings/locations?loc=${l.id}`} className={go}>
            <span className="min-w-0"><span className="block truncate">{officeName(l)}</span><Meta>{[l.phone, zoneLabel(l.timeZone)].filter(Boolean).join(' · ')}</Meta></span>
            <span aria-hidden className="shrink-0 text-muted-foreground">→</span>
          </Link>
        )) : <Empty>No offices yet.</Empty>}
      </Section>
      <Section title="Staff sign-in">
        {s ? <Row><span>Two-step verification</span><Meta>{s.requireStaffMfa ? 'Required for all staff' : 'Optional'} · sessions end after {s.sessionHours} hours</Meta></Row> : null}
        <Link href="/dashboard/platform/settings/security" className={go}><span>Your two-step verification and recovery codes</span><span aria-hidden className="shrink-0 text-muted-foreground">→</span></Link>
      </Section>
    </Page>
  );
}
