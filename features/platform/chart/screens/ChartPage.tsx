import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q } from '../../lib/server';
import { money, calendarDate, title, options, when, chartLabel} from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Stat, Tabs, TitleLine } from '../../components/ui';
import { ActionButton, PillTrack } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';
import { Legend, Odontogram, toothLabel, type ChartMark, type Numbering } from '../Odontogram';
import { PerioTab } from './PerioTab';
import { NotesTab } from './NotesTab';
import { HistoryTab } from './HistoryTab';
import { PlansTab } from './PlansTab';

const TABS = [['chart', 'Chart'], ['perio', 'Perio'], ['notes', 'Notes'], ['history', 'Medical history'], ['plans', 'Treatment plans']] as const;
const NUMBERINGS: Numbering[] = ['universal', 'fdi', 'palmer'];

type Search = { tab?: string; n?: string; d?: string; tooth?: string; exam?: string };

/**
 * Patient clinical record (BUILD-PLAN Phase 2): odontogram and progress notes, perio, notes with
 * signing, medical history review, and treatment plans. Reads are PHI reads and are audited by the API.
 */
export default async function ChartPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Search> }) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as string) : 'chart';
  const numbering: Numbering = NUMBERINGS.includes(sp.n as Numbering) ? (sp.n as Numbering) : 'universal';
  const dentition = sp.d === 'primary' ? 'primary' : 'permanent';
  const base = `/dashboard/platform/patients/${id}/chart`;
  const href = (o: Partial<Search>) => `${base}?${new URLSearchParams(Object.entries({ tab, n: numbering, d: dentition, ...o }).filter(([, v]) => v) as [string, string][]).toString()}`;

  const head = await q<any>(`query Head($id: ID!) {
    patient(where: { id: $id }) { id chartNumber firstName lastName preferredName dateOfBirth homeLocation { id code } alerts(where: { endedAt: { equals: null } }) { id kind severity text } }
    providerProfiles(where: { isActive: { equals: true } }, orderBy: { displayName: asc }) { id displayName abbreviation providerType }
  }`, { id });
  const p = head.patient;
  if (!p) notFound();
  const name = `${p.preferredName || p.firstName} ${p.lastName}`;
  const providers = head.providerProfiles as any[];
  const paths = [base];

  return (
    <Page title={`${name} · Clinical record`} crumbs={[{ label: 'Patients', href: '/dashboard/platform/patients' }, { label: name, href: `/dashboard/platform/patients/${id}` }]}>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-mono text-muted-foreground">{chartLabel(p.chartNumber)}</span>
        <span className="text-muted-foreground">Born {calendarDate(p.dateOfBirth, 'date')}</span>
        <Link className="hover:underline" href={`/dashboard/platform/patients/${id}`}>Back to overview</Link>
      </div>
      {(p.alerts as any[]).length ? (
        <div className="space-y-1 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {(p.alerts as any[]).map((a) => <div key={a.id}><span className="font-medium">{title(a.kind)}</span> · {a.text}</div>)}
        </div>
      ) : null}
      <Tabs active={tab} items={TABS.map(([key, label]) => ({ key, label, href: href({ tab: key }) }))} />
      {tab === 'chart' ? <ChartTab id={id} p={p} providers={providers} numbering={numbering} dentition={dentition} tooth={sp.tooth} href={href} paths={paths} /> : null}
      {tab === 'perio' ? <PerioTab id={id} p={p} providers={providers} examId={sp.exam} href={href} paths={paths} /> : null}
      {tab === 'notes' ? <NotesTab id={id} paths={paths} /> : null}
      {tab === 'history' ? <HistoryTab id={id} paths={paths} /> : null}
      {tab === 'plans' ? <PlansTab id={id} paths={paths} /> : null}
    </Page>
  );
}

async function ChartTab({ id, p, providers, numbering, dentition, tooth, href, paths }: { id: string; p: any; providers: any[]; numbering: Numbering; dentition: 'permanent' | 'primary'; tooth?: string; href: (o: Partial<Search>) => string; paths: string[] }) {
  const d = await q<any>(`query Chart($id: ID!) {
    chartEntries(where: { patient: { id: { equals: $id } }, status: { notIn: ["deleted_in_error", "corrected"] } }, orderBy: [{ createdAt: asc }], take: 400) {
      id kind tooth surfaces area quadrant arch status conditionStatus version dateOfService feeMinor units
      code { id code nomenclature patientFriendlyName } condition { id label } provider { abbreviation } appointment { id }
    }
    procedureCodes(where: { effectiveTo: { equals: null } }, orderBy: { code: asc }, take: 200) { id code nomenclature patientFriendlyName areaRule requiresSurfaces maxSurfaces }
    fees(where: { feeVersion: { status: { equals: "published" }, schedule: { isDefault: { equals: true } } } }, take: 300) { amountMinor code { id } }
    conditionTypes(where: { isActive: { equals: true } }, orderBy: { label: asc }) { id label areaRule }
    appointments(where: { patient: { id: { equals: $id } }, status: { in: ["scheduled", "confirmed", "arrived", "seated", "ready_for_checkout"] } }, orderBy: { startsAt: asc }, take: 10) { id ref startsAt }
  }`, { id });
  const entries = d.chartEntries as any[];
  const marks: ChartMark[] = entries
    .filter((e) => e.tooth)
    .map((e) => ({ id: e.id, kind: e.kind, tooth: e.tooth, surfaces: e.surfaces ?? '', status: e.status, conditionStatus: e.conditionStatus, label: e.kind === 'condition' ? e.condition?.label ?? 'Condition' : e.code?.patientFriendlyName || e.code?.nomenclature || 'Procedure' }));
  const selected = tooth && marks.some((m) => m.tooth === tooth) ? tooth : tooth;
  const forTooth = selected ? entries.filter((e) => e.tooth === selected) : [];
  const feeByCode = new Map((d.fees as any[]).map((f) => [f.code?.id, f.amountMinor]));
  const feeOf = (e: any) => e.feeMinor ?? feeByCode.get(e.code?.id) ?? 0;
  const open = entries.filter((e) => e.kind === 'procedure' && !['posted', 'existing_current', 'existing_other'].includes(e.status));
  const done = entries.filter((e) => e.kind === 'procedure' && ['posted', 'existing_current', 'existing_other'].includes(e.status));
  const conditions = entries.filter((e) => e.kind === 'condition' && e.conditionStatus !== 'resolved');
  const codeOptions = (d.procedureCodes as any[]).map((c) => ({ value: c.id, label: `${c.code} · ${c.patientFriendlyName || c.nomenclature}` }));
  const toothName = (e: any) => (e.tooth ? `Tooth ${toothLabel(e.tooth, numbering)}${e.surfaces ? ` ${e.surfaces}` : ''}` : e.quadrant ? `Quadrant ${e.quadrant}` : e.arch ? `${title(e.arch)} arch` : 'Whole mouth');

  return (
    <>
      <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4">
        <Stat name="Planned work" value={open.length} />
        <Stat name="Planned fees" value={money(open.reduce((s, e) => s + BigInt(feeOf(e)), 0n).toString())} />
        <Stat name="Completed" value={done.length} />
        <Stat name="Active conditions" value={conditions.length} />
      </div>
      <Section title="Tooth chart" aside={
        <div className="flex flex-wrap items-center gap-2">
          <PillTrack>{(['universal', 'fdi', 'palmer'] as const).map((n) => <Link key={n} href={href({ n })} className={`inline-flex h-8 items-center rounded-md px-3 text-sm font-medium ${n === numbering ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{n === 'fdi' ? 'FDI' : title(n)}</Link>)}</PillTrack>
          <PillTrack>{(['permanent', 'primary'] as const).map((n) => <Link key={n} href={href({ d: n })} className={`inline-flex h-8 items-center rounded-md px-3 text-sm font-medium ${n === dentition ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{title(n)}</Link>)}</PillTrack>
        </div>
      }>
        <Odontogram marks={marks} numbering={numbering} dentition={dentition} selected={selected} hrefFor={(t) => href({ tooth: t })} />
        <Legend />
        {selected ? (
          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between"><span className="font-medium">Tooth {toothLabel(selected, numbering)} <span className="text-xs text-muted-foreground">(Universal {selected})</span></span><Link className="text-sm hover:underline" href={href({ tooth: '' })}>Close</Link></div>
            {forTooth.length ? forTooth.map((e) => <Row key={e.id}><TitleLine status={e.status}><span>{e.kind === 'condition' ? e.condition?.label : e.code?.patientFriendlyName || e.code?.nomenclature}{e.surfaces ? ` · ${e.surfaces}` : ''}</span></TitleLine><Meta>{e.code?.code ?? ''}</Meta></Row>) : <Empty>Nothing charted on this tooth.</Empty>}
            <div className="grid gap-4 pt-3 lg:grid-cols-2">
              <CommandForm op="addChartProcedure" shape="chartSite" submitLabel="Add procedure" paths={paths} fixed={{ patientId: id, locationId: p.homeLocation?.id }} columns={2}
                fields={[
                  { name: 'codeId', label: 'Procedure', kind: 'select', options: codeOptions, required: true },
                  { name: 'tooth', label: 'Tooth (Universal)', kind: 'text', defaultValue: selected, required: true },
                  { name: 'surfaces', label: 'Surfaces', kind: 'text', placeholder: 'e.g. MOD', hint: 'Order is set for you (M O D B I F L).' },
                  { name: 'status', label: 'Add as', kind: 'select', options: [{ value: 'diagnosed', label: 'Diagnosed' }, { value: 'planned', label: 'Planned' }, { value: 'existing_current', label: 'Existing' }] },
                ]} />
              <CommandForm op="addChartCondition" shape="chartSite" submitLabel="Add condition" paths={paths} fixed={{ patientId: id, locationId: p.homeLocation?.id }} columns={2}
                fields={[
                  { name: 'conditionId', label: 'Condition', kind: 'select', options: (d.conditionTypes as any[]).map((c) => ({ value: c.id, label: c.label })), required: true },
                  { name: 'tooth', label: 'Tooth (Universal)', kind: 'text', defaultValue: selected, required: true },
                  { name: 'surfaces', label: 'Surfaces', kind: 'text' },
                ]} />
            </div>
          </div>
        ) : <p className="text-sm text-muted-foreground">Select a tooth to chart a procedure or condition. Teeth are stored by Universal number and shown in the numbering you pick.</p>}
      </Section>

      <Section title="Open work">
        {open.length ? open.map((e) => (
          <Row key={e.id}>
            <span className="min-w-0"><TitleLine status={e.status}><span className="font-medium">{e.code?.patientFriendlyName || e.code?.nomenclature}</span></TitleLine><Meta>{e.code?.code} · {toothName(e)} · {money(String(feeOf(e)))}</Meta></span>
            <PillTrack>
              {['diagnosed', 'planned'].includes(e.status) ? <ActionButton op="acceptChartEntry" vars={{ chartEntryId: e.id, expectedVersion: e.version }} paths={paths}>Accept</ActionButton> : null}
              {e.status === 'accepted' && (d.appointments as any[]).length ? <ActionButton op="scheduleChartEntry" vars={{ chartEntryId: e.id, expectedVersion: e.version, appointmentId: d.appointments[0].id }} paths={paths}>Schedule at next visit</ActionButton> : null}
              {['accepted', 'scheduled'].includes(e.status) ? <ActionButton op="completeProcedure" vars={{ chartEntryId: e.id, expectedVersion: e.version, providerId: providers.find((x) => x.providerType === 'dentist')?.id }} confirm="Complete this procedure and post the charge? The fee is frozen at today’s schedule." paths={paths}>Complete and post</ActionButton> : null}
              {['diagnosed', 'planned', 'accepted'].includes(e.status) ? <ActionButton op="removePlannedEntry" vars={{ chartEntryId: e.id, expectedVersion: e.version }} ask="Why is this removed?" paths={paths}>Remove</ActionButton> : null}
            </PillTrack>
          </Row>
        )) : <Empty>No open work.</Empty>}
      </Section>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Section title="Completed and existing">
          {done.length ? done.slice().reverse().map((e) => (
            <Row key={e.id}>
              <span className="min-w-0"><TitleLine status={e.status}><span>{e.code?.patientFriendlyName || e.code?.nomenclature}</span></TitleLine><Meta>{e.code?.code} · {toothName(e)}{e.provider ? ` · ${e.provider.abbreviation}` : ''}</Meta></span>
              <span className="flex items-center gap-3"><Meta>{e.dateOfService ? calendarDate(e.dateOfService, 'date') : ''} {e.feeMinor ? money(e.feeMinor) : ''}</Meta>
                {e.status === 'posted' ? <ActionButton op="correctProcedure" vars={{ chartEntryId: e.id, expectedVersion: e.version }} ask="What was wrong? The charge is reversed and a corrected entry is kept." paths={paths}>Correct</ActionButton> : null}</span>
            </Row>
          )) : <Empty>Nothing completed yet.</Empty>}
        </Section>
        <Section title="Conditions">
          {conditions.length ? conditions.map((e) => (
            <Row key={e.id}>
              <span className="min-w-0"><TitleLine status={e.conditionStatus}><span>{e.condition?.label}</span></TitleLine><Meta>{toothName(e)}</Meta></span>
              <PillTrack>
                <ActionButton op="setConditionStatus" vars={{ chartEntryId: e.id, expectedVersion: e.version, status: 'resolved' }} paths={paths}>Resolve</ActionButton>
                {e.conditionStatus !== 'watch' ? <ActionButton op="setConditionStatus" vars={{ chartEntryId: e.id, expectedVersion: e.version, status: 'watch' }} paths={paths}>Watch</ActionButton> : null}
              </PillTrack>
            </Row>
          )) : <Empty>No active conditions.</Empty>}
        </Section>
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium">Chart whole-mouth, quadrant or arch work</summary>
        <div className="pt-3">
          <CommandForm op="addChartProcedure" shape="chartMouth" submitLabel="Add procedure" paths={paths} fixed={{ patientId: id, locationId: p.homeLocation?.id }}
            fields={[
              { name: 'codeId', label: 'Procedure', kind: 'select', options: codeOptions, required: true },
              { name: 'quadrant', label: 'Quadrant', kind: 'select', options: [{ value: '', label: 'None' }, ...['UR', 'UL', 'LR', 'LL'].map((v) => ({ value: v, label: v }))] },
              { name: 'arch', label: 'Arch', kind: 'select', options: [{ value: '', label: 'None' }, { value: 'upper', label: 'Upper' }, { value: 'lower', label: 'Lower' }] },
              { name: 'status', label: 'Add as', kind: 'select', options: options(['diagnosed', 'planned', 'existing_current']) },
            ]} />
        </div>
      </details>
      <VitalsAndMeds id={id} paths={paths} />
    </>
  );
}

async function VitalsAndMeds({ id, paths }: { id: string; paths: string[] }) {
  const d = await q<any>(`query V($id: ID!) {
    vitalsReadings(where: { patient: { id: { equals: $id } } }, orderBy: { at: desc }, take: 3) { id systolic diastolic pulse asaClass at }
    medicationEntries(where: { patient: { id: { equals: $id } }, endedAt: { equals: null } }, orderBy: { name: asc }) { id name dose frequency }
  }`, { id });
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-2">
      <Section title="Vitals">
        {(d.vitalsReadings as any[]).length ? (d.vitalsReadings as any[]).map((v) => <Row key={v.id}><span>{v.systolic ?? '—'}/{v.diastolic ?? '—'} mmHg · pulse {v.pulse ?? '—'}{v.asaClass ? ` · ASA ${v.asaClass}` : ''}</span><Meta>{when(v.at, undefined, 'date')}</Meta></Row>) : <Empty>No readings.</Empty>}
        <details><summary className="cursor-pointer text-sm font-medium">Record a reading</summary>
          <div className="pt-3"><CommandForm op="recordVitals" shape="vitals" submitLabel="Save reading" paths={paths} fixed={{ patientId: id }} columns={2}
            fields={[{ name: 'systolic', label: 'Systolic', kind: 'number' }, { name: 'diastolic', label: 'Diastolic', kind: 'number' }, { name: 'pulse', label: 'Pulse', kind: 'number' }, { name: 'asaClass', label: 'ASA class', kind: 'select', options: [{ value: '', label: 'Not set' }, ...['I', 'II', 'III', 'IV'].map((v) => ({ value: v, label: v }))] }]} /></div>
        </details>
      </Section>
      <Section title="Current medications">
        {(d.medicationEntries as any[]).length ? (d.medicationEntries as any[]).map((m) => (
          <Row key={m.id}><span className="min-w-0"><span className="font-medium">{m.name}</span><Meta> {[m.dose, m.frequency].filter(Boolean).join(' · ')}</Meta></span><ActionButton op="endMedication" vars={{ medicationId: m.id }} paths={paths}>Stopped</ActionButton></Row>
        )) : <Empty>None recorded.</Empty>}
        <details><summary className="cursor-pointer text-sm font-medium">Add a medication</summary>
          <div className="pt-3"><CommandForm op="addMedication" submitLabel="Add" paths={paths} fixed={{ patientId: id }} columns={3}
            fields={[{ name: 'name', label: 'Medication', kind: 'text', required: true }, { name: 'dose', label: 'Dose', kind: 'text' }, { name: 'frequency', label: 'How often', kind: 'text' }]} /></div>
        </details>
      </Section>
    </div>
  );
}
