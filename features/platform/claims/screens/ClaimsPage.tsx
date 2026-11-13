import Link from 'next/link';
import { q } from '../../lib/server';
import { money, calendarDate, title } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, TitleLine, Tabs } from '../../components/ui';

const TABS = [
  ['work', 'Needs work', ['draft', 'scrubbed', 'ready', 'rejected', 'correction_required', 'submission_unknown']],
  ['out', 'With the payer', ['released', 'submitted', 'acknowledged', 'pending_payer', 'void_requested', 'appealed']],
  ['done', 'Paid or denied', ['adjudicated', 'appeal_decided', 'responded', 'closed', 'voided']],
] as const;

const STATUS_WORDS: Record<string, string> = { scrubbed: 'needs fixing', ready: 'ready to send', released: 'manual export, not sent', submitted: 'sending', acknowledged: 'received by the payer', pending_payer: 'payer is reviewing', adjudicated: 'payer has answered', correction_required: 'being corrected', submission_unknown: 'not sure it was sent', void_requested: 'cancelling', appeal_decided: 'appeal answered' };

/** Claims worklist in three tabs; each claim is one line with the patient, payer, total and the thing a person has to do next. */
export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const active = TABS.find((t) => t[0] === tab) ?? TABS[0];
  const d = await q<any>(`query($statuses: [String!]) {
    claims(where: { status: { in: $statuses } }, orderBy: [{ timelyFilingDeadline: asc }, { createdAt: desc }], take: 100) {
      id ref kind status adjudicationOutcome totalChargeMinor timelyFilingDeadline
      patient { id firstName lastName } coverage { subscriber { plan { payer { name } } } }
    }
    unmatched: remittanceClaimsCount(where: { claim: null })
  }`, { statuses: [...active[2]] });
  const claims = d.claims as any[];
  return (
    <Page title="Claims">
      <Tabs active={active[0]} items={TABS.map((t) => ({ key: t[0], label: t[1], href: `/dashboard/platform/claims?tab=${t[0]}` }))} />
      <Section title={active[1]}>
        {claims.length ? claims.map((c) => (
          <Row key={c.id} href={`/dashboard/platform/claims/${c.id}`} className="items-start">
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <TitleLine status={c.status}>{c.patient?.firstName} {c.patient?.lastName}</TitleLine>
                <span className="shrink-0 font-medium tabular-nums">{money(c.totalChargeMinor)}</span>
              </span>
              <Meta>{c.coverage?.subscriber?.plan?.payer?.name} · {c.ref}{c.kind !== 'original' ? ` · ${title(c.kind)}` : ''}{STATUS_WORDS[c.status] ? ` · ${STATUS_WORDS[c.status]}` : ''}{c.timelyFilingDeadline && active[0] === 'work' ? ` · file by ${calendarDate(c.timelyFilingDeadline, 'date')}` : ''}</Meta>
            </span>
          </Row>
        )) : <Empty>Nothing here.</Empty>}
      </Section>
      {d.unmatched ? <Meta>{d.unmatched} payment lines are waiting to be matched to a claim. <Link className="underline" href="/dashboard/platform/remittances">Open payments</Link></Meta> : null}
    </Page>
  );
}
