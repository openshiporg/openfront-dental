import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, practiceTimeZone } from '../../lib/server';
import { money, title, options, calendarDate, chartLabel } from '../../lib/format';
import { COB_METHODS } from '@/features/keystone/models/insurance';
import { Page, Section, Row, Empty, Meta, Stat, TitleLine } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';

const SOURCES = ['payer_portal', 'payer_phone', 'fax_breakdown', 'prior_eob', 'patient_reported', 'practice_default'];
const FIELDS = ['coverage_active', 'annual_max', 'annual_max_used', 'deductible', 'deductible_met', 'coverage_pct', 'frequency_limit', 'waiting_period', 'missing_tooth_clause', 'downgrade', 'cob_method', 'age_limit', 'non_covered'];
const CATEGORIES = ['preventive', 'basic', 'major', 'orthodontic'];

const STILL_TO_ASK: Record<string, string> = {
  'Ask the payer for frequency limits': 'frequency limits', 'Ask about waiting periods': 'waiting periods', 'Ask if a missing-tooth clause applies': 'whether a missing-tooth clause applies',
  'Ask about downgrade (alternate benefit) rules': 'downgrade (alternate benefit) rules', 'Ask the payer: COB method': 'which coordination-of-benefits method applies',
  'Ask what frequencies are already used this year': 'what frequencies are already used this year', 'Ask for procedures done elsewhere': 'treatment done elsewhere',
  'Ask for coverage percentages': 'coverage percentages', 'Ask for the annual maximum': 'the annual maximum',
};
const fieldName = (f: string) => title(f);
const categoryText = (a: any) => (a?.category ? ` · ${title(a.category)}` : a?.group ? ` · ${a.group === 'recall' ? 'cleanings and exams' : a.group}` : '');

/** Plain words for a stored fact. An unknown fact says so; it is never shown as a benefit. */
function factText(f: any): string {
  if (f.isUnknown) return 'Not known';
  const v = f.valueJson ?? {};
  switch (f.field) {
    case 'coverage_active': return v.active ? 'Active' : 'Not active';
    case 'annual_max': case 'deductible': case 'ortho_max': return money(v.amountMinor);
    case 'annual_max_used': case 'deductible_met': return `${money(v.remainingMinor)} remaining`;
    case 'ortho_used': return v.remainingMinor !== undefined ? `${money(v.remainingMinor)} remaining` : money(v.amountMinor);
    case 'coverage_pct': return `${String(v.pct).replace(/\.?0+$/, '')}%`;
    case 'frequency_limit': return v.count ? `${v.count} per ${v.months} months` : String(v.text ?? 'Limit noted, ask the payer for the numbers');
    case 'waiting_period': return `${v.months} months`;
    case 'missing_tooth_clause': case 'downgrade': return (v.categories ?? []).length ? `Applies to ${v.categories.map((c: string) => title(c).toLowerCase()).join(', ')}` : 'Does not apply';
    case 'cob_method': return title(v.method);
    case 'non_covered': return 'Not covered';
    case 'age_limit': return v.max == null ? `${v.min ?? 0} years and older` : `${v.min ?? 0}–${v.max} years`;
    default: return 'Recorded. Ask the office for details';
  }
}

/** Why a line is not covered, in words (the estimator's reason codes). */
const NOT_COVERED_WHY: Record<string, string> = {
  frequency_exceeded: ': over the frequency limit', waiting_period: ': still in the waiting period', age_limit: ': outside the age limit', missing_tooth: ': missing-tooth clause', not_covered: ': the plan does not cover this',
};

/** What an estimate line shows. Unknown benefits stay "Not estimated": insurance is never assumed to pay. A line whose coverage has ended reads as self-pay. */
function EstimateLine({ e, name, currentCoverageIds }: { e: any; name: string; currentCoverageIds: Set<string> }) {
  const selfPay = (e.reasons ?? []).includes('no_coverage') || !e.coverage?.id || !currentCoverageIds.has(e.coverage.id);
  const unknown = e.coverageStatus === 'unknown';
  const confidence = title(e.confidence);
  const detail = selfPay ? 'No insurance on file. You pay the full fee'
    : unknown ? 'Insurance benefit not known. Not estimated.'
    : e.coverageStatus === 'not_covered' ? `Not covered by this plan${NOT_COVERED_WHY[(e.reasons ?? []).find((r: string) => NOT_COVERED_WHY[r]) ?? ''] ?? ''}`
    : BigInt(e.insuranceMinor) === 0n && BigInt(e.secondaryInsuranceMinor ?? 0) > 0n ? `Second plan pays ${money(e.secondaryInsuranceMinor)}`
    : BigInt(e.insuranceMinor) === 0n ? 'Covered, nothing payable'
    : `Plan pays ${money(e.insuranceMinor)}${BigInt(e.secondaryInsuranceMinor ?? 0) > 0n ? `, second plan pays ${money(e.secondaryInsuranceMinor)}` : ''}`;
  const r = new Set<string>(e.reasons ?? []);
  const notes = [r.has('downgraded') ? 'paid at the alternate-benefit amount' : '', r.has('downgrade_amount_unknown') ? 'alternate-benefit amount not known' : '', r.has('frequency_unknown') ? 'frequency limit still to be asked' : '',
    r.has('secondary_only') ? 'the first plan does not cover this; the second plan pays' : '', r.has('secondary_limits_unknown') ? 'second plan pays nothing here until its own limits are known' : ''].filter(Boolean);
  return (
    <Row className="flex-nowrap items-start">
      <span className="min-w-0 flex-1"><span className="font-medium">{name}</span><br />
        <Meta>{detail}{selfPay ? '' : ` · ${confidence}`}{notes.length ? ` · ${notes.join(', ')}` : ''}</Meta></span>
      <span className="shrink-0 whitespace-nowrap text-right"><span className="font-medium">{money(e.patientMinor)}</span><br /><Meta>patient</Meta></span>
    </Row>
  );
}

/** A patient's coverage: ordered plans, the latest verification and its sourced facts, outside history and estimates. */
export default async function PatientInsurancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d, tz] = await Promise.all([q<any>(`query Ins($id: ID!) {
    patient(where: { id: $id }) { id chartNumber firstName lastName homeLocation { id } }
    coverages(where: { patient: { id: { equals: $id } } }, orderBy: [{ status: asc }, { ordinal: asc }]) {
      id ordinal relationship status verificationLevel version effectiveFrom effectiveTo
      subscriber { memberIdLast4 plan { id groupName planType networkStatus annualMaxMinor payer { name } } }
      verifications(orderBy: { createdAt: desc }, take: 1) { id status version completeness completedAt eligibilityChecks { id status resultNote } tasks(where: { status: { in: ["open", "in_progress"] } }) { id title } }
    }
    benefitFacts(where: { coverage: { patient: { id: { equals: $id } } } }, orderBy: { createdAt: desc }, take: 200) { id field appliesTo valueJson isUnknown source observedAt coverage { id } }
    estimates(where: { patient: { id: { equals: $id } } }, orderBy: [{ computedAt: desc }, { createdAt: desc }], take: 200) { id coverageStatus confidence insuranceMinor secondaryInsuranceMinor patientMinor reasons coverage { id } planItem { id } }
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
        // Newest answer first: the payer being unable to say overrides an older value (the estimator reads it the same way).
        for (const f of facts) { const key = `${f.field}|${JSON.stringify(f.appliesTo)}`; if (!latest.has(key)) latest.set(key, f); }
        const rows = [...latest.values()].sort((a, b) => a.field.localeCompare(b.field));
        return (
          <Section key={c.id} title={`${title(c.ordinal)} · ${c.subscriber?.plan?.payer?.name ?? ''}`}>
            <TitleLine status={c.verificationLevel}>{null}</TitleLine>
            <div className="grid min-w-0 grid-cols-2 gap-4 break-words rounded-lg border p-4 sm:grid-cols-4">
              <Stat name="Group" value={c.subscriber?.plan?.groupName ?? '—'} />
              <Stat name="Member ID" value={c.subscriber?.memberIdLast4 ? `•••• ${c.subscriber.memberIdLast4}` : '—'} />
              <Stat name="Plan type" value={title(c.subscriber?.plan?.planType)} />
              <Stat name="Since" value={calendarDate(c.effectiveFrom, 'day') || '—'} />
            </div>
            {c.verificationLevel === 'verified_electronic' ? <p className="min-w-0 break-words text-xs text-muted-foreground">The payer answered electronically. Finish the verification once the questions below are asked.</p> : null}
            {v?.eligibilityChecks?.length ? <p className="min-w-0 break-words text-xs text-muted-foreground">Electronic check: {title(v.eligibilityChecks[0].status).toLowerCase()}{v.eligibilityChecks[0].resultNote ? ` · ${v.eligibilityChecks[0].resultNote}` : ''}</p> : null}
            {rows.length ? rows.map((f) => (
              <Row key={f.id} className="flex-nowrap items-start">
                <span className="min-w-0 flex-1"><span className="font-medium">{fieldName(f.field)}</span>{categoryText(f.appliesTo) ? <Meta>{categoryText(f.appliesTo)}</Meta> : null}</span>
                <span className="min-w-0 max-w-[55%] shrink-0 text-right"><span className={f.isUnknown ? 'text-amber-700' : ''}>{factText(f)}</span><br /><Meta>{title(f.source)} · {calendarDate(f.observedAt)}</Meta></span>
              </Row>
            )) : <Empty>No benefits recorded. Insurance is not assumed to pay anything.</Empty>}
            {v?.tasks?.length ? <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Still to ask: {v.tasks.map((t: any) => STILL_TO_ASK[t.title] ?? t.title).join('; ')}</div> : null}
            <div className="flex flex-wrap gap-2">
              {c.status === 'active' && d.patient.homeLocation?.id ? <ActionButton op="buildClaim" vars={{ patientId: id, coverageId: c.id, locationId: d.patient.homeLocation.id, kind: c.ordinal === 'primary' ? 'original' : c.ordinal === 'secondary' ? 'secondary' : 'tertiary' }} paths={paths}>Bill finished work</ActionButton> : null}
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
                  { name: 'method', label: 'Coordination', kind: 'select', options: [{ value: '', label: '—' }, ...options([...COB_METHODS])] },
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
              return e ? <EstimateLine key={i.id} e={e} name={name} currentCoverageIds={new Set(current.map((c) => c.id))} /> : <Row key={i.id}><span>{name}</span><Meta>Not estimated · {money(i.feeMinor)} fee</Meta></Row>;
            })}
          </div>
        )) : <Empty>No open treatment plan to estimate.</Empty>}
      </Section>
      <Section title="Treatment done elsewhere">
        {(d.outsideHistories as any[]).length ? (d.outsideHistories as any[]).map((h) => <Row key={h.id}><span>{h.codeText}</span><Meta>{calendarDate(h.dateOfService, 'day')} · {title(h.source)}</Meta></Row>) : <Empty>None recorded. Frequency limits only count treatment done here.</Empty>}
        <details><summary className="cursor-pointer text-sm font-medium">Add outside treatment</summary>
          <div className="pt-2"><CommandForm op="addOutsideHistory" submitLabel="Save" paths={paths} columns={2} fixed={{ patientId: id }} fields={[
            { name: 'codeText', label: 'Treatment', kind: 'text', required: true },
            { name: 'dateOfService', label: 'Date', kind: 'date', required: true },
            { name: 'frequencyGroup', label: 'Counts toward', kind: 'select', options: [{ value: '', label: 'Nothing in particular' }, { value: 'recall', label: 'Cleanings and exams' }] },
            { name: 'source', label: 'Source', kind: 'select', options: options(SOURCES), required: true, defaultValue: 'patient_reported' },
          ]} /></div>
        </details>
      </Section>
      {ended.length ? <Section title="Ended coverage">{ended.map((c) => <Row key={c.id}><span>{c.subscriber?.plan?.payer?.name} · {title(c.ordinal)}</span><Meta>{c.effectiveTo ? '' : title(c.status)}{c.effectiveTo ? ` · ended ${calendarDate(c.effectiveTo, 'day')}` : ''}</Meta></Row>)}</Section> : null}
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
