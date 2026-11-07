import Link from 'next/link';
import { q } from '../../lib/server';
import { money, label } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Status, Tabs } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Locations, operatories, appointment types and schedule templates. Templates are drafted as data
 * (the Keystone admin edits blocks) and published here: publishing ends the previous template and
 * lists booked visits that fall outside the new blocks for the office manager to move.
 */
export default async function LocationsPage({ searchParams }: { searchParams?: Promise<{ loc?: string }> }) {
  const sp = (await searchParams) ?? {};
  const meta = await q<any>(`{
    locations(orderBy: { code: asc }) { id code name timeZone phone isActive address jurisdiction { label } }
    appointmentTypes(orderBy: { name: asc }) { id code name publicName category defaultPattern defaultDurationUnits defaultProductionMinor onlineBookable newPatientOnly requiresDentistOnSite colour isActive }
    practiceSettings { scheduleUnitMinutes }
  }`);
  const location = meta.locations.find((l: any) => l.id === sp.loc) ?? meta.locations[0];
  if (!location) return <Page title="Locations & operatories"><Empty>No locations yet.</Empty></Page>;
  const data = await q<any>(`query Loc($loc: ID!) {
    operatories(where: { location: { id: { equals: $loc } } }, orderBy: { sortOrder: asc }) { id code name kind isActive }
    scheduleTemplates(where: { location: { id: { equals: $loc } } }, orderBy: { effectiveFrom: desc }) {
      id name status version effectiveFrom effectiveTo publishedAt
      blocks(orderBy: [{ weekday: asc }, { startLocal: asc }]) { id weekday startLocal endLocal label onlineBookable operatory { code } provider { abbreviation } allowedTypesCount }
    }
    closureDays(where: { OR: [{ location: { id: { equals: $loc } } }, { location: null }] }, orderBy: { date: asc }) { id date reason isHalfDay startLocal endLocal location { code } }
    onlineBookingPolicies(where: { location: { id: { equals: $loc } } }) { id isActive newPatientAllowed leadTimeHours horizonDays holdMinutes appointmentTypes { name } }
  }`, { loc: location.id });
  const unit = meta.practiceSettings?.scheduleUnitMinutes ?? 10;
  const path = ['/dashboard/platform/settings/locations'];
  return (
    <Page title="Locations & operatories" crumbs={[{ label: 'Practice settings' }]}>
      <Tabs active={location.id} items={meta.locations.map((l: any) => ({ key: l.id, label: l.code, href: `/dashboard/platform/settings/locations?loc=${l.id}` }))} />
      <Section title={location.name}>
        <Row><span>Time zone</span><Meta>{location.timeZone}</Meta></Row>
        <Row><span>Jurisdiction pack</span><Meta>{location.jurisdiction?.label ?? 'Generic (strict defaults)'}</Meta></Row>
        <Row><span>Address</span><Meta>{location.address ? [location.address.line1, location.address.city, location.address.state, location.address.postal].filter(Boolean).join(', ') : '—'}</Meta></Row>
        <Row><span>Phone</span><Meta>{location.phone || '—'}</Meta></Row>
      </Section>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Section title="Operatories">
          {data.operatories.length ? data.operatories.map((o: any) => (
            <Row key={o.id}><span><span className="font-medium">{o.code}</span> {o.name}</span><span className="flex items-center gap-2"><Meta>{label(o.kind)}</Meta><Status value={o.isActive ? 'active' : 'archived'} /></span></Row>
          )) : <Empty>No chairs yet.</Empty>}
        </Section>
        <Section title="Closures">
          {data.closureDays.length ? data.closureDays.map((c: any) => (
            <Row key={c.id}><span>{String(c.date).slice(0, 10)} · {c.reason}</span><Meta>{c.isHalfDay ? `${c.startLocal}–${c.endLocal}` : 'All day'}{c.location ? '' : ' · all locations'}</Meta></Row>
          )) : <Empty>No closures scheduled.</Empty>}
        </Section>
      </div>
      <Section title="Schedule templates">
        {data.scheduleTemplates.length ? data.scheduleTemplates.map((t: any) => (
          <div key={t.id} className="space-y-2 border-b py-3 last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><span className="font-medium">{t.name}</span> <Meta>from {t.effectiveFrom}{t.effectiveTo ? ` to ${t.effectiveTo}` : ''} · {t.blocks.length} blocks</Meta></div>
              <span className="flex items-center gap-2">
                <Status value={t.status} />
                {t.status === 'draft' ? <ActionButton op="publishScheduleTemplate" vars={{ templateId: t.id, expectedVersion: t.version }} confirm="Publish this template? The current one ends the day before it starts." paths={path}>Publish</ActionButton> : null}
              </span>
            </div>
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[34rem] text-xs">
                <thead><tr className="text-left font-mono uppercase text-muted-foreground"><th className="py-1">Day</th><th>Chair</th><th>Hours</th><th>Provider</th><th>Block</th><th>Types</th><th>Online</th></tr></thead>
                <tbody>
                  {t.blocks.map((b: any) => (
                    <tr key={b.id} className="border-t"><td className="py-1">{DAYS[b.weekday]}</td><td>{b.operatory?.code}</td><td>{b.startLocal}–{b.endLocal}</td><td>{b.provider?.abbreviation}</td><td>{b.label}</td><td>{b.allowedTypesCount || 'any'}</td><td>{b.onlineBookable ? 'yes' : ''}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )) : <Empty>No templates. Draft one in the admin (Schedule templates) and publish it here.</Empty>}
      </Section>
      <Section title="Appointment types">
        {meta.appointmentTypes.map((t: any) => {
          const pattern = (Array.isArray(t.defaultPattern) ? t.defaultPattern : []) as { role: string; units: number }[];
          return (
            <Row key={t.id}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: t.colour }} /><span className="font-medium">{t.name}</span><span className="font-mono text-xs text-muted-foreground">{t.code}</span></div>
                <Meta>{pattern.map((u) => `${label(u.role)} ${u.units * unit}m`).join(' → ')} · {t.defaultDurationUnits * unit} min · est. {money(t.defaultProductionMinor)}</Meta>
              </div>
              <Meta>{[t.onlineBookable ? `online as “${t.publicName || t.name}”` : '', t.newPatientOnly ? 'new patients' : '', t.requiresDentistOnSite ? 'dentist on site' : ''].filter(Boolean).join(' · ')}</Meta>
            </Row>
          );
        })}
      </Section>
      <Section title="Online booking policy (API)">
        {data.onlineBookingPolicies.length ? data.onlineBookingPolicies.map((p: any) => (
          <div key={p.id} className="space-y-1 text-sm">
            <Row><span>Status</span><Status value={p.isActive ? 'active' : 'paused'} /></Row>
            <Row><span>New patients online</span><Meta>{p.newPatientAllowed ? 'Yes' : 'No'}</Meta></Row>
            <Row><span>Lead time · horizon · hold</span><Meta>{p.leadTimeHours}h · {p.horizonDays} days · {p.holdMinutes} min</Meta></Row>
            <Row><span>Bookable types</span><Meta>{p.appointmentTypes.map((t: any) => t.name).join(', ')}</Meta></Row>
          </div>
        )) : <Empty>Online booking is off for this location.</Empty>}
        <p className="text-xs text-muted-foreground">The public booking API serves these times to the practice&apos;s own booking pages. See <Link className="underline" href="/dashboard/platform/schedule/booking-requests">booking requests</Link>.</p>
      </Section>
    </Page>
  );
}
