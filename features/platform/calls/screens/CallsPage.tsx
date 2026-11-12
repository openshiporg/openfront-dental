import { q, requirePage, holdsAny, practiceTimeZone } from '../../lib/server';
import { when, title } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Status, TitleLine } from '../../components/ui';
import { ActionButton, summaryClass } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';
import { adapterStatus, SCENARIOS } from '../../../keystone/lib/voiceAdapters';
import { CALL_OUTCOMES } from '../../../keystone/models/phase6';

/**
 * Calls: the voice receptionist behind telephony adapters. No phone provider is connected. Staff can log a call by hand or run a scripted
 * simulation; nothing dials, sends or records real audio. Voice is off for every office until the owner turns it on.
 */
export default async function CallsPage() {
  await requirePage('calls');
  const status = adapterStatus();
  const [tz, isOwner, d] = await Promise.all([practiceTimeZone(), holdsAny(['canApproveAutonomy']), q<any>(`{
    locations(where: { isActive: { equals: true } }, orderBy: { name: asc }, take: 20) { id name }
    voicePolicies(take: 50) { id enabled recordCalls changedAt location { id } }
    callRecords(orderBy: { startedAt: desc }, take: 40) { id ref direction adapter outcome startedAt summary handoffReason followedUpAt recordingConsent patient { firstName lastName } location { name } }
    patients(orderBy: { lastName: asc }, take: 200) { id firstName lastName chartNumber }
  }`)]);
  const paths = ['/dashboard/platform/calls'];
  const policy = new Map<string, any>((d.voicePolicies as any[]).map((p) => [p.location?.id, p]));
  const locations = d.locations as any[];
  const patientOptions = (d.patients as any[]).map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName} · #${p.chartNumber}` }));
  const locationOptions = locations.map((l) => ({ value: l.id, label: l.name }));
  const enabled = locations.filter((l) => policy.get(l.id)?.enabled);
  const open = (d.callRecords as any[]).filter((c) => (c.outcome === 'handed_off' || c.outcome === 'message_taken') && !c.followedUpAt);

  return (
    <Page title="Calls">
      <Section title="Telephony">
        <Row><span>Provider</span><Status value={status.connected ? 'active' : 'paused'} /></Row>
        <p className="text-sm">{status.message}</p>
        <Meta>Two adapters are built in: a manual call log, and a scripted simulation for testing. Connecting a real phone provider is a later step and needs an account with that provider.</Meta>
      </Section>

      <Section title="Voice receptionist by office">
        <Meta>Off by default. When on, the assistant opens every call by saying it is an AI, uses the same tools as the Front Desk Assistant, and can only ask the front desk to book or confirm a visit. A person approves each request.</Meta>
        {locations.map((l) => {
          const p = policy.get(l.id);
          return (
            <Row key={l.id} className="items-start">
              <span className="min-w-0 flex-1">
                <TitleLine status={p?.enabled ? 'active' : 'paused'}>{l.name}: voice is {p?.enabled ? 'on' : 'off'}</TitleLine>
                <Meta>{p?.enabled ? `Call recording ${p.recordCalls ? 'on, only when the caller agrees' : 'off'}${p.changedAt ? ` · changed ${when(p.changedAt, tz, 'date')}` : ''}` : 'Calls are refused here until the owner turns this on.'}</Meta>
                {isOwner ? (
                  <details className="mt-1"><summary className={summaryClass}>{p?.enabled ? 'Change or turn off' : 'Turn on'}</summary>
                    <div className="pt-2"><CommandForm op="setVoicePolicy" submitLabel="Save" paths={paths} columns={2} fixed={{ locationId: l.id }} fields={[
                      { name: 'enabled', label: 'Voice receptionist on', kind: 'checkbox', defaultValue: !!p?.enabled },
                      { name: 'recordCalls', label: 'Record calls, only if the caller agrees', kind: 'checkbox', defaultValue: !!p?.recordCalls },
                      { name: 'reason', label: 'Why', kind: 'text', required: true, placeholder: 'Pilot for after-hours questions' },
                    ]} /></div>
                  </details>
                ) : <Meta>Only the practice owner can change this.</Meta>}
              </span>
            </Row>
          );
        })}
      </Section>

      <Section title="Run call simulation">
        {enabled.length ? (
          <>
            <Meta>A scripted caller talks to the assistant. Nothing is dialled or sent. Pick the office the call comes to and, for calls about a patient, which patient.</Meta>
            <ul className="space-y-1 text-xs text-muted-foreground">{SCENARIOS.map((s) => <li key={s.key}><b>{s.label}.</b> {s.blurb}</li>)}</ul>
            <CommandForm op="runCallSimulation" submitLabel="Run call simulation" paths={paths} columns={2} fields={[
              { name: 'locationId', label: 'Office', kind: 'select', required: true, options: enabled.map((l) => ({ value: l.id, label: l.name })) },
              { name: 'scenario', label: 'Call', kind: 'select', required: true, options: SCENARIOS.map((s) => ({ value: s.key, label: s.label })) },
              { name: 'patientId', label: 'Patient (for calls about a patient)', kind: 'select', options: [{ value: '', label: 'No patient' }, ...patientOptions] },
              { name: 'recordingAnswer', label: 'If asked to record, the caller says', kind: 'select', defaultValue: 'silent', options: [{ value: 'silent', label: 'Nothing clear' }, { value: 'agree', label: 'Yes' }, { value: 'decline', label: 'No' }] },
            ]} />
          </>
        ) : <Empty>Voice is off at every office, so the simulation is unavailable. The owner can turn it on above.</Empty>}
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
              <TitleLine status={c.outcome}>{c.ref} · {title(c.direction)} · {c.adapter === 'manual' ? 'Logged by hand' : 'Simulation'} · {title(c.outcome)}</TitleLine>
              <Meta>{when(c.startedAt, tz)} · {c.location?.name}{c.patient ? ` · ${c.patient.firstName} ${c.patient.lastName}` : ''}{c.recordingConsent ? ' · recorded with consent' : ''}</Meta>
              {c.summary ? <Meta>{c.summary}</Meta> : null}
            </span>
            {(c.outcome === 'handed_off' || c.outcome === 'message_taken') && !c.followedUpAt ? <ActionButton op="markCallFollowedUp" vars={{ callId: c.id }} paths={paths}>Mark followed up</ActionButton> : null}
          </Row>
        )) : <Empty>No calls yet.</Empty>}
      </Section>
    </Page>
  );
}
