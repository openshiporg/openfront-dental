import { q } from '../../lib/server';
import { money, title, calendarDate } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, TitleLine } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';

/** Fee schedules: versions are drafted, then published by a second person. A published version never changes. */
export default async function FeesPage({ searchParams }: { searchParams?: Promise<{ version?: string }> }) {
  const sp = (await searchParams) ?? {};
  const d = await q<any>(`{
    feeSchedules(orderBy: { name: asc }) { id name kind isDefault versions(orderBy: { effectiveFrom: desc }) { id label status version effectiveFrom publishedAt } }
    procedureCodes(where: { effectiveTo: { equals: null } }, orderBy: { code: asc }, take: 200) { id code nomenclature }
  }`);
  const schedules = d.feeSchedules as any[];
  const first = schedules.flatMap((s) => s.versions)[0];
  const versionId = sp.version ?? first?.id;
  const selected = versionId ? schedules.flatMap((s) => s.versions.map((v: any) => ({ ...v, schedule: s }))).find((v) => v.id === versionId) : null;
  const fees = selected ? (await q<any>(`query F($v: ID!) { fees(where: { feeVersion: { id: { equals: $v } } }, orderBy: { code: { code: asc } }, take: 300) { id amountMinor copayMinor code { code nomenclature } } }`, { v: selected.id })).fees as any[] : [];
  const paths = ['/dashboard/platform/fees'];
  return (
    <Page title="Fee schedules">
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Section title="Schedules">
          {schedules.map((s) => (
            <div key={s.id} className="border-b py-2 last:border-b-0">
              <div className="text-sm font-medium">{s.name}{s.isDefault ? <Meta> · default</Meta> : null}</div>
              <Meta>{title(s.kind)}</Meta>
              {(s.versions as any[]).map((v) => <Row key={v.id} href={`/dashboard/platform/fees?version=${v.id}`}><TitleLine status={v.status}><span className={v.id === selected?.id ? 'font-semibold' : ''}>{v.label}</span></TitleLine><Meta>from {calendarDate(v.effectiveFrom, 'date')}</Meta></Row>)}
              <details className="pt-1"><summary className="cursor-pointer text-xs font-medium">New version</summary>
                <div className="pt-2"><CommandForm op="createFeeVersion" submitLabel="Create draft" paths={paths} columns={1} fixed={{ scheduleId: s.id }} fields={[{ name: 'label', label: 'Label', kind: 'text', required: true }, { name: 'effectiveFrom', label: 'Effective from', kind: 'date', required: true }]} /></div></details>
            </div>
          ))}
          <details><summary className="cursor-pointer text-sm font-medium">New schedule</summary>
            <div className="pt-2"><CommandForm op="openFeeSchedule" submitLabel="Create" paths={paths} columns={1} fields={[{ name: 'name', label: 'Name', kind: 'text', required: true }, { name: 'kind', label: 'Kind', kind: 'select', options: [{ value: 'office_ucr', label: 'Office (UCR)' }, { value: 'ppo', label: 'In-network plan' }, { value: 'membership', label: 'Membership' }, { value: 'other', label: 'Other' }] }]} /></div></details>
        </Section>
        <Section title={selected ? `${selected.schedule.name} · ${selected.label}` : 'Fees'} aside={selected ? <TitleLine status={selected.status}>{null}</TitleLine> : null}>
          {selected?.status === 'draft' ? (
            <>
              <ActionButton op="requestFeePublish" vars={{ versionId: selected.id, expectedVersion: selected.version }} confirm="Ask a second person to approve publishing this version?" paths={[`/dashboard/platform/fees`]}>Request publish</ActionButton>
              <CommandForm op="setFee" submitLabel="Set fee" paths={[`/dashboard/platform/fees`]} columns={3} shape="feeDollars" fixed={{ versionId: selected.id }}
                fields={[{ name: 'codeId', label: 'Procedure', kind: 'select', options: (d.procedureCodes as any[]).map((c) => ({ value: c.id, label: `${c.code} · ${c.nomenclature}` })), required: true }, { name: 'dollars', label: 'Fee (dollars)', kind: 'text', required: true, placeholder: '215.00' }]} />
            </>
          ) : selected ? <Meta>Published versions are read-only. Start a new version to change fees.</Meta> : null}
          {fees.length ? fees.map((f) => <Row key={f.id}><span className="min-w-0"><span className="font-mono text-xs text-muted-foreground">{f.code.code}</span> {f.code.nomenclature}</span><span className="font-medium">{money(f.amountMinor)}</span></Row>) : <Empty>{selected ? 'No fees in this version yet.' : 'Create a schedule to begin.'}</Empty>}
        </Section>
      </div>
    </Page>
  );
}
