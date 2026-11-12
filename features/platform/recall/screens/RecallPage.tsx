import { q } from '../../lib/server';
import { calendarDate, title } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, TitleLine, Stat } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { DownloadButton, CopyMessageButton } from '../../components/Phase6Actions';

const WORDS: Record<string, string> = { scheduled_due: 'not due yet', due: 'due now', overdue: 'overdue', scheduled: 'booked', disabled: 'turned off' };
const SHOWN = ['due', 'overdue', 'scheduled_due', 'scheduled'];

/** Who is due for a cleaning or check-up. Nothing is sent from here: export the list or copy a message and use your own phone or email. */
export default async function RecallPage() {
  const d = await q<any>(`{
    patientRecalls(where: { status: { in: ["due", "overdue", "scheduled_due", "scheduled"] } }, orderBy: [{ dueOn: asc }], take: 200) { id status dueOn version outreachCount lastOutreachPreparedAt patient { firstName lastName } type { name } location { name } }
    recallTypes(where: { isActive: { equals: true } }, orderBy: { name: asc }) { id name intervalMonths ageMinYears ageMaxYears }
    locations(orderBy: { name: asc }, take: 1) { id }
  }`);
  const rows = d.patientRecalls as any[];
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const paths = ['/dashboard/platform/recall'];
  return (
    <Page title="Recall">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat name="Overdue" value={count('overdue')} /><Stat name="Due now" value={count('due')} /><Stat name="Coming up" value={count('scheduled_due')} /><Stat name="Booked" value={count('scheduled')} />
      </div>
      <Section title="Who is due" aside={<span className="flex flex-wrap gap-2">
        <ActionButton op="refreshRecall" vars={{}} paths={paths}>Work out recalls</ActionButton>
        <DownloadButton op="exportRecallCsv" vars={{}} paths={paths}>Export CSV</DownloadButton>
      </span>}>
        {rows.length ? rows.filter((r) => SHOWN.includes(r.status)).map((r) => (
          <Row key={r.id} className="items-start">
            <span className="min-w-0 flex-1">
              <TitleLine status={r.status === 'overdue' ? 'overdue' : null}>{r.patient?.firstName} {r.patient?.lastName}</TitleLine>
              <Meta>{r.type?.name} · {WORDS[r.status] ?? title(r.status)} · due {calendarDate(r.dueOn, 'date')}{r.location?.name ? ` · ${r.location.name}` : ''}{r.outreachCount ? ` · message prepared ${r.outreachCount} time${r.outreachCount === 1 ? '' : 's'}` : ''}</Meta>
              {['due', 'overdue'].includes(r.status) ? (
                <span className="mt-1 flex flex-wrap items-start gap-2">
                  <CopyMessageButton op="prepareRecallMessage" vars={{ recallId: r.id }} paths={paths}>Copy message</CopyMessageButton>
                  <ActionButton op="setRecallDisabled" vars={{ recallId: r.id, expectedVersion: r.version, disable: true }} ask="Why turn this recall off?" paths={paths}>Turn off</ActionButton>
                </span>
              ) : null}
            </span>
          </Row>
        )) : <Empty>Nobody is due. Press “Work out recalls” to read the chart.</Empty>}
      </Section>
      <Section title="Recall types">
        {(d.recallTypes as any[]).length ? (d.recallTypes as any[]).map((t) => (
          <Row key={t.id}><span className="min-w-0"><TitleLine>{t.name}</TitleLine><Meta>Every {t.intervalMonths} months{t.ageMinYears ? ` · from age ${t.ageMinYears}` : ''}{t.ageMaxYears ? ` · up to age ${t.ageMaxYears}` : ''}</Meta></span></Row>
        )) : <Empty>Recall types appear after the first time recalls are worked out.</Empty>}
      </Section>
    </Page>
  );
}
