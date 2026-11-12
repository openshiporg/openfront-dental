import { q } from '../../lib/server';
import { calendarDate, title } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, TitleLine } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';

const NEXT: Record<string, { to: string; label: string }[]> = {
  draft: [{ to: 'sent', label: 'Mark sent' }], sent: [{ to: 'in_production', label: 'In production' }, { to: 'received', label: 'Mark received' }],
  in_production: [{ to: 'shipped', label: 'Shipped' }, { to: 'received', label: 'Mark received' }], shipped: [{ to: 'received', label: 'Mark received' }],
  received: [{ to: 'qc_passed', label: 'Passed inspection' }, { to: 'remake_requested', label: 'Ask for a remake' }], qc_passed: [{ to: 'seated', label: 'Seated' }, { to: 'remake_requested', label: 'Ask for a remake' }],
  remake_requested: [{ to: 'sent', label: 'Send again' }],
};

/** Crowns, dentures and other work sent to a lab. A case that has not come back holds up check-in for the visit it is meant for. */
export default async function LabsPage() {
  const d = await q<any>(`{
    labCases(where: { status: { notIn: ["seated", "cancelled"] } }, orderBy: [{ dueDate: asc }], take: 100) { id ref status version workType tooth shade dueDate lastChasedAt patient { firstName lastName } lab { name } seatAppointment { startsAt } files }
    labs(where: { isActive: { equals: true } }, orderBy: { name: asc }, take: 50) { id name contactName phone turnaroundDays bufferDays }
    locations(orderBy: { name: asc }, take: 20) { id name }
    patients(orderBy: { lastName: asc }, take: 200) { id firstName lastName chartNumber }
  }`);
  const paths = ['/dashboard/platform/labs'];
  const cases = d.labCases as any[];
  return (
    <Page title="Lab cases">
      <Section title="Open cases">
        {cases.length ? cases.map((c) => (
          <Row key={c.id} className="items-start">
            <span className="min-w-0 flex-1">
              <TitleLine status={c.status}>{c.patient?.firstName} {c.patient?.lastName} · {c.workType}</TitleLine>
              <Meta>{c.lab?.name} · {c.ref}{c.tooth ? ` · tooth ${c.tooth}` : ''}{c.shade ? ` · shade ${c.shade}` : ''} · {title(c.status)}{c.dueDate ? ` · due back ${calendarDate(c.dueDate, 'date')}` : ''}{c.seatAppointment?.startsAt ? ` · seat visit ${calendarDate(c.seatAppointment.startsAt, 'date')}` : ''}{(c.files as any[])?.length ? ` · ${(c.files as any[]).length} file${(c.files as any[]).length === 1 ? '' : 's'}` : ''}</Meta>
              <span className="mt-1 flex flex-wrap items-start gap-2">
                {(NEXT[c.status] ?? []).map((n) => <ActionButton key={n.to} op="advanceLabCase" vars={{ caseId: c.id, expectedVersion: c.version, to: n.to }} paths={paths}>{n.label}</ActionButton>)}
                {['sent', 'in_production', 'shipped'].includes(c.status) ? <ActionButton op="chaseLabCase" vars={{ caseId: c.id }} paths={paths}>Note a chase</ActionButton> : null}
                {['draft', 'sent', 'in_production', 'shipped', 'remake_requested'].includes(c.status) ? <ActionButton op="advanceLabCase" vars={{ caseId: c.id, expectedVersion: c.version, to: 'cancelled' }} ask="Why cancel this case?" paths={paths}>Cancel</ActionButton> : null}
              </span>
            </span>
          </Row>
        )) : <Empty>No lab work is out.</Empty>}
        <details><summary className="cursor-pointer text-sm font-medium">Start a lab case</summary>
          <div className="pt-2"><CommandForm op="openLabCase" submitLabel="Start case" paths={paths} columns={2} fields={[
            { name: 'patientId', label: 'Patient', kind: 'select', required: true, options: (d.patients as any[]).map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName} · #${p.chartNumber}` })) },
            { name: 'labId', label: 'Lab', kind: 'select', required: true, options: (d.labs as any[]).map((l) => ({ value: l.id, label: l.name })) },
            { name: 'locationId', label: 'Office', kind: 'select', required: true, options: (d.locations as any[]).map((l) => ({ value: l.id, label: l.name })) },
            { name: 'workType', label: 'Work', kind: 'text', required: true, placeholder: 'Zirconia crown' },
            { name: 'tooth', label: 'Tooth', kind: 'text' },
            { name: 'shade', label: 'Shade', kind: 'text' },
            { name: 'dueDate', label: 'Due back', kind: 'date' },
            { name: 'instructions', label: 'Instructions for the lab', kind: 'textarea' },
          ]} /></div>
        </details>
      </Section>
      <Section title="Labs">
        {(d.labs as any[]).length ? (d.labs as any[]).map((l) => (
          <Row key={l.id}><span className="min-w-0"><TitleLine>{l.name}</TitleLine><Meta>{l.contactName || 'No contact'}{l.phone ? ` · ${l.phone}` : ''} · usually {l.turnaroundDays} days, plus {l.bufferDays} spare</Meta></span></Row>
        )) : <Empty>No labs yet.</Empty>}
        <details><summary className="cursor-pointer text-sm font-medium">Add a lab</summary>
          <div className="pt-2"><CommandForm op="saveLab" submitLabel="Add lab" paths={paths} columns={2} fields={[
            { name: 'name', label: 'Lab name', kind: 'text', required: true },
            { name: 'contactName', label: 'Contact', kind: 'text' },
            { name: 'phone', label: 'Phone', kind: 'tel' },
            { name: 'email', label: 'Email', kind: 'email' },
            { name: 'turnaroundDays', label: 'Usual days to make', kind: 'number', defaultValue: '10' },
            { name: 'bufferDays', label: 'Spare days before the visit', kind: 'number', defaultValue: '2' },
          ]} /></div>
        </details>
      </Section>
    </Page>
  );
}
