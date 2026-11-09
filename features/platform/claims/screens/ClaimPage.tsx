import { notFound } from 'next/navigation';
import { q, practiceTimeZone } from '../../lib/server';
import { money, when, calendarDate, title } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Stat, TitleLine } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';

const RULE_WORDS: Record<string, string> = { crosswalk_required: 'Insurance code missing', tooth_required: 'Tooth number needed', surface_required: 'Surfaces needed', attachment_required: 'X-ray or chart needed', narrative_required: 'Explanation needed', enrollment_required: 'Not enrolled with this payer', timely_filing: 'Filing deadline', duplicate: 'Possible duplicate', coverage_active: 'Coverage not active', primary_first: 'Primary insurance first', override: 'Sent anyway' };
const SENT = ['submitted', 'submission_unknown', 'acknowledged', 'pending_payer', 'adjudicated', 'appealed', 'appeal_decided'];

/** One claim: what was billed, what the scrub found, what the payer said, and the next step for a person. */
export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d, tz] = await Promise.all([q<any>(`query($id: ID!) {
    claim(where: { id: $id }) {
      id ref kind status version adjudicationOutcome totalChargeMinor narrative timelyFilingDeadline payerClaimControlNumber submittedAt recouped
      patient { id firstName lastName } renderingProvider { displayName } location { code }
      coverage { subscriber { plan { groupName payer { name } } } }
      lines(orderBy: { lineControlNumber: asc }) { id lineControlNumber tooth surfaces dateOfService feeMinor paidMinor patientRespMinor status code { nomenclature patientFriendlyName } localCode { nomenclature patientFriendlyName } }
      scrubResults(orderBy: { ranAt: desc }, take: 1) { findings }
      acknowledgements(orderBy: { at: desc }, take: 5) { id outcome errors at }
      attachments { id kind route status description }
      versions(orderBy: { number: desc }) { id number frequency releasedAt }
    }
    denials(where: { claim: { id: { equals: $id } } }) { id carc preventableClass status version amountMinor appeals { id level outcome } }
    denialReasonMaps { carc suggestedAction }
  }`, { id }), practiceTimeZone()]);
  const c = d.claim;
  if (!c) notFound();
  const advice = new Map<string, string>((d.denialReasonMaps as any[]).map((r) => [r.carc, r.suggestedAction]));
  const findings = (c.scrubResults[0]?.findings ?? []) as any[];
  const editable = ['draft', 'scrubbed', 'ready', 'rejected', 'correction_required'].includes(c.status);
  const paths = [`/dashboard/platform/claims/${id}`];
  const vars = { claimId: c.id, expectedVersion: c.version };
  const lineName = (l: any) => `${l.code?.patientFriendlyName || l.localCode?.patientFriendlyName || l.localCode?.nomenclature || 'Procedure'}${l.tooth ? `, tooth ${l.tooth}` : ''}`;
  return (
    <Page title={`${c.patient?.firstName} ${c.patient?.lastName} · ${c.ref}`} status={c.status} crumbs={[{ label: 'Claims', href: '/dashboard/platform/claims' }]}>
      <div className="grid min-w-0 grid-cols-2 gap-4 break-words rounded-lg border p-4 sm:grid-cols-4">
        <Stat name="Payer" value={c.coverage?.subscriber?.plan?.payer?.name ?? '—'} />
        <Stat name="Billed" value={money(c.totalChargeMinor)} />
        <Stat name="Provider" value={c.renderingProvider?.displayName ?? '—'} />
        <Stat name="File by" value={c.timelyFilingDeadline ? calendarDate(c.timelyFilingDeadline, 'date') : '—'} />
      </div>
      <Section title="Next step">
        <div className="flex flex-wrap gap-2">
          {editable && c.status !== 'ready' ? <ActionButton op="scrubClaim" vars={vars} paths={paths}>Check the claim</ActionButton> : null}
          {c.status === 'scrubbed' ? <ActionButton op="overrideScrub" vars={vars} ask="Why is it fine to send this as it is?" confirm="Send despite the findings?" paths={paths}>Send anyway</ActionButton> : null}
          {c.status === 'ready' ? <ActionButton op="releaseClaim" vars={vars} confirm="Send this claim to the payer now? It cannot be edited after this." paths={paths}>Send to payer</ActionButton> : null}
          {c.status === 'submission_unknown' ? <ActionButton op="requestClaimStatus" vars={{ claimId: c.id }} paths={paths}>Ask the payer if they have it</ActionButton> : null}
          {['acknowledged', 'pending_payer', 'adjudicated', 'rejected', 'submission_unknown', 'appeal_decided'].includes(c.status) ? <ActionButton op="correctClaim" vars={vars} ask="What needs to change?" paths={paths}>Correct and resend</ActionButton> : null}
          {c.status !== 'voided' && c.status !== 'closed' ? <ActionButton op="voidClaim" vars={vars} ask="Why is this claim being cancelled?" confirm={SENT.includes(c.status) ? 'Ask the payer to cancel this claim?' : 'Cancel this claim?'} paths={paths}>{SENT.includes(c.status) ? 'Cancel with payer' : 'Cancel claim'}</ActionButton> : null}
        </div>
        {c.recouped ? <Meta>The payer took this payment back.</Meta> : null}
      </Section>
      {findings.length ? (
        <Section title="Found when checking">
          {findings.map((f, i) => <Row key={i}><span className="min-w-0"><span className="font-medium">{RULE_WORDS[f.kind] ?? title(f.kind)}</span><br /><Meta>{f.message}</Meta></span><Meta>{f.severity === 'block' ? 'Must fix' : 'Warning'}</Meta></Row>)}
        </Section>
      ) : null}
      <Section title="Lines">
        {(c.lines as any[]).map((l) => (
          <Row key={l.id} className="items-start">
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3"><TitleLine status={l.status === 'pending' ? null : l.status}>{lineName(l)}</TitleLine><span className="shrink-0 font-medium tabular-nums">{money(l.feeMinor)}</span></span>
              <span className="flex items-baseline justify-between gap-3"><Meta>{calendarDate(l.dateOfService, 'date')}{l.surfaces ? ` · ${l.surfaces}` : ''}</Meta>{l.status !== 'pending' ? <Meta><span className="tabular-nums">Paid {money(l.paidMinor)}</span></Meta> : null}</span>
            </span>
          </Row>
        ))}
      </Section>
      {(c.acknowledgements as any[]).length ? (
        <Section title="What the payer's system said">
          {(c.acknowledgements as any[]).map((a) => <Row key={a.id}><span className="min-w-0"><TitleLine status={a.outcome}>{when(a.at, tz, 'dayTime')}</TitleLine>{(a.errors as any[])?.length ? <Meta>{(a.errors as any[]).map((e) => e.message || e.description).join(' · ')}</Meta> : null}</span></Row>)}
        </Section>
      ) : null}
      {(d.denials as any[]).length ? (
        <Section title="Denials">
          {(d.denials as any[]).map((n) => (
            <Row key={n.id} className="items-start">
              <span className="min-w-0 flex-1"><TitleLine status={n.status}>{advice.get(n.carc) ?? `Payer reason ${n.carc}`}</TitleLine><Meta>{money(n.amountMinor)} · {title(n.preventableClass)}{n.appeals?.length ? ` · appeal level ${n.appeals.length}` : ''}</Meta></span>
              <span className="flex flex-wrap gap-2">
                {n.status === 'open' ? <ActionButton op="startDenialWork" vars={{ denialId: n.id, expectedVersion: n.version }} paths={paths}>Start work</ActionButton> : null}
                {['open', 'working'].includes(n.status) ? <ActionButton op="resolveDenial" vars={{ denialId: n.id, expectedVersion: n.version, resolution: 'written_off' }} ask="Why is this being written off?" paths={paths}>Write off</ActionButton> : null}
              </span>
            </Row>
          ))}
          {(d.denials as any[]).filter((n) => ['open', 'working'].includes(n.status)).slice(0, 1).map((n) => (
            <details key={n.id}><summary className="cursor-pointer text-sm font-medium">File an appeal</summary>
              <div className="pt-2"><CommandForm op="fileAppeal" submitLabel="File appeal" paths={paths} fixed={{ denialId: n.id, expectedVersion: n.version }} fields={[
                { name: 'via', label: 'Sent by', kind: 'select', required: true, options: [{ value: 'portal', label: 'Payer portal' }, { value: 'fax', label: 'Fax' }, { value: 'mail', label: 'Mail' }, { value: 'phone', label: 'Phone' }] },
                { name: 'letter', label: 'Appeal letter', kind: 'textarea', required: true },
              ]} /></div>
            </details>
          ))}
        </Section>
      ) : null}
      {editable ? (
        <Section title="Explanation for the payer">
          <CommandForm op="saveClaimNarrative" submitLabel="Save" paths={paths} columns={1} fixed={{ claimId: c.id }} fields={[{ name: 'narrative', label: 'Narrative', kind: 'textarea', defaultValue: c.narrative ?? '' }]} />
        </Section>
      ) : null}
      <Section title="Versions sent">
        {(c.versions as any[]).length ? (c.versions as any[]).map((v) => <Row key={v.id}><span>Version {v.number} · {title(v.frequency)}</span><Meta>{when(v.releasedAt, tz, 'dayTime')}</Meta></Row>) : <Empty>Not sent yet.</Empty>}
      </Section>
    </Page>
  );
}
