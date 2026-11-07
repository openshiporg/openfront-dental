import Link from 'next/link';
import { q, practiceTimeZone } from '../../lib/server';
import { when, label } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Status, Tabs } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';

const PATHS = ['/dashboard/platform/schedule/booking-requests'];

/**
 * Online booking inbox (SCHEMA §16). Each request already holds a real appointment (the public API
 * books through the same slot checks). The desk reviews it: keep it, attach it to an existing
 * patient (a merge proposal for a second person to approve), or reject it as spam, which withdraws
 * the visit and archives the empty prospect.
 */
export default async function BookingRequestsPage({ searchParams }: { searchParams?: Promise<{ view?: string }> }) {
  const view = (await searchParams)?.view === 'reviewed' ? 'reviewed' : 'open';
  const where = view === 'open' ? '{ reviewedAt: { equals: null } }' : '{ reviewedAt: { not: { equals: null } } }';
  const [data, tz] = await Promise.all([
    q<any>(`{
      publicBookingRequests(where: ${where}, orderBy: { createdAt: desc }, take: 100) {
        id publicRef status matchStatus matchEvidence version createdAt reviewedAt reviewNote contact captchaScore
        location { code } reviewedBy { name }
        patientMatch { id chartNumber status }
        appointment { id ref status startsAt type { name } }
      }
      open: publicBookingRequestsCount(where: { reviewedAt: { equals: null } })
      reviewed: publicBookingRequestsCount(where: { reviewedAt: { not: { equals: null } } })
    }`),
    practiceTimeZone(),
  ]);
  return (
    <Page title="Booking requests" crumbs={[{ label: 'Schedule', href: '/dashboard/platform/schedule' }]}>
      <Tabs active={view} items={[
        { key: 'open', label: 'To review', href: '/dashboard/platform/schedule/booking-requests', count: data.open },
        { key: 'reviewed', label: 'Reviewed', href: '/dashboard/platform/schedule/booking-requests?view=reviewed', count: data.reviewed },
      ]} />
      <Section title={view === 'open' ? 'Booked online, waiting for review' : 'Reviewed'}>
        {data.publicBookingRequests.length ? data.publicBookingRequests.map((r: any) => {
          const c = r.contact ?? {};
          const candidates = (r.matchEvidence?.candidates ?? []) as { chartNumber: string; evidence: string[]; score: number }[];
          return (
            <Row key={r.id}>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.firstName} {c.lastName}</span>
                  <span className="font-mono text-xs text-muted-foreground">{r.publicRef}</span>
                  <Status value={r.matchStatus} />
                </div>
                <Meta>{r.location?.code} · {r.appointment?.type?.name ?? 'Visit'} · {r.appointment ? when(r.appointment.startsAt, tz) : 'no visit'} · sent {when(r.createdAt, tz)} · captcha {label(r.captchaScore || 'not_configured')}</Meta>
                <div><Meta>{[c.email, c.phone, c.dateOfBirth ? `born ${c.dateOfBirth}` : ''].filter(Boolean).join(' · ')}</Meta></div>
                {r.patientMatch ? <div><Link className="text-sm underline-offset-2 hover:underline" href={`/dashboard/platform/patients/${r.patientMatch.id}`}>Booked on {r.patientMatch.chartNumber} ({label(r.patientMatch.status)})</Link>{r.appointment ? <> · <Link className="text-sm underline-offset-2 hover:underline" href={`/dashboard/platform/schedule?date=${r.appointment.startsAt.slice(0, 10)}&appt=${r.appointment.id}`}>{r.appointment.ref} ({label(r.appointment.status)})</Link></> : null}</div> : null}
                {candidates.length ? <div className="text-sm text-amber-800">Possible existing patient: {candidates.map((x) => `${x.chartNumber} (${x.evidence.map(label).join(', ')})`).join('; ')}</div> : null}
                {r.reviewedAt ? <Meta>Reviewed by {r.reviewedBy?.name ?? 'staff'} · {when(r.reviewedAt, tz)}{r.reviewNote ? ` · ${r.reviewNote}` : ''}</Meta> : null}
              </div>
              <div className="flex min-w-0 flex-col items-end gap-2">
                <Status value={r.status} />
                {!r.reviewedAt ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    <ActionButton op="reviewBookingRequest" vars={{ requestId: r.id, decision: 'accept', expectedVersion: r.version }} paths={PATHS}>{r.matchStatus === 'possible_duplicate' ? 'Different person: keep' : 'Keep'}</ActionButton>
                    <ActionButton op="reviewBookingRequest" vars={{ requestId: r.id, decision: 'reject_spam', expectedVersion: r.version }} ask="Why is this spam? The visit will be withdrawn." paths={PATHS}>Reject as spam</ActionButton>
                  </div>
                ) : null}
                {!r.reviewedAt && candidates.length ? (
                  <CommandForm op="reviewBookingRequest" submitLabel="Same person: propose merge" columns={1} paths={PATHS} fixed={{ requestId: r.id, decision: 'link', expectedVersion: r.version }}
                    fields={[{ name: 'existingPatientId', label: 'Existing chart', kind: 'select', options: candidates.map((x) => ({ value: `chart:${x.chartNumber}`, label: x.chartNumber })) }]} />
                ) : null}
              </div>
            </Row>
          );
        }) : <Empty>{view === 'open' ? 'No online bookings to review.' : 'Nothing reviewed yet.'}</Empty>}
      </Section>
      <p className="text-xs text-muted-foreground">Online booking runs through the public API (rate limited, captcha hook, no patient names returned). The practice&apos;s booking pages call it; this inbox is the staff side.</p>
    </Page>
  );
}
