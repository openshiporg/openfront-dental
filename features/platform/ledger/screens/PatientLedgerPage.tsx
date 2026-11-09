import { notFound } from 'next/navigation';
import { q, practiceTimeZone } from '../../lib/server';
import { money, title, calendarDate, chartLabel } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Stat, TitleLine, ScrollX } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';

const AGING = [['current', '0–30 days'], ['d31', '31–60 days'], ['d61', '61–90 days'], ['d91', 'Over 90 days']] as const;
const KIND_WORDS: Record<string, string> = { patient_payment: 'Payment', insurance_payment: 'Insurance payment', insurance_writeoff: 'Insurance write-off', patient_adjustment: 'Adjustment', insurance_adjustment: 'Insurance adjustment', transfer_in: 'Transfer in', transfer_out: 'Transfer out' };

/** The patient's account: what is owed, how old it is, and every entry in order. Entries are never edited; a mistake is a new reversing entry. */
export default async function PatientLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d, tz] = await Promise.all([q<any>(`query($id: ID!) {
    patient(where: { id: $id }) { id chartNumber firstName lastName homeLocation { id code } }
    ledgerEntries(where: { patient: { id: { equals: $id } } }, orderBy: [{ businessDate: desc }, { createdAt: desc }], take: 200) {
      id kind amountMinor businessDate memo reverses { id } provider { abbreviation } location { code } adjustment { id }
    }
    guarantorAccounts(where: { guarantor: { links: { some: { patient: { id: { equals: $id } }, status: { equals: "active" } } } } }, take: 1) { id ref balanceCache }
    adjustmentTypes(where: { isActive: { equals: true } }, orderBy: { name: asc }) { id name direction approvalThresholdMinor requiresApproval }
    adjustmentRequests(where: { patient: { id: { equals: $id } }, status: { equals: "requested" } }) { id amountMinor reason type { name } }
  }`, { id }), practiceTimeZone()]);
  void tz;
  const p = d.patient;
  if (!p) notFound();
  const account = d.guarantorAccounts[0];
  const cache = account?.balanceCache ?? {};
  const entries = d.ledgerEntries as any[];
  const reversed = new Set(entries.filter((e) => e.reverses).map((e) => e.reverses.id));
  const paths = [`/dashboard/platform/patients/${id}/ledger`];
  return (
    <Page title={`${p.firstName} ${p.lastName} · Account`} crumbs={[{ label: 'Patients', href: '/dashboard/platform/patients' }, { label: chartLabel(p.chartNumber), href: `/dashboard/platform/patients/${id}` }]}>
      <div className="grid min-w-0 grid-cols-2 gap-4 break-words rounded-lg border p-4 sm:grid-cols-4">
        <Stat name="Account" value={account?.ref ?? '—'} />
        <Stat name="Balance owed" value={money(cache.patientMinor ?? '0')} />
        <Stat name="Credit on account" value={money(cache.creditMinor ?? '0')} />
        <Stat name="Entries" value={String(cache.entryCount ?? entries.length)} />
      </div>
      <Section title="How old the balance is">
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
          {AGING.map(([key, name]) => <Stat key={key} name={name} value={money(cache.aging?.[key] ?? '0')} />)}
        </div>
      </Section>
      {(d.adjustmentRequests as any[]).length ? (
        <Section title="Waiting for a second person">
          {(d.adjustmentRequests as any[]).map((r) => <Row key={r.id}><span className="min-w-0">{r.type?.name}<br /><Meta>{r.reason}</Meta></span><span className="font-medium">{money(r.amountMinor)}</span></Row>)}
        </Section>
      ) : null}
      <Section title="Entries">
        {entries.length ? (
          <ScrollX>
            <div className="min-w-[34rem] space-y-1">
              {entries.map((e) => {
                const amount = BigInt(e.amountMinor);
                const isReversal = e.kind === 'reversal';
                return (
                  <Row key={e.id} className="flex-nowrap items-start">
                    <span className="w-24 shrink-0 text-sm tabular-nums">{calendarDate(e.businessDate, 'date')}</span>
                    <span className="min-w-0 flex-1"><TitleLine>{isReversal ? 'Reversal' : KIND_WORDS[e.kind] ?? title(e.kind)}{reversed.has(e.id) ? ' (reversed)' : ''}</TitleLine><br /><Meta>{e.memo}{e.provider?.abbreviation ? ` · ${e.provider.abbreviation}` : ''}</Meta></span>
                    <span className={`w-24 shrink-0 text-right font-medium tabular-nums ${amount < 0n ? 'text-emerald-700' : ''}`}>{money(e.amountMinor)}</span>
                    {['patient_adjustment', 'insurance_adjustment'].includes(e.kind) && !reversed.has(e.id) ? <ActionButton op="reverseLedgerEntry" vars={{ entryId: e.id }} ask="Why is this entry being reversed?" confirm="Post a reversing entry?" paths={paths}>Reverse</ActionButton> : <span className="w-16" />}
                  </Row>
                );
              })}
            </div>
          </ScrollX>
        ) : <Empty>No charges or payments yet.</Empty>}
      </Section>
      {account ? (
        <Section title="Adjust the balance">
          <details><summary className="cursor-pointer text-sm font-medium">New adjustment</summary>
            <div className="pt-2"><CommandForm op="requestAdjustment" submitLabel="Post adjustment" paths={paths} columns={2} fixed={{ patientId: id, locationId: p.homeLocation?.id }} fields={[
              { name: 'typeId', label: 'Type', kind: 'select', required: true, options: (d.adjustmentTypes as any[]).map((t) => ({ value: t.id, label: `${t.name}${t.requiresApproval ? ' (second person approves)' : ''}` })) },
              { name: 'amount', label: 'Amount in dollars', kind: 'text', required: true, placeholder: '25.00', hint: 'Over the type’s limit, a second person has to approve it.' },
              { name: 'reason', label: 'Reason', kind: 'textarea', required: true },
            ]} /></div>
          </details>
          <ActionButton op="rebuildAccountBalance" vars={{ accountId: account.id }} paths={paths}>Recalculate balance</ActionButton>
        </Section>
      ) : null}
    </Page>
  );
}
