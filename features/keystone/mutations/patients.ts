import { requirePermission, type Actor } from '../lib/actor'
import { requestApproval } from '../lib/approval'
import { registerApplier } from '../lib/approvalAppliers'
import { auditCreate, lockRow, transition } from '../lib/cas'
import { command } from '../lib/command'
import { advisoryLock, delegateOf, type Tx } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import { nextChartNumber, nextReference } from '../lib/sequence'
import { localDate } from '../lib/time'
import type { UnitOfWork } from '../lib/unitOfWork'
import { CONSENT_CHANNELS, CONSENT_PURPOSES } from '../models/messaging'
import { ALERT_KINDS, CONTACT_KINDS, GUARANTOR_RELATIONSHIPS, SEX_AT_BIRTH } from '../models/patients'
import { ACTIVE_APPOINTMENT_STATUSES } from '../models/scheduling'
import { withdrawIn } from './scheduling'
import { assertLocation, assertPatientInScope, normalizeContact, optionalText, requireText, staff, type Ctx, resolvePatientRef } from './shared'

/*
 * Patient identity commands (SM§1; SCHEMA §3). Patient rows are read-only in the generated API:
 * every change to who a patient is, how they are reached, what they consented to and which record
 * survives a merge happens here, audited, in one transaction.
 */

const DOB = /^\d{4}-\d{2}-\d{2}$/

export type PatientInput = {
  firstName: string
  lastName: string
  middleName?: string | null
  preferredName?: string | null
  dateOfBirth: string
  sexAssignedAtBirth?: string | null
  pronouns?: string | null
  preferredLanguage?: string | null
  address?: Record<string, unknown> | null
  homeLocationId: string
  primaryProviderId?: string | null
  contacts?: { kind: string; value: string; isPrimary?: boolean | null }[] | null
  referralSourceId?: string | null
}

function cleanPatient(input: PatientInput, today: string) {
  const firstName = requireText(input.firstName, 'first name', 100)
  const lastName = requireText(input.lastName, 'last name', 100)
  if (!DOB.test(String(input.dateOfBirth ?? '')) || Number.isNaN(Date.parse(`${input.dateOfBirth}T00:00:00Z`))) throw new DomainError(Codes.INVALID_INPUT, 'Enter the date of birth as YYYY-MM-DD.', { field: 'dateOfBirth' })
  if (input.dateOfBirth > today || input.dateOfBirth < '1880-01-01') throw new DomainError(Codes.INVALID_INPUT, 'The date of birth is not plausible.', { field: 'dateOfBirth' })
  const sex = input.sexAssignedAtBirth ?? 'unknown'
  if (!(SEX_AT_BIRTH as readonly string[]).includes(sex)) throw new DomainError(Codes.INVALID_INPUT, 'Unknown sex assigned at birth.', { field: 'sexAssignedAtBirth' })
  return {
    firstName, lastName, middleName: optionalText(input.middleName, 100), preferredName: optionalText(input.preferredName, 100),
    dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00Z`), sexAssignedAtBirth: sex, pronouns: optionalText(input.pronouns, 40),
    preferredLanguage: optionalText(input.preferredLanguage, 20) || 'en', address: (input.address ?? {}) as never,
  }
}

// ── Duplicate detection (SM§1.2; catalog C14) ───────────────────────────────────────────────────

export type DuplicateCandidate = { patientId: string; chartNumber: string; score: number; evidence: string[] }

/**
 * Candidates share the date of birth and either a similar name (trigram) or a contact value. Email
 * alone never matches: a shared family inbox is common, so DOB must also agree.
 */
export async function findDuplicates(tx: Tx, input: { firstName: string; lastName: string; dateOfBirth: string; contacts?: string[]; excludeId?: string | null }): Promise<DuplicateCandidate[]> {
  const contacts = (input.contacts ?? []).filter(Boolean)
  const rows = await tx.$queryRawUnsafe<{ id: string; chartNumber: string; name_score: number; contact_match: boolean; last_exact: boolean }[]>(
    `SELECT p.id, p."chartNumber",
            public.similarity(lower(p."lastName" || ' ' || p."firstName"), lower($2)) AS name_score,
            EXISTS (SELECT 1 FROM "ContactPoint" c WHERE c.patient = p.id AND c."isActive" AND c."valueNormalized" = ANY($3::text[])) AS contact_match,
            lower(p."lastName") = lower($4) AS last_exact
       FROM "Patient" p
      WHERE p."dateOfBirth" = $1::date AND p.status <> 'merged_into' AND ($5::text IS NULL OR p.id <> $5)
      ORDER BY name_score DESC LIMIT 10`,
    input.dateOfBirth, `${input.lastName} ${input.firstName}`, contacts, input.lastName, input.excludeId ?? null,
  )
  return rows
    .map(r => {
      const evidence = ['date_of_birth']
      if (r.name_score >= 0.45) evidence.push('similar_name')
      if (r.last_exact) evidence.push('same_last_name')
      if (r.contact_match) evidence.push('shared_contact')
      const score = Math.round((0.4 + Math.min(0.4, Number(r.name_score) * 0.4) + (r.contact_match ? 0.2 : 0)) * 100) / 100
      return { patientId: r.id, chartNumber: r.chartNumber, score, evidence }
    })
    .filter(c => c.evidence.includes('similar_name') || c.evidence.includes('shared_contact'))
}

// ── Create and update ───────────────────────────────────────────────────────────────────────────

export async function createPatientIn(uow: UnitOfWork, actor: Actor, input: PatientInput & { isSynthetic?: boolean; status?: 'prospect' | 'active' }) {
  const location = await uow.tx.location.findUnique({ where: { id: input.homeLocationId }, select: { timeZone: true } })
  if (!location) throw new DomainError(Codes.INVALID_INPUT, 'Choose a home location.', { field: 'homeLocationId' })
  const clean = cleanPatient(input, localDate(location.timeZone, uow.now))
  const contacts = (input.contacts ?? []).map(c => {
    if (!(CONTACT_KINDS as readonly string[]).includes(c.kind)) throw new DomainError(Codes.INVALID_INPUT, 'Unknown contact kind.', { field: 'contacts' })
    return { kind: c.kind, isPrimary: c.isPrimary ?? true, ...normalizeContact(c.kind, c.value) }
  })
  const chartNumber = await nextChartNumber(uow.tx)
  const patient = await uow.tx.patient.create({
    data: {
      ...clean, chartNumber, status: input.status ?? 'prospect', homeLocationId: input.homeLocationId, primaryProviderId: input.primaryProviderId ?? null,
      referralSourceId: input.referralSourceId ?? null, isSynthetic: input.isSynthetic ?? false,
    },
  })
  const seenPrimary = new Set<string>()
  for (const c of contacts) {
    const primary = c.isPrimary && !seenPrimary.has(c.kind)
    if (primary) seenPrimary.add(c.kind)
    await uow.tx.contactPoint.create({ data: { patientId: patient.id, kind: c.kind, value: c.value, valueNormalized: c.normalized, isPrimary: primary, isActive: true } })
  }
  // A new patient is their own guarantor until staff link another (one active link, I-L3).
  const guarantor = await uow.tx.guarantor.create({ data: { patientId: patient.id, isSynthetic: patient.isSynthetic } })
  await uow.tx.guarantorLink.create({ data: { patientId: patient.id, guarantorId: guarantor.id, relationship: 'self', status: 'active', startsOn: new Date(`${localDate(location.timeZone, uow.now)}T00:00:00Z`) } })
  auditCreate(uow, actor, 'Patient', patient.id, 'patient.created', { chartNumber, homeLocationId: input.homeLocationId, contacts: contacts.length })
  return patient
}

export async function registerPatient(_root: unknown, args: { data: PatientInput; acknowledgeDuplicates?: boolean | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManagePatients')
  assertLocation(locationIds, args.data?.homeLocationId)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'patient.create', actor, idempotencyKey, params }, async uow => {
    await advisoryLock(uow.tx, `patient-dob:${args.data.dateOfBirth}`)
    const contacts = (args.data.contacts ?? []).map(c => { try { return normalizeContact(c.kind, c.value).normalized } catch { return '' } })
    const duplicates = await findDuplicates(uow.tx, { firstName: args.data.firstName, lastName: args.data.lastName, dateOfBirth: args.data.dateOfBirth, contacts })
    if (duplicates.length && !args.acknowledgeDuplicates) {
      throw new DomainError(Codes.DUPLICATE_SUSPECTED, `This may be an existing patient (chart ${duplicates.map(d => d.chartNumber).join(', ')}). Open that record, or confirm this is a different person.`, { problems: duplicates.map(d => ({ chartNumber: d.chartNumber, evidence: d.evidence })) })
    }
    const patient = await createPatientIn(uow, actor, args.data)
    if (duplicates.length) uow.audit({ eventType: 'patient.duplicate_acknowledged', entityType: 'Patient', entityId: patient.id, actorUserId: actor.kind === 'user' ? actor.userId : null, after: { candidates: duplicates.map(d => d.chartNumber) } })
    return { patientId: patient.id, chartNumber: patient.chartNumber, status: patient.status }
  })
  return { replay: result.replay, ...result.value }
}

const DEMOGRAPHIC_FIELDS = ['firstName', 'lastName', 'middleName', 'preferredName', 'dateOfBirth', 'sexAssignedAtBirth', 'pronouns', 'preferredLanguage', 'address', 'genderIdentity', 'suffix'] as const

export async function updatePatientDemographics(_root: unknown, args: { patientId: string; expectedVersion: number; changes: Record<string, unknown>; reason?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManagePatients')
  const keys = Object.keys(args.changes ?? {})
  if (!keys.length) throw new DomainError(Codes.INVALID_INPUT, 'Nothing to change.')
  const unknown = keys.filter(k => !(DEMOGRAPHIC_FIELDS as readonly string[]).includes(k))
  if (unknown.length) throw new DomainError(Codes.INVALID_INPUT, `These fields can't be changed here: ${unknown.join(', ')}.`, { field: unknown[0] })
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'patient.update_demographics', actor, idempotencyKey, params }, async uow => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const row = await lockRow<any>(uow.tx, 'Patient', args.patientId)
    if (row.version !== args.expectedVersion) throw new DomainError(Codes.STALE_STATE, 'This patient changed since you loaded it. Reload and try again.', { currentVersion: row.version })
    if (row.status === 'merged_into') throw new DomainError(Codes.GUARD_FAILED, 'This record was merged; edit the surviving record.')
    const merged = { ...row, dateOfBirth: row.dateOfBirth.toISOString().slice(0, 10), ...args.changes } as any
    const location = await uow.tx.location.findUnique({ where: { id: row.homeLocationId ?? '' }, select: { timeZone: true } })
    const clean = cleanPatient({ ...merged, homeLocationId: row.homeLocationId }, localDate(location?.timeZone ?? 'UTC', uow.now))
    const data: Record<string, unknown> = {}
    for (const k of keys) data[k] = k in clean ? (clean as any)[k] : optionalText(args.changes[k], 100)
    const before = Object.fromEntries(keys.map(k => [k, row[k]]))
    const updated = await uow.tx.patient.updateMany({ where: { id: row.id, version: row.version }, data: { ...data, version: { increment: 1 } } })
    if (updated.count !== 1) throw new DomainError(Codes.STALE_STATE, 'This patient changed while saving.')
    uow.audit({ eventType: 'patient.demographics_updated', entityType: 'Patient', entityId: row.id, actorUserId: actor.kind === 'user' ? actor.userId : null, reason: args.reason ?? null, before, after: data })
    return { patientId: row.id, version: row.version + 1 }
  })
  return { replay: result.replay, ...result.value }
}

// ── Contacts and consent ────────────────────────────────────────────────────────────────────────

export async function addContactPoint(_root: unknown, args: { patientId: string; kind: string; value: string; isPrimary?: boolean | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManagePatients')
  if (!(CONTACT_KINDS as readonly string[]).includes(args.kind)) throw new DomainError(Codes.INVALID_INPUT, 'Unknown contact kind.', { field: 'kind' })
  const { value, normalized } = normalizeContact(args.kind, args.value)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'patient.add_contact', actor, idempotencyKey, params }, async uow => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId)
    await advisoryLock(uow.tx, `patient:${args.patientId}`)
    if (args.isPrimary) await uow.tx.contactPoint.updateMany({ where: { patientId: args.patientId, kind: args.kind, isPrimary: true }, data: { isPrimary: false } })
    const contact = await uow.tx.contactPoint.create({ data: { patientId: args.patientId, kind: args.kind, value, valueNormalized: normalized, isPrimary: !!args.isPrimary, isActive: true } })
    auditCreate(uow, actor, 'ContactPoint', contact.id, 'contact.added', { patientId: args.patientId, kind: args.kind, isPrimary: contact.isPrimary })
    return { contactPointId: contact.id }
  })
  return { replay: result.replay, ...result.value }
}

export async function deactivateContactPoint(_root: unknown, args: { contactPointId: string; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManagePatients')
  const reason = requireText(args.reason, 'reason')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'patient.deactivate_contact', actor, idempotencyKey, params }, async uow => {
    const contact = await uow.tx.contactPoint.findUnique({ where: { id: args.contactPointId } })
    if (!contact?.patientId) throw new DomainError(Codes.NOT_FOUND, 'Contact not found.')
    await assertPatientInScope(uow.tx, locationIds, contact.patientId)
    await uow.tx.contactPoint.update({ where: { id: contact.id }, data: { isActive: false, isPrimary: false } })
    // A dead number or address carries no consent (I-X1).
    const revoked = await uow.tx.consentGrant.updateMany({ where: { contactPointId: contact.id, status: 'granted' }, data: { status: 'revoked', revokedAt: uow.now, revokeReason: 'contact_deactivated', version: { increment: 1 } } })
    uow.audit({ eventType: 'contact.deactivated', entityType: 'ContactPoint', entityId: contact.id, actorUserId: actor.kind === 'user' ? actor.userId : null, reason, after: { consentsRevoked: revoked.count } })
    return { contactPointId: contact.id, consentsRevoked: revoked.count }
  })
  return { replay: result.replay, ...result.value }
}

export async function grantConsentIn(uow: UnitOfWork, actor: Actor, input: { contactPointId: string; channel: string; purpose: string; source: string; evidence?: Record<string, unknown> }) {
  if (!(CONSENT_CHANNELS as readonly string[]).includes(input.channel)) throw new DomainError(Codes.INVALID_INPUT, 'Unknown consent channel.', { field: 'channel' })
  if (!(CONSENT_PURPOSES as readonly string[]).includes(input.purpose)) throw new DomainError(Codes.INVALID_INPUT, 'Unknown consent purpose.', { field: 'purpose' })
  const contact = await uow.tx.contactPoint.findUnique({ where: { id: input.contactPointId } })
  if (!contact || !contact.isActive) throw new DomainError(Codes.NOT_FOUND, 'Contact not found.')
  const fits = input.channel === 'email' ? contact.kind === 'email' : contact.kind !== 'email'
  if (!fits) throw new DomainError(Codes.INVALID_INPUT, `A ${contact.kind} contact can't carry ${input.channel} consent.`, { field: 'channel' })
  await advisoryLock(uow.tx, `consent:${contact.id}`)
  const existing = await uow.tx.consentGrant.findFirst({ where: { contactPointId: contact.id, channel: input.channel, purpose: input.purpose, status: 'granted' } })
  if (existing) return existing
  const grant = await uow.tx.consentGrant.create({
    data: { contactPointId: contact.id, channel: input.channel, purpose: input.purpose, status: 'granted', source: input.source, evidence: (input.evidence ?? {}) as never, recordedById: actor.kind === 'user' ? actor.userId : null, grantedAt: uow.now },
  })
  auditCreate(uow, actor, 'ConsentGrant', grant.id, 'consent.granted', { contactPointId: contact.id, channel: input.channel, purpose: input.purpose, source: input.source })
  return grant
}

export async function revokeConsentIn(uow: UnitOfWork, actor: Actor, input: { contactPointId: string; channel: string; purpose?: string | null; reason: string }) {
  const where = { contactPointId: input.contactPointId, channel: input.channel, status: 'granted', ...(input.purpose ? { purpose: input.purpose } : {}) }
  const grants = await uow.tx.consentGrant.findMany({ where, select: { id: true, purpose: true } })
  if (!grants.length) return 0
  await uow.tx.consentGrant.updateMany({ where: { id: { in: grants.map(g => g.id) } }, data: { status: 'revoked', revokedAt: uow.now, revokeReason: input.reason, version: { increment: 1 } } })
  for (const g of grants) uow.audit({ eventType: 'consent.revoked', entityType: 'ConsentGrant', entityId: g.id, actorUserId: actor.kind === 'user' ? actor.userId : null, reason: input.reason, after: { purpose: g.purpose } })
  return grants.length
}

export async function recordConsent(_root: unknown, args: { contactPointId: string; channel: string; purpose: string; granted: boolean; source?: string | null; evidence?: Record<string, unknown> | null; reason?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManagePatients', 'canMessagePatients')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'consent.record', actor, idempotencyKey, params }, async uow => {
    const contact = await uow.tx.contactPoint.findUnique({ where: { id: args.contactPointId }, select: { patientId: true } })
    if (!contact?.patientId) throw new DomainError(Codes.NOT_FOUND, 'Contact not found.')
    await assertPatientInScope(uow.tx, locationIds, contact.patientId)
    if (args.granted) {
      // A staff-recorded verbal consent carries the staff member's note as its evidence.
      const evidence = args.evidence ?? (args.reason?.trim() ? { note: args.reason.trim(), recordedVia: 'staff_dashboard' } : {})
      if (args.source === 'verbal_staff' && !String((evidence as any).note ?? '').trim()) throw new DomainError(Codes.INVALID_INPUT, 'Note what the patient said and when.', { field: 'evidence' })
      const grant = await grantConsentIn(uow, actor, { contactPointId: args.contactPointId, channel: args.channel, purpose: args.purpose, source: args.source ?? 'verbal_staff', evidence })
      return { consentGrantId: grant.id, status: 'granted' }
    }
    const revoked = await revokeConsentIn(uow, actor, { contactPointId: args.contactPointId, channel: args.channel, purpose: args.purpose, reason: requireText(args.reason, 'reason') })
    return { revoked, status: 'revoked' }
  })
  return { replay: result.replay, ...result.value }
}

// ── Alerts and guarantor ────────────────────────────────────────────────────────────────────────

export async function addPatientAlert(_root: unknown, args: { patientId: string; kind: string; severity: string; text: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManagePatients', 'canChart')
  if (!(ALERT_KINDS as readonly string[]).includes(args.kind)) throw new DomainError(Codes.INVALID_INPUT, 'Unknown alert kind.', { field: 'kind' })
  if (!['info', 'caution', 'critical'].includes(args.severity)) throw new DomainError(Codes.INVALID_INPUT, 'Choose info, caution or critical.', { field: 'severity' })
  const text = requireText(args.text, 'alert text', 500)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'patient.alert_add', actor, idempotencyKey, params }, async uow => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const alert = await uow.tx.patientAlert.create({ data: { patientId: args.patientId, kind: args.kind, severity: args.severity, text, source: 'manual', activeFrom: uow.now, recordedById: actor.kind === 'user' ? actor.userId : null } })
    auditCreate(uow, actor, 'PatientAlert', alert.id, 'alert.added', { patientId: args.patientId, kind: args.kind, severity: args.severity })
    return { alertId: alert.id }
  })
  return { replay: result.replay, ...result.value }
}

export async function endPatientAlert(_root: unknown, args: { alertId: string; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManagePatients', 'canChart')
  const reason = requireText(args.reason, 'reason')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'patient.alert_end', actor, idempotencyKey, params }, async uow => {
    const alert = await uow.tx.patientAlert.findUnique({ where: { id: args.alertId } })
    if (!alert?.patientId) throw new DomainError(Codes.NOT_FOUND, 'Alert not found.')
    await assertPatientInScope(uow.tx, locationIds, alert.patientId)
    if (alert.endedAt) return { alertId: alert.id, endedAt: alert.endedAt.toISOString() }
    await uow.tx.patientAlert.update({ where: { id: alert.id }, data: { endedAt: uow.now, version: { increment: 1 } } })
    uow.audit({ eventType: 'alert.ended', entityType: 'PatientAlert', entityId: alert.id, actorUserId: actor.kind === 'user' ? actor.userId : null, reason })
    return { alertId: alert.id, endedAt: uow.now.toISOString() }
  })
  return { replay: result.replay, ...result.value }
}

/** Change who is responsible for the account (SM§1.3): end the active link, open a new one. Balances stay put. */
export async function linkGuarantor(_root: unknown, args: { patientId: string; guarantorPatientId?: string | null; personName?: Record<string, unknown> | null; relationship: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManagePatients')
  if (!(GUARANTOR_RELATIONSHIPS as readonly string[]).includes(args.relationship)) throw new DomainError(Codes.INVALID_INPUT, 'Unknown relationship.', { field: 'relationship' })
  if (!args.guarantorPatientId && !String((args.personName as any)?.lastName ?? '').trim()) throw new DomainError(Codes.INVALID_INPUT, 'Choose a guarantor or enter their name.', { field: 'personName' })
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'patient.link_guarantor', actor, idempotencyKey, params }, async uow => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId)
    await advisoryLock(uow.tx, `patient:${args.patientId}`)
    const patient = await uow.tx.patient.findUniqueOrThrow({ where: { id: args.patientId }, select: { homeLocation: { select: { timeZone: true } }, isSynthetic: true } })
    const today = new Date(`${localDate(patient.homeLocation?.timeZone ?? 'UTC', uow.now)}T00:00:00Z`)
    let guarantor = args.guarantorPatientId ? await uow.tx.guarantor.findFirst({ where: { patientId: args.guarantorPatientId } }) : null
    if (!guarantor) guarantor = await uow.tx.guarantor.create({ data: { patientId: args.guarantorPatientId ?? null, personName: (args.guarantorPatientId ? {} : args.personName) as never, isSynthetic: patient.isSynthetic } })
    const current = await uow.tx.guarantorLink.findFirst({ where: { patientId: args.patientId, status: 'active' } })
    if (current?.guarantorId === guarantor.id) return { guarantorId: guarantor.id, guarantorLinkId: current.id, changed: false }
    if (current) await transition(uow, { model: 'GuarantorLink', id: current.id, from: ['active'], to: 'ended', actor, eventType: 'guarantor.unlinked', data: { endsOn: today } })
    const link = await uow.tx.guarantorLink.create({ data: { patientId: args.patientId, guarantorId: guarantor.id, relationship: args.relationship, status: 'active', startsOn: today } })
    auditCreate(uow, actor, 'GuarantorLink', link.id, 'guarantor.linked', { patientId: args.patientId, guarantorId: guarantor.id, relationship: args.relationship })
    return { guarantorId: guarantor.id, guarantorLinkId: link.id, changed: true }
  })
  return { replay: result.replay, ...result.value }
}

// ── Status (SM§1.1) ─────────────────────────────────────────────────────────────────────────────

export async function setPatientStatus(_root: unknown, args: { patientId: string; status: 'active' | 'inactive' | 'archived' | 'deceased'; expectedVersion: number; dateOfDeath?: string | null; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManagePatients')
  const reason = requireText(args.reason, 'reason')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'patient.set_status', actor, idempotencyKey, params }, async uow => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const future = await uow.tx.appointment.findMany({ where: { patientId: args.patientId, status: { in: [...ACTIVE_APPOINTMENT_STATUSES] }, startsAt: { gt: uow.now } }, select: { id: true, status: true } })
    const from: Record<string, string[]> = { active: ['prospect', 'inactive'], inactive: ['active'], archived: ['prospect', 'active', 'inactive'], deceased: ['prospect', 'active', 'inactive', 'archived'] }
    if (!from[args.status]) throw new DomainError(Codes.INVALID_INPUT, 'Choose active, inactive, archived or deceased.', { field: 'status' })
    let data: Record<string, unknown> = {}
    if (args.status === 'archived' || args.status === 'inactive') {
      if (future.length) throw new DomainError(Codes.GUARD_FAILED, `Cancel the ${future.length} upcoming appointment${future.length === 1 ? '' : 's'} first.`)
      // Balance, open claims, plans and memberships join this guard with the ledger (Phase 4).
    }
    if (args.status === 'deceased') {
      if (!args.dateOfDeath || !DOB.test(args.dateOfDeath)) throw new DomainError(Codes.INVALID_INPUT, 'Enter the date of death.', { field: 'dateOfDeath' })
      data = { dateOfDeath: new Date(`${args.dateOfDeath}T00:00:00Z`), statementHold: true }
    }
    const updated = await transition<any>(uow, { model: 'Patient', id: args.patientId, from: from[args.status], to: args.status, expectedVersion: args.expectedVersion, actor, eventType: `patient.${args.status}`, reason, data })
    if (args.status === 'deceased') {
      // Future appointments are cancelled (reason deceased) and outreach stops (SM§1.1).
      for (const a of future.filter(f => f.status === 'scheduled' || f.status === 'confirmed')) await withdrawIn(uow, actor, a.id, 'deceased')
      await uow.tx.asapEntry.updateMany({ where: { patientId: args.patientId, status: { in: ['active', 'offered'] } }, data: { status: 'expired', version: { increment: 1 } } })
      const contacts = await uow.tx.contactPoint.findMany({ where: { patientId: args.patientId }, select: { id: true } })
      await uow.tx.consentGrant.updateMany({ where: { contactPointId: { in: contacts.map(c => c.id) }, status: 'granted' }, data: { status: 'revoked', revokedAt: uow.now, revokeReason: 'deceased', version: { increment: 1 } } })
    }
    return { patientId: updated.id, status: updated.status, version: updated.version }
  })
  return { replay: result.replay, ...result.value }
}

// ── Merge (SM§1.2) ──────────────────────────────────────────────────────────────────────────────

/** Rows that move to the survivor. Ledger rows never move (a family transfer is a ledger entry). */
const MERGE_CHILDREN: { list: string; field: string }[] = [
  { list: 'Appointment', field: 'patientId' },
  { list: 'AsapEntry', field: 'patientId' },
  { list: 'BookingHold', field: 'patientId' },
  { list: 'PatientAlert', field: 'patientId' },
  { list: 'ContactPoint', field: 'patientId' },
  { list: 'PatientIdentifier', field: 'patientId' },
  { list: 'Referral', field: 'patientId' },
  { list: 'PortalScope', field: 'patientId' },
  { list: 'Conversation', field: 'patientId' },
  { list: 'PublicBookingRequest', field: 'patientMatchId' },
]

export async function proposeMergeIn(uow: UnitOfWork, actor: Actor, input: { survivorId: string; mergedId: string; reason: string; evidence?: Record<string, unknown> }) {
  if (input.survivorId === input.mergedId) throw new DomainError(Codes.INVALID_INPUT, 'Choose two different records.')
  const [survivor, merged] = await Promise.all([uow.tx.patient.findUnique({ where: { id: input.survivorId } }), uow.tx.patient.findUnique({ where: { id: input.mergedId } })])
  if (!survivor || !merged) throw new DomainError(Codes.NOT_FOUND, 'Patient not found.')
  if (survivor.status === 'merged_into' || merged.status === 'merged_into') throw new DomainError(Codes.GUARD_FAILED, 'One of these records was already merged.')
  const open = await uow.tx.mergeCase.findFirst({ where: { status: { in: ['proposed', 'approved'] }, OR: [{ survivorId: input.survivorId, mergedId: input.mergedId }, { survivorId: input.mergedId, mergedId: input.survivorId }] } })
  if (open) return { mergeCase: open, approvalId: open.approvalId }
  const mergeCase = await uow.tx.mergeCase.create({ data: { survivorId: input.survivorId, mergedId: input.mergedId, evidence: (input.evidence ?? {}) as never, reason: input.reason, status: 'proposed', proposedById: actor.kind === 'user' ? actor.userId : null } })
  const approval = await requestApproval(uow, actor, {
    action: 'patient.merge', targetList: 'MergeCase', targetId: mergeCase.id, requiredPermission: 'canApprovePatientMerge',
    payload: { mergeCaseId: mergeCase.id, survivorId: input.survivorId, mergedId: input.mergedId },
    summary: `Merge chart ${merged.chartNumber} into ${survivor.chartNumber}`,
    scope: { locationId: survivor.homeLocationId ?? null, patientId: input.survivorId, otherPatientId: input.mergedId },
  })
  await uow.tx.mergeCase.update({ where: { id: mergeCase.id }, data: { approvalId: approval.id } })
  auditCreate(uow, actor, 'MergeCase', mergeCase.id, 'merge.proposed', { survivorId: input.survivorId, mergedId: input.mergedId }, { reason: input.reason })
  return { mergeCase, approvalId: approval.id }
}

export async function proposeMerge(_root: unknown, args: { survivorId: string; mergedId: string; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManagePatients')
  const reason = requireText(args.reason, 'reason')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'patient.merge_propose', actor, idempotencyKey, params }, async uow => {
    const survivorId = await resolvePatientRef(uow.tx, args.survivorId)
    const mergedId = await resolvePatientRef(uow.tx, args.mergedId)
    await assertPatientInScope(uow.tx, locationIds, survivorId)
    await assertPatientInScope(uow.tx, locationIds, mergedId)
    const { mergeCase, approvalId } = await proposeMergeIn(uow, actor, { survivorId, mergedId, reason, evidence: { proposedBy: 'staff' } })
    return { mergeCaseId: mergeCase.id, approvalId, status: mergeCase.status }
  })
  return { replay: result.replay, ...result.value }
}

/** Applied in the approval transaction: re-point child rows and record every move in MergeMap. */
export async function applyMergeIn(uow: UnitOfWork, actor: Actor, mergeCaseId: string, approverId: string | null) {
  const mergeCase = await lockRow<any>(uow.tx, 'MergeCase', mergeCaseId)
  if (mergeCase.status !== 'proposed' && mergeCase.status !== 'approved') throw new DomainError(Codes.INVALID_TRANSITION, `A ${mergeCase.status} merge can't be applied.`, { currentStatus: mergeCase.status })
  const { survivorId, mergedId } = mergeCase as { survivorId: string; mergedId: string }
  await lockResourcesForMerge(uow.tx, survivorId, mergedId)
  const merged = await lockRow<any>(uow.tx, 'Patient', mergedId)
  const survivor = await lockRow<any>(uow.tx, 'Patient', survivorId)
  if (merged.status === 'merged_into' || survivor.status === 'merged_into') throw new DomainError(Codes.GUARD_FAILED, 'One of these records was already merged.')
  if (mergeCase.status === 'proposed') await transition(uow, { model: 'MergeCase', id: mergeCaseId, from: ['proposed'], to: 'approved', actor, eventType: 'merge.approved', approverId })

  let seq = 0
  const entries: { listKey: string; rowId: string; field: string; fromId: string; toId: string; seq: number }[] = []
  // A moved primary contact steps down when the survivor already has a primary of that kind.
  const survivorPrimary = new Set((await uow.tx.contactPoint.findMany({ where: { patientId: survivorId, isPrimary: true, isActive: true }, select: { kind: true } })).map(c => c.kind))
  for (const { list, field } of MERGE_CHILDREN) {
    const rows = await (delegateOf(uow.tx, list) as any).findMany({ where: { [field]: mergedId }, select: { id: true, ...(list === 'ContactPoint' ? { kind: true, isPrimary: true, isActive: true } : {}) } })
    for (const row of rows) {
      if (list === 'ContactPoint' && row.isPrimary && row.isActive && survivorPrimary.has(row.kind)) {
        await uow.tx.contactPoint.update({ where: { id: row.id }, data: { isPrimary: false } })
        entries.push({ listKey: list, rowId: row.id, field: 'isPrimary', fromId: 'true', toId: 'false', seq: seq++ })
      }
      try {
        await (delegateOf(uow.tx, list) as any).update({ where: { id: row.id }, data: { [field]: survivorId } })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/exclusion constraint|unique constraint|Unique constraint/i.test(message)) throw new DomainError(Codes.MERGE_CONFLICT, `The two records have conflicting ${list === 'Appointment' ? 'overlapping appointments' : list} rows. Resolve them before merging.`)
        throw error
      }
      entries.push({ listKey: list, rowId: row.id, field, fromId: mergedId, toId: survivorId, seq: seq++ })
    }
  }
  if (entries.length) await uow.tx.mergeMap.createMany({ data: entries.map(e => ({ ...e, mergeCaseId })) })
  const practice = await uow.tx.practiceSettings.findUnique({ where: { id: 1 }, select: { mergeRevertDays: true } })
  const revertibleUntil = new Date(uow.now.getTime() + (practice?.mergeRevertDays ?? 30) * 86_400_000)
  await uow.tx.patient.update({ where: { id: mergedId }, data: { status: 'merged_into', mergedIntoId: survivorId, version: { increment: 1 } } })
  uow.audit({ eventType: 'patient.merged_into', entityType: 'Patient', entityId: mergedId, actorUserId: actor.kind === 'user' ? actor.userId : null, approverId, before: { status: merged.status }, after: { status: 'merged_into', mergedIntoId: survivorId } })
  const applied = await transition<any>(uow, { model: 'MergeCase', id: mergeCaseId, from: ['approved'], to: 'applied', actor, eventType: 'merge.applied', approverId, data: { appliedAt: uow.now, revertibleUntil, mergedStatusBefore: merged.status }, metadata: { moved: entries.length } })
  return { mergeCaseId: applied.id, status: applied.status, moved: entries.length, revertibleUntil: revertibleUntil.toISOString() }
}

async function lockResourcesForMerge(tx: Tx, a: string, b: string) {
  for (const id of [a, b].sort()) await advisoryLock(tx, `patient:${id}`)
}

registerApplier('patient.merge', async (uow, actor, request) => {
  const decision = await uow.tx.approvalDecision.findFirst({ where: { requestId: request.id, decision: 'approve' }, orderBy: { at: 'desc' } })
  return applyMergeIn(uow, actor, String(request.payload.mergeCaseId), decision?.decidedById ?? null)
}, { applyOnApprove: true })

/** Undo a merge inside the revert window: replay the map backwards, with a reason. */
export async function revertMerge(_root: unknown, args: { mergeCaseId: string; expectedVersion: number; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, 'canApprovePatientMerge', 'canManagePatients')
  const reason = requireText(args.reason, 'reason')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'patient.merge_revert', actor, idempotencyKey, params }, async uow => revertMergeIn(uow, actor, args.mergeCaseId, reason, args.expectedVersion))
  return { replay: result.replay, ...result.value }
}

export async function revertMergeIn(uow: UnitOfWork, actor: Actor, mergeCaseId: string, reason: string, expectedVersion?: number | null) {
  const mergeCase = await lockRow<any>(uow.tx, 'MergeCase', mergeCaseId)
  if (mergeCase.status !== 'applied') throw new DomainError(Codes.INVALID_TRANSITION, `A ${mergeCase.status} merge can't be reverted.`, { currentStatus: mergeCase.status })
  if (!mergeCase.revertibleUntil || mergeCase.revertibleUntil.getTime() <= uow.now.getTime()) throw new DomainError(Codes.GUARD_FAILED, 'The revert window has passed; this merge is permanent.')
  await lockResourcesForMerge(uow.tx, mergeCase.survivorId, mergeCase.mergedId)
  const entries = await uow.tx.mergeMap.findMany({ where: { mergeCaseId }, orderBy: { seq: 'desc' } })
  for (const e of entries) {
    const delegate = delegateOf(uow.tx, e.listKey) as any
    if (e.field === 'isPrimary') {
      await delegate.update({ where: { id: e.rowId }, data: { isPrimary: e.fromId === 'true' } })
      continue
    }
    const row = await delegate.findUnique({ where: { id: e.rowId }, select: { id: true, [e.field]: true } })
    // A row deleted or re-pointed since the merge is left alone and reported.
    if (!row || row[e.field] !== e.toId) continue
    await delegate.update({ where: { id: e.rowId }, data: { [e.field]: e.fromId } })
  }
  await uow.tx.patient.update({ where: { id: mergeCase.mergedId }, data: { status: mergeCase.mergedStatusBefore || 'active', mergedIntoId: null, version: { increment: 1 } } })
  uow.audit({ eventType: 'patient.unmerged', entityType: 'Patient', entityId: mergeCase.mergedId, actorUserId: actor.kind === 'user' ? actor.userId : null, reason, after: { status: mergeCase.mergedStatusBefore || 'active' } })
  const reverted = await transition<any>(uow, { model: 'MergeCase', id: mergeCaseId, from: ['applied'], to: 'reverted', expectedVersion, actor, eventType: 'merge.reverted', reason, data: { revertedAt: uow.now } })
  return { mergeCaseId: reverted.id, status: reverted.status, restored: entries.length }
}
