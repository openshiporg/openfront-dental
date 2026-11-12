import { notFound } from 'next/navigation';
import { q, requirePage, practiceTimeZone } from '../../lib/server';
import { when, title } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, TitleLine } from '../../components/ui';

/** One call, word for word. A call at another office, or one that does not exist, is a 404. */
export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('calls');
  const { id } = await params;
  const [tz, d] = await Promise.all([practiceTimeZone(), q<any>(`query($id: ID!) { callRecord(where: { id: $id }) {
    id ref direction adapter outcome scenario startedAt durationSeconds summary notes handoffReason disclosedAt recordingConsent recordingBasis followedUpAt transcript toolCalls
    patient { firstName lastName } location { name } agentRun { id }
  } }`, { id }).catch(() => ({ callRecord: null }))]);
  const c = d.callRecord;
  if (!c) notFound();
  const turns = (Array.isArray(c.transcript) ? c.transcript : []) as { who: string; text: string }[];
  const tools = (Array.isArray(c.toolCalls) ? c.toolCalls : []) as { tool: string; ok: boolean; proposes: string | null }[];
  return (
    <Page title={`Call ${c.ref}`} status={c.outcome} crumbs={[{ label: 'Calls', href: '/dashboard/platform/calls' }]}>
      <Section title="Summary">
        <Row><TitleLine status={c.outcome}>{title(c.direction)} · {c.adapter === 'manual' ? 'Logged by hand' : 'Simulation'} · {title(c.outcome)}</TitleLine></Row>
        <Meta>{when(c.startedAt, tz)} · {c.location?.name}{c.patient ? ` · ${c.patient.firstName} ${c.patient.lastName}` : ' · caller not matched to a patient'}</Meta>
        {c.summary ? <p className="text-sm">{c.summary}</p> : null}
        {c.notes && c.notes !== c.summary ? <p className="whitespace-pre-wrap text-sm">{c.notes}</p> : null}
        {c.handoffReason ? <Meta>Handed to the front desk because {c.handoffReason}.</Meta> : null}
        <Meta>{c.disclosedAt ? 'The assistant said it was an AI before anything else.' : 'No assistant spoke on this call.'} {c.adapter === 'manual' ? 'Not recorded.' : c.recordingConsent ? 'Recorded with the caller’s agreement.' : 'Not recorded.'}</Meta>
      </Section>
      {turns.length ? (
        <Section title="What was said">
          {turns.map((t, i) => (
            <Row key={i} className="items-start"><span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">{t.who === 'agent' ? 'Assistant' : 'Caller'}</span><span className="min-w-0 break-words text-sm">{t.text}</span></Row>
          ))}
          <Meta>A date of birth the caller gave is checked and then hidden here.</Meta>
        </Section>
      ) : null}
      <Section title="What the assistant did">
        {tools.length ? tools.map((t, i) => <Row key={i}><span>{title(t.tool)}</span><Meta>{t.ok ? 'done' : 'failed'}{t.proposes ? ` · asked the front desk (${title(t.proposes)})` : ''}</Meta></Row>) : <Empty>The assistant used no tools on this call.</Empty>}
      </Section>
    </Page>
  );
}
