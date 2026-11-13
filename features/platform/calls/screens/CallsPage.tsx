import { q, requirePage, holdsAny, practiceTimeZone } from '../../lib/server';
import { when, title } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Status, TitleLine } from '../../components/ui';
import { ActionButton, summaryClass } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';
import { CALL_OUTCOMES } from '../../../keystone/models/phase6';

/**
 * Calls: the voice receptionist answers a real phone number connected to an office (Settings > Locations), and staff log calls they took by hand.
 * With no number connected, only the hand log is offered. Voice is off for every office until the owner turns it on.
 */
export default async function CallsPage() {
  await requirePage('calls');
  const [tz, isOwner, d] = await Promise.all([practiceTimeZone(), holdsAny(['canApproveAutonomy']), q<any>(`{
    voiceConnections
    locations(where: { isActive: { equals: true } }, orderBy: { name: asc }, take: 20) { id name }
    voicePolicies(take: 50) { id enabled recordCalls changedAt location { id } }
    callRecords(where: { adapter: { in: ["manual", "twilio"] } }, orderBy: { startedAt: desc }, take: 40) { id ref direction adapter outcome startedAt summary handoffReason followedUpAt patient { firstName lastName } location { name } }
    patients(orderBy: { lastName: asc }, take: 200) { id firstName lastName chartNumber }
  }`)]);
  const paths = ['/dashboard/platform/calls'];
  const policy = new Map<string, any>((d.voicePolicies as any[]).map((p) => [p.location?.id, p]));
  const locations = d.locations as any[];
  const patientOptions = (d.patients as any[]).map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName} · #${p.chartNumber}` }));
  const locationOptions = locations.map((l) => ({ value: l.id, label: l.name }));
  const lines = new Map<string, string>(((d.voiceConnections?.lines ?? []) as any[]).map((l) => [l.locationId, l.phoneNumber]));
  const connected = lines.size > 0;
  const open = (d.callRecords as any[]).filter((c) => (c.outcome === 'handed_off' || c.outcome === 'message_taken') && !c.followedUpAt);

  return (
    <Page title="Calls">
      <Section title="Phone line">
        {connected ? (
          locations.filter((l) => lines.has(l.id)).map((l) => <Row key={l.id}><span>{l.name}</span><Meta>{lines.get(l.id)} · answered by the voice receptionist when voice is on</Meta></Row>)
        ) : (
          <>
            <Row><span>Phone number</span><Status value="paused" /></Row>
            <p className="text-sm">Voice needs a connected phone number, and none is connected. Calls can be logged by hand below.</p>
            <Meta>The owner connects a Twilio number for each office in Settings &gt; Locations.</Meta>
          </>
        )}
      </Section>

      <Section title="Voice receptionist by office">
        <Meta>Off by default. When on, the assistant opens every call by saying it is an AI, does not record, uses the same tools as the Front Desk Assistant, and can only ask the front desk to book or confirm a visit. A person approves each request.</Meta>
        {locations.map((l) => {
          const p = policy.get(l.id);
          return (
            <Row key={l.id} className="items-start">
              <span className="min-w-0 flex-1">
                <TitleLine status={p?.enabled ? 'active' : 'inactive'}>{l.name}: voice is {p?.enabled ? 'on' : 'off'}</TitleLine>
                <Meta>{p?.enabled ? `${lines.has(l.id) ? 'Answering calls' : 'No phone number connected, so no calls arrive'}${p.changedAt ? ` · changed ${when(p.changedAt, tz, 'date')}` : ''}` : 'Calls are refused here until the owner turns this on.'}</Meta>
                {isOwner ? (
                  <details className="mt-1"><summary className={summaryClass}>{p?.enabled ? 'Change or turn off' : 'Turn on'}</summary>
                    <div className="pt-2"><CommandForm op="setVoicePolicy" submitLabel="Save" paths={paths} columns={2} fixed={{ locationId: l.id }} fields={[
                      { name: 'enabled', label: 'Voice receptionist on', kind: 'checkbox', defaultValue: !!p?.enabled },
                      { name: 'reason', label: 'Why', kind: 'text', required: true, placeholder: 'Pilot for after-hours questions' },
                    ]} /></div>
                  </details>
                ) : <Meta>Only the practice owner can change this.</Meta>}
              </span>
            </Row>
          );
        })}
      </Section>

      <Section title="Log a call by hand">
        <Meta>For a call someone on the team took or made. Write what happened; nothing is recorded.</Meta>
        <CommandForm op="logManualCall" submitLabel="Log call" paths={paths} columns={2} fields={[
          { name: 'locationId', label: 'Office', kind: 'select', required: true, options: locationOptions },
          { name: 'direction', label: 'Direction', kind: 'select', required: true, options: [{ value: 'inbound', label: 'Came in' }, { value: 'outbound', label: 'We called' }] },
          { name: 'patientId', label: 'Patient', kind: 'select', options: [{ value: '', label: 'Not a known patient' }, ...patientOptions] },
          { name: 'outcome', label: 'How it ended', kind: 'select', required: true, options: CALL_OUTCOMES.filter((o) => o !== 'logged' && o !== 'refused').map((o) => ({ value: o, label: title(o) })) },
          { name: 'durationSeconds', label: 'Length in seconds', kind: 'number' },
          { name: 'notes', label: 'What was said and agreed', kind: 'textarea', required: true },
        ]} />
      </Section>

      <Section title={`Needs a person (${open.length})`}>
        {open.length ? open.map((c) => (
          <Row key={c.id} href={`/dashboard/platform/calls/${c.id}`}>
            <span className="min-w-0 flex-1"><TitleLine status={c.outcome}>{c.ref} · {c.patient ? `${c.patient.firstName} ${c.patient.lastName}` : 'Caller not matched'}</TitleLine><Meta>{c.summary}</Meta></span>
          </Row>
        )) : <Empty>No calls are waiting for a person.</Empty>}
      </Section>

      <Section title="Recent calls">
        {(d.callRecords as any[]).length ? (d.callRecords as any[]).map((c) => (
          <Row key={c.id} href={`/dashboard/platform/calls/${c.id}`} className="items-start">
            <span className="min-w-0 flex-1">
              <TitleLine status={c.outcome}>{c.ref} · {title(c.direction)} · {c.adapter === 'manual' ? 'Logged by hand' : 'Phone'} · {title(c.outcome)}</TitleLine>
              <Meta>{when(c.startedAt, tz)} · {c.location?.name}{c.patient ? ` · ${c.patient.firstName} ${c.patient.lastName}` : ''}</Meta>
              {c.summary ? <Meta>{c.summary}</Meta> : null}
            </span>
            {(c.outcome === 'handed_off' || c.outcome === 'message_taken') && !c.followedUpAt ? <ActionButton op="markCallFollowedUp" vars={{ callId: c.id }} paths={paths}>Mark followed up</ActionButton> : null}
          </Row>
        )) : <Empty>No calls yet.</Empty>}
      </Section>
    </Page>
  );
}
