import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { requirePermission, systemActor, type Actor } from '../lib/actor'
import { auditCreate, transition } from '../lib/cas'
import { command } from '../lib/command'
import { DomainError, Codes } from '../lib/errors'
import { parsePackRules } from '../lib/jurisdiction'
import type { UnitOfWork } from '../lib/unitOfWork'
import { PORTAL_CAPABILITIES, PORTAL_RELATIONSHIPS, type PortalCapability } from '../models/portal'
import { recordDirectPhiRead } from '../security/phiReadAudit'
import { enforcePublicLimit } from '../security/publicRateLimit'
import { grantConsentIn, revokeConsentIn } from './patients'
import { cancelIn, confirmIn, rescheduleIn } from './scheduling'
import { assertPatientInScope, normalizeContact, staff, type Ctx } from './shared'

/*
 * Patient portal API (INTEGRATIONS §9; SCHEMA §16). Backend only: the portal pages wait for the
 * owner's design pick. A portal account is not a dashboard User:
 *   - sign-in is an emailed six-digit code (hashed at rest, 10 minutes, 5 tries), then a portal token;
 *   - the token is HMAC-signed, carries the account's authVersion (staff suspending an account or a
 *     new sign-in code bumps it) and expires after 2 hours;
 *   - every read and action names a patient and passes the PortalScope check: an active scope for that
 *     patient, not expired, with the capability, and for guardian scopes the patient is still a minor
 *     under the location's jurisdiction pack.
 * Reads are written to PhiReadAudit with purpose patient_request.
 */

const CODE_TTL_MS = 10 * 60_000
const CODE_MAX_FAILURES = 5
const TOKEN_TTL_MS = 2 * 3_600_000
const TOKEN_HEADER = 'x-portal-token'

const secret = () => {
  const value = process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'local-development-session-secret-change-me-now')
  if (value.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.')
  return value
}
const mac = (purpose: string, value: string) => createHmac('sha256', secret()).update(`${purpose}\0${value}`).digest('base64url')
const portalActor = (accountId: string): Actor => systemActor(`portal:${accountId}`)

function equal(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

// ── Sign-in ─────────────────────────────────────────────────────────────────────────────────────

/** Issue a sign-in code for an active account. Returns the code to the caller (server code only). */
export async function issuePortalCode(db: any, email: string, now = new Date()) {
  const normalized = normalizeContact('email', email).normalized
  const account = await db.portalAccount.findUnique({ where: { email: normalized } })
  if (!account || !['invited', 'active'].includes(account.status)) return null
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await db.portalAccount.update({ where: { id: account.id }, data: { codeHash: mac('portal-code', `${account.id}:${code}`), codeExpiresAt: new Date(now.getTime() + CODE_TTL_MS), codeFailures: 0 } })
  return { accountId: account.id, code, email: normalized }
}

/** Ask for a sign-in code. The answer is the same whether or not the address has an account. */
export async function portalRequestCode(_root: unknown, args: { email: string }, context: Ctx) {
  const email = normalizeContact('email', args.email).normalized
  await enforcePublicLimit(context.prisma, { scope: 'portal-code', req: context.req, contacts: [email] })
  const issued = await issuePortalCode(context.prisma, email)
  if (issued) {
    await command(context.prisma, { name: 'portal.code_sent', actor: portalActor(issued.accountId), idempotencyKey: `portal-code:${issued.accountId}:${Date.now()}`, params: { accountId: issued.accountId } }, async uow => {
      // Nothing is sent from here: no texting or email machinery lives in this app. The code is never logged or audited.
      uow.audit({ eventType: 'portal.code_sent', entityType: 'PortalAccount', entityId: issued.accountId })
      return null
    })
  }
  return { sent: true }
}

/** Exchange a code for a portal token. Five wrong codes void the code; a new one must be requested. */
export async function portalSession(_root: unknown, args: { email: string; code: string }, context: Ctx) {
  const email = normalizeContact('email', args.email).normalized
  await enforcePublicLimit(context.prisma, { scope: 'portal-session', req: context.req, contacts: [email] })
  const invalid = () => new DomainError(Codes.PORTAL_SESSION_INVALID, 'That code is not valid. Request a new one.')
  const now = new Date()
  const account = await context.prisma.portalAccount.findUnique({ where: { email } })
  if (!account || !['invited', 'active'].includes(account.status) || !account.codeHash || !account.codeExpiresAt || account.codeExpiresAt.getTime() <= now.getTime()) throw invalid()
  const presented = mac('portal-code', `${account.id}:${String(args.code ?? '').trim()}`)
  if (!equal(presented, account.codeHash)) {
    const failures = Number(account.codeFailures ?? 0) + 1
    await context.prisma.portalAccount.update({ where: { id: account.id }, data: failures >= CODE_MAX_FAILURES ? { codeHash: null, codeExpiresAt: null, codeFailures: failures } : { codeFailures: failures } })
    throw invalid()
  }
  const result = await command(context.prisma, { name: 'portal.sign_in', actor: portalActor(account.id), idempotencyKey: `portal-sign-in:${account.id}:${presented.slice(0, 16)}`, params: { accountId: account.id } }, async uow => {
    const updated = await uow.tx.portalAccount.updateMany({ where: { id: account.id, codeHash: account.codeHash }, data: { codeHash: null, codeExpiresAt: null, codeFailures: 0, lastLoginAt: uow.now, status: 'active', identityVerifiedAt: account.identityVerifiedAt ?? uow.now, version: { increment: 1 } } })
    if (updated.count !== 1) throw invalid()
    uow.audit({ eventType: 'portal.signed_in', entityType: 'PortalAccount', entityId: account.id })
    return { accountId: account.id }
  })
  if (result.replay) throw invalid()
  return { token: signPortalToken({ accountId: account.id, authVersion: Number(account.authVersion ?? 1) }, now), expiresAt: new Date(now.getTime() + TOKEN_TTL_MS).toISOString() }
}

export function signPortalToken(claims: { accountId: string; authVersion: number }, now = new Date()) {
  const body = Buffer.from(JSON.stringify({ a: claims.accountId, v: claims.authVersion, e: now.getTime() + TOKEN_TTL_MS })).toString('base64url')
  return `pt1.${body}.${mac('portal-token', body)}`
}

function readToken(token: string, now = Date.now()) {
  const [prefix, body, signature] = String(token ?? '').split('.')
  if (prefix !== 'pt1' || !body || !signature || !equal(mac('portal-token', body), signature)) return null
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { a: string; v: number; e: number }
    if (!claims.a || !Number.isFinite(claims.e) || claims.e <= now) return null
    return claims
  } catch {
    return null
  }
}

// ── Scope ───────────────────────────────────────────────────────────────────────────────────────

export type PortalPrincipal = { accountId: string; scopes: { id: string; patientId: string; relationship: string; capabilities: string[]; confidentialItemsHidden: boolean }[] }

const ageOn = (dob: Date, at: Date) => {
  let age = at.getUTCFullYear() - dob.getUTCFullYear()
  const m = at.getUTCMonth() - dob.getUTCMonth()
  if (m < 0 || (m === 0 && at.getUTCDate() < dob.getUTCDate())) age -= 1
  return age
}

/** The signed-in portal account and its currently valid scopes. */
export async function portalPrincipal(context: Ctx, now = new Date()): Promise<PortalPrincipal> {
  const header = context.req?.headers?.[TOKEN_HEADER]
  const claims = readToken(Array.isArray(header) ? header[0] : header, now.getTime())
  if (!claims) throw new DomainError(Codes.PORTAL_SESSION_INVALID, 'Your session has ended. Sign in again.')
  const account = await context.prisma.portalAccount.findUnique({ where: { id: claims.a }, select: { id: true, status: true, authVersion: true } })
  if (!account || account.status !== 'active' || Number(account.authVersion ?? 1) !== Number(claims.v)) throw new DomainError(Codes.PORTAL_SESSION_INVALID, 'Your session has ended. Sign in again.')
  const scopes = await context.prisma.portalScope.findMany({
    where: { accountId: account.id, status: 'active', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    include: { patient: { select: { id: true, status: true, dateOfBirth: true, homeLocation: { select: { jurisdiction: { select: { rules: true } } } } } } },
  })
  const valid = scopes.filter((s: any) => {
    if (!s.patient || ['merged_into', 'archived'].includes(s.patient.status)) return false
    if (!s.validUntilMajority) return true
    let majority = 18
    try {
      if (s.patient.homeLocation?.jurisdiction?.rules) majority = parsePackRules(s.patient.homeLocation.jurisdiction.rules).retention.value.majorityAge
    } catch {
      majority = 18
    }
    return ageOn(s.patient.dateOfBirth, now) < majority
  })
  return { accountId: account.id, scopes: valid.map((s: any) => ({ id: s.id, patientId: s.patientId, relationship: s.relationship, capabilities: Array.isArray(s.capabilities) ? s.capabilities : [], confidentialItemsHidden: s.confidentialItemsHidden })) }
}

export function assertPortalScope(principal: PortalPrincipal, patientId: string | null | undefined, capability: PortalCapability) {
  const scope = principal.scopes.find(s => s.patientId === patientId)
  if (!scope || !scope.capabilities.includes(capability)) throw new DomainError(Codes.PORTAL_SCOPE_DENIED, 'You don’t have access to that.')
  return scope
}

async function auditPortalRead(context: Ctx, principal: PortalPrincipal, operationName: string, list: string, ids: string[], fields: string[]) {
  await recordDirectPhiRead(context.prisma, { purpose: 'patient_request', correlationReference: `portal:${principal.accountId}` }, { operationName, list, ids, fields, tiers: ['dem'] })
}

// ── Portal reads and actions ────────────────────────────────────────────────────────────────────

/** The people this account may act for (names come from scopes the practice granted). */
export async function portalMe(_root: unknown, _args: unknown, context: Ctx) {
  const principal = await portalPrincipal(context)
  const patients = await context.prisma.patient.findMany({ where: { id: { in: principal.scopes.map(s => s.patientId) } }, select: { id: true, firstName: true, preferredName: true } })
  await auditPortalRead(context, principal, 'portalMe', 'Patient', patients.map((p: any) => p.id), ['firstName', 'preferredName'])
  return {
    people: principal.scopes.map(s => {
      const p = patients.find((x: any) => x.id === s.patientId)
      return { patientId: s.patientId, name: p?.preferredName || p?.firstName || '', relationship: s.relationship, capabilities: s.capabilities }
    }),
  }
}

export async function portalAppointments(_root: unknown, args: { patientId: string }, context: Ctx) {
  const principal = await portalPrincipal(context)
  assertPortalScope(principal, args.patientId, 'appointments')
  const since = new Date(Date.now() - 365 * 86_400_000)
  const rows = await context.prisma.appointment.findMany({
    where: { patientId: args.patientId, startsAt: { gte: since }, status: { notIn: ['planned', 'rescheduled'] } },
    orderBy: { startsAt: 'asc' },
    select: { id: true, startsAt: true, endsAt: true, status: true, version: true, type: { select: { publicName: true, name: true } }, location: { select: { name: true, phone: true, timeZone: true } }, primaryProvider: { select: { displayName: true } } },
    take: 100,
  })
  await auditPortalRead(context, principal, 'portalAppointments', 'Appointment', rows.map((r: any) => r.id), ['startsAt', 'status', 'type'])
  return {
    appointments: rows.map((r: any) => ({
      id: r.id, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), status: r.status, version: r.version,
      visit: r.type?.publicName || r.type?.name || '', location: r.location?.name ?? '', locationPhone: r.location?.phone ?? '', timeZone: r.location?.timeZone ?? '',
      provider: r.primaryProvider?.displayName ?? '',
      canConfirm: r.status === 'scheduled', canChange: ['scheduled', 'confirmed'].includes(r.status) && r.startsAt.getTime() > Date.now(),
    })),
  }
}

async function portalAppointmentCommand(context: Ctx, name: string, args: { appointmentId: string; idempotencyKey: string } & Record<string, unknown>, work: (uow: UnitOfWork, actor: Actor, appointment: any) => Promise<any>) {
  const principal = await portalPrincipal(context)
  const actor = portalActor(principal.accountId)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name, actor, idempotencyKey: `portal:${principal.accountId}:${idempotencyKey}`.slice(0, 200), params }, async uow => {
    const appointment = await uow.tx.appointment.findUnique({ where: { id: args.appointmentId } })
    if (!appointment) throw new DomainError(Codes.PORTAL_SCOPE_DENIED, 'You don’t have access to that.')
    assertPortalScope(principal, appointment.patientId, 'appointments')
    const row = await work(uow, actor, appointment)
    return { appointmentId: row.id, status: row.status, version: row.version, startsAt: row.startsAt?.toISOString?.() ?? null }
  })
  return { replay: result.replay, ...result.value }
}

async function assertOutsideLateWindow(uow: UnitOfWork, appointment: { startsAt: Date }) {
  const practice = await uow.tx.practiceSettings.findUnique({ where: { id: 1 }, select: { lateCancelHours: true } })
  const hours = practice?.lateCancelHours ?? 24
  if (appointment.startsAt.getTime() - uow.now.getTime() < hours * 3_600_000) {
    throw new DomainError(Codes.LATE_CANCEL_WINDOW, `This visit is less than ${hours} hours away. Please call the office to change it.`)
  }
}

export async function portalConfirm(_root: unknown, args: { appointmentId: string; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  return portalAppointmentCommand(context, 'portal.confirm', args, (uow, actor, appointment) => confirmIn(uow, actor, appointment.id, 'portal_api', args.expectedVersion))
}

export async function portalCancel(_root: unknown, args: { appointmentId: string; expectedVersion?: number | null; reason?: string | null; idempotencyKey: string }, context: Ctx) {
  return portalAppointmentCommand(context, 'portal.cancel', args, async (uow, actor, appointment) => {
    await assertOutsideLateWindow(uow, appointment)
    return cancelIn(uow, actor, appointment.id, `Cancelled by patient online${args.reason ? `: ${String(args.reason).slice(0, 200)}` : ''}`, args.expectedVersion)
  })
}

/** Move to another online-bookable time (same rules as public booking; a fresh slot check under locks). */
export async function portalReschedule(_root: unknown, args: { appointmentId: string; expectedVersion?: number | null; operatoryId: string; startsAt: string; providerId?: string | null; idempotencyKey: string }, context: Ctx) {
  return portalAppointmentCommand(context, 'portal.reschedule', args, async (uow, actor, appointment) => {
    await assertOutsideLateWindow(uow, appointment)
    const policy = await uow.tx.onlineBookingPolicy.findFirst({ where: { locationId: appointment.locationId, isActive: true }, include: { appointmentTypes: { select: { id: true } } } })
    if (!policy || !policy.appointmentTypes.some(t => t.id === appointment.typeId)) throw new DomainError(Codes.GUARD_FAILED, 'This visit can’t be moved online. Please call the office.')
    const startsAt = new Date(String(args.startsAt))
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < uow.now.getTime() + policy.leadTimeHours * 3_600_000) throw new DomainError(Codes.OUTSIDE_TEMPLATE, 'That time is too soon to book online.')
    return rescheduleIn(uow, actor, appointment, {
      appointmentId: appointment.id, expectedVersion: args.expectedVersion ?? appointment.version, reason: 'Rescheduled by patient online', locationId: appointment.locationId, operatoryId: args.operatoryId,
      typeId: appointment.typeId, startsAt: args.startsAt, providerId: args.providerId, source: 'online_booking',
    })
  })
}

/** Contact preferences: which purposes each address may be used for (consent with portal evidence). */
export async function portalPreferences(_root: unknown, args: { patientId: string; changes?: { contactPointId: string; channel: string; purpose: string; granted: boolean }[] | null; idempotencyKey?: string | null }, context: Ctx) {
  const principal = await portalPrincipal(context)
  assertPortalScope(principal, args.patientId, 'preferences')
  const actor = portalActor(principal.accountId)
  const changes = args.changes ?? []
  if (changes.length) {
    if (!args.idempotencyKey) throw new DomainError(Codes.IDEMPOTENCY_KEY_REQUIRED, 'An idempotency key is required.')
    await command(context.prisma, { name: 'portal.preferences', actor, idempotencyKey: `portal:${principal.accountId}:${args.idempotencyKey}`.slice(0, 200), params: { patientId: args.patientId, changes } }, async uow => {
      for (const change of changes.slice(0, 20)) {
        const contact = await uow.tx.contactPoint.findUnique({ where: { id: change.contactPointId }, select: { patientId: true } })
        if (!contact || contact.patientId !== args.patientId) throw new DomainError(Codes.PORTAL_SCOPE_DENIED, 'You don’t have access to that.')
        if (change.granted) await grantConsentIn(uow, actor, { contactPointId: change.contactPointId, channel: change.channel, purpose: change.purpose, source: 'portal_api', evidence: { portalAccount: principal.accountId, at: uow.now.toISOString() } })
        else await revokeConsentIn(uow, actor, { contactPointId: change.contactPointId, channel: change.channel, purpose: change.purpose, reason: 'portal_preference' })
      }
      return null
    })
  }
  const contacts = await context.prisma.contactPoint.findMany({ where: { patientId: args.patientId, isActive: true }, select: { id: true, kind: true, valueNormalized: true, consentGrants: { where: { status: 'granted' }, select: { channel: true, purpose: true } } } })
  await auditPortalRead(context, principal, 'portalPreferences', 'ContactPoint', contacts.map((c: any) => c.id), ['valueNormalized'])
  return { contacts: contacts.map((c: any) => ({ id: c.id, kind: c.kind, masked: mask(c.kind, c.valueNormalized), consents: c.consentGrants })) }
}

const mask = (kind: string, value: string) => (kind === 'email' ? value.replace(/^(.).*(@.*)$/, '$1•••$2') : `•••${value.slice(-4)}`)

// ── Staff: grant and revoke portal access ───────────────────────────────────────────────────────

export async function grantPortalAccess(_root: unknown, args: { patientId: string; email: string; relationship: string; capabilities?: string[] | null; expiresAt?: string | null; validUntilMajority?: boolean | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManagePatients')
  if (!(PORTAL_RELATIONSHIPS as readonly string[]).includes(args.relationship)) throw new DomainError(Codes.INVALID_INPUT, 'Unknown relationship.', { field: 'relationship' })
  const capabilities = (args.capabilities?.length ? args.capabilities : ['appointments', 'preferences']).filter(c => (PORTAL_CAPABILITIES as readonly string[]).includes(c))
  const email = normalizeContact('email', args.email).normalized
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'portal.grant', actor, idempotencyKey, params }, async uow => {
    const patient = await assertPatientInScope(uow.tx, locationIds, args.patientId)
    if (['merged_into', 'archived', 'deceased'].includes(patient.status)) throw new DomainError(Codes.GUARD_FAILED, `A ${patient.status} patient can't be given portal access.`)
    let account = await uow.tx.portalAccount.findUnique({ where: { email } })
    if (!account) {
      account = await uow.tx.portalAccount.create({ data: { email, status: 'invited', invitedById: actor.kind === 'user' ? actor.userId : null, isSynthetic: false } })
      auditCreate(uow, actor, 'PortalAccount', account.id, 'portal.account_invited', { relationship: args.relationship })
    }
    const existing = await uow.tx.portalScope.findFirst({ where: { accountId: account.id, patientId: args.patientId, status: 'active' } })
    if (existing) await transition(uow, { model: 'PortalScope', id: existing.id, from: ['active'], to: 'revoked', actor, eventType: 'portal.scope_replaced' })
    const scope = await uow.tx.portalScope.create({
      data: {
        accountId: account.id, patientId: args.patientId, relationship: args.relationship, capabilities: capabilities as never, status: 'active', grantedById: actor.kind === 'user' ? actor.userId : null,
        expiresAt: args.expiresAt ? new Date(args.expiresAt) : null, validUntilMajority: args.validUntilMajority ?? args.relationship === 'guardian',
      },
    })
    auditCreate(uow, actor, 'PortalScope', scope.id, 'portal.scope_granted', { patientId: args.patientId, relationship: args.relationship, capabilities })
    return { portalAccountId: account.id, portalScopeId: scope.id }
  })
  return { replay: result.replay, ...result.value }
}

export async function revokePortalScope(_root: unknown, args: { portalScopeId: string; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManagePatients')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'portal.revoke', actor, idempotencyKey, params }, async uow => {
    const scope = await uow.tx.portalScope.findUnique({ where: { id: args.portalScopeId } })
    if (!scope?.patientId) throw new DomainError(Codes.NOT_FOUND, 'Portal access not found.')
    await assertPatientInScope(uow.tx, locationIds, scope.patientId)
    const updated = await transition<any>(uow, { model: 'PortalScope', id: scope.id, from: ['active'], to: 'revoked', actor, eventType: 'portal.scope_revoked', reason: args.reason })
    return { portalScopeId: updated.id, status: updated.status }
  })
  return { replay: result.replay, ...result.value }
}

/** Suspend an account: bumps authVersion, so every portal token for it stops working now. */
export async function suspendPortalAccount(_root: unknown, args: { portalAccountId: string; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, 'canManagePatients')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'portal.suspend', actor, idempotencyKey, params }, async uow => {
    const updated = await transition<any>(uow, { model: 'PortalAccount', id: args.portalAccountId, from: ['invited', 'active'], to: 'suspended', actor, eventType: 'portal.account_suspended', reason: args.reason, data: { authVersion: { increment: 1 }, codeHash: null, codeExpiresAt: null } })
    return { portalAccountId: updated.id, status: updated.status }
  })
  return { replay: result.replay, ...result.value }
}
