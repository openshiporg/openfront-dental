import Link from 'next/link';
import { q } from '../../lib/server';
import { calendarDate, title } from '../../lib/format';
import { Section, Row, Empty, Meta, Stat, TitleLine } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';
import { cal, compareExams, summarize } from '@/features/keystone/lib/perio';

const SITES = ['MB', 'B', 'DB', 'ML', 'L', 'DL'] as const;
const UPPER = Array.from({ length: 16 }, (_, i) => String(i + 1));
const LOWER = Array.from({ length: 16 }, (_, i) => String(32 - i));

/** Perio chart: 6-site grid per tooth, CAL derived, comparison with the prior exam, and the stage/grade suggestion awaiting confirmation. */
export async function PerioTab({ id, p, providers, examId, href, paths }: { id: string; p: any; providers: any[]; examId?: string; href: (o: Record<string, string>) => string; paths: string[] }) {
  const list = await q<any>(`query Exams($id: ID!) {
    perioExams(where: { patient: { id: { equals: $id } } }, orderBy: [{ examDate: desc }, { revision: desc }], take: 20) { id examDate revision status version examiner { displayName } signedAt }
  }`, { id });
  const exams = list.perioExams as any[];
  const exam = exams.find((e) => e.id === examId) ?? exams[0];
  const hygienists = providers.filter((x) => ['hygienist', 'dentist'].includes(x.providerType));
  if (!exam) {
    return (
      <Section title="Perio exams">
        <Empty>No perio exam yet.</Empty>
        <StartForm id={id} p={p} hygienists={hygienists} paths={paths} />
      </Section>
    );
  }
  const prior = exams.find((e) => e.id !== exam.id && e.status === 'completed' && new Date(e.examDate) <= new Date(exam.examDate) && e.revision <= exam.revision && e.id !== exam.id);
  const data = await q<any>(`query Exam($e: ID!, $prior: ID!) {
    perioSiteMeasurements(where: { exam: { id: { equals: $e } } }, take: 600) { tooth site probingDepthMm gingivalMarginMm bleeding suppuration plaque }
    perioToothFindings(where: { exam: { id: { equals: $e } } }, take: 40) { tooth mobility furcation missing implant }
    perioClassifications(where: { exam: { id: { equals: $e } } }) { id suggestedStage suggestedGrade extent inputs confirmedStage confirmedGrade status version }
    prior: perioSiteMeasurements(where: { exam: { id: { equals: $prior } } }, take: 600) { tooth site probingDepthMm gingivalMarginMm }
  }`, { e: exam.id, prior: prior?.id ?? 'none' });
  const rows = data.perioSiteMeasurements as any[];
  const by = new Map(rows.map((r) => [`${r.tooth}-${r.site}`, r]));
  const mobility = new Map((data.perioToothFindings as any[]).map((f) => [f.tooth, f]));
  const summary = summarize(rows);
  const changes = prior ? compareExams(data.prior, rows, 2) : [];
  const classification = (data.perioClassifications as any[])[0];
  const editable = exam.status === 'in_progress';

  const Row16 = ({ teeth, label }: { teeth: string[]; label: string }) => (
    <div>
      <div className="pb-1 text-xs text-muted-foreground">{label}</div>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-center font-mono text-xs">
        <thead><tr><th className="w-10 text-left">Tooth</th>{teeth.map((t) => <th key={t} colSpan={3} className="border-l px-0.5 font-semibold">{t}{mobility.get(t)?.mobility ? <span className="text-amber-700"> M{mobility.get(t).mobility}</span> : null}{mobility.get(t)?.missing ? ' ✕' : ''}</th>)}</tr></thead>
        <tbody>
          {[['Buccal', ['MB', 'B', 'DB']], ['Lingual', ['ML', 'L', 'DL']]].map(([name, sites]) => (
            <tr key={name as string}>
              <th className="text-left font-sans font-normal text-muted-foreground">{(name as string)[0]}</th>
              {teeth.flatMap((t, ti) => (sites as string[]).map((s, si) => {
                const m = by.get(`${t}-${s}`);
                const pd = m?.probingDepthMm;
                const level = cal(pd, m?.gingivalMarginMm);
                return (
                  <td key={`${t}${s}`} title={m ? `PD ${pd ?? '—'} · GM ${m.gingivalMarginMm ?? '—'} · CAL ${level ?? '—'}${m.bleeding ? ' · bleeding' : ''}${m.plaque ? ' · plaque' : ''}` : 'Not recorded'} className={`${si === 0 ? 'border-l' : ''} ${pd !== null && pd !== undefined && pd >= 5 ? 'font-bold text-red-700' : pd !== null && pd !== undefined && pd >= 4 ? 'text-amber-700' : ''}`}>
                    {pd ?? '·'}{m?.bleeding ? <sup className="text-red-600">•</sup> : null}
                  </td>
                );
              }))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );

  return (
    <>
      <Section title="Perio exams" aside={<span className="text-xs text-muted-foreground">{exams.length} on file</span>}>
        {exams.map((e) => (
          <Row key={e.id} href={href({ tab: 'perio', exam: e.id })}>
            <TitleLine status={e.status}><span className={e.id === exam.id ? 'font-semibold' : ''}>{calendarDate(e.examDate, 'date')}{e.revision > 1 ? ` · revision ${e.revision}` : ''}</span></TitleLine>
            <Meta>{e.examiner?.displayName}</Meta>
          </Row>
        ))}
        <details><summary className="cursor-pointer text-sm font-medium">Start a new exam</summary><div className="pt-3"><StartForm id={id} p={p} hygienists={hygienists} paths={paths} /></div></details>
      </Section>
      <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-5">
        <Stat name="Sites recorded" value={summary.sites} />
        <Stat name="Mean depth" value={`${summary.meanPd} mm`} />
        <Stat name="Bleeding" value={`${summary.bleedingPct}%`} />
        <Stat name="Sites 5 mm+" value={summary.sitesGe5} />
        <Stat name="Worst CAL" value={summary.maxCal === null ? '—' : `${summary.maxCal} mm`} />
      </div>
      <Section title={`Exam ${calendarDate(exam.examDate, 'date')}`}>
        <p className="max-w-full whitespace-normal break-words text-xs text-muted-foreground">Probing depth in mm. A dot marks bleeding. Hover a number for gingival margin and CAL.</p>
        <Row16 teeth={UPPER} label="Upper, patient’s right to left" />
        <Row16 teeth={LOWER} label="Lower, patient’s right to left" />
        {editable ? (
          <details open className="pt-2">
            <summary className="cursor-pointer text-sm font-medium">Enter measurements</summary>
            <div className="pt-3">
              <CommandForm op="recordPerioMeasurements" submitLabel="Save sites" paths={paths} columns={3} fixed={{ examId: exam.id, expectedVersion: exam.version }} shape="perioRow"
                fields={[
                  { name: 'tooth', label: 'Tooth', kind: 'text', required: true, placeholder: '3' },
                  { name: 'depths', label: 'Depths MB B DB', kind: 'text', required: true, placeholder: '3 2 3', hint: 'Three numbers, 0 to 15 mm.' },
                  { name: 'margins', label: 'Margin MB B DB', kind: 'text', placeholder: '0 0 1', hint: 'Gingival margin, −10 to 15 mm.' },
                  { name: 'lingualDepths', label: 'Depths ML L DL', kind: 'text', placeholder: '3 3 4' },
                  { name: 'lingualMargins', label: 'Margin ML L DL', kind: 'text', placeholder: '0 0 0' },
                  { name: 'bleeding', label: 'Bleeding sites', kind: 'text', placeholder: 'MB DL' },
                ]} />
              <div className="pt-3">
                <CommandForm op="completePerioExam" submitLabel="Sign and complete exam" paths={paths} columns={2} fixed={{ examId: exam.id, expectedVersion: exam.version }}
                  fields={[{ name: 'password', label: 'Your password', kind: 'password', required: true, hint: 'Signing re-checks who you are.' }]} />
              </div>
            </div>
          </details>
        ) : <ActionButton op="reviseSignedPerioExam" vars={{ examId: exam.id }} ask="Why is a revision needed? The signed exam stays as it is." paths={paths}>Start a revision</ActionButton>}
      </Section>
      {prior ? (
        <Section title={`Changes since ${calendarDate(prior.examDate, 'date')}`}>
          {changes.length ? changes.slice(0, 20).map((c) => <Row key={`${c.tooth}${c.site}`}><span>Tooth {c.tooth} {c.site}</span><Meta>{c.before ?? '—'} → {c.after ?? '—'} mm ({c.delta > 0 ? '+' : ''}{c.delta})</Meta></Row>) : <Empty>No site changed by 2 mm or more.</Empty>}
        </Section>
      ) : null}
      {classification ? (
        <Section title="Stage and grade">
          <Row>
            <span className="min-w-0"><TitleLine status={classification.status}><span className="font-medium">Suggested: Stage {classification.suggestedStage}, Grade {classification.suggestedGrade}, {title(classification.extent)}</span></TitleLine>
              <Meta>{((classification.inputs?.reasons ?? []) as string[]).join('; ')}. This is a suggestion from the recorded numbers; a clinician confirms or changes it.</Meta></span>
            {classification.status === 'suggested' ? <ActionButton op="confirmPerioClassification" vars={{ classificationId: classification.id, expectedVersion: classification.version, stage: classification.suggestedStage, grade: classification.suggestedGrade }} paths={paths}>Confirm</ActionButton> : <Meta>Confirmed: Stage {classification.confirmedStage}, Grade {classification.confirmedGrade}</Meta>}
          </Row>
        </Section>
      ) : null}
      <Link className="text-sm hover:underline" href={href({ tab: 'chart' })}>Back to chart</Link>
    </>
  );
}

function StartForm({ id, p, hygienists, paths }: { id: string; p: any; hygienists: any[]; paths: string[] }) {
  return (
    <CommandForm op="startPerioExam" submitLabel="Start exam" paths={paths} fixed={{ patientId: id, locationId: p.homeLocation?.id }} columns={2}
      fields={[{ name: 'examinerId', label: 'Examiner', kind: 'select', options: hygienists.map((h) => ({ value: h.id, label: h.displayName })), required: true }, { name: 'examDate', label: 'Exam date', kind: 'date' }]} />
  );
}
