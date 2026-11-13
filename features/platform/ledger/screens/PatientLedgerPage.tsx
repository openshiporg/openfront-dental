import { notFound } from 'next/navigation';
import { q, practiceTimeZone } from '../../lib/server';
import { money, title, calendarDate, chartLabel } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Stat, TitleLine } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';
import { paymentsConfigured } from '@/features/integrations/payments/stripe';
import { CardPayment } from '../components/CardPayment';

const AGING = [['current', '0–30 days'], ['d31', '31–60 days'], ['d61', '61–90 days'], ['d91', 'Over 90 days']] as const;
const KIND_WORDS: Record<string, string> = { patient_payment: 'Payment', insurance_payment: 'Insurance payment', insurance_writeoff: 'Insurance write-off', patient_adjustment: 'Adjustment', insurance_adjustment: 'Insurance adjustment', transfer_in: 'Transfer in', transfer_out: 'Transfer out' };

const SURFACE_WORDS: Record<string, string> = { M: 'mesial', O: 'occlusal', D: 'distal', B: 'buccal', L: 'lingual', F: 'facial', I: 'incisal' };
const surfaceWords = (letters: string) => letters.split('').map((c) => SURFACE_WORDS[c] ?? c).join(', ');
/** "Crown, tooth 3" or "Filling, tooth 30 (mesial, occlusal)": the procedure in words, never the code. */
function entryTitle(e: any, isReversal: boolean) {
  const base = chargeName(e) ?? (isReversal ? 'Reversal' : e.adjustment?.type?.name ?? KIND_WORDS[e.kind] ?? title(e.kind));
  return isReversal && chargeName(e) ? `Reversal: ${base}` : base;
}
function chargeName(e: any) {
  const c = e.chartEntry; if (!c?.code) return null;
  const name = c.code.patientFriendlyName || c.code.nomenclature || 'Procedure';
  return `${name}${c.tooth ? `, tooth ${c.tooth}` : ''}${c.surfaces ? ` (${surfaceWords(c.surfaces)})` : ''}`;
}
/** Free-text notes only; a charge's memo is its code, which the title already spells out. */
function entryNote(e: any, fixed?: string) { return fixed ? fixed : e.chartEntry?.code ? '' : e.kind === 'reversal' ? String(e.memo).replace(/^Reversal: /, '') : e.memo; }

/** The patient's account: what is owed, how old it is, and every entry in order. Entries are never edited; a mistake is a new reversing entry. */
export default async function PatientLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d, tz] = await Promise.all([q<any>(`query($id: ID!) {
    patient(where: { id: $id }) { id chartNumber firstName lastName homeLocation { id code } }
    ledgerEntries(where: { patient: { id: { equals: $id } } }, orderBy: [{ businessDate: desc }, { createdAt: desc }], take: 200) {
      id kind amountMinor businessDate memo reverses { id } provider { displayName } location { code } adjustment { type { name } } chartEntry { tooth surfaces code { nomenclature patientFriendlyName } }
    }
    guarantorAccounts(where: { guarantor: { links: { some: { patient: { id: { equals: $id } }, status: { equals: "active" } } } } }, take: 1) { id ref balanceCache }
    adjustmentTypes(where: { isActive: { equals: true } }, orderBy: { name: asc }) { id name direction approvalThresholdMinor requiresApproval }
    adjustmentRequests(where: { patient: { id: { equals: $id } }, status: { equals: "requested" } }) { id amountMinor reason type { name } }
    ledgerNotes(where: { entry: { patient: { id: { equals: $id } } } }, orderBy: { createdAt: asc }) { id text entry { id } }
    payments(where: { patient: { id: { equals: $id } } }, orderBy: { createdAt: desc }, take: 10) { id ref amountMinor refundedMinor tender status failureNote createdAt methodToken { brand last4 } }
    paymentMethodTokens(where: { account: { guarantor: { links: { some: { patient: { id: { equals: $id } } } } } }, status: { equals: "active" } }) { id brand last4 expMonth expYear }
    paymentPlans(where: { patient: { id: { equals: $id } }, status: { in: ["proposed", "active", "delinquent"] } }, take: 1) { id ref status version principalMinor agreementText installments(orderBy: { dueDate: asc }) { id dueDate amountMinor status } }
  }`, { id }), practiceTimeZone()]);
  void tz;
  const p = d.patient;
  if (!p) notFound();
  const account = d.guarantorAccounts[0];
  const cache = account?.balanceCache ?? {};
  const entries = d.ledgerEntries as any[];
  const notes = new Map<string, string>((d.ledgerNotes as any[]).map((n) => [n.entry.id, n.text]));
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
          <div className="space-y-1">
            {entries.map((e, i) => {
              const amount = BigInt(e.amountMinor);
              const after = BigInt(cache.totalMinor ?? '0') - entries.slice(0, i).reduce((sum, x) => sum + BigInt(x.amountMinor), 0n);
              const isReversal = e.kind === 'reversal';
              const canReverse = ['patient_adjustment', 'insurance_adjustment'].includes(e.kind) && !reversed.has(e.id);
              return (
                <Row key={e.id} className="items-start">
                  <span className="min-w-0 flex-1 break-words">
                    <span className="flex items-baseline justify-between gap-3">
                      <TitleLine>{entryTitle(e, isReversal)}{reversed.has(e.id) ? ' (reversed)' : ''}</TitleLine>
                      <span className={`shrink-0 font-medium tabular-nums ${amount < 0n ? 'text-emerald-700' : ''}`}>{money(e.amountMinor)}</span>
                    </span>
                    <span className="flex items-baseline justify-between gap-3">
                      <Meta>{calendarDate(e.businessDate, 'date')}{e.provider?.displayName ? ` · ${e.provider.displayName}` : ''}{entryNote(e, notes.get(e.id)) ? ` · ${entryNote(e, notes.get(e.id))}` : ''}</Meta>
                      <Meta><span className="shrink-0 tabular-nums">Balance {money(String(after))}</span></Meta>
                    </span>
                    {e.kind === 'reversal' || e.kind === 'patient_adjustment' ? <span className="mt-1 mr-2 inline-block"><ActionButton op="correctLedgerNote" vars={{ entryId: e.id }} ask="Corrected note for this entry (the original stays in the history):" paths={paths}>Correct note</ActionButton></span> : null}
                    {canReverse ? <span className="mt-1 block"><ActionButton op="reverseLedgerEntry" vars={{ entryId: e.id }} ask="Why is this entry being reversed?" confirm="Post a reversing entry?" paths={paths}>Reverse</ActionButton></span> : null}
                  </span>
                </Row>
              );
            })}
          </div>
        ) : <Empty>No charges or payments yet.</Empty>}
      </Section>
      {account ? (
        <Section title="Take a payment">
          <details><summary className="cursor-pointer text-sm font-medium">New payment</summary>
            <div className="pt-2"><CommandForm op="takePayment" submitLabel="Take payment" paths={paths} columns={2} fixed={{ patientId: id, locationId: p.homeLocation?.id }} fields={[
              { name: 'amount', label: 'Amount in dollars', kind: 'text', required: true, placeholder: '50.00' },
              { name: 'tender', label: 'Paid by', kind: 'select', required: true, options: [{ value: 'cash', label: 'Cash' }, { value: 'check', label: 'Check' }, ...(paymentsConfigured() && (d.paymentMethodTokens as any[]).length ? [{ value: 'card', label: 'Card on file' }] : [])] },
              { name: 'checkNumber', label: 'Check number', kind: 'text', hint: 'For a check.' },
              ...(paymentsConfigured() && (d.paymentMethodTokens as any[]).length ? [{ name: 'methodTokenId', label: 'Card on file', kind: 'select' as const, options: [{ value: '', label: 'None' }, ...(d.paymentMethodTokens as any[]).map((t) => ({ value: t.id, label: `${title(t.brand)} ending ${t.last4}` }))] }] : []),
            ]} /></div>
          </details>
          {paymentsConfigured() ? (
            <details><summary className="cursor-pointer text-sm font-medium">New card</summary>
              <div className="pt-2"><CardPayment patientId={id} locationId={p.homeLocation?.id} stripeKey={process.env.NEXT_PUBLIC_STRIPE_KEY ?? ''} paths={paths} /></div>
            </details>
          ) : <Meta>Card payments are not set up yet.</Meta>}
          {(d.payments as any[]).length ? (d.payments as any[]).map((pay) => (
            <Row key={pay.id} className="items-start">
              <span className="min-w-0 flex-1"><span className="flex items-baseline justify-between gap-3"><TitleLine status={pay.status === 'succeeded' ? null : pay.status}>{title(pay.tender)}{pay.methodToken ? ` ending ${pay.methodToken.last4}` : ''} · {pay.ref}</TitleLine><span className="shrink-0 font-medium tabular-nums">{money(pay.amountMinor)}</span></span>
                <Meta>{calendarDate(pay.createdAt, 'date')}{BigInt(pay.refundedMinor) > 0n ? ` · ${money(pay.refundedMinor)} refunded` : ''}{pay.failureNote ? ` · ${pay.failureNote}` : ''}</Meta>
                {['succeeded', 'partially_refunded'].includes(pay.status) && BigInt(pay.amountMinor) > BigInt(pay.refundedMinor) ? <details className="mt-1"><summary className="cursor-pointer text-sm font-medium">Refund</summary>
                  <div className="pt-2"><CommandForm op="requestRefund" submitLabel="Ask for a refund" paths={paths} columns={1} fixed={{ paymentId: pay.id }} fields={[
                    { name: 'amount', label: 'Amount in dollars', kind: 'text', required: true, defaultValue: (Number(BigInt(pay.amountMinor) - BigInt(pay.refundedMinor)) / 100).toFixed(2) },
                    { name: 'method', label: 'Refund by', kind: 'select', options: pay.tender === 'card' ? [{ value: 'original_tender', label: 'Back to the card' }, { value: 'check', label: 'Check' }] : [{ value: 'check', label: 'Check' }] },
                    { name: 'reason', label: 'Reason', kind: 'textarea', required: true },
                  ]} /></div></details> : null}
              </span>
            </Row>
          )) : null}
        </Section>
      ) : null}
      {account ? (
        <Section title="Payment plan">
          {(d.paymentPlans as any[]).length ? (d.paymentPlans as any[]).map((pl) => (
            <div key={pl.id} className="space-y-2">
              <Row><span className="min-w-0"><TitleLine status={pl.status}>{pl.ref} · {money(pl.principalMinor)} in {pl.installments.length} payments, no interest</TitleLine></span></Row>
              {pl.installments.map((i: any) => <Row key={i.id}><span>{calendarDate(i.dueDate, 'date')}</span><span className="flex gap-3"><Meta>{title(i.status)}</Meta><span className="font-medium tabular-nums">{money(i.amountMinor)}</span></span></Row>)}
              {pl.status === 'proposed' ? <><Meta>{pl.agreementText}</Meta><CommandForm op="activatePaymentPlan" submitLabel="Patient agrees" paths={paths} columns={1} fixed={{ planId: pl.id, expectedVersion: pl.version }} fields={[{ name: 'agreedByName', label: 'Name of the person agreeing', kind: 'text', required: true }]} /></> : null}
              <ActionButton op="cancelPaymentPlan" vars={{ planId: pl.id, expectedVersion: pl.version }} ask="Why is the plan ending?" confirm="End this payment plan?" paths={paths}>End plan</ActionButton>
            </div>
          )) : (
            <details><summary className="cursor-pointer text-sm font-medium">Set up a payment plan</summary>
              <div className="pt-2"><CommandForm op="proposePaymentPlan" submitLabel="Show the plan" paths={paths} columns={2} fixed={{ patientId: id, locationId: p.homeLocation?.id }} fields={[
                { name: 'amount', label: 'Amount to spread', kind: 'text', placeholder: 'Leave empty for the whole balance' },
                { name: 'downPayment', label: 'Paid today', kind: 'text', placeholder: '0.00' },
                { name: 'installments', label: 'Number of payments', kind: 'number', required: true, defaultValue: '3' },
                { name: 'firstDueDate', label: 'First payment date', kind: 'date', required: true },
              ]} shape="planDollars" /></div>
            </details>
          )}
        </Section>
      ) : null}
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
