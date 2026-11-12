import { q, requirePage } from '../../lib/server';
import { calendarDate, money, title } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, TitleLine } from '../../components/ui';
import { ActionButton, summaryClass } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';
import { DownloadButton, ImportPreviewForm, ApplyImportButton } from '../../components/Phase6Actions';
import { practiceToday } from '../../lib/today';

const n = (v: unknown) => Number(v ?? 0);

/** Bring a patient list in from another system, check it, and have a second person approve it. Or take a copy of a patient's records out. */
export default async function DataPage() {
  await requirePage('data');
  const [today, d] = await Promise.all([practiceToday(), q<any>(`{
    importBatches(orderBy: { createdAt: desc }, take: 12) { id ref source fileName status version cursor preview reconciliation approval { id status } createdAt }
    exportJobs(orderBy: { createdAt: desc }, take: 15) { id ref kind byteCount counts createdAt patient { firstName lastName } }
    locations(orderBy: { name: asc }, take: 20) { id name }
    patients(orderBy: { lastName: asc }, take: 200) { id firstName lastName chartNumber }
  }`)]);
  const paths = ['/dashboard/platform/data'];
  const locations = d.locations as { id: string; name: string }[];
  const monthStart = `${today.slice(0, 8)}01`;
  return (
    <Page title="Import and export">
      <Section title="Import patients">
        <Meta>Reading a file creates nothing. After you read it, ask for approval; a second person approves, then you apply it. Large files are applied in steps and can be resumed.</Meta>
        <ImportPreviewForm locations={locations} paths={paths} />
        {(d.importBatches as any[]).length ? (d.importBatches as any[]).map((b) => {
          const p = b.preview ?? {};
          const r = b.reconciliation?.patients ? b.reconciliation : null;
          return (
            <Row key={b.id} className="items-start">
              <span className="min-w-0 flex-1">
                <TitleLine status={b.status}>{b.ref} · {b.fileName}</TitleLine>
                <Meta>{title(b.source)} · {title(b.status)} · {n(p.patients?.importable)} patients, {n(p.appointments?.importable)} appointments, {n(p.procedures?.importable)} procedures · opening balances {money(String(p.balanceMinor ?? '0'))}</Meta>
                <Meta>{n(p.patients?.alreadyInChart)} look like patients already in the chart · {n(p.problemCount)} rows could not be read{p.problems?.[0] ? ` (for example: ${p.problems[0].problem})` : ''}</Meta>
                {r ? (
                  <span className="mt-1 block space-y-0.5 text-sm">
                    <span className="block font-medium">Reconciliation: {r.balanced ? 'balances match' : b.status === 'applied' ? 'balances do not match' : 'in progress'}</span>
                    <Meta>Patients: {n(r.patients.source)} in file, {n(r.patients.created)} added, {n(r.patients.matchedExisting)} matched to existing, {n(r.patients.skipped)} skipped</Meta>
                    <Meta>Appointments: {n(r.appointments.source)} in file, {n(r.appointments.created)} added, {n(r.appointments.skipped)} skipped{Object.entries(r.appointments.skippedReasons ?? {}).map(([k, v]) => ` (${v} ${k})`).join('')}</Meta>
                    <Meta>Procedures: {n(r.procedures.source)} in file, {n(r.procedures.chart)} on the chart, {n(r.procedures.conditions)} as findings, {n(r.procedures.historyOnly)} kept as history only, {n(r.procedures.deleted)} deleted in the old system and left out, {n(r.procedures.skipped)} skipped</Meta>
                    <Meta>Balances: file {money(r.balances.sourceMinor)}, ledger {money(r.balances.ledgerMinor)}, {n(r.balances.mismatches)} patients differ</Meta>
                  </span>
                ) : null}
                <span className="mt-1 flex flex-wrap items-start gap-2">
                  {b.status === 'previewed' ? <ActionButton op="requestImportApply" vars={{ batchId: b.id, expectedVersion: b.version }} paths={paths}>Ask for approval</ActionButton> : null}
                  {b.status === 'approval_requested' && b.approval?.status === 'approved' ? <ApplyImportButton batchId={b.id} paths={paths}>Apply the import</ApplyImportButton> : null}
                  {b.status === 'applying' ? <ApplyImportButton batchId={b.id} paths={paths}>Carry on ({n(b.cursor)} done)</ApplyImportButton> : null}
                  {b.status === 'approval_requested' && b.approval?.status !== 'approved' ? <Meta>Waiting for a second person on the Approvals page.</Meta> : null}
                </span>
              </span>
            </Row>
          );
        }) : <Empty>No imports yet.</Empty>}
      </Section>
      <Section title="Export a patient's records">
        <Meta>A zip file with the patient's chart, notes, visits, ledger, prescriptions and consents, plus a manifest that proves nothing was changed.</Meta>
        <ExportPatient patients={d.patients} paths={paths} />
      </Section>
      <Section title="Export the ledger for your accountant">
        <JournalForm locationOptions={locations} from={monthStart} to={today} paths={paths} />
      </Section>
      <Section title="Recent exports">
        {(d.exportJobs as any[]).length ? (d.exportJobs as any[]).map((e) => (
          <Row key={e.id}><span className="min-w-0"><TitleLine>{e.kind === 'ehi_bundle' ? `Records for ${e.patient?.firstName ?? ''} ${e.patient?.lastName ?? ''}` : 'Ledger journal'}</TitleLine><Meta>{e.ref} · {Math.max(1, Math.round(n(e.byteCount) / 1024))} KB · {calendarDate(e.createdAt, 'date')}</Meta></span></Row>
        )) : <Empty>Nothing exported yet.</Empty>}
      </Section>
    </Page>
  );
}

function ExportPatient({ patients, paths }: { patients: any[]; paths: string[] }) {
  return (
    <details open><summary className={summaryClass}>Choose a patient</summary>
      <div className="space-y-2 pt-2">
        {patients.slice(0, 8).map((p) => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">{p.lastName}, {p.firstName} · #{p.chartNumber}</span><DownloadButton op="exportEhiBundle" vars={{ patientId: p.id }} paths={paths}>Download records</DownloadButton></div>)}
        {patients.length > 8 ? <Meta>Open a patient from the Patients page to find the rest.</Meta> : null}
      </div>
    </details>
  );
}

function JournalForm({ locationOptions, from, to, paths }: { locationOptions: { id: string; name: string }[]; from: string; to: string; paths: string[] }) {
  return <JournalClient locationOptions={locationOptions} from={from} to={to} paths={paths} />;
}
import { JournalClient } from '../../components/JournalClient';
