import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { systemActor } from '../lib/actor'
import { command } from '../lib/command'
import { DomainError, Codes } from '../lib/errors'
import { publicCode } from '../lib/sequence'
import { addDays, localDate } from '../lib/time'
import { clientFingerprint, enforcePublicLimit, limitsFrom, userAgentFingerprint, verifyCaptcha } from '../security/publicRateLimit'
import { createPatientIn, findDuplicates, grantConsentIn, proposeMergeIn } from './patients'
import { parsePattern, patternUnits } from '../scheduling/engine'
import { availability, createAppointment, placeHold, withdrawIn } from './scheduling'
import { assertLocation, assertPatientInScope, normalizeContact, optionalText, requireText, resolvePatientRef, staff, type Ctx } from './shared'
import { requirePermission } from '../lib/actor'
import { transition } from '../lib/cas'

/*
 * Public booking API (INTEGRATIONS §9; SCHEMA §16). No sign-in; every call is rate limited (global,
 * client, contact) and answers only with practice information and open times. It never returns a
 * patient's name or whether someone is a patient: a matched booking and a new-patient booking answer
 * the same way. The customer-facing pages that call this wait for the owner's design pick (Phase S).
 */

const actor = systemActor('public-booking')
const sha = (value: string) => createHash('sha256').update(value).digest('hex')

async function siteAndPolicy(db: any, slug: string, locationId?: string | null) {
  const site = await db.storefrontSite.findUnique({ where: { slug: String(slug ?? '') }, include: { location: true } })
  if (!site || !site.isPublished) throw new DomainError(Codes.NOT_FOUND, 'Practice not found.')
  const location = locationId ?? site.locationId
  if (!location) throw new DomainError(Codes.INVALID_INPUT, 'Choose a location.', { field: 'locationId' })
  if (site.locationId && site.locationId !== location) throw new DomainError(Codes.NOT_FOUND, 'Location not found.')
  const policy = await db.onlineBookingPolicy.findFirst({ where: { locationId: location, isActive: true }, include: { appointmentTypes: { select: { id: true } }, location: { select: { id: true, name: true, timeZone: true, isActive: true, isSynthetic: true } } } })
  if (!policy || !policy.location?.isActive) throw new DomainError(Codes.NOT_FOUND, 'Online booking is not available at this location.')
  return { site, policy, limits: limitsFrom(policy.rateLimit) }
}

function assertTypeAllowed(policy: any, typeId: string) {
  if (!policy.appointmentTypes.some((t: { id: string }) => t.id === typeId)) throw new DomainError(Codes.INVALID_INPUT, 'That visit type can’t be booked online.', { field: 'typeId' })
}

/** Practice-facing information for a storefront: no patient data, nothing tiered. */
export async function publicSite(_root: unknown, args: { slug: string }, context: Ctx) {
  await enforcePublicLimit(context.prisma, { scope: 'site', req: context.req })
  const site = await context.prisma.storefrontSite.findUnique({ where: { slug: String(args.slug ?? '') }, include: { providersShown: { where: { isActive: true }, select: { id: true, displayName: true, providerType: true, specialty: true } } } })
  if (!site || !site.isPublished) throw new DomainError(Codes.NOT_FOUND, 'Practice not found.')
  const practice = await context.prisma.practiceSettings.findUnique({ where: { id: 1 }, select: { displayName: true, isSynthetic: true } })
  const locations = await context.prisma.location.findMany({
    where: { isActive: true, ...(site.locationId ? { id: site.locationId } : {}) },
    select: { id: true, name: true, address: true, phone: true, timeZone: true, hours: true },
    orderBy: { name: 'asc' },
  })
  const policies = await context.prisma.onlineBookingPolicy.findMany({
    where: { isActive: true, locationId: { in: locations.map((l: any) => l.id) } },
    include: { appointmentTypes: { where: { isActive: true, onlineBookable: true }, select: { id: true, name: true, publicName: true, category: true, defaultPattern: true, newPatientOnly: true } } },
  })
  const unit = (await context.prisma.practiceSettings.findUnique({ where: { id: 1 }, select: { scheduleUnitMinutes: true } }))?.scheduleUnitMinutes ?? 10
  return {
    slug: site.slug, headline: site.headline, about: site.about, services: site.services, seo: site.seo, brand: site.brand,
    practiceName: practice?.displayName ?? '', sample: practice?.isSynthetic ? 'Sample practice: synthetic data' : null,
    providers: site.providersShown.map((p: any) => ({ id: p.id, name: p.displayName, kind: p.providerType, specialty: p.specialty })),
    locations: locations.map((l: any) => {
      const policy = policies.find((p: any) => p.locationId === l.id)
      return {
        ...l,
        onlineBooking: policy ? {
          newPatientAllowed: policy.newPatientAllowed, leadTimeHours: policy.leadTimeHours, horizonDays: policy.horizonDays, holdMinutes: policy.holdMinutes,
          depositMinor: String(policy.depositMinor ?? 0n), requireInsuranceCapture: policy.requireInsuranceCapture,
          visitTypes: policy.appointmentTypes.map((t: any) => ({ id: t.id, name: t.publicName || t.name, category: t.category, minutes: minutesOf(t.defaultPattern, unit), newPatientOnly: t.newPatientOnly })),
        } : null,
      }
    }),
  }
}

/** Open times only (never who is booked). Lead time, horizon and online-bookable blocks apply. */
export async function publicAvailability(_root: unknown, args: { slug: string; locationId?: string | null; typeId: string; fromDate: string; days?: number | null; providerId?: string | null }, context: Ctx) {
  const { policy, limits } = await siteAndPolicy(context.prisma, args.slug, args.locationId)
  await enforcePublicLimit(context.prisma, { scope: 'availability', req: context.req, limits })
  assertTypeAllowed(policy, args.typeId)
  const today = localDate(policy.location.timeZone, new Date())
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(args.fromDate)) && args.fromDate > today ? args.fromDate : today
  const lastDay = addDays(today, policy.horizonDays)
  if (from > lastDay) return { slots: [], durationMinutes: 0 }
  const result = await availability(context.prisma, {
    locationId: policy.locationId, typeId: args.typeId, fromDate: from, days: Math.min(Number(args.days ?? 7), 14), providerId: args.providerId,
    onlineOnly: true, leadMinutes: policy.leadTimeHours * 60, limit: 120, horizonDays: 14,
  })
  return {
    durationMinutes: result.durationMinutes,
    slots: result.slots.filter(s => s.localDate <= lastDay).map(s => ({ startsAt: s.startsAt, endsAt: s.endsAt, operatoryId: s.operatoryId, providerId: s.providerId, localDate: s.localDate })),
  }
}

/**
 * Hold a time for the person filling in the form (default 10 minutes). The answer carries a hold
 * token; only its hash is stored, so the token is the proof of ownership at submit.
 */
export async function publicHoldSlot(_root: unknown, args: { slug: string; locationId?: string | null; typeId: string; operatoryId: string; startsAt: string; providerId?: string | null; captchaToken?: string | null; idempotencyKey: string }, context: Ctx) {
  const { policy, limits } = await siteAndPolicy(context.prisma, args.slug, args.locationId)
  await enforcePublicLimit(context.prisma, { scope: 'hold', req: context.req, limits })
  assertTypeAllowed(policy, args.typeId)
  const captcha = await verifyCaptcha(args.captchaToken)
  if (!captcha.ok) throw new DomainError(Codes.GUARD_FAILED, 'Please complete the verification and try again.', { reason: 'captcha' })
  const startsAt = new Date(String(args.startsAt))
  if (Number.isNaN(startsAt.getTime())) throw new DomainError(Codes.INVALID_INPUT, 'Choose a time.', { field: 'startsAt' })
  if (startsAt.getTime() < Date.now() + policy.leadTimeHours * 3_600_000) throw new DomainError(Codes.OUTSIDE_TEMPLATE, 'That time is too soon to book online. Please call the office.')
  const token = randomBytes(24).toString('base64url')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'public.hold', actor, idempotencyKey: `public-hold:${sha(`${idempotencyKey}:${clientFingerprint(context.req)}`).slice(0, 48)}`, params: { ...params, captchaToken: undefined } }, async uow => {
    const { hold } = await placeHold(uow, actor, {
      locationId: policy.locationId, operatoryId: args.operatoryId, typeId: args.typeId, startsAt: args.startsAt, providerId: args.providerId,
      holderKind: 'public_api', holderRef: `public:${sha(token)}`, minutes: policy.holdMinutes, onlineOnly: true, isSynthetic: policy.location.isSynthetic,
    })
    return { holdId: hold.id, expiresAt: hold.expiresAt.toISOString(), startsAt: hold.startsAt.toISOString(), endsAt: hold.endsAt.toISOString(), tokenHash: sha(token) }
  })
  // A replayed hold returns the original receipt; the token isn't stored, so the caller must keep the first one.
  return { replay: result.replay, holdId: result.value.holdId, expiresAt: result.value.expiresAt, startsAt: result.value.startsAt, endsAt: result.value.endsAt, holdToken: result.replay ? null : token }
}

type PublicContact = { firstName: string; lastName: string; dateOfBirth: string; email?: string | null; phone?: string | null; smsConsent?: boolean | null; emailReminders?: boolean | null }

/**
 * Submit the booking. Strong match (same DOB, similar name and a shared phone/email) books on the
 * existing record; no candidate creates a prospect (if the policy allows new patients); a weaker match
 * books on a new prospect flagged possible_duplicate for the front desk to merge. The answer is the same
 * in every case: a reference and the time.
 */
export async function publicSubmitBooking(_root: unknown, args: { slug: string; holdId: string; holdToken: string; contact: PublicContact; intake?: Record<string, unknown> | null; insuranceCapture?: Record<string, unknown> | null; captchaToken?: string | null; idempotencyKey: string }, context: Ctx) {
  const hold = await context.prisma.bookingHold.findUnique({ where: { id: String(args.holdId ?? '') }, select: { locationId: true } })
  const { site, policy, limits } = await siteAndPolicy(context.prisma, args.slug, hold?.locationId)
  const contact = args.contact ?? ({} as PublicContact)
  const email = contact.email ? normalizeContact('email', contact.email) : null
  const phone = contact.phone ? normalizeContact('mobile', contact.phone) : null
  if (!email && !phone) throw new DomainError(Codes.INVALID_INPUT, 'Enter an email address or mobile number.', { field: 'contact' })
  await enforcePublicLimit(context.prisma, { scope: 'submit', req: context.req, limits, contacts: [email?.normalized ?? '', phone?.normalized ?? ''] })
  const captcha = await verifyCaptcha(args.captchaToken)
  if (!captcha.ok) throw new DomainError(Codes.GUARD_FAILED, 'Please complete the verification and try again.', { reason: 'captcha' })
  if (!hold) throw new DomainError(Codes.HOLD_EXPIRED, 'That time is no longer held. Please pick a time again.')
  if (policy.requireInsuranceCapture && !args.insuranceCapture) throw new DomainError(Codes.INVALID_INPUT, 'Add your insurance details, or choose "I don’t have dental insurance".', { field: 'insuranceCapture' })
  const holderRef = `public:${sha(String(args.holdToken ?? ''))}`
  const fingerprint = clientFingerprint(context.req)
  const result = await command(context.prisma, { name: 'public.submit', actor, idempotencyKey: `public-submit:${sha(`${args.idempotencyKey}:${args.holdId}`).slice(0, 48)}`, params: { holdId: args.holdId, holderRef } }, async uow => {
    const held = await uow.tx.bookingHold.findUnique({ where: { id: args.holdId } })
    if (!held || !safeEqual(held.holderRef, holderRef)) throw new DomainError(Codes.HOLD_EXPIRED, 'That time is no longer held. Please pick a time again.')
    const firstName = requireText(contact.firstName, 'first name', 100)
    const lastName = requireText(contact.lastName, 'last name', 100)
    const candidates = await findDuplicates(uow.tx, { firstName, lastName, dateOfBirth: String(contact.dateOfBirth ?? ''), contacts: [email?.normalized ?? '', phone?.normalized ?? ''] })
    const strong = candidates.filter(c => c.evidence.includes('shared_contact') && (c.evidence.includes('similar_name') || c.evidence.includes('same_last_name')))
    let matchStatus: 'matched' | 'new_patient' | 'possible_duplicate'
    let patientId: string
    if (strong.length === 1) {
      matchStatus = 'matched'
      patientId = strong[0].patientId
      const existing = await uow.tx.patient.findUniqueOrThrow({ where: { id: patientId }, select: { status: true } })
      if (!['prospect', 'active', 'inactive'].includes(existing.status)) throw new DomainError(Codes.GUARD_FAILED, 'We couldn’t book this online. Please call the office.')
    } else {
      if (!policy.newPatientAllowed && !candidates.length) throw new DomainError(Codes.GUARD_FAILED, 'This location isn’t taking new patients online. Please call the office.')
      matchStatus = candidates.length ? 'possible_duplicate' : 'new_patient'
      const created = await createPatientIn(uow, actor, {
        firstName, lastName, dateOfBirth: String(contact.dateOfBirth ?? ''), homeLocationId: policy.locationId,
        contacts: [...(email ? [{ kind: 'email', value: email.value, isPrimary: true }] : []), ...(phone ? [{ kind: 'mobile', value: phone.value, isPrimary: true }] : [])],
        isSynthetic: policy.location.isSynthetic,
      })
      patientId = created.id
    }
    const appointment = await createAppointment(uow, actor, {
      locationId: held.locationId!, operatoryId: held.operatoryId!, typeId: held.typeId!, startsAt: held.startsAt.toISOString(), providerId: held.providerId,
      patientId, holdId: held.id, holderRef, source: 'online_booking', note: 'Booked online', isSynthetic: policy.location.isSynthetic,
    })
    // Consent captured on the form, with evidence, on the contact points of the record that was booked.
    const points = await uow.tx.contactPoint.findMany({ where: { patientId, isActive: true, valueNormalized: { in: [email?.normalized ?? '', phone?.normalized ?? ''].filter(Boolean) } } })
    const evidence = { form: 'online_booking', siteSlug: site.slug, clientHash: fingerprint, at: uow.now.toISOString() }
    for (const p of points) {
      if (p.kind === 'email' && contact.emailReminders !== false) await grantConsentIn(uow, actor, { contactPointId: p.id, channel: 'email', purpose: 'appointment_reminders', source: 'intake_form', evidence })
      if (p.kind === 'mobile' && contact.smsConsent === true) await grantConsentIn(uow, actor, { contactPointId: p.id, channel: 'sms', purpose: 'appointment_reminders', source: 'intake_form', evidence })
    }
    const publicRef = publicCode('BK')
    await uow.tx.publicBookingRequest.create({
      data: {
        siteId: site.id, locationId: held.locationId, publicRef, holdId: held.id, contact: { firstName, lastName, email: email?.normalized ?? '', phone: phone?.normalized ?? '', dateOfBirth: contact.dateOfBirth } as never,
        patientMatchId: patientId, matchStatus, matchEvidence: { candidates: candidates.map(c => ({ chartNumber: c.chartNumber, evidence: c.evidence, score: c.score })) } as never,
        intake: (args.intake ?? {}) as never, insuranceCapture: (args.insuranceCapture ?? {}) as never, appointmentId: appointment.id, status: 'booked',
        ipHash: fingerprint, userAgentHash: userAgentFingerprint(context.req), captchaScore: captcha.score, isSynthetic: policy.location.isSynthetic,
      },
    })
    return { publicRef, status: 'booked', startsAt: appointment.startsAt.toISOString(), endsAt: appointment.endsAt.toISOString(), locationName: policy.location.name }
  })
  return { replay: result.replay, ...result.value }
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  return left.length === right.length && timingSafeEqual(left, right)
}

function minutesOf(pattern: unknown, unit: number) {
  try {
    return patternUnits(parsePattern(pattern)) * unit
  } catch {
    return null
  }
}

// ── Staff review of online booking requests (BUILD-PLAN Phase 1, /schedule/booking-requests) ──────

/**
 * The front desk reviews each online booking. `accept` keeps the booking (and, for a possible
 * duplicate, records that the new record is a different person). `link` attaches the visit to an
 * existing patient and proposes a merge of the prospect into that record (the merge itself needs a
 * second person). `reject_spam` withdraws the visit and archives the empty prospect.
 */
export async function reviewBookingRequest(_root: unknown, args: { requestId: string; decision: 'accept' | 'link' | 'reject_spam'; expectedVersion: number; existingPatientId?: string | null; note?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageSchedule')
  if (!['accept', 'link', 'reject_spam'].includes(args.decision)) throw new DomainError(Codes.INVALID_INPUT, 'Choose accept, link or reject.', { field: 'decision' })
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'booking_request.review', actor, idempotencyKey, params }, async uow => {
    const request = await uow.tx.publicBookingRequest.findUnique({ where: { id: args.requestId } })
    if (!request) throw new DomainError(Codes.NOT_FOUND, 'Booking request not found.')
    assertLocation(locationIds, request.locationId)
    if (request.reviewedAt) throw new DomainError(Codes.INVALID_TRANSITION, 'This request was already reviewed.', { currentStatus: request.status })
    const note = optionalText(args.note, 2000) ?? ''
    let status = request.status
    let mergeCaseId: string | null = null
    if (args.decision === 'reject_spam') {
      if (request.appointmentId) {
        const appointment = await uow.tx.appointment.findUnique({ where: { id: request.appointmentId }, select: { status: true } })
        if (appointment && ['scheduled', 'confirmed'].includes(appointment.status)) await withdrawIn(uow, actor, request.appointmentId, 'online booking rejected as spam')
      }
      if (request.patientMatchId && request.matchStatus !== 'matched') {
        const prospect = await uow.tx.patient.findUnique({ where: { id: request.patientMatchId }, select: { status: true } })
        if (prospect?.status === 'prospect') await transition<any>(uow, { model: 'Patient', id: request.patientMatchId, from: ['prospect'], to: 'archived', actor, eventType: 'patient.archived', reason: 'online booking rejected as spam' })
      }
      status = 'rejected_spam'
    } else if (args.decision === 'link') {
      if (!args.existingPatientId || !request.patientMatchId) throw new DomainError(Codes.INVALID_INPUT, 'Choose the existing patient.', { field: 'existingPatientId' })
      const existingId = await resolvePatientRef(uow.tx, args.existingPatientId)
      if (existingId === request.patientMatchId) throw new DomainError(Codes.INVALID_INPUT, 'That is the record the booking is already on.', { field: 'existingPatientId' })
      await assertPatientInScope(uow.tx, locationIds, existingId)
      const proposed = await proposeMergeIn(uow, actor, { survivorId: existingId, mergedId: request.patientMatchId, reason: `Online booking ${request.publicRef} is the same person${note ? `: ${note}` : ''}` })
      mergeCaseId = proposed.mergeCase.id
    }
    const updated = await transition<any>(uow, {
      model: 'PublicBookingRequest', id: request.id, from: [request.status], to: status, expectedVersion: args.expectedVersion, actor, eventType: `booking_request.${args.decision}`,
      reason: note || args.decision, data: { reviewedAt: uow.now, reviewedById: actor.kind === 'user' ? actor.userId : null, reviewNote: note },
    })
    return { requestId: updated.id, status: updated.status, version: updated.version, mergeCaseId }
  })
  return { replay: result.replay, ...result.value }
}
