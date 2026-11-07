import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, practiceTimeZone } from '../../lib/server';
import { money, when, label } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Status, Stat } from '../../components/ui';
import { ActionButton, PillTrack } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';

const ALERT_KINDS = ['premedication', 'anticoagulant', 'antiresorptive', 'allergy', 'latex', 'pregnancy', 'diabetes', 'hypertension', 'cardiac', 'sedation_history', 'behavioural', 'financial', 'other'];
const PURPOSES = ['appointment_reminders', 'recall', 'treatment_follow_up', 'billing_statements', 'payment_reminders', 'marketing', 'reviews'];

/**
 * Patient overview (BUILD-PLAN §2 /patients/[id]): demographics, family and guarantor, alerts,
 * contact points with consent per purpose, visits, ASAP entries, portal access and merges. Clinical,
 * insurance and ledger tabs arrive with their phases. Every read here is a PHI read and is audited.
 */
export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, tz] = await Promise.all([
    q<any>(`query Patient($id: ID!) {
      patient(where: { id: $id }) {
        id chartNumber status version firstName middleName lastName preferredName suffix dateOfBirth sexAssignedAtBirth pronouns preferredLanguage address dateOfDeath
        firstVisitOn lastVisitOn statementHold isSynthetic
        homeLocation { id code name } primaryProvider { displayName } primaryHygienist { displayName } mergedInto { id chartNumber }
        family { id name members(orderBy: { dateOfBirth: asc }) { id chartNumber firstName lastName preferredName dateOfBirth status } }
        guarantorLinks(where: { status: { equals: "active" } }) { relationship guarantor { id patient { id chartNumber firstName lastName } personName } }
        alerts(orderBy: { activeFrom: desc }) { id kind severity text source activeFrom endedAt }
        contactPoints(orderBy: { kind: asc }) { id kind value isPrimary isActive verifiedAt consentGrants(orderBy: { grantedAt: desc }) { id channel purpose status source grantedAt revokedAt needsReconfirmation } }
        appointments(orderBy: { startsAt: desc }, take: 30) { id ref status startsAt productionScheduledMinor type { name } operatory { code } location { code } primaryProvider { abbreviation } }
        asapEntries(where: { status: { in: ["active", "offered"] } }) { id status note appointmentType { name } }
      }
      mergeCases(where: { OR: [{ survivor: { id: { equals: $id } } }, { merged: { id: { equals: $id } } }] }, orderBy: { createdAt: desc }) {
        id status version reason appliedAt revertibleUntil survivor { id chartNumber } merged { id chartNumber }
      }
      portalScopes(where: { patient: { id: { equals: $id } } }) { id relationship status capabilities validUntilMajority account { id email status } }
    }`, { id }),
    practiceTimeZone(),
  ]);
  const p = data.patient;
  if (!p) notFound();
  const name = `${p.preferredName || p.firstName} ${p.lastName}`;
  const upcoming = (p.appointments as any[]).filter((a) => ['scheduled', 'confirmed', 'arrived', 'seated', 'ready_for_checkout'].includes(a.status) && new Date(a.startsAt).getTime() > Date.now() - 12 * 3_600_000).reverse();
  const past = (p.appointments as any[]).filter((a) => !upcoming.includes(a));
  const activeAlerts = (p.alerts as any[]).filter((a) => !a.endedAt);
  const path = [`/dashboard/platform/patients/${p.id}`];
  const guarantor = p.guarantorLinks[0];
  const gName = guarantor?.guarantor?.patient ? `${guarantor.guarantor.patient.firstName} ${guarantor.guarantor.patient.lastName}` : guarantor?.guarantor?.personName?.full ?? '—';
  return (
    <Page title={name} crumbs={[{ label: 'Patients', href: '/dashboard/platform/patients' }]}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm text-muted-foreground">{p.chartNumber}</span>
        <Status value={p.status} />
        {p.isSynthetic ? <span className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground">Sample practice: synthetic data</span> : null}
        {p.mergedInto ? <Link className="text-sm underline" href={`/dashboard/platform/patients/${p.mergedInto.id}`}>Merged into {p.mergedInto.chartNumber}</Link> : null}
      </div>
      {activeAlerts.length ? (
        <div className="space-y-1 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {activeAlerts.map((a: any) => (
            <div key={a.id} className="flex flex-wrap items-start justify-between gap-2">
              <span><span className="font-mono text-[11px] uppercase">{label(a.kind)} · {a.severity}</span><br />{a.text}</span>
              <ActionButton op="endPatientAlert" vars={{ alertId: a.id }} ask="Why is this alert no longer active?" paths={path}>End</ActionButton>
            </div>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4">
        <Stat name="Born" value={p.dateOfBirth} />
        <Stat name="Home location" value={p.homeLocation?.code ?? '—'} />
        <Stat name="Last visit" value={p.lastVisitOn ?? '—'} />
        <Stat name="Next visit" value={upcoming[0] ? when(upcoming[0].startsAt, tz, 'day') : '—'} />
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Section title="Demographics">
          <Row><span>Legal name</span><Meta>{[p.firstName, p.middleName, p.lastName, p.suffix].filter(Boolean).join(' ')}</Meta></Row>
          <Row><span>Sex at birth · pronouns</span><Meta>{label(p.sexAssignedAtBirth)}{p.pronouns ? ` · ${p.pronouns}` : ''}</Meta></Row>
          <Row><span>Language</span><Meta>{p.preferredLanguage?.toUpperCase()}</Meta></Row>
          <Row><span>Address</span><Meta>{p.address ? [p.address.line1, p.address.city, p.address.state, p.address.postal].filter(Boolean).join(', ') : '—'}</Meta></Row>
          <Row><span>Providers</span><Meta>{p.primaryProvider?.displayName ?? '—'}{p.primaryHygienist ? ` · ${p.primaryHygienist.displayName}` : ''}</Meta></Row>
          <Row><span>First visit</span><Meta>{p.firstVisitOn ?? '—'}</Meta></Row>
          {p.dateOfDeath ? <Row><span>Date of death</span><Meta>{p.dateOfDeath}</Meta></Row> : null}
          <PillTrack className="mt-2">
            {['prospect', 'inactive'].includes(p.status) ? <ActionButton op="setPatientStatus" vars={{ patientId: p.id, status: 'active', expectedVersion: p.version }} ask="Reason" paths={path}>Make active</ActionButton> : null}
            {p.status === 'active' ? <ActionButton op="setPatientStatus" vars={{ patientId: p.id, status: 'inactive', expectedVersion: p.version }} ask="Why is this patient inactive?" paths={path}>Make inactive</ActionButton> : null}
            {['prospect', 'active', 'inactive'].includes(p.status) ? <ActionButton op="setPatientStatus" vars={{ patientId: p.id, status: 'archived', expectedVersion: p.version }} ask="Why archive this record?" paths={path}>Archive</ActionButton> : null}
          </PillTrack>
        </Section>
        <Section title="Family and guarantor">
          <Row><span>Guarantor</span><Meta>{guarantor ? `${gName} (${label(guarantor.relationship)})` : 'None'}</Meta></Row>
          {p.family ? (
            <>
              <div className="pt-2 font-mono text-[11px] uppercase text-muted-foreground">{p.family.name}</div>
              {(p.family.members as any[]).map((m) => (
                <Row key={m.id} href={m.id === p.id ? undefined : `/dashboard/platform/patients/${m.id}`}>
                  <span className={m.id === p.id ? 'font-semibold' : ''}>{m.preferredName || m.firstName} {m.lastName}</span>
                  <span className="flex items-center gap-2"><Meta>{m.chartNumber} · {m.dateOfBirth}</Meta><Status value={m.status} /></span>
                </Row>
              ))}
            </>
          ) : <Empty>Not in a family group.</Empty>}
        </Section>
      </div>
      <Section title="Contact and consent">
        {(p.contactPoints as any[]).length ? (p.contactPoints as any[]).map((c) => (
          <Row key={c.id}>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{c.value} <span className="font-mono text-xs text-muted-foreground">{label(c.kind)}{c.isPrimary ? ' · primary' : ''}{c.isActive ? '' : ' · inactive'}</span></div>
              <Meta>{(c.consentGrants as any[]).length ? (c.consentGrants as any[]).map((g) => `${label(g.purpose)} by ${g.channel}: ${g.status}${g.needsReconfirmation ? ' (reconfirm)' : ''}`).join(' · ') : 'No consent recorded'}</Meta>
            </div>
            {c.isActive ? (
              <div className="flex flex-wrap gap-2">
                {!(c.consentGrants as any[]).some((g) => g.purpose === 'appointment_reminders' && g.status === 'granted') ? (
                  <ActionButton op="recordConsent" vars={{ contactPointId: c.id, channel: c.kind === 'email' ? 'email' : 'sms', purpose: 'appointment_reminders', granted: true, source: 'verbal_staff' }} ask="Note how the patient agreed (who, when, what was said)" paths={path}>Record reminder consent</ActionButton>
                ) : (
                  <ActionButton op="recordConsent" vars={{ contactPointId: c.id, channel: c.kind === 'email' ? 'email' : 'sms', purpose: 'appointment_reminders', granted: false }} ask="Why is consent withdrawn?" paths={path}>Withdraw reminders</ActionButton>
                )}
                <ActionButton op="deactivateContactPoint" vars={{ contactPointId: c.id }} ask="Why is this contact no longer used? Consents on it end." paths={path}>Deactivate</ActionButton>
              </div>
            ) : null}
          </Row>
        )) : <Empty>No phone or email on file.</Empty>}
        <details className="pt-2">
          <summary className="cursor-pointer text-sm font-medium">Add a phone or email</summary>
          <div className="pt-3">
            <CommandForm op="addContactPoint" submitLabel="Add contact" columns={3} paths={path} fixed={{ patientId: p.id }}
              fields={[
                { name: 'kind', label: 'Kind', kind: 'select', options: [{ value: 'mobile', label: 'Mobile' }, { value: 'home', label: 'Home phone' }, { value: 'work', label: 'Work phone' }, { value: 'email', label: 'Email' }] },
                { name: 'value', label: 'Number or address', kind: 'text', required: true },
                { name: 'isPrimary', label: 'Primary for this kind', kind: 'checkbox', defaultValue: true },
              ]} />
          </div>
        </details>
        <p className="text-xs text-muted-foreground">Purposes: {PURPOSES.map(label).join(', ')}. Texts and calls also follow the practice quiet hours.</p>
      </Section>
      <Section title="Upcoming visits" aside={<Link className="text-sm hover:underline" href={`/dashboard/platform/schedule?loc=${p.homeLocation?.id ?? ''}`}>Book</Link>}>
        {upcoming.length ? upcoming.map((a) => (
          <Row key={a.id} href={`/dashboard/platform/schedule?date=${a.startsAt.slice(0, 10)}&appt=${a.id}`}>
            <span>{when(a.startsAt, tz)} · {a.type?.name}</span>
            <span className="flex items-center gap-2"><Meta>{a.location?.code} {a.operatory?.code} · {a.primaryProvider?.abbreviation} · {money(a.productionScheduledMinor)}</Meta><Status value={a.status} /></span>
          </Row>
        )) : <Empty>Nothing booked.</Empty>}
        {(p.asapEntries as any[]).map((e) => <Meta key={e.id}>On the ASAP list for {e.appointmentType?.name ?? 'any visit'}{e.note ? ` · ${e.note}` : ''}</Meta>)}
      </Section>
      <Section title="Visit history">
        {past.length ? past.map((a) => (
          <Row key={a.id}>
            <span>{when(a.startsAt, tz)} · {a.type?.name}</span>
            <span className="flex items-center gap-2"><Meta>{a.ref} · {a.location?.code} · {a.primaryProvider?.abbreviation}</Meta><Status value={a.status} /></span>
          </Row>
        )) : <Empty>No past visits.</Empty>}
      </Section>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Section title="Add a medical alert">
          <CommandForm op="addPatientAlert" submitLabel="Add alert" columns={2} paths={path} fixed={{ patientId: p.id }}
            fields={[
              { name: 'kind', label: 'Kind', kind: 'select', options: ALERT_KINDS.map((k) => ({ value: k, label: label(k) })) },
              { name: 'severity', label: 'Severity', kind: 'select', options: [{ value: 'caution', label: 'Caution' }, { value: 'critical', label: 'Critical' }, { value: 'info', label: 'Info' }] },
              { name: 'text', label: 'What the team must know', kind: 'textarea', required: true },
            ]} />
        </Section>
        <Section title="Portal access and merges">
          {(data.portalScopes as any[]).map((s) => (
            <Row key={s.id}>
              <span>{s.account?.email} <Meta>{label(s.relationship)}{s.validUntilMajority ? ' · until majority' : ''}</Meta></span>
              <span className="flex items-center gap-2"><Status value={s.status} />{s.status === 'active' ? <ActionButton op="revokePortalScope" vars={{ portalScopeId: s.id }} ask="Why is access removed?" paths={path}>Revoke</ActionButton> : null}</span>
            </Row>
          ))}
          {(data.mergeCases as any[]).map((m) => (
            <Row key={m.id}>
              <span>{m.merged?.chartNumber} → {m.survivor?.chartNumber} <Meta>{m.reason}</Meta></span>
              <span className="flex items-center gap-2">
                <Status value={m.status} />
                {m.status === 'applied' && m.revertibleUntil && new Date(m.revertibleUntil).getTime() > Date.now() ? <ActionButton op="revertMerge" vars={{ mergeCaseId: m.id, expectedVersion: m.version }} ask="Why undo this merge?" paths={path}>Undo merge</ActionButton> : null}
              </span>
            </Row>
          ))}
          {!(data.portalScopes as any[]).length && !(data.mergeCases as any[]).length ? <Empty>No portal access or merges.</Empty> : null}
          <details className="pt-2">
            <summary className="cursor-pointer text-sm font-medium">Same person as another chart?</summary>
            <div className="pt-3">
              <CommandForm op="proposeMerge" submitLabel="Propose merge" columns={2} paths={path} fixed={{ survivorId: p.id }}
                fields={[{ name: 'mergedId', label: 'Chart to merge into this one', kind: 'text', required: true, placeholder: 'PT-…' }, { name: 'reason', label: 'Why they are the same person', kind: 'textarea', required: true }]}
                shape="mergeByChart" />
              <p className="pt-2 text-xs text-muted-foreground">A second person approves the merge in Approvals. It can be undone during the practice merge window.</p>
            </div>
          </details>
          <details className="pt-2">
            <summary className="cursor-pointer text-sm font-medium">Give portal access</summary>
            <div className="pt-3">
              <CommandForm op="grantPortalAccess" submitLabel="Grant access" columns={2} paths={path} fixed={{ patientId: p.id }}
                fields={[
                  { name: 'email', label: 'Email', kind: 'email', required: true },
                  { name: 'relationship', label: 'Relationship', kind: 'select', options: [{ value: 'self', label: 'Self' }, { value: 'guardian', label: 'Parent/guardian' }, { value: 'guarantor', label: 'Guarantor' }, { value: 'personal_representative', label: 'Personal representative' }] },
                ]} />
            </div>
          </details>
        </Section>
      </div>
    </Page>
  );
}
