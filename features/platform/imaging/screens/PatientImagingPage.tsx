import { notFound } from 'next/navigation';
import { q, practiceTimeZone } from '../../lib/server';
import { when, title, chartLabel } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, TitleLine } from '../../components/ui';
import { ActionButton, summaryClass } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';
import { IMAGING_STATUS_TEXT } from '../../lib/adapterText';

const KINDS: Record<string, string> = { bitewing: 'Bitewing', periapical: 'Periapical', fmx: 'Full-mouth series', panoramic: 'Panoramic', ceph: 'Cephalometric', cbct: '3D scan (CBCT)', intraoral_photo: 'Photo inside the mouth', extraoral_photo: 'Photo of the face', scan_stl: 'Digital impression' };

/** A patient's images and the findings outside readers have handed over. Images are taken in the imaging software; here the office records that a study exists. A finding is a note to look at and never changes the chart. */
export default async function PatientImagingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tz, d] = await Promise.all([practiceTimeZone(), q<any>(`query($id: ID!) {
    patient(where: { id: $id }) { id chartNumber firstName lastName }
    imagingStudies(where: { patient: { id: { equals: $id } } }, orderBy: { acquiredAt: desc }, take: 100) { id modality teeth acquiredAt source status }
    externalFindings(where: { patient: { id: { equals: $id } } }, orderBy: { createdAt: desc }, take: 100) { id vendor device modelVersion clearanceRef findingType tooth surfaces confidence status dismissReason version study { id } }
  }`, { id })]);
  const p = d.patient; if (!p) notFound();
  const studies = d.imagingStudies as any[]; const findings = d.externalFindings as any[];
  const paths = [`/dashboard/platform/patients/${id}/imaging`];
  const studyOptions = studies.filter((s) => s.status !== 'entered_in_error').map((s) => ({ value: s.id, label: `${KINDS[s.modality] ?? title(s.modality)} · ${when(s.acquiredAt, tz, 'date')}` }));
  return (
    <Page title={`${p.firstName} ${p.lastName} · Images`} crumbs={[{ label: 'Patients', href: '/dashboard/platform/patients' }, { label: chartLabel(p.chartNumber), href: `/dashboard/platform/patients/${id}` }]}>
      <Section title="Images" aside={<Meta>{IMAGING_STATUS_TEXT}</Meta>}>
        {studies.length ? studies.map((s) => (
          <Row key={s.id}>
            <span className="min-w-0 flex-1">
              <TitleLine status={s.status === 'entered_in_error' ? 'entered_in_error' : undefined}>{KINDS[s.modality] ?? title(s.modality)}</TitleLine>
              <Meta>{when(s.acquiredAt, tz, 'date')}{(s.teeth as string[])?.length ? ` · teeth ${(s.teeth as string[]).join(', ')}` : ''} · recorded by hand</Meta>
            </span>
          </Row>
        )) : <Empty>No images recorded for this patient.</Empty>}
        <details><summary className={summaryClass}>Record an image taken today</summary>
          <div className="pt-2"><CommandForm op="recordManualStudy" submitLabel="Record image" paths={paths} columns={2} fixed={{ patientId: id }} fields={[
            { name: 'modality', label: 'Kind of image', kind: 'select', required: true, options: Object.entries(KINDS).map(([value, label]) => ({ value, label })) },
            { name: 'teeth', label: 'Teeth', kind: 'text', hint: 'Numbers separated by commas, such as 3, 4.' },
          ]} /></div>
        </details>
      </Section>
      <Section title="Findings from outside readers">
        {findings.length ? findings.map((f) => (
          <Row key={f.id} className="items-start">
            <span className="min-w-0 flex-1">
              <TitleLine status={f.status}>{f.findingType}{f.tooth ? ` · tooth ${f.tooth}` : ''}</TitleLine>
              <Meta>{f.vendor ? `${f.vendor} · ` : ''}{f.device}, version {f.modelVersion}{f.confidence ? ` · confidence ${Number(f.confidence).toFixed(2)}` : ''}{f.clearanceRef ? ` · clearance ${f.clearanceRef}` : ''}</Meta>
              {f.dismissReason ? <Meta>Dismissed: {f.dismissReason}</Meta> : null}
              {f.status === 'received' || f.status === 'shown' ? (
                <span className="mt-1 flex flex-wrap items-start gap-2">
                  <ActionButton op="decideExternalFinding" vars={{ findingId: f.id, expectedVersion: f.version, decision: 'accepted' }} paths={paths}>Accept</ActionButton>
                  <details><summary className={summaryClass}>Dismiss</summary><div className="pt-2"><CommandForm op="decideExternalFinding" submitLabel="Dismiss" paths={paths} columns={1} fixed={{ findingId: f.id, expectedVersion: f.version, decision: 'dismissed' }} fields={[{ name: 'reason', label: 'Why', kind: 'textarea', required: true }]} /></div></details>
                </span>
              ) : null}
            </span>
          </Row>
        )) : <Empty>No findings from outside readers. Accepting a finding does not change the chart.</Empty>}
        {studyOptions.length ? (
          <details><summary className={summaryClass}>Enter a finding by hand</summary>
            <div className="pt-2"><CommandForm op="receiveExternalFinding" submitLabel="Save finding" paths={paths} columns={2} fields={[
              { name: 'studyId', label: 'Image', kind: 'select', required: true, options: studyOptions },
              { name: 'findingType', label: 'What was found', kind: 'text', required: true },
              { name: 'device', label: 'Device or reader', kind: 'text', required: true },
              { name: 'modelVersion', label: 'Version', kind: 'text', required: true },
              { name: 'vendor', label: 'Company', kind: 'text' },
              { name: 'tooth', label: 'Tooth', kind: 'text' },
              { name: 'confidence', label: 'Confidence (0 to 1)', kind: 'text', placeholder: '0.85' },
            ]} /></div>
          </details>
        ) : null}
      </Section>
    </Page>
  );
}
