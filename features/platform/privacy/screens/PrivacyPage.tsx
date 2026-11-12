import Link from 'next/link';
import { q, practiceTimeZone, requirePage, holdsAny } from '../../lib/server';
import { calendarDate, title, when } from '../../lib/format';
import { practiceToday, daysBetween } from '../../lib/today';
import { Page, Section, Row, Empty, Meta, TitleLine, Stat } from '../../components/ui';
import { ActionButton, summaryClass } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';
import { DownloadButton } from '../../components/Phase6Actions';

const left = (due: string, today: string) => {
  const n = daysBetween(today, due);
  return n < 0 ? `${-n} day${n === -1 ? '' : 's'} late` : n === 0 ? 'due today' : `${n} day${n === 1 ? '' : 's'} left`;
};
const RIGHTS = [
  { value: 'access', label: 'See or get their records' }, { value: 'amendment', label: 'Correct their records' }, { value: 'accounting', label: 'Know who records were shared with' },
  { value: 'restriction', label: 'Limit how records are used' }, { value: 'confidential_communication', label: 'Be contacted another way' },
];
const PURPOSE: Record<string, string> = { treatment: 'Treatment', payment: 'Payment', operations: 'Running the practice', patient_request: 'Patient request', break_glass: 'Emergency access', system: 'System' };

/**
 * Privacy (BUILD-PLAN Phase 6): who read patient records, emergency access, patients' privacy requests, who records were shared with,
 * and a patient's records as a download. Each part reads only what the role may see.
 */
export default async function PrivacyPage({ searchParams }: { searchParams?: Promise<{ user?: string }> }) {
  await requirePage('privacy');
  const params = (await searchParams) ?? {};
  const user = (params.user ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
  const [today, tz, canAudit, canManage, canExport] = await Promise.all([
    practiceToday(), practiceTimeZone(), holdsAny(['canReadPhiAudit']), holdsAny(['canManageCompliance', 'canReviewPrivacy', 'canApproveRetention']), holdsAny(['canExportData']),
  ]);
  const canBreakGlass = await holdsAny(['canReviewPrivacy']);
  const [reads, glass, d] = await Promise.all([
    canAudit ? q<any>(`query($where: PhiReadAuditWhereInput!) { phiReadAudits(where: $where, orderBy: { at: desc }, take: 50) { id at purpose operationName listKeys recordCount success actorReference actorUser { id name } actorAgent { name } } }`, { where: user ? { actorUser: { id: { equals: user } } } : {} }) : null,
    canBreakGlass ? q<any>(`{ breakGlassEvents(orderBy: { openedAt: desc }, take: 30) { id kind subjectType reason status openedAt expiresAt endedAt reviewNote user { name } location { name } } }`) : null,
    canManage ? q<any>(`{
      patientRightsRequests(orderBy: { dueOn: asc }, take: 60) { id ref kind receivedOn dueOn status extendedOnce resolution version patient { id firstName lastName chartNumber } }
      accountingOfDisclosures(orderBy: { disclosedOn: desc }, take: 40) { id disclosedOn recipient purpose description patient { firstName lastName } }
      exportJobs(where: { kind: { equals: "ehi_bundle" } }, orderBy: { createdAt: desc }, take: 20) { id ref byteCount createdAt patient { firstName lastName } requestedBy { name } }
      patients(orderBy: { lastName: asc }, take: 200) { id firstName lastName chartNumber }
    }`) : null,
  ]);
  const paths = ['/dashboard/platform/privacy'];
  const requests = (d?.patientRightsRequests ?? []) as any[];
  const open = requests.filter((r) => r.status === 'open' || r.status === 'extended');
  const patients = ((d?.patients ?? []) as any[]).map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName} · #${p.chartNumber}` }));
  const glassRows = (glass?.breakGlassEvents ?? []) as any[];
  return (
    <Page title="Privacy">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat name="Open requests" value={d ? open.length : '—'} />
        <Stat name="Requests late" value={d ? open.filter((r) => r.dueOn.slice(0, 10) < today).length : '—'} />
        <Stat name="Emergency access" value={glass ? glassRows.filter((g) => g.status === 'active' || g.status === 'ended').length : '—'} />
        <Stat name="Records reads shown" value={reads ? (reads.phiReadAudits as any[]).length : '—'} />
      </div>

      {d ? (
        <Section title="Patient privacy requests (30 days to answer)">
          {requests.length ? requests.map((r) => (
            <Row key={r.id} className="items-start">
              <span className="min-w-0 flex-1">
                <TitleLine status={r.status === 'open' || r.status === 'extended' ? (r.dueOn.slice(0, 10) < today ? 'overdue' : null) : r.status}>{r.patient?.firstName} {r.patient?.lastName} · {RIGHTS.find((k) => k.value === r.kind)?.label ?? title(r.kind)}</TitleLine>
                <Meta>{r.ref} · received {calendarDate(r.receivedOn, 'date')} · {r.status === 'open' || r.status === 'extended' ? `answer by ${calendarDate(r.dueOn, 'date')} (${left(r.dueOn, today)})` : title(r.status)}{r.extendedOnce ? ' · extended once' : ''}</Meta>
                {r.resolution ? <Meta>{r.resolution}</Meta> : null}
                {r.status === 'open' || r.status === 'extended' ? (
                  <span className="mt-1 flex flex-wrap items-start gap-2">
                    {r.kind === 'access' && canExport && r.patient?.id ? <DownloadButton op="exportEhiBundle" vars={{ patientId: r.patient.id }} paths={paths}>Export records</DownloadButton> : null}
                    {!r.extendedOnce ? <ActionButton op="extendRightsRequest" vars={{ requestId: r.id, expectedVersion: r.version }} ask="Why do you need more time? The patient must be told." paths={paths}>Take 30 more days</ActionButton> : null}
                    <details><summary className={summaryClass}>Answer the request</summary><div className="pt-2"><CommandForm op="resolveRightsRequest" submitLabel="Save answer" paths={paths} columns={1} fixed={{ requestId: r.id, expectedVersion: r.version }} fields={[
                      { name: 'outcome', label: 'Outcome', kind: 'select', required: true, options: [{ value: 'fulfilled', label: 'Fulfilled' }, { value: 'denied', label: 'Denied' }] },
                      { name: 'resolution', label: 'What was done or why not', kind: 'textarea', required: true },
                    ]} /></div></details>
                  </span>
                ) : null}
              </span>
            </Row>
          )) : <Empty>No requests yet.</Empty>}
          <details><summary className={summaryClass}>Log a request</summary>
            <div className="pt-2"><CommandForm op="openRightsRequest" submitLabel="Log request" paths={paths} columns={2} fixed={{ receivedOn: today }} fields={[
              { name: 'patientId', label: 'Patient', kind: 'select', required: true, options: patients },
              { name: 'kind', label: 'They asked to', kind: 'select', required: true, options: RIGHTS },
            ]} /></div>
          </details>
        </Section>
      ) : null}

      {d ? (
        <Section title="Who records were shared with">
          {(d.accountingOfDisclosures as any[]).length ? (d.accountingOfDisclosures as any[]).map((a) => (
            <Row key={a.id}><span className="min-w-0"><TitleLine>{a.patient?.firstName} {a.patient?.lastName} → {a.recipient}</TitleLine><Meta>{calendarDate(a.disclosedOn, 'date')} · {a.purpose}{a.description ? ` · ${a.description}` : ''}</Meta></span></Row>
          )) : <Empty>Nothing recorded.</Empty>}
          <details><summary className={summaryClass}>Record a disclosure</summary>
            <div className="pt-2"><CommandForm op="recordDisclosure" submitLabel="Record" paths={paths} columns={2} fixed={{ disclosedOn: today }} fields={[
              { name: 'patientId', label: 'Patient', kind: 'select', required: true, options: patients },
              { name: 'recipient', label: 'Shared with', kind: 'text', required: true },
              { name: 'purpose', label: 'Why', kind: 'text', required: true },
              { name: 'description', label: 'What was shared', kind: 'text' },
            ]} /></div>
          </details>
        </Section>
      ) : null}

      {d ? (
        <Section title="Records exports">
          {(d.exportJobs as any[]).length ? (d.exportJobs as any[]).map((e) => (
            <Row key={e.id}><span className="min-w-0"><TitleLine>{e.patient?.firstName} {e.patient?.lastName}</TitleLine><Meta>{e.ref} · {Math.max(1, Math.round(Number(e.byteCount ?? 0) / 1024))} KB · {when(e.createdAt, tz, 'dayTime')}{e.requestedBy?.name ? ` · by ${e.requestedBy.name}` : ''}</Meta></span></Row>
          )) : <Empty>No records exported yet. Use “Export records” on an access request.</Empty>}
        </Section>
      ) : null}

      {glass ? (
        <Section title="Emergency access">
          {glassRows.length ? glassRows.map((g) => (
            <Row key={g.id} className="items-start"><span className="min-w-0 flex-1">
              <TitleLine status={g.status}>{g.user?.name ?? 'Someone'} · {g.kind === 'records_override' ? 'opened restricted records' : 'worked outside their office'}</TitleLine>
              <Meta>{when(g.openedAt, tz, 'dayTime')}{g.location?.name ? ` · ${g.location.name}` : ''} · {title(g.status)}</Meta>
              <Meta>Reason given: {g.reason}</Meta>
              {g.reviewNote ? <Meta>Review: {g.reviewNote}</Meta> : null}
            </span></Row>
          )) : <Empty>No emergency access has been used.</Empty>}
        </Section>
      ) : null}

      {reads ? (
        <Section title={user ? 'Records read by one person' : 'Who read patient records'} aside={user ? <Link href="/dashboard/platform/privacy" className="inline-flex min-h-11 items-center text-sm underline">Show everyone</Link> : null}>
          {(reads.phiReadAudits as any[]).length ? (reads.phiReadAudits as any[]).map((r) => (
            <Row key={r.id} className="items-start"><span className="min-w-0 flex-1">
              <TitleLine status={r.success ? null : 'failed'}>
                {r.actorUser ? <Link href={`/dashboard/platform/privacy?user=${r.actorUser.id}`} className="inline-flex min-h-11 items-center underline-offset-2 hover:underline">{r.actorUser.name}</Link> : <span>{r.actorAgent?.name ?? 'System'}</span>}
              </TitleLine>
              <Meta>{when(r.at, tz, 'dayTime')} · {PURPOSE[r.purpose] ?? title(r.purpose)} · {r.recordCount} record{r.recordCount === 1 ? '' : 's'} · {((r.listKeys as string[]) ?? []).map((k) => title(k.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase())).join(', ')}</Meta>
            </span></Row>
          )) : <Empty>No reads recorded{user ? ' for this person' : ''}.</Empty>}
        </Section>
      ) : null}
    </Page>
  );
}
