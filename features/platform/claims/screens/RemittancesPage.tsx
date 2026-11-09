import Link from 'next/link';
import { q, practiceTimeZone } from '../../lib/server';
import { money, when, calendarDate, title } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, TitleLine } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';

/** Payments from insurance: what arrived, what is on hold and why, open denials, and a form for a paper explanation of benefits. */
export default async function RemittancesPage() {
  const [d, tz] = await Promise.all([q<any>(`{
    remittances(orderBy: { createdAt: desc }, take: 40) { id ref status traceNumber paymentDate totalPaidMinor paymentMethod exceptionNote payer { name } createdAt }
    held: remittanceClaims(where: { claim: { is: null } }, orderBy: { createdAt: desc }, take: 40) { id patientControlNumber paidMinor chargeMinor remittance { ref payer { name } } }
    denials(where: { status: { in: ["open", "working"] } }, orderBy: { createdAt: asc }, take: 40) { id carc preventableClass status amountMinor claim { id ref patient { firstName lastName } } }
    denialReasonMaps { carc suggestedAction }
    payers(orderBy: { name: asc }, take: 100) { id name }
    claims(where: { status: { in: ["acknowledged", "pending_payer"] } }, orderBy: { createdAt: asc }, take: 60) { id ref patient { firstName lastName } }
  }`), practiceTimeZone()]);
  const paths = ['/dashboard/platform/remittances'];
  const advice = new Map<string, string>((d.denialReasonMaps as any[]).map((r) => [r.carc, r.suggestedAction]));
  return (
    <Page title="Insurance payments">
      <Section title="Waiting for a person">
        {(d.held as any[]).length ? (d.held as any[]).map((h) => (
          <Row key={h.id} className="items-start">
            <span className="min-w-0 flex-1"><span className="flex items-baseline justify-between gap-3"><TitleLine>Claim {h.patientControlNumber}</TitleLine><span className="shrink-0 font-medium tabular-nums">{money(h.paidMinor)}</span></span><Meta>{h.remittance?.payer?.name} · no claim of ours matches</Meta></span>
            <details><summary className="cursor-pointer text-sm font-medium">Match to a claim</summary>
              <div className="pt-2"><CommandForm op="matchRemittance" submitLabel="Match and post" paths={paths} columns={1} fixed={{ remittanceClaimId: h.id }} fields={[{ name: 'claimId', label: 'Claim', kind: 'select', required: true, options: (d.claims as any[]).map((c) => ({ value: c.id, label: `${c.patient?.firstName} ${c.patient?.lastName} · ${c.ref}` })) }]} /></div>
            </details>
          </Row>
        )) : <Empty>Every payment line matched a claim.</Empty>}
      </Section>
      <Section title="Denied lines to work">
        {(d.denials as any[]).length ? (d.denials as any[]).map((n) => (
          <Row key={n.id} href={`/dashboard/platform/claims/${n.claim?.id}`} className="items-start">
            <span className="min-w-0 flex-1"><span className="flex items-baseline justify-between gap-3"><TitleLine status={n.status}>{n.claim?.patient?.firstName} {n.claim?.patient?.lastName}</TitleLine><span className="shrink-0 font-medium tabular-nums">{money(n.amountMinor)}</span></span><Meta>{advice.get(n.carc) ?? `Payer reason ${n.carc}`} · {title(n.preventableClass)}</Meta></span>
          </Row>
        )) : <Empty>No open denials.</Empty>}
      </Section>
      <Section title="Received">
        {(d.remittances as any[]).length ? (d.remittances as any[]).map((r) => (
          <Row key={r.id} className="items-start">
            <span className="min-w-0 flex-1"><span className="flex items-baseline justify-between gap-3"><TitleLine status={r.status === 'posted' ? null : r.status}>{r.payer?.name ?? 'Insurance'} · {r.ref}</TitleLine><span className="shrink-0 font-medium tabular-nums">{money(r.totalPaidMinor)}</span></span><Meta>{title(r.paymentMethod)} · {r.paymentDate ? calendarDate(r.paymentDate, 'date') : when(r.createdAt, tz, 'day')}{r.exceptionNote ? ` · ${r.exceptionNote}` : ''}</Meta></span>
          </Row>
        )) : <Empty>No insurance payments received yet.</Empty>}
      </Section>
      <Section title="Enter a paper explanation of benefits">
        <details><summary className="cursor-pointer text-sm font-medium">New entry</summary>
          <div className="pt-2"><CommandForm op="enterManualEob" shape="manualEob" submitLabel="Post payment" paths={paths} columns={2} fields={[
            { name: 'payerId', label: 'Payer', kind: 'select', required: true, options: (d.payers as any[]).map((p) => ({ value: p.id, label: p.name })) },
            { name: 'traceNumber', label: 'Check or payment number', kind: 'text', required: true },
            { name: 'paymentDate', label: 'Payment date', kind: 'date' },
            { name: 'method', label: 'Paid by', kind: 'select', required: true, options: [{ value: 'check', label: 'Check' }, { value: 'eft', label: 'Bank transfer' }, { value: 'virtual_card', label: 'Virtual card' }] },
            { name: 'claimRef', label: 'Claim number', kind: 'text', required: true, placeholder: 'CLM-…' },
            { name: 'charge', label: 'Billed', kind: 'text', required: true, placeholder: '120.00' },
            { name: 'paid', label: 'Insurance paid', kind: 'text', required: true, placeholder: '84.00' },
            { name: 'writeOff', label: 'Contract write-off', kind: 'text', placeholder: '36.00', hint: 'Single-line claims only. Use the payment file for several lines.' },
          ]} /></div>
        </details>
      </Section>
      <Meta><Link className="underline" href="/dashboard/platform/claims">Back to claims</Link></Meta>
    </Page>
  );
}
