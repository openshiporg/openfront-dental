import { q } from '../../lib/server';
import { money, title, when } from '../../lib/format';
import { Section, Row, Empty, Meta, Stat, TitleLine } from '../../components/ui';
import { ActionButton, PillTrack } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';

/** Treatment plans: phases, priorities, frozen versions with a content hash, presentation and signed acceptance. */
export async function PlansTab({ id, paths }: { id: string; paths: string[] }) {
  const d = await q<any>(`query Plans($id: ID!) {
    treatmentPlans(where: { patient: { id: { equals: $id } } }, orderBy: { createdAt: desc }) {
      id ref title status version currentVersion { id number contentHash frozenAt phases
        items(orderBy: { sortOrder: asc }) { id phaseKey priority feeMinor selected refused chartEntry { id status tooth surfaces code { code nomenclature patientFriendlyName } } } }
    }
    chartEntries(where: { patient: { id: { equals: $id } }, status: { in: ["diagnosed"] }, kind: { equals: "procedure" } }, take: 50) { id tooth surfaces code { code patientFriendlyName nomenclature } }
  }`, { id }).catch(() => ({ treatmentPlans: [], chartEntries: [] }));
  const plans = d.treatmentPlans as any[];
  const diagnosed = d.chartEntries as any[];
  return (
    <>
      {plans.length ? plans.map((plan) => {
        const v = plan.currentVersion;
        const items = (v?.items ?? []) as any[];
        const total = items.reduce((s, i) => s + BigInt(i.feeMinor ?? 0), 0n);
        const frozen = !!v?.frozenAt;
        return (
          <Section key={plan.id} title={plan.ref} keepTitleOnOneLine aside={<TitleLine status={plan.status}><span className="text-sm font-medium">{plan.title}</span></TitleLine>}>
            <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4">
              <Stat name="Version" value={v?.number ?? '—'} />
              <Stat name="Items" value={items.length} />
              <Stat name="Total fee" value={money(total.toString())} />
              <Stat name="State" value={frozen ? 'Frozen' : 'Editable'} />
            </div>
            {v?.contentHash ? <Meta>Presented {when(v.frozenAt, undefined, 'dayTime')}. A presented version never changes; revising makes a new one.</Meta> : null}
            {items.map((i) => (
              <Row key={i.id}>
                <span className="min-w-0"><TitleLine status={i.chartEntry?.status}><span className="font-medium">{i.chartEntry?.code?.patientFriendlyName || i.chartEntry?.code?.nomenclature}</span></TitleLine><Meta>{i.chartEntry?.code?.code}{i.chartEntry?.tooth ? ` · tooth ${i.chartEntry.tooth}${i.chartEntry.surfaces ? ` ${i.chartEntry.surfaces}` : ''}` : ''} · {title(i.phaseKey)} · {title(i.priority)}</Meta></span>
                <span className="flex items-center gap-2"><Meta>{money(i.feeMinor)}</Meta>
                  {!frozen ? <ActionButton op="updatePlanItem" vars={{ itemId: i.id, priority: i.priority === 'urgent' ? 'recommended' : 'urgent' }} paths={paths}>{i.priority === 'urgent' ? 'Make routine' : 'Make urgent'}</ActionButton> : null}</span>
              </Row>
            ))}
            <PillTrack>
              {plan.status === 'draft' ? <ActionButton op="presentTreatmentPlan" vars={{ planId: plan.id, expectedVersion: plan.version }} confirm="Present this plan? The version is frozen and its hash recorded." paths={paths}>Present to patient</ActionButton> : null}
              {['presented', 'partially_accepted', 'declined'].includes(plan.status) ? <ActionButton op="reviseTreatmentPlan" vars={{ planId: plan.id }} ask="What is changing in the new version?" paths={paths}>Revise (new version)</ActionButton> : null}
              {['presented', 'partially_accepted'].includes(plan.status) ? <ActionButton op="declineTreatmentPlan" vars={{ planId: plan.id, expectedVersion: plan.version }} ask="Reason the patient declined" paths={paths}>Patient declined</ActionButton> : null}
            </PillTrack>
            {['presented', 'partially_accepted'].includes(plan.status) && frozen ? (
              <details>
                <summary className="cursor-pointer text-sm font-medium">Record acceptance</summary>
                <div className="pt-3">
                  <CommandForm op="acceptTreatmentPlan" shape="acceptItems" submitLabel="Sign acceptance" paths={paths} columns={2} fixed={{ planId: plan.id, expectedVersion: plan.version, versionHash: v.contentHash }}
                    fields={[
                      ...items.filter((i) => !['accepted', 'scheduled', 'completed', 'posted'].includes(i.chartEntry?.status)).map((i) => ({ name: `item_${i.id}`, label: `${i.chartEntry?.code?.patientFriendlyName || i.chartEntry?.code?.nomenclature} · ${money(i.feeMinor)}`, kind: 'checkbox' as const, defaultValue: true })),
                      { name: 'signer', label: 'Signed by', kind: 'select', options: [{ value: 'patient', label: 'Patient' }, { value: 'guardian', label: 'Parent or guardian' }, { value: 'representative', label: 'Representative' }] },
                      { name: 'signerName', label: 'Signer’s name', kind: 'text', required: true },
                      { name: 'password', label: 'Your password (staff witness)', kind: 'password', required: true },
                    ]} />
                </div>
              </details>
            ) : null}
          </Section>
        );
      }) : <Section title="Treatment plans"><Empty>No treatment plans.</Empty></Section>}
      <Section title="Start a plan">
        {diagnosed.length ? (
          <CommandForm op="buildTreatmentPlan" shape="planFromEntries" submitLabel="Create plan" paths={paths} columns={1} fixed={{ patientId: id }}
            fields={[
              { name: 'title', label: 'Plan title', kind: 'text', required: true },
              ...diagnosed.map((e) => ({ name: `entry_${e.id}`, label: `${e.code?.patientFriendlyName || e.code?.nomenclature}${e.tooth ? ` · tooth ${e.tooth}${e.surfaces ? ` ${e.surfaces}` : ''}` : ''}`, kind: 'checkbox' as const, defaultValue: true })),
            ]} />
        ) : <Empty>Chart a diagnosed procedure first; plans are built from diagnosed work.</Empty>}
      </Section>
    </>
  );
}
