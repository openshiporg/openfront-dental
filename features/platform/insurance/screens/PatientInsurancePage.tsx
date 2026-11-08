import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, practiceTimeZone } from '../../lib/server';
import { money, when, title, options, calendarDate, chartLabel } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Stat, TitleLine } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';

const SOURCES = ['payer_portal', 'payer_phone', 'fax_breakdown', 'prior_eob', 'patient_reported', 'practice_default'];
const FIELDS = ['coverage_active', 'annual_max', 'annual_max_used', 'deductible', 'deductible_met', 'coverage_pct', 'frequency_limit', 'waiting_period', 'missing_tooth_clause', 'downgrade', 'cob_method', 'age_limit', 'non_covered'];
const CATEGORIES = ['preventive', 'basic', 'major', 'orthodontic'];

const FIELD_NAMES: Record<string, string> = { cob_method: 'Coordination of benefits', coverage_pct: 'Plan pays', coverage_active: 'Coverage', annual_max: 'Annual maximum', annual_max_used: 'Maximum left this year', deductible_met: 'Deductible left this year', frequency_limit: 'Frequency limit', waiting_period: 'Waiting period', missing_tooth_clause: 'Missing-tooth clause', downgrade: 'Downgrade rule', age_limit: 'Age limit', non_covered: 'Not covered' };
const fieldName = (f: string) => FIELD_NAMES[f] ?? title(f);

/** Plain words for a stored fact. An unknown fact says so; it is never shown as a benefit. */
function factText(f: any): string {
  if (f.isUnknown) return 'Not known';
  const v = f.valueJson ?? {};
  switch (f.field) {
    case 'coverage_active': return v.active ? 'Active' : 'Not active';
    case 'annual_max': case 'deductible': return money(v.amountMinor);
    case 'annual_max_used': case 'deductible_met': return `${money(v.remainingMinor)} remaining`;
    case 'coverage_pct': return `${String(v.pct).replace(/\.?0+$/, '')}%`;
    case 'frequency_limit': return v.count ? `${v.count} per ${v.months} months` : String(v.text ?? 'Limit noted');
    case 'waiting_period': return `${v.months} months`;
    case 'missing_tooth_clause': case 'downgrade': return (v.categories ?? []).length ? `Applies to ${v.categories.join(', ')}` : 'Does not apply';
    case 'cob_method': return title(v.method);
    case 'age_limit': return `${v.min ?? 0}–${v.max ?? 'no limit'} years`;
    default: return JSON.stringify(v);
  }
}

/** What an estimate line shows. Unknown benefits stay "Not estimated": insurance is never assumed to pay. */
function EstimateLine({ e, name }: { e: any; name: string }) {
  const unknown = e.coverageStatus === 'unknown';
  return (
    <Row className="flex-nowrap items-start">
      <span className="min-w-0 flex-1"><span className="font-medium">{name}</span><br />
        <Meta>{unknown ? 'Insurance benefit not known. Not estimated.' : e.coverageStatus === 'not_covered' ? 'Not covered by this plan' : `Plan pays ${money(e.insuranceMinor)}`} · {title(e.confidence)}</Meta></span>
      <span className="shrink-0 whitespace-nowrap text-right"><span className="font-medium">{money(e.patientMinor)}</span><br /><Meta>patient</Meta></span>
    </Row>
  );
}

/** A patient's coverage: ordered plans, the latest verification and its sourced facts, outside history and estimates. */
export default async function PatientInsurancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d, tz] = await Promise.all([q<any>(`query Ins($id: ID!) {
    patient(where: { id: $id }) { id chartNumber firstName lastName }
    coverages(where: { patient: { id: { equals: $id } } }, orderBy: [{ status: asc }, { ordinal: asc }]) {
      id ordinal relationship status verificationLevel version effectiveFrom effectiveTo
      subscriber { memberIdLast4 plan { id groupName planType networkStatus annualMaxMinor payer { name } } }
      verifications(orderBy: { createdAt: desc }, take: 1) { id status version completeness completedAt eligibilityChecks { id status resultNote } tasks(where: { status: { in: ["open", "in_progress"] } }) { id title } }
    }
    benefitFacts(where: { coverage: { patient: { id: { equals: $id } } } }, orderBy: { createdAt: desc }, take: 200) { id field appliesTo valueJson isUnknown source observedAt coverage { id } }
    estimates(where: { patient: { id: { equals: $id } } }, orderBy: { computedAt: desc }, take: 200) { id coverageStatus confidence insuranceMinor patientMinor planItem { id } }
    outsideHistories(where: { patient: { id: { equals: $id } } }, orderBy: { dateOfService: desc }, take: 20) { id codeText dateOfService providerName source }
    treatmentPlans(where: { patient: { id: { equals: $id } }, status: { in: ["draft", "presented", "accepted"] } }, orderBy: { createdAt: desc }, take: 3) {
      id ref title currentVersion { items(orderBy: { sortOrder: asc }) { id feeMinor chartEntry { tooth code { code patientFriendlyName nomenclature } } } }
    }
  }`, { id }), practiceTimeZone()]);
  if (!d.patient) notFound();
  const p = d.patient;
  const coverages = d.coverages as any[];
  const current = coverages.filter((c) => ['pending_verification', 'active'].includes(c.status));
  const ended = coverages.filter((c) => !current.includes(c));
  const paths = [`/dashboard/platform/patients/${id}/insurance`];
  return (
    <Page title={`Insurance · ${p.firstName} ${p.lastName}`} crumbs={[{ label: 'Patients', href: '/dashboard/platform/patients' }, { label: `${p.firstName} ${p.lastName}`, href: `/dashboard/platform/patients/${id}` }]}>
      <div className="flex flex-wrap items-center gap-3"><span className="font-mono text-sm text-muted-foreground">{chartLabel(p.chartNumber)}</span></div>
      {current.length ? current.map((c) => {
        const v = c.verifications[0];
        const facts = (d.benefitFacts as any[]).filter((f) => f.coverage?.id === c.id);
        const latest = new Map<string, any>();
        for (const f of facts) { const key = `${f.field}|${JSON.stringify(f.appliesTo)}`; const have = latest.get(key); if (!have || (have.isUnknown && !f.isUnknown)) latest.set(key, f); }
        const rows = [...latest.values()].sort((a, b) => a.field.localeCompare(b.field));
        return (
          <Section key={c.id} title={`${title(c.ordinal)} · ${c.subscriber?.plan?.payer?.name ?? ''}`}>
            <TitleLine status={c.verificationLevel}>{null}</TitleLine>
            <div className="grid min-w-0 grid-cols-2 gap-4 break-words rounded-lg border p-4 sm:grid-cols-4">
              <Stat name="Group" value={c.subscriber?.plan?.groupName ?? '—'} />
              <Stat name="Member ID" value={c.subscriber?.memberIdLast4 ? `•••• ${c.subscriber.memberIdLast4}` : '—'} />
              <Stat name="Plan type" value={title(c.subscriber?.plan?.planType)} />
              <Stat name="Since" value={calendarDate(c.effectiveFrom, 'date') || '—'} />
            </div>
            {v?.eligibilityChecks?.length ? <Meta>Electronic check: {title(v.eligibilityChecks[0].status)}{v.eligibilityChecks[0].resultNote ? ` · ${v.eligibilityChecks[0].resultNote}` : ''}</Meta> : null}
            {rows.length ? rows.map((f) => (
              <Row key={f.id} className="flex-nowrap items-start">
                <span className="min-w-0 flex-1"><span className="font-medium">{fieldName(f.field)}</span>{f.appliesTo?.category ? <Meta> · {f.appliesTo.category}</Meta> : null}</span>
                <span className="min-w-0 max-w-[55%] shrink-0 text-right"><span className={f.isUnknown ? 'text-amber-700' : ''}>{factText(f)}</span><br /><Meta>{title(f.source)} · {calendarDate(f.observedAt)}</Meta></span>
              </Row>
            )) : <Empty>No benefits recorded. Insurance is not assumed to pay anything.</Empty>}
            {v?.tasks?.length ? <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Still to ask: {v.tasks.map((t: any) => t.title.replace(/^Ask the payer: /i, '')).join('; ')}</div> : null}
            <div className="flex flex-wrap gap-2">
              {v && ['in_progress'].includes(v.status) ? <ActionButton op="completeVerification" vars={{ verificationId: v.id, expectedVersion: v.version }} paths={paths}>Finish verification</ActionButton> : <ActionButton op="requestVerification" vars={{ coverageId: c.id }} paths={paths}>Verify benefits</ActionButton>}
              {c.ordinal !== 'primary' ? <ActionButton op="setCoverageOrder" vars={{ coverageId: c.id, ordinal: 'primary' }} ask="Why is this now the primary plan?" paths={paths}>Make primary</ActionButton> : null}
              <ActionButton op="terminateCoverage" vars={{ coverageId: c.id, expectedVersion: c.version, endedOn: new Date().toISOString().slice(0, 10) }} ask="Why did this coverage end?" confirm="End this coverage today?" paths={paths}>End coverage</ActionButton>
            </div>
            {v && v.status === 'in_progress' ? (
              <details><summary className="cursor-pointer text-sm font-medium">Record what the payer said</summary>
                <div className="pt-2"><CommandForm op="recordBenefitFact" submitLabel="Save" paths={paths} columns={3} fixed={{ verificationId: v.id }} fields={[
                  { name: 'field', label: 'Item', kind: 'select', options: options(FIELDS), required: true },
                  { name: 'category', label: 'Category', kind: 'select', options: [{ value: '', label: '—' }, ...options(CATEGORIES)] },
                  { name: 'source', label: 'Source', kind: 'select', options: options(SOURCES), required: true, defaultValue: 'payer_phone' },
                  { name: 'dollars', label: 'Dollars', kind: 'text', placeholder: '1500' },
                  { name: 'pct', label: 'Percent', kind: 'text', placeholder: '80' },
                  { name: 'months', label: 'Months', kind: 'number' },
                  { name: 'count', label: 'Times allowed', kind: 'number' },
                  { name: 'method', label: 'Coordination', kind: 'select', options: [{ value: '', label: '—' }, ...options(['standard', 'non_duplication', 'carve_out', 'unknown'])] },
                  { name: 'flag', label: 'Applies?', kind: 'select', options: [{ value: '', label: '—' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
                  { name: 'isUnknown', label: 'The payer could not say', kind: 'checkbox' },
                ]} /></div>
              </details>
            ) : null}
          </Section>
        );
      }) : <Section title="Coverage"><Empty>No insurance on file. Estimates will treat every fee as self-pay.</Empty></Section>}
      <Section title="Add coverage">
        <AddCoverage patientId={id} paths={paths} />
      </Section>
      <Section title="Estimates">
        {(d.treatmentPlans as any[]).length ? (d.treatmentPlans as any[]).map((plan) => (
          <div key={plan.id} className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{plan.ref} · {plan.title}</span>
              <ActionButton op="estimateTreatmentPlan" vars={{ planId: plan.id }} paths={paths}>Estimate</ActionButton></div>
            {(plan.currentVersion?.items ?? []).map((i: any) => {
              const e = (d.estimates as any[]).find((x) => x.planItem?.id === i.id);
              const name = i.chartEntry?.code?.patientFriendlyName || i.chartEntry?.code?.nomenclature || 'Procedure';
              return e ? <EstimateLine key={i.id} e={e} name={name} /> : <Row key={i.id}><span>{name}</span><Meta>Not estimated · {money(i.feeMinor)} fee</Meta></Row>;
            })}
          </div>
        )) : <Empty>No open treatment plan to estimate.</Empty>}
      </Section>
      <Section title="Treatment done elsewhere">
        {(d.outsideHistories as any[]).length ? (d.outsideHistories as any[]).map((h) => <Row key={h.id}><span>{h.codeText}</span><Meta>{calendarDate(h.dateOfService, 'date')} · {title(h.source)}</Meta></Row>) : <Empty>None recorded. Frequency limits only count treatment done here.</Empty>}
        <details><summary className="cursor-pointer text-sm font-medium">Add outside treatment</summary>
          <div className="pt-2"><CommandForm op="addOutsideHistory" submitLabel="Save" paths={paths} columns={2} fixed={{ patientId: id }} fields={[
            { name: 'codeText', label: 'Treatment', kind: 'text', required: true },
            { name: 'dateOfService', label: 'Date', kind: 'date', required: true },
            { name: 'frequencyGroup', label: 'Counts toward', kind: 'select', options: [{ value: '', label: 'Nothing in particular' }, { value: 'recall', label: 'Cleanings and exams' }] },
            { name: 'source', label: 'Source', kind: 'select', options: options(SOURCES), required: true, defaultValue: 'patient_reported' },
          ]} /></div>
        </details>
      </Section>
      {ended.length ? <Section title="Ended coverage">{ended.map((c) => <Row key={c.id}><span>{c.subscriber?.plan?.payer?.name} · {title(c.ordinal)}</span><Meta>{title(c.status)}{c.effectiveTo ? ` · ${calendarDate(c.effectiveTo, 'date')}` : ''}</Meta></Row>)}</Section> : null}
    </Page>
  );
}

async function AddCoverage({ patientId, paths }: { patientId: string; paths: string[] }) {
  const d = await q<any>(`{ insurancePlans(orderBy: { groupName: asc }) { id groupName payer { name } } }`);
  return (
    <details><summary className="cursor-pointer text-sm font-medium">Add a plan for this patient</summary>
      <div className="pt-2"><CommandForm op="addCoverage" submitLabel="Add coverage" paths={paths} columns={2} fixed={{ patientId }} fields={[
        { name: 'planId', label: 'Plan', kind: 'select', required: true, options: (d.insurancePlans as any[]).map((x) => ({ value: x.id, label: `${x.payer?.name} · ${x.groupName}` })) },
        { name: 'memberId', label: 'Member ID', kind: 'text', required: true },
        { name: 'ordinal', label: 'Order', kind: 'select', options: options(['primary', 'secondary', 'tertiary']), required: true },
        { name: 'relationship', label: 'Subscriber is', kind: 'select', options: options(['self', 'spouse', 'child', 'other']), required: true },
        { name: 'effectiveFrom', label: 'Effective from', kind: 'date', required: true },
        { name: 'subscriberFirstName', label: 'Subscriber first name', kind: 'text', hint: 'When not the patient.' },
        { name: 'subscriberLastName', label: 'Subscriber last name', kind: 'text' },
        { name: 'subscriberDateOfBirth', label: 'Subscriber date of birth', kind: 'date' },
      ]} /></div>
    </details>
  );
}
