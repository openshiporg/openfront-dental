import Link from 'next/link';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { q, practiceTimeZone } from '../../lib/server';
import { calendarDate, chartLabel, officeName, when } from '../../lib/format';
import { Empty, Meta, Section, Stat, Status } from '../../components/ui';
import { addDays, localToday } from '../../schedule/lib/day';

type Visit = { id: string; status: string; startsAt: string; localDate: string; type: { name: string } | null; location: { id: string; code: string; name: string; timeZone: string } | null; operatory: { code: string } | null; primaryProvider: { displayName: string } | null; patient: { chartNumber: string; firstName: string; lastName: string; preferredName: string } | null };

const VISIT = `id status startsAt localDate type { name } location { id code name timeZone } operatory { code } primaryProvider { displayName } patient { chartNumber firstName lastName preferredName }`;
const LIVE = `status: { in: ["scheduled", "confirmed", "arrived", "seated", "ready_for_checkout", "completed"] }`;

/** The day by office and chair, in chair order. */
function chairs(visits: Visit[]): [string, Visit[]][] {
  const groups = new Map<string, Visit[]>();
  for (const v of visits) {
    const key = `${v.location ? officeName(v.location) : 'Office'} · chair ${v.operatory?.code ?? '—'}`;
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** A read the role may not be allowed: the part of the page it feeds is left out instead of failing the page. */
async function read<T>(query: string, variables: Record<string, unknown> = {}): Promise<T | null> {
  try { return await q<T>(query, variables); } catch { return null; }
}

/** The staff home: today's visits and the work that is waiting, in the order a front desk opens the day. */
export default async function TodayPage() {
  const tz = await practiceTimeZone();
  const today = localToday(tz);
  const [me, day, queues] = await Promise.all([
    read<any>(`{ authenticatedItem { ... on User { name } } }`),
    read<{ appointments: Visit[] }>(`query ($d: CalendarDay!) { appointments(where: { localDate: { equals: $d }, ${LIVE} }, orderBy: { startsAt: asc }, take: 200) { ${VISIT} } }`, { d: today }),
    Promise.all([
      read<{ n: number }>(`{ n: publicBookingRequestsCount(where: { reviewedAt: { equals: null } }) }`),
      read<{ n: number }>(`query ($a: CalendarDay!, $b: CalendarDay!) { n: appointmentsCount(where: { localDate: { gt: $a, lte: $b }, status: { equals: "scheduled" } }) }`, { a: today, b: addDays(today, 3) }),
      read<{ n: number }>(`{ n: statementsCount(where: { status: { in: ["generated", "sent", "partially_paid", "overdue"] } }) }`),
      read<{ n: number }>(`{ n: patientRecallsCount(where: { status: { in: ["due", "overdue"] } }) }`),
      read<{ n: number }>(`query ($now: DateTime!) { n: approvalRequestsCount(where: { status: { equals: "pending" }, OR: [{ expiresAt: { equals: null } }, { expiresAt: { gt: $now } }] }) }`, { now: new Date().toISOString() }),
    ]),
  ]);
  let visits = day?.appointments ?? [];
  let shown = today;
  // A closed day (a Sunday) shows the next day that has visits, so the page is never an empty screen.
  if (day && !visits.length) {
    const next = await read<{ appointments: { localDate: string }[] }>(`query ($d: CalendarDay!) { appointments(where: { localDate: { gt: $d }, ${LIVE} }, orderBy: { startsAt: asc }, take: 1) { localDate } }`, { d: today });
    const nextDay = next?.appointments[0]?.localDate?.slice(0, 10);
    if (nextDay) {
      shown = nextDay;
      visits = (await read<{ appointments: Visit[] }>(`query ($d: CalendarDay!) { appointments(where: { localDate: { equals: $d }, ${LIVE} }, orderBy: { startsAt: asc }, take: 200) { ${VISIT} } }`, { d: nextDay }))?.appointments ?? [];
    }
  }
  const [requests, unconfirmed, statements, recalls, approvals] = queues.map((x) => x?.n ?? null);
  const firstName = String(me?.authenticatedItem?.name ?? '').split(' ')[0];
  const waiting = visits.filter((v) => v.status === 'arrived').length;
  const done = visits.filter((v) => v.status === 'completed').length;
  const work = [
    { n: requests, one: 'online booking to review', many: 'online bookings to review', href: '/dashboard/platform/schedule/booking-requests' },
    { n: unconfirmed, one: 'visit in the next 3 days is not confirmed', many: 'visits in the next 3 days are not confirmed', href: '/dashboard/platform/schedule/confirmations' },
    { n: statements, one: 'statement is not paid yet', many: 'statements are not paid yet', href: '/dashboard/platform/payments' },
    { n: recalls, one: 'patient is due for a cleaning or check-up', many: 'patients are due for a cleaning or check-up', href: '/dashboard/platform/recall' },
    { n: approvals, one: 'request is waiting for a second person', many: 'requests are waiting for a second person', href: '/dashboard/platform/approvals' },
  ].filter((w) => w.n !== null);
  const shortcuts = [
    ['Schedule', '/dashboard/platform/schedule'], ['Patients', '/dashboard/platform/patients'], ['Patient payments', '/dashboard/platform/payments'],
    ['Claims', '/dashboard/platform/claims'], ['Recall', '/dashboard/platform/recall'], ['Day and month close', '/dashboard/platform/close'],
  ];
  const title = shown === today ? 'Today' : 'Next open day';
  return (
    <PageContainer
      title="Today"
      breadcrumbs={[{ type: 'page', label: 'Dashboard' }]}
      header={<div className="min-w-0"><h1 className="break-words text-xl font-semibold tracking-tight">{firstName ? `Hello, ${firstName}` : 'Today'}</h1><p className="text-sm text-muted-foreground">{calendarDate(today, 'day')}{shown !== today ? ' · no visits today' : ''}</p></div>}
    >
      <div className="min-w-0 max-w-4xl space-y-6 px-4 pb-10 md:px-6">
        {day ? (
          <div className="grid min-w-0 grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4">
            <Stat name={shown === today ? 'Visits today' : `Visits ${calendarDate(shown, 'day')}`} value={String(visits.length)} />
            <Stat name="Not confirmed" value={String(visits.filter((v) => v.status === 'scheduled').length)} />
            <Stat name="In the waiting room" value={String(waiting)} />
            <Stat name="Completed" value={String(done)} />
          </div>
        ) : null}

        {work.length ? (
          <Section title="Waiting for you">
            <ul>
              {work.map((w) => (
                <li key={w.href} className="border-b last:border-b-0">
                  <Link href={w.href} className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm hover:bg-muted/40">
                    <span className="min-w-0"><span className="mr-2 inline-block min-w-6 font-semibold tabular-nums">{w.n}</span>{w.n === 1 ? w.one : w.many}</span>
                    <span aria-hidden className="shrink-0 text-muted-foreground">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {day ? (
          <Section title={`${title} · ${calendarDate(shown, 'day')}`} aside={<Link href={`/dashboard/platform/schedule?date=${shown}`} className="text-sm font-medium underline underline-offset-4">Open the schedule</Link>}>
            {visits.length ? (
              <div className="space-y-4">
                {chairs(visits).map(([chair, list]) => (
                  <div key={chair}>
                    <h3 className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">{chair}<Meta>{[...new Set(list.map((v) => v.primaryProvider?.displayName).filter(Boolean))].join(', ')}</Meta></h3>
                    <ul>
                      {list.map((v) => (
                        <li key={v.id} className="border-b last:border-b-0">
                          <Link href={`/dashboard/platform/schedule?loc=${v.location?.id ?? ''}&date=${shown}&appt=${v.id}`} className="flex min-h-14 items-center gap-3 py-2 text-sm hover:bg-muted/40">
                            <span className="w-[4.75rem] shrink-0 font-medium tabular-nums">{when(v.startsAt, v.location?.timeZone ?? tz, 'time').replace(/ [A-Z]{2,4}$/, '')}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{v.patient ? `${v.patient.preferredName || v.patient.firstName} ${v.patient.lastName}` : 'Patient'}</span>
                              <Meta>{[v.type?.name, chartLabel(v.patient?.chartNumber)].filter(Boolean).join(' · ')}</Meta>
                            </span>
                            <Status value={v.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : <Empty>No visits are booked yet. New bookings appear here as they come in.</Empty>}
          </Section>
        ) : null}

        <Section title="Go to">
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {shortcuts.map(([label, href]) => <li key={href}><Link href={href} className="flex min-h-12 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted/40">{label}</Link></li>)}
          </ul>
        </Section>
      </div>
    </PageContainer>
  );
}
