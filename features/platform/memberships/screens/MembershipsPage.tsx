import { q } from '../../lib/server';
import { money, calendarDate, title } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, TitleLine } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';

const WORDS: Record<string, string> = { pending_agreement: 'waiting for the agreement', past_due: 'past due' };

/** Membership plans, who is on them, and the licence the office needs where the state asks for one. */
export default async function MembershipsPage() {
  const d = await q<any>(`{
    membershipPlans(orderBy: { name: asc }, take: 40) { id name ageBand priceMinor interval discountPct includedBenefits status version }
    patientMemberships(where: { status: { in: ["pending_agreement", "active", "past_due", "frozen"] } }, orderBy: { createdAt: desc }, take: 60) { id ref status version currentPeriodEnd patient { firstName lastName } plan { name } }
    regulatoryLicences(orderBy: { createdAt: desc }, take: 10) { id kind jurisdiction number effectiveFrom effectiveTo }
    locations(orderBy: { name: asc }, take: 20) { id name jurisdiction { key } }
    patients(orderBy: { lastName: asc }, take: 200) { id firstName lastName chartNumber }
  }`);
  const paths = ['/dashboard/platform/memberships'];
  const jurisdictions = [...new Set((d.locations as any[]).map((l) => l.jurisdiction?.key).filter(Boolean))] as string[];
  const hasLicence = (key: string) => (d.regulatoryLicences as any[]).some((l) => l.jurisdiction === key);
  return (
    <Page title="Memberships">
      <Section title="Licence or registration">
        {(d.regulatoryLicences as any[]).length ? (d.regulatoryLicences as any[]).map((l) => (
          <Row key={l.id}><span className="min-w-0"><TitleLine>{l.jurisdiction} · {l.number}</TitleLine><Meta>{title(l.kind)} · from {calendarDate(l.effectiveFrom, 'date')}{l.effectiveTo ? ` to ${calendarDate(l.effectiveTo, 'date')}` : ''}</Meta></span></Row>
        )) : <Empty>None on file.</Empty>}
        {jurisdictions.filter((j) => !hasLicence(j)).map((j) => <Meta key={j}>{j} may require a discount plan licence or registration before anyone is enrolled. Record it below.</Meta>)}
        <details><summary className="cursor-pointer text-sm font-medium">Record a licence or registration</summary>
          <div className="pt-2"><CommandForm op="recordLicence" submitLabel="Save" paths={paths} columns={2} fixed={{ kind: 'discount_plan_operator' }} fields={[
            { name: 'jurisdiction', label: 'State rules', kind: 'select', required: true, options: jurisdictions.map((j) => ({ value: j, label: j })) },
            { name: 'number', label: 'Licence or registration number', kind: 'text', required: true },
            { name: 'effectiveFrom', label: 'Starts', kind: 'date' },
            { name: 'effectiveTo', label: 'Ends', kind: 'date' },
            { name: 'evidence', label: 'Where the paperwork is', kind: 'text' },
          ]} /></div>
        </details>
      </Section>
      <Section title="Plans">
        {(d.membershipPlans as any[]).length ? (d.membershipPlans as any[]).map((p) => (
          <Row key={p.id} className="items-start">
            <span className="min-w-0 flex-1"><span className="flex items-baseline justify-between gap-3"><TitleLine status={p.status === 'active' ? null : p.status}>{p.name}</TitleLine><span className="shrink-0 font-medium tabular-nums">{money(p.priceMinor)} {p.interval === 'annual' ? 'a year' : 'a month'}</span></span>
              <Meta>{title(p.ageBand)} · {Number(p.discountPct)}% off other work{(p.includedBenefits as any[])?.length ? ` · ${(p.includedBenefits as any[]).map((b) => `${b.countPerPeriod} ${b.codeFamily} visits`).join(', ')}` : ''}</Meta>
              {p.status === 'active' ? <span className="mt-1 block"><ActionButton op="retireMembershipPlan" vars={{ planId: p.id, expectedVersion: p.version }} confirm="Stop offering this plan? Current members keep it." paths={paths}>Stop offering</ActionButton></span> : null}
            </span>
          </Row>
        )) : <Empty>No plans yet.</Empty>}
        <details><summary className="cursor-pointer text-sm font-medium">Add a plan</summary>
          <div className="pt-2"><CommandForm op="defineMembershipPlan" shape="membershipPlan" submitLabel="Add plan" paths={paths} columns={2} fields={[
            { name: 'name', label: 'Plan name', kind: 'text', required: true },
            { name: 'ageBand', label: 'Who it is for', kind: 'select', required: true, options: [{ value: 'adult', label: 'Adults' }, { value: 'child', label: 'Children' }, { value: 'perio', label: 'Gum care' }] },
            { name: 'price', label: 'Price', kind: 'text', required: true, placeholder: '29.00' },
            { name: 'interval', label: 'Charged', kind: 'select', required: true, options: [{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Yearly' }] },
            { name: 'discountPct', label: 'Percent off other work', kind: 'text', required: true, defaultValue: '15' },
            { name: 'coveredVisits', label: 'Cleanings and exams included each period', kind: 'number', defaultValue: '2' },
            { name: 'locationId', label: 'Office', kind: 'select', required: true, options: (d.locations as any[]).map((l) => ({ value: l.id, label: l.name })) },
            { name: 'termsText', label: 'Terms the member agrees to', kind: 'textarea', required: true },
          ]} /></div>
        </details>
      </Section>
      <Section title="Members">
        {(d.patientMemberships as any[]).length ? (d.patientMemberships as any[]).map((m) => (
          <Row key={m.id} className="items-start">
            <span className="min-w-0 flex-1"><TitleLine status={m.status}>{m.patient?.firstName} {m.patient?.lastName}</TitleLine>
              <Meta>{m.plan?.name} · {m.ref}{WORDS[m.status] ? ` · ${WORDS[m.status]}` : ''}{m.currentPeriodEnd ? ` · paid through ${calendarDate(m.currentPeriodEnd, 'date')}` : ''}</Meta>
              <span className="mt-1 flex flex-wrap gap-2">
                {m.status === 'pending_agreement' ? <details><summary className="cursor-pointer text-sm font-medium">Sign the agreement</summary><div className="pt-2"><CommandForm op="signMembershipAgreement" shape="signAgreement" submitLabel="Start the plan" paths={paths} columns={1} fixed={{ membershipId: m.id, expectedVersion: m.version }} fields={[
                  { name: 'signerName', label: 'Name of the person signing', kind: 'text', required: true },
                  { name: 'startsOn', label: 'Starts on', kind: 'date', hint: 'Leave empty to start today.' },
                  { name: 'consent', label: 'They have read the terms and agree to the plan and its price.', kind: 'checkbox' },
                ]} /></div></details> : null}
                {m.status === 'active' ? <ActionButton op="freezeMembership" vars={{ membershipId: m.id, expectedVersion: m.version, freeze: true }} ask="Why is it being paused?" paths={paths}>Pause</ActionButton> : null}
                {m.status === 'frozen' ? <ActionButton op="freezeMembership" vars={{ membershipId: m.id, expectedVersion: m.version, freeze: false }} ask="Why is it starting again?" paths={paths}>Resume</ActionButton> : null}
                {['pending_agreement', 'active', 'past_due', 'frozen'].includes(m.status) ? <ActionButton op="cancelMembership" vars={{ membershipId: m.id, expectedVersion: m.version }} ask="Why is it being cancelled?" paths={paths}>Cancel</ActionButton> : null}
              </span>
            </span>
          </Row>
        )) : <Empty>Nobody is enrolled.</Empty>}
        <details><summary className="cursor-pointer text-sm font-medium">Enrol a patient</summary>
          <div className="pt-2"><CommandForm op="enrolMembership" submitLabel="Enrol" paths={paths} columns={2} fields={[
            { name: 'patientId', label: 'Patient', kind: 'select', required: true, options: (d.patients as any[]).map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName} · #${p.chartNumber}` })) },
            { name: 'planId', label: 'Plan', kind: 'select', required: true, options: (d.membershipPlans as any[]).filter((p) => p.status === 'active').map((p) => ({ value: p.id, label: p.name })) },
            { name: 'locationId', label: 'Office', kind: 'select', required: true, options: (d.locations as any[]).map((l) => ({ value: l.id, label: l.name })) },
          ]} /></div>
        </details>
      </Section>
    </Page>
  );
}
