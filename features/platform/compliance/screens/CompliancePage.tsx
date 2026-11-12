import { q, practiceTimeZone } from '../../lib/server';
import { calendarDate, title, when } from '../../lib/format';
import { practiceToday, daysBetween } from '../../lib/today';
import { Page, Section, Row, Empty, Meta, TitleLine, Stat } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';

/** Every deadline here is worked out from today's date each time the page opens. Nothing runs in the background. */
const left = (due: string, today: string) => {
  const n = daysBetween(today, due);
  return n < 0 ? `${-n} day${n === -1 ? '' : 's'} late` : n === 0 ? 'due today' : `${n} day${n === 1 ? '' : 's'} left`;
};
const addDays = (day: string, n: number) => new Date(Date.parse(day.slice(0, 10)) + n * 86_400_000).toISOString().slice(0, 10);

export default async function CompliancePage() {
  const [today, tz, d] = await Promise.all([practiceToday(), practiceTimeZone(), q<any>(`{
    complianceTasks(where: { status: { equals: "open" } }, orderBy: { dueOn: asc }, take: 100) { id title category dueOn repeatMonths version owner { name } }
    incidentReports(where: { status: { not: { equals: "closed" } } }, orderBy: { discoveredAt: desc }, take: 30) { id title description discoveredAt affectedCount status version }
    patientRightsRequests(where: { status: { in: ["open", "extended"] } }, orderBy: { dueOn: asc }, take: 50) { id ref kind receivedOn dueOn status extendedOnce version patient { firstName lastName } }
    credentials(orderBy: { expiresOn: asc }, take: 60) { id kind jurisdiction numberLast4 expiresOn status holder { displayName } }
    recordHolds(where: { status: { equals: "active" } }, orderBy: { createdAt: desc }, take: 30) { id reason version createdAt patient { firstName lastName } }
    retentionDispositions(where: { status: { not: { equals: "executed" } } }, orderBy: { eligibleOn: asc }, take: 40) { id eligibleOn status blockedReason version patient { firstName lastName } }
    retentionPolicies(where: { isActive: { equals: true } }) { id recordType years minorsUntilAge }
    accountingOfDisclosures(orderBy: { disclosedOn: desc }, take: 20) { id disclosedOn recipient purpose patient { firstName lastName } }
    patients(orderBy: { lastName: asc }, take: 200) { id firstName lastName chartNumber }
  }`)]);
  const paths = ['/dashboard/platform/compliance'];
  const patients = (d.patients as any[]).map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName} · #${p.chartNumber}` }));
  const tasks = d.complianceTasks as any[];
  const late = tasks.filter((t) => t.dueOn.slice(0, 10) < today).length;
  const creds = (d.credentials as any[]).filter((c) => c.expiresOn);
  const credState = (c: any) => { const n = daysBetween(today, c.expiresOn); return n < 0 ? 'expired' : n <= 60 ? 'expiring soon' : 'current'; };
  return (
    <Page title="Compliance">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat name="Open tasks" value={tasks.length} /><Stat name="Tasks late" value={late} /><Stat name="Open incidents" value={(d.incidentReports as any[]).length} /><Stat name="Patient requests" value={(d.patientRightsRequests as any[]).length} />
      </div>
      <Section title="Tasks">
        {tasks.length ? tasks.map((t) => (
          <Row key={t.id} className="items-start">
            <span className="min-w-0 flex-1"><TitleLine status={t.dueOn.slice(0, 10) < today ? 'overdue' : null}>{t.title}</TitleLine>
              <Meta>{title(t.category)} · due {calendarDate(t.dueOn, 'date')} ({left(t.dueOn, today)}){t.repeatMonths ? ` · repeats every ${t.repeatMonths} months` : ''}{t.owner?.name ? ` · ${t.owner.name}` : ''}</Meta>
              <span className="mt-1 flex flex-wrap gap-2">
                <ActionButton op="completeComplianceTask" vars={{ taskId: t.id, expectedVersion: t.version }} ask="Note what was done" paths={paths}>Done</ActionButton>
                <ActionButton op="completeComplianceTask" vars={{ taskId: t.id, expectedVersion: t.version, dismiss: true }} ask="Why does this not apply?" paths={paths}>Not needed</ActionButton>
              </span></span>
          </Row>
        )) : <Empty>No open tasks.</Empty>}
        <details><summary className="cursor-pointer text-sm font-medium">Add a task</summary>
          <div className="pt-2"><CommandForm op="addComplianceTask" submitLabel="Add task" paths={paths} columns={2} fields={[
            { name: 'title', label: 'Task', kind: 'text', required: true, placeholder: 'Yearly privacy training' },
            { name: 'category', label: 'Kind', kind: 'select', required: true, options: ['training', 'risk_analysis', 'policy_review', 'credential', 'equipment', 'baa', 'other'].map((v) => ({ value: v, label: title(v) })) },
            { name: 'dueOn', label: 'Due', kind: 'date', required: true },
            { name: 'repeatMonths', label: 'Repeat every (months)', kind: 'number', hint: 'Leave empty for a one-time task.' },
          ]} /></div>
        </details>
      </Section>
      <Section title="Licences and credentials">
        {creds.length ? creds.map((c) => <Row key={c.id}><span className="min-w-0"><TitleLine status={credState(c) === 'current' ? null : 'overdue'}>{c.holder?.displayName ?? 'Staff'} · {title(c.kind)} {c.jurisdiction}{c.numberLast4 ? ` ending ${c.numberLast4}` : ''}</TitleLine><Meta>Expires {calendarDate(c.expiresOn, 'date')} · {credState(c)}</Meta></span></Row>) : <Empty>No credentials with an expiry date.</Empty>}
      </Section>
      <Section title="Patient requests (30 days to answer)">
        {(d.patientRightsRequests as any[]).length ? (d.patientRightsRequests as any[]).map((r) => (
          <Row key={r.id} className="items-start">
            <span className="min-w-0 flex-1"><TitleLine status={r.dueOn.slice(0, 10) < today ? 'overdue' : null}>{r.patient?.firstName} {r.patient?.lastName} · {title(r.kind)}</TitleLine>
              <Meta>{r.ref} · received {calendarDate(r.receivedOn, 'date')} · answer by {calendarDate(r.dueOn, 'date')} ({left(r.dueOn, today)}){r.extendedOnce ? ' · extended once' : ''}</Meta>
              <span className="mt-1 flex flex-wrap items-start gap-2">
                {!r.extendedOnce ? <ActionButton op="extendRightsRequest" vars={{ requestId: r.id, expectedVersion: r.version }} ask="Why do you need more time? The patient must be told." paths={paths}>Take 30 more days</ActionButton> : null}
                <details><summary className="cursor-pointer text-sm font-medium">Answer the request</summary><div className="pt-2"><CommandForm op="resolveRightsRequest" submitLabel="Save answer" paths={paths} columns={1} fixed={{ requestId: r.id, expectedVersion: r.version }} fields={[
                  { name: 'outcome', label: 'Outcome', kind: 'select', required: true, options: [{ value: 'fulfilled', label: 'Fulfilled' }, { value: 'denied', label: 'Denied' }] },
                  { name: 'resolution', label: 'What was done or why not', kind: 'textarea', required: true },
                ]} /></div></details>
              </span></span>
          </Row>
        )) : <Empty>No open requests.</Empty>}
        <details><summary className="cursor-pointer text-sm font-medium">Log a patient request</summary>
          <div className="pt-2"><CommandForm op="openRightsRequest" submitLabel="Log request" paths={paths} columns={2} fixed={{ receivedOn: today }} fields={[
            { name: 'patientId', label: 'Patient', kind: 'select', required: true, options: patients },
            { name: 'kind', label: 'They asked to', kind: 'select', required: true, options: [{ value: 'access', label: 'See or get their records' }, { value: 'amendment', label: 'Correct their records' }, { value: 'accounting', label: 'Know who records were shared with' }, { value: 'restriction', label: 'Limit how records are used' }, { value: 'confidential_communication', label: 'Be contacted another way' }] },
          ]} /></div>
        </details>
      </Section>
      <Section title="Incidents and breaches (60 days to notify)">
        {(d.incidentReports as any[]).length ? (d.incidentReports as any[]).map((i) => {
          const by = addDays(String(i.discoveredAt), 60);
          return (
            <Row key={i.id} className="items-start">
              <span className="min-w-0 flex-1"><TitleLine status={i.status}>{i.title}</TitleLine>
                <Meta>{title(i.status)} · found {when(i.discoveredAt, tz, 'date')} · patients told by {calendarDate(by, 'date')} ({left(by, today)}){i.affectedCount ? ` · about ${i.affectedCount} patients` : ''}</Meta>
                <span className="mt-1 flex flex-wrap gap-2">
                  {({ reported: [['assessing', 'Start assessing']], assessing: [['notifiable', 'Must notify'], ['not_notifiable', 'No notice needed']], notifiable: [['notified', 'Notice sent']], not_notifiable: [['closed', 'Close']], notified: [['closed', 'Close']] } as Record<string, string[][]>)[i.status]?.map(([to, label]) => (
                    <ActionButton key={to} op="advanceIncident" vars={{ incidentId: i.id, expectedVersion: i.version, to }} ask={to === 'notifiable' || to === 'not_notifiable' ? 'Write down the risk assessment' : undefined} paths={paths}>{label}</ActionButton>
                  ))}
                </span></span>
            </Row>
          );
        }) : <Empty>No open incidents.</Empty>}
        <details><summary className="cursor-pointer text-sm font-medium">Report an incident</summary>
          <div className="pt-2"><CommandForm op="reportIncident" submitLabel="Report" paths={paths} columns={2} fixed={{ discoveredOn: today }} fields={[
            { name: 'title', label: 'What happened, briefly', kind: 'text', required: true },
            { name: 'affectedCount', label: 'Patients affected, if known', kind: 'number' },
            { name: 'description', label: 'Details', kind: 'textarea', required: true },
          ]} /></div>
        </details>
      </Section>
      <Section title="Legal holds and record retention">
        {(d.retentionPolicies as any[]).map((p) => <Meta key={p.id}>Charts are kept {p.years} years after the last visit{p.minorsUntilAge ? `, or until the patient is ${p.minorsUntilAge} if later` : ''}.</Meta>)}
        {(d.recordHolds as any[]).length ? (d.recordHolds as any[]).map((h) => (
          <Row key={h.id} className="items-start"><span className="min-w-0 flex-1"><TitleLine status="active">{h.patient?.firstName} {h.patient?.lastName} · on hold</TitleLine><Meta>{h.reason}</Meta>
            <span className="mt-1 block"><ActionButton op="releaseRecordHold" vars={{ holdId: h.id, expectedVersion: h.version }} ask="Why is the hold ending?" paths={paths}>Release hold</ActionButton></span></span></Row>
        )) : <Empty>No records are on hold.</Empty>}
        <details><summary className="cursor-pointer text-sm font-medium">Place a legal hold</summary>
          <div className="pt-2"><CommandForm op="placeRecordHold" submitLabel="Place hold" paths={paths} columns={1} fields={[
            { name: 'patientId', label: 'Patient', kind: 'select', required: true, options: patients },
            { name: 'reason', label: 'Why', kind: 'textarea', required: true },
          ]} /></div>
        </details>
        <div className="flex flex-wrap items-center gap-2 pt-2"><ActionButton op="scanRetention" vars={{}} paths={paths}>Find charts past retention</ActionButton></div>
        {(d.retentionDispositions as any[]).length ? (d.retentionDispositions as any[]).map((x) => (
          <Row key={x.id} className="items-start"><span className="min-w-0 flex-1"><TitleLine status={x.status}>{x.patient?.firstName} {x.patient?.lastName}</TitleLine><Meta>Eligible since {calendarDate(x.eligibleOn, 'date')} · {title(x.status)}{x.blockedReason ? ` · ${x.blockedReason}` : ''}</Meta>
            {['eligible', 'blocked'].includes(x.status) ? <span className="mt-1 block"><ActionButton op="requestDisposition" vars={{ dispositionId: x.id, expectedVersion: x.version }} paths={paths}>Ask for approval to dispose</ActionButton></span> : null}</span></Row>
        )) : null}
      </Section>
      <Section title="Who records were shared with">
        {(d.accountingOfDisclosures as any[]).length ? (d.accountingOfDisclosures as any[]).map((a) => <Row key={a.id}><span className="min-w-0"><TitleLine>{a.patient?.firstName} {a.patient?.lastName} → {a.recipient}</TitleLine><Meta>{calendarDate(a.disclosedOn, 'date')} · {a.purpose}</Meta></span></Row>) : <Empty>Nothing recorded.</Empty>}
        <details><summary className="cursor-pointer text-sm font-medium">Record a disclosure</summary>
          <div className="pt-2"><CommandForm op="recordDisclosure" submitLabel="Record" paths={paths} columns={2} fixed={{ disclosedOn: today }} fields={[
            { name: 'patientId', label: 'Patient', kind: 'select', required: true, options: patients },
            { name: 'recipient', label: 'Shared with', kind: 'text', required: true },
            { name: 'purpose', label: 'Why', kind: 'text', required: true },
            { name: 'description', label: 'What was shared', kind: 'text' },
          ]} /></div>
        </details>
      </Section>
    </Page>
  );
}
