import { q } from '../../lib/server';
import { money, title, options } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, TitleLine } from '../../components/ui';
import { CommandForm } from '../../components/CommandForm';

import { COB_METHODS, PAYER_KINDS, PLAN_TYPES } from '@/features/keystone/models/insurance';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Payers and plans: who pays, what the plan type is, which fee schedule applies, and how benefits are coordinated. */
export default async function InsurancePage() {
  const d = await q<any>(`{
    payers(orderBy: { name: asc }) { id name kind phone adapterPayerIds timelyFilingDays }
    insurancePlans(orderBy: { groupName: asc }) { id groupName groupNumber planType networkStatus cobMethod annualMaxMinor deductibleIndividualMinor benefitYearStartMonth payer { id name } feeSchedule { id name } }
    feeSchedules(orderBy: { name: asc }) { id name isDefault }
  }`);
  const payers = d.payers as any[];
  const plans = d.insurancePlans as any[];
  const paths = ['/dashboard/platform/insurance'];
  return (
    <Page title="Insurance payers and plans">
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Section title="Payers">
          {payers.length ? payers.map((p) => (
            <Row key={p.id}>
              <span className="min-w-0"><span className="font-medium">{p.name}</span><br /><Meta>{title(p.kind)}{p.adapterPayerIds?.stedi ? ` · clearinghouse ID ${p.adapterPayerIds.stedi}` : ' · no electronic checks'}</Meta></span>
              <Meta>{plural(plans.filter((x) => x.payer?.id === p.id).length, 'plan', 'plans')}</Meta>
            </Row>
          )) : <Empty>No payers yet.</Empty>}
          <details><summary className="cursor-pointer text-sm font-medium">Add a payer</summary>
            <div className="pt-2"><CommandForm op="savePayer" submitLabel="Save payer" paths={paths} columns={2} fields={[
              { name: 'name', label: 'Name', kind: 'text', required: true },
              { name: 'kind', label: 'Kind', kind: 'select', options: options([...PAYER_KINDS]), required: true },
              { name: 'stediPayerId', label: 'Clearinghouse payer ID', kind: 'text', hint: 'Leave empty if the payer is checked by phone or portal.' },
              { name: 'phone', label: 'Phone', kind: 'tel' },
            ]} /></div>
          </details>
        </Section>
        <Section title="Plans">
          {plans.length ? plans.map((p) => (
            <Row key={p.id} className="flex-nowrap items-start">
              <span className="min-w-0 flex-1"><span className="font-medium">{p.groupName}</span><br /><Meta>{p.payer?.name} · {title(p.planType)} · {title(p.networkStatus)}{p.cobMethod && p.cobMethod !== 'unknown' ? ` · ${title(p.cobMethod)} coordination` : ''}{p.groupNumber ? ` · ${p.groupNumber}` : ''}</Meta></span>
              <span className="shrink-0 text-right"><Meta>{p.annualMaxMinor ? `Max ${money(p.annualMaxMinor)}` : 'Max not set'}<br />{p.feeSchedule?.name ?? 'Practice fees'}</Meta></span>
            </Row>
          )) : <Empty>No plans yet.</Empty>}
          <details><summary className="cursor-pointer text-sm font-medium">Add a plan</summary>
            <div className="pt-2"><CommandForm op="saveInsurancePlan" submitLabel="Save plan" paths={paths} columns={2} fields={[
              { name: 'payerId', label: 'Payer', kind: 'select', options: payers.map((p) => ({ value: p.id, label: p.name })), required: true },
              { name: 'groupName', label: 'Employer or group', kind: 'text', required: true },
              { name: 'groupNumber', label: 'Group number', kind: 'text' },
              { name: 'planType', label: 'Plan type', kind: 'select', options: options([...PLAN_TYPES]), required: true },
              { name: 'networkStatus', label: 'Network', kind: 'select', options: options(['in_network', 'out_of_network']), required: true },
              { name: 'feeScheduleId', label: 'Fee schedule', kind: 'select', options: [{ value: '', label: 'The practice’s own fees' }, ...(d.feeSchedules as any[]).filter((f) => !f.isDefault).map((f) => ({ value: f.id, label: f.name }))] },
              { name: 'cobMethod', label: 'Coordination method', kind: 'select', options: options(['unknown', ...COB_METHODS.filter((m) => m !== 'unknown')]), defaultValue: 'unknown' },
              { name: 'annualMax', label: 'Annual maximum ($)', kind: 'text', placeholder: '1500' },
              { name: 'deductible', label: 'Deductible ($)', kind: 'text', placeholder: '50' },
            ]} /></div>
          </details>
        </Section>
      </div>
    </Page>
  );
}
