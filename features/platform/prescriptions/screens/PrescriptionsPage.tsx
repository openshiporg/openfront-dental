import { q, requirePage } from '../../lib/server';
import { when, title } from '../../lib/format';
import { practiceTimeZone } from '../../lib/server';
import { Page, Section, Row, Empty, Meta, TitleLine } from '../../components/ui';
import { ActionButton, summaryClass } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';
import { ERX_STATUS_TEXT } from '../../lib/adapterText';

/** Prescriptions are written and signed here and printed for the patient. A controlled drug cannot be signed until the state prescription-monitoring check is recorded. */
export default async function PrescriptionsPage() {
  await requirePage('prescriptions');
  const [tz, d] = await Promise.all([practiceTimeZone(), q<any>(`{
    prescriptions(orderBy: { createdAt: desc }, take: 60) { id drug strength form sig quantity refills isControlled schedule status version signedAt createdAt patient { firstName lastName } }
    pdmpChecks(orderBy: { checkedAt: desc }, take: 200) { id result note checkedAt prescription { id } }
    patients(orderBy: { lastName: asc }, take: 200) { id firstName lastName chartNumber }
  }`)]);
  const paths = ['/dashboard/platform/prescriptions'];
  return (
    <Page title="Prescriptions">
      <Meta>{ERX_STATUS_TEXT}</Meta>
      <Section title="Recent prescriptions">
        {(d.prescriptions as any[]).length ? (d.prescriptions as any[]).map((r) => {
          const checks = (d.pdmpChecks as any[]).filter((c) => c.prescription?.id === r.id);
          return (
            <Row key={r.id} className="items-start">
              <span className="min-w-0 flex-1">
                <TitleLine status={r.status}>{r.drug} {r.strength} · {r.patient?.firstName} {r.patient?.lastName}</TitleLine>
                <Meta>{r.sig} · {Number(r.quantity)} to dispense · {r.refills} refill{r.refills === 1 ? '' : 's'} · {title(r.status)}{r.isControlled ? ` · controlled (schedule ${r.schedule})` : ''}{r.signedAt ? ` · signed ${when(r.signedAt, tz, 'dayTime')}` : ''}</Meta>
                {checks.map((c) => <Meta key={c.id}>State check {when(c.checkedAt, tz, 'dayTime')}: {title(c.result)} — {c.note}</Meta>)}
                <span className="mt-1 flex flex-wrap items-start gap-2">
                  {r.isControlled && !checks.length && r.status === 'draft' ? <details><summary className={summaryClass}>Record the state check</summary><div className="pt-2"><CommandForm op="recordPdmpCheck" submitLabel="Record" paths={paths} columns={1} fixed={{ prescriptionId: r.id }} fields={[
                    { name: 'result', label: 'What it showed', kind: 'select', required: true, options: [{ value: 'reviewed_no_concern', label: 'Reviewed, no concern' }, { value: 'reviewed_concern', label: 'Reviewed, a concern' }] },
                    { name: 'note', label: 'Where you looked and what you saw', kind: 'textarea', required: true },
                  ]} /></div></details> : null}
                  {r.status === 'draft' ? <ActionButton op="signPrescription" vars={{ prescriptionId: r.id, expectedVersion: r.version }} paths={paths}>Sign</ActionButton> : null}
                  {r.status === 'signed' ? <ActionButton op="markPrescriptionPrinted" vars={{ prescriptionId: r.id, expectedVersion: r.version }} paths={paths}>Mark printed</ActionButton> : null}
                </span>
              </span>
            </Row>
          );
        }) : <Empty>No prescriptions yet.</Empty>}
        <details><summary className={summaryClass}>Write a prescription</summary>
          <div className="pt-2"><CommandForm op="writePrescription" submitLabel="Save draft" paths={paths} columns={2} fields={[
            { name: 'patientId', label: 'Patient', kind: 'select', required: true, options: (d.patients as any[]).map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName} · #${p.chartNumber}` })) },
            { name: 'drug', label: 'Medicine', kind: 'text', required: true },
            { name: 'strength', label: 'Strength', kind: 'text', placeholder: '500 mg' },
            { name: 'form', label: 'Form', kind: 'text', placeholder: 'capsule' },
            { name: 'sig', label: 'Directions', kind: 'text', required: true, placeholder: 'Take one three times a day for 7 days' },
            { name: 'quantity', label: 'Amount to dispense', kind: 'text', required: true },
            { name: 'refills', label: 'Refills', kind: 'number', defaultValue: '0' },
            { name: 'schedule', label: 'Controlled drug schedule', kind: 'select', defaultValue: 'none', options: [{ value: 'none', label: 'Not controlled' }, { value: 'II', label: 'Schedule II' }, { value: 'III', label: 'Schedule III' }, { value: 'IV', label: 'Schedule IV' }, { value: 'V', label: 'Schedule V' }] },
          ]} /></div>
        </details>
      </Section>
    </Page>
  );
}
