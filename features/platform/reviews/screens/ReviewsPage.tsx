import { q, requirePage } from '../../lib/server';
import { when, title } from '../../lib/format';
import { practiceTimeZone } from '../../lib/server';
import { Page, Section, Row, Empty, Meta, TitleLine } from '../../components/ui';
import { ActionButton, summaryClass } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';
import { CopyMessageButton } from '../../components/Phase6Actions';

/** Review requests are a message to copy, only for patients who agreed to hear from the office about reviews. Replies are drafted, checked against the office's rules, approved, then posted by hand. */
export default async function ReviewsPage() {
  await requirePage('reviews');
  const [tz, d] = await Promise.all([practiceTimeZone(), q<any>(`{
    reviewReplies(orderBy: { createdAt: desc }, take: 40) { id platform reviewerName rating reviewText draft policyFindings status version postedAt }
    reviewRequests(orderBy: { createdAt: desc }, take: 20) { id channel createdAt patient { firstName lastName } }
    locations(orderBy: { name: asc }, take: 20) { id name }
    patients(orderBy: { lastName: asc }, take: 200) { id firstName lastName chartNumber }
  }`)]);
  const paths = ['/dashboard/platform/reviews'];
  const loc = (d.locations as any[])[0]?.id;
  return (
    <Page title="Reviews">
      <Section title="Ask for a review">
        <Meta>The message is copied, not sent. The patient must have agreed to review requests; this is checked when you copy.</Meta>
        <details open><summary className={summaryClass}>Copy a review request</summary>
          <div className="pt-2"><CommandForm op="copyReviewRequest" submitLabel="Copy request" paths={paths} columns={2} fixed={{ locationId: loc }} fields={[
            { name: 'patientId', label: 'Patient', kind: 'select', required: true, options: (d.patients as any[]).map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName} · #${p.chartNumber}` })) },
            { name: 'channel', label: 'You will paste it into', kind: 'select', required: true, options: [{ value: 'sms', label: 'A text message' }, { value: 'email', label: 'An email' }] },
            { name: 'reviewLink', label: 'Your review link', kind: 'text', required: true, placeholder: 'https://g.page/r/your-practice/review' },
          ]} /></div>
        </details>
        {(d.reviewRequests as any[]).map((r) => <Row key={r.id}><span className="min-w-0"><TitleLine>{r.patient?.firstName} {r.patient?.lastName}</TitleLine><Meta>Copied for {r.channel === 'sms' ? 'a text' : 'an email'} · {when(r.createdAt, tz, 'dayTime')}</Meta></span></Row>)}
      </Section>
      <Section title="Replies to reviews">
        {(d.reviewReplies as any[]).length ? (d.reviewReplies as any[]).map((r) => (
          <Row key={r.id} className="items-start">
            <span className="min-w-0 flex-1">
              <TitleLine status={r.status}>{title(r.platform)} · {r.rating} star{r.rating === 1 ? '' : 's'}{r.reviewerName ? ` · ${r.reviewerName}` : ''}</TitleLine>
              {r.reviewText ? <Meta>“{r.reviewText}”</Meta> : null}
              <span className="mt-1 block whitespace-pre-wrap break-words text-sm">{r.draft}</span>
              {(r.policyFindings as any[])?.length ? <span className="mt-1 block text-xs text-red-600">{(r.policyFindings as any[]).map((f) => f.message).join(' ')}</span> : null}
              <Meta>{title(r.status)}</Meta>
              <span className="mt-1 flex flex-wrap items-start gap-2">
                {['draft', 'policy_failed', 'policy_passed'].includes(r.status) ? <details><summary className={summaryClass}>Edit the reply</summary><div className="pt-2"><CommandForm op="editReviewReply" submitLabel="Check reply" paths={paths} columns={1} fixed={{ replyId: r.id, expectedVersion: r.version }} fields={[{ name: 'draft', label: 'Reply', kind: 'textarea', required: true, defaultValue: r.draft }]} /></div></details> : null}
                {r.status === 'policy_passed' ? <ActionButton op="approveReviewReply" vars={{ replyId: r.id, expectedVersion: r.version }} paths={paths}>Approve</ActionButton> : null}
                {r.status === 'approved' ? <ActionButton op="markReviewReplyPosted" vars={{ replyId: r.id, expectedVersion: r.version }} confirm="Mark as posted? Post it on the review site yourself first." paths={paths}>I posted it</ActionButton> : null}
              </span>
            </span>
          </Row>
        )) : <Empty>No replies yet.</Empty>}
        <details><summary className={summaryClass}>Draft a reply</summary>
          <div className="pt-2"><CommandForm op="draftReviewReply" submitLabel="Draft reply" paths={paths} columns={2} fixed={{ locationId: loc }} fields={[
            { name: 'platform', label: 'Where the review is', kind: 'select', required: true, options: [{ value: 'google', label: 'Google' }, { value: 'facebook', label: 'Facebook' }, { value: 'yelp', label: 'Yelp' }, { value: 'other', label: 'Somewhere else' }] },
            { name: 'rating', label: 'Stars', kind: 'number', required: true, defaultValue: '5' },
            { name: 'reviewerName', label: 'Reviewer name as shown', kind: 'text' },
            { name: 'reviewText', label: 'What the review says', kind: 'textarea' },
          ]} /></div>
        </details>
      </Section>
    </Page>
  );
}
