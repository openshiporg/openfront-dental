import Link from 'next/link';
import { chartLabel } from '../../lib/format';
import { q } from '../../lib/server';
import { money, when, label, title } from '../../lib/format';
import { Section, Status, Meta, Row, TitleLine } from '../../components/ui';
import { ActionButton, PillTrack } from '../../components/ActionButton';

const PATHS = ['/dashboard/platform/schedule'];

/**
 * The appointment drawer: who, what, when, alerts, confirmations and the next legal moves (SM§2).
 * Buttons only send commands; the server checks the transition, the version, the location scope,
 * the lab gate and alert acknowledgement.
 */
export async function AppointmentDrawer({ id, timeZone, closeHref }: { id: string; timeZone: string; closeHref: string }) {
  const data = await q<any>(`query Appt($id: ID!) {
    appointment(where: { id: $id }) {
      id ref status version startsAt endsAt brokenKind confirmationMethod confirmedAt arrivedAt seatedAt completedAt cancelReason source productionScheduledMinor warnings note
      type { name } operatory { code name } location { name } primaryProvider { displayName } supervisingDentist { displayName }
      patient { id chartNumber firstName lastName preferredName status alerts(where: { endedAt: { equals: null } }) { id kind severity text } }
      segments(orderBy: { startsAt: asc }) { role startsAt endsAt provider { abbreviation } concurrencyKind }
      confirmations(orderBy: { scheduledFor: asc }) { id channel status scheduledFor suppressedReason }
      rescheduledTo { id ref startsAt }
    }
  }`, { id });
  const a = data.appointment;
  if (!a) return null;
  const name = a.patient ? `${a.patient.preferredName || a.patient.firstName || ''} ${a.patient.lastName || ''}`.trim() : 'Patient';
  const v = { appointmentId: a.id, expectedVersion: a.version };
  const critical = (a.patient?.alerts ?? []).some((x: any) => x.severity !== 'info');
  const warnings = Array.isArray(a.warnings) ? a.warnings : [];
  return (
    <Section title={`Appointment ${a.ref}`} aside={<Link href={closeHref} scroll={false} className="text-xs text-muted-foreground hover:underline">Close</Link>}>
      <div className="space-y-3 text-sm">
        <div className="min-w-0">
          <TitleLine status={a.status}>{a.patient ? <Link href={`/dashboard/platform/patients/${a.patient.id}`} className="text-base font-semibold hover:underline">{name}</Link> : <span className="font-semibold">{name}</span>}</TitleLine>
          <div className="text-xs text-muted-foreground"><span className="font-mono">{chartLabel(a.patient?.chartNumber)}</span> · {label(a.patient?.status)} patient</div>
        </div>
        <div className="space-y-0.5">
          <div>{when(a.startsAt, timeZone, 'day')} · {when(a.startsAt, timeZone, 'time')} – {when(a.endsAt, timeZone, 'time')}</div>
          <Meta>{a.type?.name} · {a.operatory?.code} at {a.location?.name} · {a.primaryProvider?.displayName}{a.supervisingDentist ? ` · exam ${a.supervisingDentist.displayName}` : ''}</Meta>
          <div><Meta>Scheduled production {money(a.productionScheduledMinor)} · booked via {label(a.source)}</Meta></div>
          {a.brokenKind ? <div className="text-red-700">Broken: {label(a.brokenKind)}</div> : null}
          {a.cancelReason ? <Meta>Reason: {a.cancelReason}</Meta> : null}
          {a.rescheduledTo ? <div><Link className="underline" href={`?appt=${a.rescheduledTo.id}`}>Moved to {a.rescheduledTo.ref} · {when(a.rescheduledTo.startsAt, timeZone, 'dayTime')}</Link></div> : null}
        </div>
        {(a.patient?.alerts ?? []).length ? (
          <ul className="space-y-1 rounded-md border border-red-200 bg-red-50 p-2 text-red-900">
            {a.patient.alerts.map((x: any) => <li key={x.id}><span className="font-medium">{title(x.kind)}</span> · {label(x.severity)}<br />{x.text}</li>)}
          </ul>
        ) : null}
        {warnings.length ? <ul className="list-disc space-y-1 pl-5 text-amber-800">{warnings.map((w: any, i: number) => <li key={i}>{typeof w === 'string' ? w : w.message ?? JSON.stringify(w)}</li>)}</ul> : null}
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Unit pattern</div>
          {(a.segments as any[]).map((s, i) => (
            <Row key={i} className="py-1.5"><span>{title(s.role)}{s.provider ? ` · ${s.provider.abbreviation}` : ''}{s.concurrencyKind !== 'none' ? ` · ${label(s.concurrencyKind)}` : ''}</span><Meta>{when(s.startsAt, timeZone, 'time')} – {when(s.endsAt, timeZone, 'time')}</Meta></Row>
          ))}
        </div>
        {(a.confirmations as any[]).length ? (
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Reminders</div>
            {(a.confirmations as any[]).map((c) => <Row key={c.id} className="py-1.5"><TitleLine status={c.status}><span>{title(c.channel)} · {when(c.scheduledFor, timeZone)}</span></TitleLine>{c.suppressedReason ? <Meta>Held back: {label(c.suppressedReason)}</Meta> : null}</Row>)}
          </div>
        ) : null}
        <PillTrack>
          {a.status === 'scheduled' ? <ActionButton op="confirmAppointment" vars={{ ...v, method: 'phone' }} paths={PATHS}>Confirmed by phone</ActionButton> : null}
          {['scheduled', 'confirmed'].includes(a.status) ? <ActionButton op="markArrived" vars={v} paths={PATHS}>Arrived</ActionButton> : null}
          {a.status === 'arrived' ? <ActionButton op="seatPatient" vars={{ ...v, acknowledgeAlerts: critical || undefined }} confirm={critical ? 'This patient has medical alerts. Have you reviewed them?' : undefined} paths={PATHS}>Seat</ActionButton> : null}
          {a.status === 'seated' ? <ActionButton op="markReadyForCheckout" vars={v} paths={PATHS}>Ready for checkout</ActionButton> : null}
          {['seated', 'ready_for_checkout'].includes(a.status) ? <ActionButton op="completeAppointment" vars={v} paths={PATHS}>Complete</ActionButton> : null}
          {['scheduled', 'confirmed'].includes(a.status) ? <ActionButton op="cancelAppointment" vars={v} ask="Why is this visit cancelled? (Inside the late-cancel window it is recorded as a late cancellation.)" paths={PATHS}>Cancel</ActionButton> : null}
          {['scheduled', 'confirmed', 'arrived'].includes(a.status) ? <ActionButton op="markBroken" vars={{ ...v, kind: 'no_show' }} ask="Note for the no-show (optional)" paths={PATHS}>No-show</ActionButton> : null}
        </PillTrack>
      </div>
    </Section>
  );
}
