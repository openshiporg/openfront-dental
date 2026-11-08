import { q } from '../../lib/server';
import { when, title } from '../../lib/format';
import { Section, Row, Empty, Meta, TitleLine } from '../../components/ui';
import { CommandForm, type FieldSpec } from '../../components/CommandForm';

/** Medical history: the patient's latest answers, review with acknowledgement and signature, and past reviews. */
export async function HistoryTab({ id, paths }: { id: string; paths: string[] }) {
  const d = await q<any>(`query History($id: ID!) {
    medicalHistoryResponses(where: { patient: { id: { equals: $id } } }, orderBy: { submittedAt: desc }, take: 10) { id answers status version submittedVia submittedAt form { id name questions } }
    medicalHistoryForms(where: { status: { equals: "published" } }) { id name questions }
    patientAlerts: patientAlerts(where: { patient: { id: { equals: $id } }, endedAt: { equals: null } }) { id kind text }
  }`, { id });
  const responses = d.medicalHistoryResponses as any[];
  const form = (d.medicalHistoryForms as any[])[0];
  const latest = responses[0];
  const questions = ((latest?.form?.questions ?? form?.questions ?? []) as { key: string; label: string; type: string }[]);
  const yesNo = questions.filter((x) => x.type === 'yes_no');
  const fields: FieldSpec[] = yesNo.map((x) => ({ name: x.key, label: x.label, kind: 'select', options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }], defaultValue: String(latest?.answers?.[x.key] ?? 'no') }));
  return (
    <>
      <Section title="Latest answers">
        {latest ? (
          <>
            <TitleLine status={latest.status}><span className="font-medium">{latest.form.name}</span><Meta>{title(latest.submittedVia)} · {when(latest.submittedAt, undefined, 'dayTime')}</Meta></TitleLine>
            {questions.map((x) => {
              const a = latest.answers?.[x.key];
              return <Row key={x.key}><span>{x.label}</span><Meta>{x.type === 'list' ? ((a as any[]) ?? []).map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ''}`).join(', ') || 'None' : title(String(a ?? 'not answered'))}</Meta></Row>;
            })}
            {latest.status !== 'reviewed' ? (
              <CommandForm op="reviewMedicalHistory" submitLabel="Review and sign" paths={paths} columns={2} fixed={{ responseId: latest.id, expectedVersion: latest.version, acknowledgedChanges: yesNo.filter((x) => latest.answers?.[x.key] === 'yes').map((x) => x.key) }}
                fields={[{ name: 'password', label: 'Your password', kind: 'password', required: true, hint: 'Every “yes” answer is acknowledged and becomes an alert or medication entry.' }]} />
            ) : <Meta>Reviewed and signed.</Meta>}
          </>
        ) : <Empty>No history on file.</Empty>}
      </Section>
      {form ? (
        <Section title="Update the history">
          <CommandForm op="submitMedicalHistory" submitLabel="Save new answers" paths={paths} columns={2} fixed={{ patientId: id, formId: form.id, via: 'staff' }} shape="historyAnswers" fields={fields} />
          <p className="text-xs text-muted-foreground">Saved as a new response. It is not final until someone reviews and signs it.</p>
        </Section>
      ) : null}
      <Section title="Active alerts from history">
        {(d.patientAlerts as any[]).length ? (d.patientAlerts as any[]).map((a) => <Row key={a.id}><span>{title(a.kind)}</span><Meta>{a.text}</Meta></Row>) : <Empty>None.</Empty>}
      </Section>
    </>
  );
}
