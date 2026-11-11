import { q, practiceTimeZone } from '../../lib/server';
import { when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, TitleLine } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { ExportDigest } from '../components/ExportDigest';

const PATH = ['/dashboard/platform/assistant'];
const STATUS_TEXT: Record<string, string> = { validated: 'waiting for you', proposed: 'waiting for you', executed: 'done', rejected: 'turned down', expired: 'ran out of time', invalid: 'no longer needed', failed: 'did not go through', approved: 'approved' };

/**
 * The assistant's home. Opening it runs the checks (they are safe to repeat), then lists what was found and what is suggested.
 * Each suggestion shows its trail: what was noticed, who decided, what was done and what came of it.
 */
export default async function AssistantPage() {
  const tz = await practiceTimeZone();
  let data: any;
  try {
    await q(`mutation Run($k: String!) { runSignalChecks(idempotencyKey: $k) }`, { k: `home:${new Date().toISOString().slice(0, 13)}:${Math.random().toString(36).slice(2, 10)}` });
    data = (await q<any>(`{ aiHome }`)).aiHome;
  } catch {
    return <Page title="Assistant"><Empty>Your role is not allowed to see the assistant's suggestions.</Empty></Page>;
  }
  const waiting = data.proposals.filter((p: any) => ['validated', 'proposed'].includes(p.status));
  const past = data.proposals.filter((p: any) => !['validated', 'proposed'].includes(p.status));
  const digest = data.proposals.map((p: any) => ({ when: when(p.createdAt, tz), what: p.summary, status: STATUS_TEXT[p.status] ?? p.status, result: p.outcome?.text ?? '' }));
  return (
    <Page title="Assistant">
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton op="runSignalChecks" vars={{}} paths={PATH}>Run checks</ActionButton>
        <ExportDigest rows={digest} />
        <Meta>It suggests; a person decides. Nothing is sent to patients.</Meta>
      </div>
      <Section title={`Waiting for a decision (${waiting.length})`}>
        {waiting.length ? waiting.map((p: any) => (
          <Row key={p.id}>
            <div className="min-w-0 flex-1 space-y-1">
              <TitleLine status={p.status === 'validated' ? 'pending' : p.status}><span className="font-medium">{p.kindTitle}</span></TitleLine>
              <p className="break-words text-sm">{p.summary}</p>
              <Meta>Noticed: {p.trace.signal} · suggested by {p.proposedBy} · {p.expiresAt ? `open until ${when(p.expiresAt, tz)}` : ''}</Meta>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton op="decideProposal" vars={{ proposalId: p.id, decision: 'approve', expectedVersion: p.version }} paths={PATH}>Approve</ActionButton>
              <ActionButton op="decideProposal" vars={{ proposalId: p.id, decision: 'reject', expectedVersion: p.version }} ask="Why are you turning this down?" paths={PATH}>Turn down</ActionButton>
            </div>
          </Row>
        )) : <Empty>Nothing needs a decision right now.</Empty>}
      </Section>
      <Section title="What happened">
        {past.length ? past.map((p: any) => (
          <Row key={p.id}>
            <div className="min-w-0 flex-1 space-y-1">
              <TitleLine status={p.status}><span className="font-medium">{p.kindTitle}</span></TitleLine>
              <p className="break-words text-sm">{p.summary}</p>
              <Meta>Noticed: {p.trace.signal}{p.trace.decision.map((d: any) => ` → ${d.by} ${d.reason ? `said “${d.reason}”` : 'approved'}`).join('')}{p.trace.effects.length ? ` → carried out (${p.trace.effects.length} change${p.trace.effects.length === 1 ? '' : 's'})` : ''}{p.outcome ? ` → ${p.outcome.text}` : ''}</Meta>
            </div>
          </Row>
        )) : <Empty>No suggestions have been decided yet.</Empty>}
      </Section>
      <Section title={`Noticed, no suggestion yet (${data.signals.filter((s: any) => s.status === 'open').length})`}>
        {data.signals.filter((s: any) => s.status === 'open').length ? data.signals.filter((s: any) => s.status === 'open').map((s: any) => <Row key={s.id}><div className="min-w-0"><p className="break-words text-sm">{s.summary}</p><Meta>{s.type}</Meta></div></Row>) : <Empty>Nothing else to flag.</Empty>}
      </Section>
    </Page>
  );
}
