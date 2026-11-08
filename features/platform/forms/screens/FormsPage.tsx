import { q } from '../../lib/server';
import { when, title, chartLabel} from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Tabs, TitleLine } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';

const TABS = [['requests', 'Waiting to be signed'], ['consents', 'Signed consents'], ['templates', 'Form templates']] as const;

/** Forms and consents: templates with versions, requests to patients, signed submissions and consent withdrawal. */
export default async function FormsPage({ searchParams }: { searchParams?: Promise<{ tab?: string }> }) {
  const sp = (await searchParams) ?? {};
  const tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as string) : 'requests';
  const d = await q<any>(`{
    formRequests(where: { status: { in: ["requested", "opened"] } }, orderBy: { createdAt: desc }, take: 60) { id status version channel createdAt expiresAt patient { id chartNumber firstName lastName } template { id number template { title } } }
    consentRecords(orderBy: { signedAt: desc }, take: 60) { id signerName signerRole signedAt patient { id chartNumber firstName lastName } templateVersion { number template { title kind } } }
    consentActions(where: { kind: { in: ["withdraw", "expire"] } }, take: 200) { kind at reason record { id } }
    formTemplates(orderBy: { title: asc }) { id key kind title versions(orderBy: { number: desc }) { id number status requiresWitness contentHash body } }
    pendingCount: formRequestsCount(where: { status: { in: ["requested", "opened"] } })
    patients(where: { status: { equals: "active" } }, orderBy: { lastName: asc }, take: 120) { id chartNumber firstName lastName }
    users(orderBy: { name: asc }, take: 50) { id name }
  }`);
  const paths = ['/dashboard/platform/forms'];
  const templates = d.formTemplates as any[];
  const published = templates.flatMap((t) => (t.versions as any[]).filter((v) => v.status === 'published').slice(0, 1).map((v) => ({ value: v.id, label: t.title })));
  const who = (p: any) => `${p.firstName} ${p.lastName}`;
  return (
    <Page title="Forms and consents">
      <Tabs active={tab} items={TABS.map(([k, l]) => ({ key: k, label: l, href: `/dashboard/platform/forms?tab=${k}`, count: k === 'requests' ? d.pendingCount : k === 'consents' ? (d.consentRecords as any[]).length : templates.length }))} />
      {tab === 'requests' ? (
        <>
          <Section title="Send a form">
            <CommandForm op="requestForm" submitLabel="Send form" paths={paths} columns={2}
              fields={[
                { name: 'patientId', label: 'Patient', kind: 'select', options: (d.patients as any[]).map((p) => ({ value: p.id, label: `${who(p)} · ${chartLabel(p.chartNumber)}` })), required: true },
                { name: 'templateVersionId', label: 'Form', kind: 'select', options: published, required: true },
                { name: 'channel', label: 'How it is signed', kind: 'select', options: [{ value: 'in_office', label: 'In the office, on a tablet' }, { value: 'portal', label: 'Patient portal' }] },
              ]} />
          </Section>
          <Section title="Waiting to be signed">
            {(d.formRequests as any[]).length ? (d.formRequests as any[]).map((r) => (
              <div key={r.id} className="space-y-2 border-b py-3 text-sm last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2"><TitleLine status={r.status}><span className="font-medium">{r.template?.template?.title}</span><Meta>{who(r.patient)} · {chartLabel(r.patient.chartNumber)}</Meta></TitleLine><Meta>{when(r.createdAt, undefined, 'dayTime')}</Meta></div>
                <details><summary className="cursor-pointer font-medium">Record signature</summary>
                  <div className="pt-3"><CommandForm op="submitForm" shape="signForm" submitLabel="Record signed form" paths={paths} columns={2} fixed={{ requestId: r.id, expectedVersion: r.version }}
                    fields={[
                      { name: 'signerName', label: 'Signer’s name', kind: 'text', required: true },
                      { name: 'signerRole', label: 'Signer', kind: 'select', options: [{ value: 'patient', label: 'Patient' }, { value: 'guardian', label: 'Parent or guardian' }] },
                      { name: 'witnessUserId', label: 'Staff witness (if the form needs one)', kind: 'select', options: [{ value: '', label: 'None' }, ...(d.users as any[]).map((u) => ({ value: u.id, label: u.name }))] },
                      { name: 'password', label: 'Your password', kind: 'password', required: true },
                    ]} /></div></details>
              </div>
            )) : <Empty>Nothing waiting.</Empty>}
          </Section>
        </>
      ) : null}
      {tab === 'consents' ? (
        <Section title="Signed consents">
          {(d.consentRecords as any[]).length ? (d.consentRecords as any[]).map((c) => {
            const withdrawn = (d.consentActions as any[]).find((a) => a.record?.id === c.id);
            return (
              <Row key={c.id}>
                <span className="min-w-0"><TitleLine status={withdrawn ? 'revoked' : 'active'}><span className="font-medium">{c.templateVersion?.template?.title}</span></TitleLine><Meta>{who(c.patient)} · signed by {c.signerName} ({title(c.signerRole)}) · {when(c.signedAt, undefined, 'dayTime')}{withdrawn ? ` · withdrawn: ${withdrawn.reason}` : ''}</Meta></span>
                {!withdrawn ? <ActionButton op="withdrawConsent" vars={{ consentId: c.id }} ask="Why is this consent withdrawn? The signed record stays on file." paths={paths}>Withdraw</ActionButton> : null}
              </Row>
            );
          }) : <Empty>No signed consents.</Empty>}
        </Section>
      ) : null}
      {tab === 'templates' ? (
        <>
          {templates.map((t) => (
            <Section key={t.id} title={t.title} aside={<Meta>{title(t.kind)}</Meta>}>
              {(t.versions as any[]).map((v) => (
                <div key={v.id} className="space-y-1 border-b py-2 text-sm last:border-b-0">
                  <TitleLine status={v.status}><span className="font-medium">Version {v.number}</span>{v.requiresWitness ? <Meta>needs a witness</Meta> : null}</TitleLine>
                  <p className="break-words text-muted-foreground">{v.body}</p>
                </div>
              ))}
              <details><summary className="cursor-pointer text-sm font-medium">Publish a new version</summary>
                <div className="pt-3"><CommandForm op="publishFormVersion" submitLabel="Publish version" paths={paths} columns={1} fixed={{ templateKey: t.key }}
                  fields={[{ name: 'body', label: 'Text', kind: 'textarea', defaultValue: (t.versions as any[])[0]?.body, required: true }, { name: 'requiresWitness', label: 'Needs a staff witness', kind: 'checkbox', defaultValue: (t.versions as any[])[0]?.requiresWitness }]} /></div></details>
            </Section>
          ))}
        </>
      ) : null}
    </Page>
  );
}
