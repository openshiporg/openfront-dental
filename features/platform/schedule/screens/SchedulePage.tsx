import Link from 'next/link';
import { q } from '../../lib/server';
import { money, when, zoneLabel } from '../../lib/format';
import { Page, Section, Stat, Tabs, Empty, Meta, Row, TitleLine } from '../../components/ui';
import { ScheduleGrid, type GridAppointment, type GridBlock } from '../components/ScheduleGrid';
import { AppointmentDrawer } from '../components/AppointmentDrawer';
import { ACTIVE, COUNTS_FOR_PRODUCTION, addDays, dayTitle, isDate, localMinutes, localToday, percentOf, shortDay, sumMinor, weekStart, weekdayOf } from '../lib/day';

type Search = { date?: string; loc?: string; view?: string; appt?: string; provider?: string };

const APPT_FIELDS = `id ref status version startsAt endsAt localDate productionScheduledMinor operatory { id } type { id name colour } primaryProvider { id abbreviation displayName }
  patient { id chartNumber firstName lastName preferredName alertsCount(where: { endedAt: { equals: null } }) } segments { role startsAt endsAt isActive }`;

/**
 * The schedule (BUILD-PLAN §2): a location-day by operatory with template blocks, unit patterns and
 * production against goal, or a week by provider. Reads go through the signed-in session, so the
 * location scope and PHI tiers of the list rules apply here too.
 */
export default async function SchedulePage({ searchParams }: { searchParams?: Promise<Search> }) {
  const sp = (await searchParams) ?? {};
  const meta = await q<{ locations: { id: string; code: string; name: string; timeZone: string }[]; practiceSettings: { scheduleUnitMinutes: number } | null }>(`{
    locations(where: { isActive: { equals: true } }, orderBy: { code: asc }) { id code name timeZone }
    practiceSettings { scheduleUnitMinutes }
  }`);
  const location = meta.locations.find((l) => l.id === sp.loc) ?? meta.locations[0];
  if (!location) {
    return <Page title="Schedule"><Empty>No locations yet. Add a location in practice settings.</Empty></Page>;
  }
  const tz = location.timeZone;
  const today = localToday(tz);
  const date = isDate(sp.date) ? sp.date : today;
  const view = sp.view === 'week' ? 'week' : 'day';
  const base = `/dashboard/platform/schedule`;
  const link = (patch: Partial<Search>) => {
    const next = { loc: location.id, date, view, ...patch } as Record<string, string | undefined>;
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
    return `${base}?${qs}`;
  };
  const step = view === 'week' ? 7 : 1;
  return (
    <Page title="Schedule">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs active={location.id} items={meta.locations.map((l) => ({ key: l.id, label: l.code, href: link({ loc: l.id, appt: undefined }) }))} />
        <Tabs active={view} items={[{ key: 'day', label: 'Day', href: link({ view: 'day', appt: undefined }) }, { key: 'week', label: 'Week', href: link({ view: 'week', appt: undefined }) }]} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link className="rounded-md border px-2.5 py-1 hover:bg-muted" href={link({ date: addDays(date, -step), appt: undefined })}>← {view === 'week' ? 'Last week' : 'Previous'}</Link>
        <Link className="rounded-md border px-2.5 py-1 hover:bg-muted" href={link({ date: today, appt: undefined })}>Today</Link>
        <Link className="rounded-md border px-2.5 py-1 hover:bg-muted" href={link({ date: addDays(date, step), appt: undefined })}>{view === 'week' ? 'Next week' : 'Next'} →</Link>
        <span className="font-medium">{view === 'week' ? `Week of ${shortDay(weekStart(date))}` : dayTitle(date)}</span>
        <span className="text-muted-foreground">· {location.name} · {zoneLabel(tz)}</span>
      </div>
      {view === 'week'
        ? <WeekView location={location} date={date} link={link} />
        : <DayView location={location} date={date} unitMinutes={meta.practiceSettings?.scheduleUnitMinutes ?? 10} selected={sp.appt ?? null} link={link} />}
    </Page>
  );
}

const nameOf = (p: { firstName?: string | null; lastName?: string | null; preferredName?: string | null } | null) =>
  p ? `${p.preferredName || p.firstName || ''} ${p.lastName || ''}`.trim() || 'Patient' : 'Patient';

async function DayView({ location, date, unitMinutes, selected, link }: { location: { id: string; code: string; name: string; timeZone: string }; date: string; unitMinutes: number; selected: string | null; link: (p: Partial<Search>) => string }) {
  const tz = location.timeZone;
  const weekday = weekdayOf(date);
  const data = await q<any>(`query Day($loc: ID!, $date: CalendarDay!, $weekday: Int!) {
    operatories(where: { location: { id: { equals: $loc } }, isActive: { equals: true } }, orderBy: { sortOrder: asc }) { id code name kind }
    scheduleTemplates(where: { location: { id: { equals: $loc } }, status: { equals: "active" }, effectiveFrom: { lte: $date } }, orderBy: { effectiveFrom: desc }, take: 1) {
      id name blocks(where: { weekday: { equals: $weekday } }) { id label startLocal endLocal onlineBookable operatory { id } provider { id abbreviation } }
    }
    closureDays(where: { date: { equals: $date } }) { id reason isHalfDay startLocal endLocal location { id } }
    appointments(where: { location: { id: { equals: $loc } }, localDate: { equals: $date } }, orderBy: { startsAt: asc }, take: 400) { ${APPT_FIELDS} }
    productionGoals(where: { location: { id: { equals: $loc } }, OR: [{ weekday: { equals: $weekday } }, { date: { equals: $date } }] }) { id goalMinor weekday date provider { id abbreviation displayName } }
  }`, { loc: location.id, date, weekday });
  const closures = (data.closureDays as any[]).filter((c) => !c.location || c.location.id === location.id);
  const template = data.scheduleTemplates[0];
  const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const fullClosure = closures.find((c) => !c.isHalfDay);
  const blocks: GridBlock[] = fullClosure ? [] : (template?.blocks ?? []).filter((b: any) => b.operatory).map((b: any) => ({
    id: b.id, operatoryId: b.operatory.id, startMin: toMin(b.startLocal), endMin: toMin(b.endLocal), label: b.label, provider: b.provider?.abbreviation ?? '', providerId: b.provider?.id ?? null, onlineBookable: b.onlineBookable,
  }));
  const appts = data.appointments as any[];
  const visible = appts.filter((a) => a.status !== 'rescheduled');
  const grid: GridAppointment[] = visible.filter((a) => a.operatory).map((a) => ({
    id: a.id, ref: a.ref, operatoryId: a.operatory.id, startMin: localMinutes(a.startsAt, tz), endMin: localMinutes(a.endsAt, tz), status: a.status, version: a.version,
    typeId: a.type?.id ?? '', typeName: a.type?.name ?? 'Visit', colour: a.type?.colour ?? '#64748b', patient: nameOf(a.patient), provider: a.primaryProvider?.abbreviation ?? '', providerId: a.primaryProvider?.id ?? null,
    alerts: a.patient?.alertsCount ?? 0,
    segments: (a.segments as any[]).map((s) => ({ role: s.role, startMin: localMinutes(s.startsAt, tz), endMin: localMinutes(s.endsAt, tz) })).sort((x, y) => x.startMin - y.startMin),
  }));
  const allMins = [...blocks.flatMap((b) => [b.startMin, b.endMin]), ...grid.flatMap((a) => [a.startMin, a.endMin])];
  const startMin = Math.max(0, Math.floor(Math.min(7 * 60 + 30, ...allMins) / 60) * 60);
  const endMin = Math.min(24 * 60, Math.ceil(Math.max(17 * 60 + 30, ...allMins) / 60) * 60);
  // The zone offset at local noon, for turning a dropped local minute back into an instant.
  const noon = Date.parse(`${date}T12:00:00Z`);
  const offsetMinutes = localMinutes(new Date(noon).toISOString(), tz) - 12 * 60;

  const production = sumMinor(visible.filter((a) => COUNTS_FOR_PRODUCTION.includes(a.status)).map((a) => a.productionScheduledMinor));
  const goals = data.productionGoals as any[];
  const goal = sumMinor(goals.filter((g) => g.date || !goals.some((x) => x.date && x.provider?.id === g.provider?.id)).map((g) => g.goalMinor));
  const byProvider = new Map<string, { name: string; production: string; goal: string; visits: number }>();
  for (const g of goals) byProvider.set(g.provider?.id ?? '-', { name: g.provider?.displayName ?? 'Unassigned', production: '0', goal: g.goalMinor, visits: 0 });
  for (const a of visible.filter((x) => COUNTS_FOR_PRODUCTION.includes(x.status))) {
    const key = a.primaryProvider?.id ?? '-';
    const row = byProvider.get(key) ?? { name: a.primaryProvider?.displayName ?? 'Unassigned', production: '0', goal: '0', visits: 0 };
    row.production = sumMinor([row.production, a.productionScheduledMinor]);
    row.visits += 1;
    byProvider.set(key, row);
  }
  const counts = {
    booked: visible.filter((a) => ACTIVE.includes(a.status) || a.status === 'completed').length,
    unconfirmed: visible.filter((a) => a.status === 'scheduled').length,
    broken: visible.filter((a) => a.status === 'broken').length,
  };
  const hrefFor = Object.fromEntries(grid.map((a) => [a.id, link({ appt: a.id })]));
  const selectedAppt = selected ? appts.find((a) => a.id === selected) : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4">
        <Stat name="Scheduled production" value={money(production)} />
        <Stat name="Goal" value={<span>{money(goal)} <span className="text-sm font-normal text-muted-foreground">{percentOf(production, goal)}%</span></span>} />
        <Stat name="Visits" value={counts.booked} />
        <Stat name="Unconfirmed" value={<Link className="underline-offset-2 hover:underline" href="/dashboard/platform/schedule/confirmations">{counts.unconfirmed}</Link>} />
      </div>
      {closures.length ? closures.map((c) => <p key={c.id} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{c.isHalfDay ? `Closed ${c.startLocal}–${c.endLocal}` : 'Closed all day'}: {c.reason}</p>) : null}
      {!template ? <Empty>No active schedule template for this location on this date.</Empty> : null}
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          {blocks.length || grid.length
            ? <ScheduleGrid date={date} locationId={location.id} operatories={data.operatories} blocks={blocks} appointments={grid} startMin={startMin} endMin={endMin} unitMinutes={unitMinutes} offsetMinutes={offsetMinutes} selectedId={selected} hrefFor={hrefFor} />
            : <Empty>No chairs open on this day.</Empty>}
        </div>
        <div className="min-w-0 space-y-6">
          {selectedAppt ? <AppointmentDrawer id={selectedAppt.id} timeZone={tz} closeHref={link({ appt: undefined })} /> : null}
          <Section title="Production by provider">
            {[...byProvider.values()].length ? [...byProvider.values()].map((p) => (
              <Row key={p.name}>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{p.name}</div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, percentOf(p.production, p.goal))}%` }} /></div>
                </div>
                <Meta>{money(p.production)}{BigInt(p.goal || '0') > BigInt(0) ? ` of ${money(p.goal)}` : ' · no goal set'} · {p.visits} visits</Meta>
              </Row>
            )) : <Empty>No goals set for this day.</Empty>}
          </Section>
          <Section title="Day list">
            {visible.length ? visible.map((a) => (
              <Row key={a.id} href={link({ appt: a.id })}>
                <div className="min-w-0">
                  <TitleLine status={a.status}><span className="font-medium">{nameOf(a.patient)}</span><span className="font-mono text-xs text-muted-foreground">{a.patient?.chartNumber}</span></TitleLine>
                  <Meta>{when(a.startsAt, tz, 'time')} · {a.type?.name} · {a.primaryProvider?.abbreviation}</Meta>
                </div>
              </Row>
            )) : <Empty>No visits booked.</Empty>}
            {counts.broken ? <Meta>{counts.broken} broken appointment{counts.broken === 1 ? '' : 's'} today.</Meta> : null}
          </Section>
        </div>
      </div>
    </>
  );
}

async function WeekView({ location, date, link }: { location: { id: string; timeZone: string }; date: string; link: (p: Partial<Search>) => string }) {
  const from = weekStart(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const data = await q<any>(`query Week($loc: ID!, $from: CalendarDay!, $to: CalendarDay!) {
    appointments(where: { location: { id: { equals: $loc } }, localDate: { gte: $from, lte: $to } }, take: 3000) { id status localDate productionScheduledMinor primaryProvider { id abbreviation displayName } }
    productionGoals(where: { location: { id: { equals: $loc } } }) { goalMinor weekday date provider { id displayName abbreviation } }
    closureDays(where: { date: { gte: $from, lte: $to } }) { date reason isHalfDay location { id } }
  }`, { loc: location.id, from, to: days[6] });
  const appts = (data.appointments as any[]).filter((a) => COUNTS_FOR_PRODUCTION.includes(a.status));
  const providers = new Map<string, { name: string; abbr: string }>();
  for (const g of data.productionGoals) if (g.provider) providers.set(g.provider.id, { name: g.provider.displayName, abbr: g.provider.abbreviation });
  for (const a of appts) if (a.primaryProvider) providers.set(a.primaryProvider.id, { name: a.primaryProvider.displayName, abbr: a.primaryProvider.abbreviation });
  const closed = new Map<string, string>();
  for (const c of data.closureDays) if (!c.location || c.location.id === location.id) closed.set(String(c.date).slice(0, 10), c.isHalfDay ? `½ ${c.reason}` : c.reason);
  const goalFor = (providerId: string, day: string) => {
    const goals = (data.productionGoals as any[]).filter((g) => g.provider?.id === providerId);
    const dated = goals.find((g) => g.date && String(g.date).slice(0, 10) === day);
    if (closed.has(day) && !closed.get(day)!.startsWith('½')) return '0';
    return dated?.goalMinor ?? goals.find((g) => g.weekday === weekdayOf(day))?.goalMinor ?? '0';
  };
  const cell = (providerId: string, day: string) => sumMinor(appts.filter((a) => a.primaryProvider?.id === providerId && String(a.localDate).slice(0, 10) === day).map((a) => a.productionScheduledMinor));
  const dayTotal = (day: string) => sumMinor(appts.filter((a) => String(a.localDate).slice(0, 10) === day).map((a) => a.productionScheduledMinor));
  const dayGoal = (day: string) => sumMinor([...providers.keys()].map((id) => goalFor(id, day)));
  const weekTotal = sumMinor(days.map(dayTotal));
  const weekGoal = sumMinor(days.map(dayGoal));
  return (
    <>
      <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <Stat name="Week scheduled" value={money(weekTotal)} />
        <Stat name="Week goal" value={<span>{money(weekGoal)} <span className="text-sm font-normal text-muted-foreground">{percentOf(weekTotal, weekGoal)}%</span></span>} />
        <Stat name="Visits" value={appts.length} />
      </div>
      <div className="max-w-full overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="sticky left-0 bg-background p-2 text-xs font-medium text-muted-foreground">Provider</th>
              {days.map((d) => <th key={d} className="p-2 text-right font-medium"><Link className="hover:underline" href={link({ view: 'day', date: d })}>{shortDay(d)}</Link>{closed.has(d) ? <div className="text-[11px] font-normal text-amber-700">{closed.get(d)}</div> : null}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...providers.entries()].map(([id, p]) => (
              <tr key={id} className="border-b last:border-b-0">
                <td className="sticky left-0 bg-background p-2"><div className="font-medium">{p.name}</div><div className="font-mono text-[11px] text-muted-foreground">{p.abbr}</div></td>
                {days.map((d) => {
                  const value = cell(id, d);
                  const goal = goalFor(id, d);
                  return (
                    <td key={d} className="p-2 text-right align-top">
                      <div className="font-mono">{value === '0' ? '—' : money(value)}</div>
                      {goal !== '0' ? <div className="text-[11px] text-muted-foreground">{percentOf(value, goal)}% of {money(goal, 'USD', 2).replace('.00', '')}</div> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="bg-muted/40 font-medium">
              <td className="sticky left-0 bg-muted/40 p-2">Location</td>
              {days.map((d) => <td key={d} className="p-2 text-right font-mono">{money(dayTotal(d))}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
