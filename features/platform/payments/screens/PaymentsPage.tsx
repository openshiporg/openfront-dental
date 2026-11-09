import Link from 'next/link';
import { q } from '../../lib/server';
import { money, calendarDate, title } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, TitleLine } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';

/** Money from patients: refunds waiting on a person, statements, credits that need a decision, and payments that need a look. */
export default async function PaymentsPage() {
  const d = await q<any>(`{
    refunds(where: { status: { in: ["requested", "approved", "executing", "unknown", "failed"] } }, orderBy: { createdAt: asc }, take: 40) { id ref amountMinor method status reason failureNote payment { ref patient { firstName lastName } } account { ref } }
    statements(orderBy: { createdAt: desc }, take: 30) { id ref status cycleDate dueDate amountDueMinor payLinkCode payLinkExpiresAt account { ref } }
    creditBalances(where: { status: { in: ["open", "refund_requested", "escheat_pending"] } }, orderBy: { dormancyDueOn: asc }, take: 40) { id amountMinor arisenOn dormancyDueOn status account { ref } }
    payments(where: { status: { in: ["unknown", "failed", "requires_action"] } }, orderBy: { createdAt: desc }, take: 20) { id ref amountMinor status failureNote patient { firstName lastName } }
    locations(orderBy: { name: asc }, take: 20) { id name }
  }`);
  const paths = ['/dashboard/platform/payments'];
  return (
    <Page title="Patient payments">
      <Section title="Refunds">
        {(d.refunds as any[]).length ? (d.refunds as any[]).map((r) => (
          <Row key={r.id} className="items-start">
            <span className="min-w-0 flex-1"><span className="flex items-baseline justify-between gap-3"><TitleLine status={r.status}>{r.payment?.patient ? `${r.payment.patient.firstName} ${r.payment.patient.lastName}` : `Account ${r.account?.ref}`} · {r.ref}</TitleLine><span className="shrink-0 font-medium tabular-nums">{money(r.amountMinor)}</span></span>
              <Meta>{r.status === 'requested' ? 'Waiting for a second person to approve' : r.status === 'approved' ? 'Approved. Write the check, then mark it sent' : title(r.status)} · {r.reason}{r.failureNote ? ` · ${r.failureNote}` : ''}</Meta>
              {r.status === 'approved' && r.method !== 'original_tender' ? <span className="mt-1 block"><ActionButton op="recordRefundPaid" vars={{ refundId: r.id }} confirm="Mark this refund as sent?" paths={paths}>Mark as sent</ActionButton></span> : null}
            </span>
          </Row>
        )) : <Empty>No refunds waiting.</Empty>}
        <Meta><Link className="underline" href="/dashboard/platform/approvals">Approvals</Link></Meta>
      </Section>
      <Section title="Payments that need a look">
        {(d.payments as any[]).length ? (d.payments as any[]).map((p) => (
          <Row key={p.id}><span className="min-w-0"><TitleLine status={p.status}>{p.patient?.firstName} {p.patient?.lastName} · {p.ref}</TitleLine><Meta>{p.failureNote || 'Waiting for the card processor'}</Meta></span><span className="font-medium tabular-nums">{money(p.amountMinor)}</span></Row>
        )) : <Empty>Every payment went through.</Empty>}
      </Section>
      <Section title="Statements">
        {(d.statements as any[]).length ? (d.statements as any[]).map((s) => (
          <Row key={s.id} className="items-start">
            <span className="min-w-0 flex-1"><span className="flex items-baseline justify-between gap-3"><TitleLine status={s.status}>{s.ref} · Account {s.account?.ref}</TitleLine><span className="shrink-0 font-medium tabular-nums">{money(s.amountDueMinor)}</span></span>
              <Meta>Cycle {calendarDate(s.cycleDate, 'date')} · due {calendarDate(s.dueDate, 'date')}</Meta>
              <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm"><a className="underline underline-offset-2" href={`/api/statements/${s.id}/pdf`} target="_blank" rel="noreferrer">Open PDF</a>{s.payLinkCode ? <a className="underline underline-offset-2" href={`/pay/${s.payLinkCode}`} target="_blank" rel="noreferrer">Patient pay page</a> : null}</span>
              {s.status === 'generated' ? <span className="mt-1 block"><ActionButton op="sendStatement" vars={{ statementId: s.id, channel: 'mail' }} paths={paths}>Mark as mailed</ActionButton></span> : null}
            </span>
          </Row>
        )) : <Empty>No statements yet.</Empty>}
        <details><summary className="cursor-pointer text-sm font-medium">Build this month’s statements</summary>
          <div className="pt-2"><CommandForm op="generateStatements" submitLabel="Build statements" paths={paths} columns={2} fields={[
            { name: 'locationId', label: 'Office', kind: 'select', required: true, options: (d.locations as any[]).map((l) => ({ value: l.id, label: l.name })) },
            { name: 'cycleDate', label: 'Statement date', kind: 'date', hint: 'Leave empty for today.' },
          ]} /></div>
        </details>
      </Section>
      <Section title="Credits on accounts">
        {(d.creditBalances as any[]).length ? (d.creditBalances as any[]).map((c) => (
          <Row key={c.id}><span className="min-w-0"><TitleLine status={c.status === 'open' ? null : c.status}>Account {c.account?.ref}</TitleLine><Meta>Since {calendarDate(c.arisenOn, 'date')} · unclaimed after {calendarDate(c.dormancyDueOn, 'date')}</Meta></span><span className="font-medium tabular-nums">{money(c.amountMinor)}</span></Row>
        )) : <Empty>No account has a credit.</Empty>}
      </Section>
    </Page>
  );
}
