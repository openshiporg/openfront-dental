import Link from 'next/link';
import { chartLabel } from '../../lib/format';
import { q, practiceTimeZone } from '../../lib/server';
import { when, calendarDate } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Tabs, TitleLine } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The short-call (ASAP) list: patients who want an earlier visit, with their preferred windows. When
 * a chair opens (cancel, no-show, reschedule) the open-time notice goes to the front desk, who offer
 * it from here; booking runs through the same slot checks as any other booking.
 */
export default async function AsapPage({ searchParams }: { searchParams?: Promise<{ view?: string }> }) {
  const view = (await searchParams)?.view === 'closed' ? 'closed' : 'active';
  const [data, tz] = await Promise.all([
    q<any>(`{
      asapEntries(where: { status: ${view === 'active' ? '{ in: ["active", "offered"] }' : '{ notIn: ["active", "offered"] }'} }, orderBy: [{ priority: desc }, { createdAt: asc }], take: 200) {
        id status priority version note preferredWindows earliestDate createdAt
        patient { id chartNumber firstName lastName preferredName } location { id code } appointmentType { id name } provider { abbreviation }
        bookedAppointment { id ref startsAt }
      }
      active: asapEntriesCount(where: { status: { in: ["active", "offered"] } })
      closed: asapEntriesCount(where: { status: { notIn: ["active", "offered"] } })
      locations(where: { isActive: { equals: true } }, orderBy: { code: asc }) { id code }
      appointmentTypes(where: { isActive: { equals: true } }, orderBy: { name: asc }) { id name }
    }`),
    practiceTimeZone(),
  ]);
  return (
    <Page title="ASAP list" crumbs={[{ label: 'Schedule', href: '/dashboard/platform/schedule' }]}>
      <Tabs active={view} items={[
        { key: 'active', label: 'Waiting', href: '/dashboard/platform/schedule/asap', count: data.active },
        { key: 'closed', label: 'Booked or closed', href: '/dashboard/platform/schedule/asap?view=closed', count: data.closed },
      ]} />
      <Section title={view === 'active' ? 'Wants an earlier visit' : 'Booked, declined or expired'}>
        {data.asapEntries.length ? data.asapEntries.map((e: any) => (
          <Row key={e.id}>
            <div className="min-w-0 flex-1 space-y-0.5">
              <TitleLine status={e.status}><Link href={`/dashboard/platform/patients/${e.patient?.id}`} className="font-medium hover:underline">{e.patient ? `${e.patient.preferredName || e.patient.firstName} ${e.patient.lastName}` : 'Patient'}</Link><span className="font-mono text-xs text-muted-foreground">{chartLabel(e.patient?.chartNumber)}</span></TitleLine>
              <div><Meta>{e.location?.code} · {e.appointmentType?.name ?? 'Any visit'}{e.provider ? ` · ${e.provider.abbreviation}` : ''} · priority {e.priority ?? 0} · added {when(e.createdAt, tz, 'day')}</Meta></div>
              <div><Meta>{(Array.isArray(e.preferredWindows) ? e.preferredWindows : []).map((w: any) => `${DAYS[w.weekday] ?? '?'} ${w.from}–${w.to}`).join(', ') || 'Any time'}{e.earliestDate ? ` · from ${calendarDate(e.earliestDate)}` : ''}</Meta></div>
              {e.note ? <p className="text-sm">{e.note}</p> : null}
              {e.bookedAppointment ? <Meta>Booked {e.bookedAppointment.ref} · {when(e.bookedAppointment.startsAt, tz, 'dayTime')}</Meta> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {['active', 'offered'].includes(e.status) ? (
                <>
                  <Link className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted" href={`/dashboard/platform/schedule?loc=${e.location?.id}`}>Find a time</Link>
                  <ActionButton op="closeAsapEntry" vars={{ asapEntryId: e.id, status: 'declined', expectedVersion: e.version }} ask="Why is this entry closed?" paths={['/dashboard/platform/schedule/asap']}>Close</ActionButton>
                </>
              ) : null}
            </div>
          </Row>
        )) : <Empty>{view === 'active' ? 'Nobody is waiting for an earlier visit.' : 'Nothing closed yet.'}</Empty>}
      </Section>
      <Section title="Add to the ASAP list">
        <CommandForm
          op="addAsapEntry"
          submitLabel="Add"
          columns={3}
          paths={['/dashboard/platform/schedule/asap']}
          fields={[
            { name: 'chart', label: 'Patient chart number', kind: 'text', required: true, placeholder: '1001', hint: 'Find the chart number on the patient page.' },
            { name: 'locationId', label: 'Location', kind: 'select', required: true, options: data.locations.map((l: any) => ({ value: l.id, label: l.code })) },
            { name: 'appointmentTypeId', label: 'Visit type', kind: 'select', options: [{ value: '', label: 'Any' }, ...data.appointmentTypes.map((t: any) => ({ value: t.id, label: t.name }))] },
            { name: 'weekday', label: 'Preferred day', kind: 'select', options: [{ value: '', label: 'Any day' }, ...[1, 2, 3, 4, 5].map((d) => ({ value: String(d), label: DAYS[d] }))] },
            { name: 'from', label: 'From', kind: 'text', placeholder: '08:00' },
            { name: 'to', label: 'To', kind: 'text', placeholder: '12:00' },
            { name: 'note', label: 'Note', kind: 'textarea' },
          ]}
          shape="asapEntry"
        />
      </Section>
    </Page>
  );
}
