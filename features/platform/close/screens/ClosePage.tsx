import { q } from '../../lib/server';
import { money, calendarDate, title } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, TitleLine } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';

/** End of day and end of month: close the day's sheet, bank the cash and checks, close the month, reopen it with a second person. */
export default async function ClosePage() {
  const d = await q<any>(`{
    dayCloses(orderBy: { businessDate: desc }, take: 14) { id businessDate status daySheet closedAt closedBy { name } location { name } }
    depositBatches(orderBy: { businessDate: desc }, take: 14) { id ref businessDate totalMinor status version location { name } lines { id } }
    periodCloses(orderBy: { period: desc }, take: 12) { id period status closedAt closedBy { name } location { name } }
    locations(orderBy: { name: asc }, take: 20) { id name }
  }`);
  const paths = ['/dashboard/platform/close'];
  const offices = (d.locations as any[]).map((l) => ({ value: l.id, label: l.name }));
  return (
    <Page title="Day and month close">
      <Section title="Days">
        {(d.dayCloses as any[]).length ? (d.dayCloses as any[]).map((c) => (
          <Row key={c.id} className="items-start">
            <span className="min-w-0 flex-1"><span className="flex items-baseline justify-between gap-3"><TitleLine status={c.status}>{calendarDate(c.businessDate, 'date')} · {c.location?.name}</TitleLine><span className="shrink-0 font-medium tabular-nums">{money(c.daySheet?.collectionsMinor ?? '0')}</span></span>
              <Meta>Production {money(c.daySheet?.productionMinor ?? '0')} · collected {money(c.daySheet?.collectionsMinor ?? '0')} · adjustments {money(c.daySheet?.adjustmentsMinor ?? '0')}{c.closedBy?.name ? ` · closed by ${c.closedBy.name}` : ''}</Meta>
            </span>
          </Row>
        )) : <Empty>No day has been closed yet.</Empty>}
        <details><summary className="cursor-pointer text-sm font-medium">Close a day</summary>
          <div className="pt-2"><CommandForm op="closeDay" submitLabel="Close the day" paths={paths} columns={2} fields={[
            { name: 'locationId', label: 'Office', kind: 'select', required: true, options: offices },
            { name: 'businessDate', label: 'Day', kind: 'date', required: true },
          ]} /></div>
        </details>
      </Section>
      <Section title="Deposits">
        {(d.depositBatches as any[]).length ? (d.depositBatches as any[]).map((b) => (
          <Row key={b.id} className="items-start">
            <span className="min-w-0 flex-1"><span className="flex items-baseline justify-between gap-3"><TitleLine status={b.status === 'banked' ? 'completed' : 'pending'}>{b.ref} · {calendarDate(b.businessDate, 'date')}</TitleLine><span className="shrink-0 font-medium tabular-nums">{money(b.totalMinor)}</span></span>
              <Meta>{b.location?.name} · {b.lines.length} cash and check payment{b.lines.length === 1 ? '' : 's'} · {b.status === 'banked' ? 'taken to the bank' : 'not at the bank yet'}</Meta>
              {b.status === 'open' ? <span className="mt-1 block"><ActionButton op="bankDeposit" vars={{ depositId: b.id, expectedVersion: b.version }} confirm="Mark this deposit as taken to the bank?" paths={paths}>Mark as banked</ActionButton></span> : null}
            </span>
          </Row>
        )) : <Empty>No deposits yet.</Empty>}
      </Section>
      <Section title="Months">
        {(d.periodCloses as any[]).length ? (d.periodCloses as any[]).map((p) => (
          <Row key={p.id} className="items-start">
            <span className="min-w-0 flex-1"><TitleLine status={p.status}>{p.period} · {p.location?.name}</TitleLine>
              <Meta>{p.status === 'closed' ? `Closed${p.closedBy?.name ? ` by ${p.closedBy.name}` : ''}` : p.status === 'reopen_requested' ? 'Waiting for a second person to approve reopening' : p.status === 'reopened' ? 'Open for corrections' : title(p.status)}</Meta>
              <span className="mt-1 flex flex-wrap gap-2">
                {p.status === 'closed' ? <ActionButton op="requestPeriodReopen" vars={{ periodCloseId: p.id }} ask="Why does this month need to be reopened?" paths={paths}>Ask to reopen</ActionButton> : null}
                {p.status === 'reopened' ? <ActionButton op="reclosePeriod" vars={{ periodCloseId: p.id }} confirm="Close this month again?" paths={paths}>Close again</ActionButton> : null}
              </span>
            </span>
          </Row>
        )) : <Empty>No month has been closed yet.</Empty>}
        <details><summary className="cursor-pointer text-sm font-medium">Close a month</summary>
          <div className="pt-2"><CommandForm op="closePeriod" submitLabel="Close the month" paths={paths} columns={2} fields={[
            { name: 'locationId', label: 'Office', kind: 'select', required: true, options: offices },
            { name: 'period', label: 'Month', kind: 'text', required: true, placeholder: '2026-10', hint: 'Year and month. Every day with entries must be closed first.' },
          ]} /></div>
        </details>
      </Section>
    </Page>
  );
}
