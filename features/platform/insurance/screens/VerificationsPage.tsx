import Link from 'next/link';
import { q, practiceTimeZone } from '../../lib/server';
import { when, title } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, TitleLine } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';

/** Verification worklist: open checks, checks that ended unknown or rejected, and the questions a person still has to ask. */
export default async function VerificationsPage() {
  const [d, tz] = await Promise.all([q<any>(`{
    eligibilityChecks(where: { status: { in: ["queued", "sent", "unknown", "rejected", "error_retryable"] } }, orderBy: { createdAt: desc }, take: 50) {
      id status resultNote attempts createdAt coverage { id patient { id chartNumber firstName lastName } subscriber { plan { groupName payer { name } } } }
    }
    workTasks(where: { status: { in: ["open", "in_progress"] }, kind: { equals: "verification_checklist" } }, orderBy: { dueAt: asc }, take: 100) {
      id title taskKey dueAt verification { id coverage { id patient { id chartNumber firstName lastName } subscriber { plan { payer { name } } } } }
    }
    coverages(where: { verificationLevel: { equals: "unverified" }, status: { in: ["pending_verification", "active"] } }, orderBy: { createdAt: asc }, take: 50) {
      id patient { id chartNumber firstName lastName } subscriber { plan { groupName payer { name } } }
    }
  }`), practiceTimeZone()]);
  const checks = d.eligibilityChecks as any[];
  const tasks = d.workTasks as any[];
  const unverified = d.coverages as any[];
  const paths = ['/dashboard/platform/verifications'];
  const who = (p: any) => (p ? `${p.firstName} ${p.lastName}` : '—');
  const link = (p: any, text?: string) => (p ? <Link className="font-medium underline" href={`/dashboard/platform/patients/${p.id}/insurance`}>{text ?? who(p)}</Link> : null);
  return (
    <Page title="Insurance verification">
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Section title="Not verified yet">
          {unverified.length ? unverified.map((c) => (
            <Row key={c.id}>
              <span className="min-w-0">{link(c.patient)}<br /><Meta>{c.subscriber?.plan?.payer?.name} · {c.subscriber?.plan?.groupName}</Meta></span>
              <ActionButton op="requestVerification" vars={{ coverageId: c.id }} paths={paths}>Check</ActionButton>
            </Row>
          )) : <Empty>Every current coverage has been checked.</Empty>}
        </Section>
        <Section title="Electronic checks needing attention">
          {checks.length ? checks.map((c) => (
            <Row key={c.id} className="flex-nowrap items-start">
              <span className="min-w-0 flex-1"><TitleLine status={c.status}>{link(c.coverage?.patient)}</TitleLine><br /><Meta>{c.coverage?.subscriber?.plan?.payer?.name}{c.resultNote ? ` · ${c.resultNote}` : ''}</Meta></span>
              {['unknown', 'error_retryable', 'rejected'].includes(c.status) ? <ActionButton op="recheckEligibility" vars={{ checkId: c.id }} paths={paths}>Check again</ActionButton> : <Meta>{when(c.createdAt, tz, 'dayTime')}</Meta>}
            </Row>
          )) : <Empty>No checks waiting.</Empty>}
        </Section>
      </div>
      <Section title="Questions a person still has to ask">
        {tasks.length ? tasks.map((t) => (
          <Row key={t.id}>
            <span className="min-w-0"><span className="font-medium">{t.title}</span><br /><Meta>{t.verification?.coverage?.subscriber?.plan?.payer?.name} · {who(t.verification?.coverage?.patient)}</Meta></span>
            <span className="flex items-center gap-2"><Meta>{t.dueAt ? `due ${when(t.dueAt, tz, 'day')}` : ''}</Meta>{link(t.verification?.coverage?.patient, 'Open')}</span>
          </Row>
        )) : <Empty>Nothing to ask right now.</Empty>}
      </Section>
    </Page>
  );
}
