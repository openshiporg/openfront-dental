import { q } from '../../lib/server';
import { when, title, calendarDate } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Stat, Tabs, TitleLine } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';

const TABS = [['codes', 'Procedure codes'], ['imports', 'Code imports']] as const;

/** Procedure codes: the practice's OF- codes, licensed sets imported under the practice's own licence, and the import wizard. */
export default async function CodesPage({ searchParams }: { searchParams?: Promise<{ tab?: string; q?: string; system?: string }> }) {
  const sp = (await searchParams) ?? {};
  const tab = sp.tab === 'imports' ? 'imports' : 'codes';
  const search = (sp.q ?? '').replace(/["\\]/g, '').trim();
  const where = [`effectiveTo: { equals: null }`, sp.system ? `codeSystem: { key: { equals: "${sp.system.replace(/[^A-Za-z0-9_-]/g, '')}" } }` : '', search ? `OR: [{ code: { contains: "${search}", mode: insensitive } }, { nomenclature: { contains: "${search}", mode: insensitive } }]` : ''].filter(Boolean).join(', ');
  const d = await q<any>(`{
    procedureCodes(where: { ${where} }, orderBy: { code: asc }, take: 120) { id code nomenclature patientFriendlyName category areaRule requiresSurfaces maxSurfaces isPreventiveRecallTrigger codeSystem { key } }
    total: procedureCodesCount
    codeSystems(orderBy: { key: asc }) { id key name isLicensed }
    codeImportBatches(orderBy: { createdAt: desc }, take: 20) { id label editionYear fileName status version validationReport attestation attestedAt createdAt codeSystem { key } }
  }`);
  const batches = d.codeImportBatches as any[];
  const paths = ['/dashboard/platform/codes'];
  const href = (o: Record<string, string>) => `/dashboard/platform/codes?${new URLSearchParams({ tab, ...o }).toString()}`;
  return (
    <Page title="Procedure codes">
      <Tabs active={tab} items={TABS.map(([k, l]) => ({ key: k, label: l, href: href({ tab: k }), count: k === 'imports' ? batches.length : d.total }))} />
      {tab === 'codes' ? (
        <Section title="Codes" aside={<span className="text-xs text-muted-foreground">{(d.codeSystems as any[]).map((s) => `${s.key}${s.isLicensed ? ' (licensed)' : ''}`).join(' · ')}</span>}>
          <form className="flex flex-wrap gap-2" action="/dashboard/platform/codes">
            <input type="hidden" name="tab" value="codes" />
            <input name="q" defaultValue={search} placeholder="Search code or name" className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" />
            <button className="h-9 rounded-md border px-3 text-sm font-medium" type="submit">Search</button>
          </form>
          {(d.procedureCodes as any[]).length ? (d.procedureCodes as any[]).map((c) => (
            <Row key={c.id}>
              <span className="min-w-0"><span className="font-mono text-xs text-muted-foreground">{c.code}</span> <span className="font-medium">{c.nomenclature}</span><br /><Meta>{c.patientFriendlyName} · {title(c.category)} · {title(c.areaRule)}{c.requiresSurfaces ? ` · up to ${c.maxSurfaces ?? 5} surfaces` : ''}</Meta></span>
              <Meta>{c.codeSystem?.key}</Meta>
            </Row>
          )) : <Empty>No codes match.</Empty>}
        </Section>
      ) : (
        <>
          <Section title="Import a licensed code set">
            <p className="text-sm text-muted-foreground">The practice supplies its own licensed file. Paste rows with a header line (code, nomenclature, category, areaRule, effectiveFrom). Rows are checked, the licence is attested, and a second person approves activation. The file text is cleared once the codes are live.</p>
            <CommandForm op="uploadCodeImport" shape="csvRows" submitLabel="Check file" paths={paths} columns={2}
              fields={[
                { name: 'systemKey', label: 'Code system', kind: 'select', options: (d.codeSystems as any[]).filter((s) => s.isLicensed).map((s) => ({ value: s.key, label: s.name })), required: true },
                { name: 'label', label: 'Label', kind: 'text', required: true, placeholder: '2027 edition' },
                { name: 'editionYear', label: 'Edition year', kind: 'number', required: true },
                { name: 'fileName', label: 'File name', kind: 'text', placeholder: 'codes.csv' },
                { name: 'csv', label: 'File contents', kind: 'textarea', required: true },
              ]} />
          </Section>
          <Section title="Imports">
            {batches.length ? batches.map((b) => {
              const problems = (b.validationReport?.problems ?? []) as { row: number; message: string }[];
              return (
                <div key={b.id} className="space-y-2 border-b py-3 text-sm last:border-b-0">
                  <div className="flex flex-wrap items-center justify-between gap-2"><TitleLine status={b.status}><span className="font-medium">{b.label}</span><Meta>{b.codeSystem?.key} · {b.editionYear} · {b.fileName}</Meta></TitleLine><Meta>{when(b.createdAt, undefined, 'dayTime')}</Meta></div>
                  {problems.length ? <ul className="list-disc pl-5 text-xs text-red-700">{problems.slice(0, 5).map((pr) => <li key={pr.row}>Row {pr.row}: {pr.message}</li>)}</ul> : null}
                  {b.status === 'validated' ? (
                    <details><summary className="cursor-pointer font-medium">Attest the licence</summary>
                      <div className="pt-3"><CommandForm op="attestCodeLicence" submitLabel="Attest" paths={paths} columns={3} fixed={{ batchId: b.id, expectedVersion: b.version }}
                        fields={[{ name: 'licenceType', label: 'Licence type', kind: 'select', options: [{ value: 'practice_end_user', label: 'Practice end-user licence' }, { value: 'vendor_sublicence', label: 'Vendor sublicence' }] }, { name: 'licenceHolder', label: 'Licence holder', kind: 'text', required: true }, { name: 'agreementRef', label: 'Agreement reference', kind: 'text', required: true }]} /></div></details>
                  ) : null}
                  {b.status === 'attested' ? <ActionButton op="requestCodeActivation" vars={{ batchId: b.id, expectedVersion: b.version }} confirm="Ask a second person to approve activation of these codes?" paths={paths}>Request activation</ActionButton> : null}
                  {b.status === 'attested' ? <Meta>Activation needs a second person to approve it in Approvals.</Meta> : null}
                  {b.attestedAt ? <Meta>Attested {calendarDate(b.attestedAt, 'date')}</Meta> : null}
                </div>
              );
            }) : <Empty>No imports yet. The practice’s own OF- codes are already available.</Empty>}
          </Section>
        </>
      )}
    </Page>
  );
}
