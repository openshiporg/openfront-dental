import { requirePermission, systemActor } from '../lib/actor'
import { auditCreate, lockRow, transition } from '../lib/cas'
import { command } from '../lib/command'
import { DomainError, Codes } from '../lib/errors'
import { formatMinor } from '../lib/money'
import { parseMoney, postEntry } from '../lib/ledger'
import { chargesOutstanding, sha256 } from '../lib/payments'
import { membershipGate, nextPeriodEnd, parseBenefits, todayAt } from '../lib/memberships'
import { nextReference } from '../lib/sequence'
import { addDays } from '../lib/time'
import { accountFor, dayOf, requireReason } from './clinicalShared'
import { assertLocation, assertPatientInScope, optionalText, requireText, resolvePatientRef, staff, type Ctx } from './shared'
import { MEMBERSHIP_AGE_BANDS, MEMBERSHIP_INTERVALS } from '../models/memberships'

/*
 * Memberships (STATE-MACHINES §8). The jurisdiction gate is checked when someone is enrolled and again when the agreement is signed,
 * because a licence can lapse in between. Signing activates the membership and charges the first period to the account (the invoice
 * policy); the front desk takes the payment like any other. Renewal and past-due are a daily job.
 */

const currencyOf = async (tx: any) => (await tx.practiceSettings.findUnique({ where: { id: 1 }, select: { currencyCode: true } }))?.currencyCode ?? 'USD'
const PAST_DUE_AFTER_DAYS = 30
const CANCEL_AFTER_PAST_DUE_DAYS = 30

const DISCLOSURES = {
  notInsurance: 'This is a membership plan for in-office savings. It is not dental insurance.',
  renewal: 'The plan renews each period and the price is charged to the account. You can cancel before the next period starts.',
  cancellation: 'If you cancel, benefits stop at the end of the period already charged. Unused covered visits do not carry over.',
}

export async function recordLicence(_root: unknown, args: { kind: string; jurisdiction: string; number: string; effectiveFrom?: string | null; effectiveTo?: string | null; evidence?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, 'canManageMemberships')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'licence.record', actor, idempotencyKey, params }, async uow => {
    const jurisdiction = requireText(args.jurisdiction, 'jurisdiction', 40)
    const number = requireText(args.number, 'number', 60)
    if (!['discount_plan_operator', 'other'].includes(args.kind)) throw new DomainError(Codes.INVALID_INPUT, 'Choose the kind of licence.', { field: 'kind' })
    if (args.effectiveFrom && args.effectiveTo && args.effectiveTo < args.effectiveFrom) throw new DomainError(Codes.INVALID_INPUT, 'The licence cannot end before it starts.', { field: 'effectiveTo' })
    const row = await uow.tx.regulatoryLicence.create({ data: { kind: args.kind, jurisdiction, number, effectiveFrom: args.effectiveFrom ? dayOf(args.effectiveFrom) : null, effectiveTo: args.effectiveTo ? dayOf(args.effectiveTo) : null, evidence: optionalText(args.evidence, 400) } })
    auditCreate(uow, actor, 'RegulatoryLicence', row.id, 'licence.recorded', { kind: args.kind, jurisdiction, number })
    return { id: row.id }
  })
  return { replay: result.replay, ...result.value }
}

export async function defineMembershipPlan(_root: unknown, args: { name: string; ageBand: string; price: string; interval: string; discountPct: string; benefits?: { codeFamily: string; countPerPeriod: number }[] | null; termsText: string; locationIds: string[]; renewalNoticeDays?: number | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageMemberships')
  const priceMinor = parseMoney(args.price, 'price')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'membership_plan.create', actor, idempotencyKey, params }, async uow => {
    const name = requireText(args.name, 'name', 80)
    if (!(MEMBERSHIP_AGE_BANDS as readonly string[]).includes(args.ageBand)) throw new DomainError(Codes.INVALID_INPUT, 'Choose child, adult or perio.', { field: 'ageBand' })
    if (!(MEMBERSHIP_INTERVALS as readonly string[]).includes(args.interval)) throw new DomainError(Codes.INVALID_INPUT, 'Choose monthly or annual.', { field: 'interval' })
    const discountText = String(args.discountPct ?? '').trim()
    if (!/^\d{1,3}(\.\d{1,4})?$/.test(discountText) || Number(discountText) > 100) throw new DomainError(Codes.INVALID_INPUT, 'The discount is a percent from 0 to 100.', { field: 'discountPct' })
    const termsText = requireText(args.termsText, 'termsText', 4000)
    if (!args.locationIds?.length) throw new DomainError(Codes.INVALID_INPUT, 'Choose at least one office.', { field: 'locationIds' })
    for (const id of args.locationIds) assertLocation(locationIds, id)
    if (await uow.tx.membershipPlan.findUnique({ where: { name } })) throw new DomainError(Codes.INVALID_INPUT, 'A plan with that name already exists.', { field: 'name' })
    const benefits = parseBenefits(args.benefits ?? [])
    const row = await uow.tx.membershipPlan.create({
      data: {
        name, ageBand: args.ageBand, priceMinor, interval: args.interval, discountPct: discountText, includedBenefits: benefits as never, termsText, termsHash: sha256(termsText),
        renewalNoticeDays: args.renewalNoticeDays ?? 30, status: 'active', locations: { connect: args.locationIds.map(id => ({ id })) },
      },
    })
    auditCreate(uow, actor, 'MembershipPlan', row.id, 'membership_plan.created', { name, priceMinor: priceMinor.toString(), interval: args.interval })
    return { id: row.id, status: 'active' }
  })
  return { replay: result.replay, ...result.value }
}

export async function retireMembershipPlan(_root: unknown, args: { planId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, 'canManageMemberships')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'membership_plan.retire', actor, idempotencyKey, params }, async uow => {
    const row = await transition<any>(uow, { model: 'MembershipPlan', id: args.planId, from: ['active', 'draft'], to: 'retired', expectedVersion: args.expectedVersion, actor, eventType: 'membership_plan.retired' })
    return { id: row.id, status: 'retired' }
  })
  return { replay: result.replay, ...result.value }
}

/** Start an enrolment. Blocked when the pack requires a licence or registration and none is recorded (I-M1). */
export async function enrolMembership(_root: unknown, args: { patientId: string; planId: string; locationId: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageMemberships')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'membership.enrol', actor, idempotencyKey, params }, async uow => {
    const { tx } = uow
    assertLocation(locationIds, args.locationId)
    const patientId = await resolvePatientRef(tx, args.patientId)
    await assertPatientInScope(tx, locationIds, patientId)
    const plan = await tx.membershipPlan.findUnique({ where: { id: args.planId }, include: { locations: { select: { id: true } } } })
    if (!plan || plan.status !== 'active') throw new DomainError(Codes.NOT_FOUND, 'That plan is not available.', { field: 'planId' })
    if (!plan.locations.some(l => l.id === args.locationId)) throw new DomainError(Codes.GUARD_FAILED, 'That plan is not offered at this office.', { field: 'planId' })
    await membershipGate(tx, args.locationId, await todayAt(tx, args.locationId, uow.now))
    const live = await tx.patientMembership.findFirst({ where: { patientId, planId: plan.id, status: { in: ['pending_agreement', 'active', 'past_due', 'frozen'] } }, select: { ref: true } })
    if (live) throw new DomainError(Codes.INVALID_INPUT, `This patient already has ${live.ref} on that plan.`)
    const account = await accountFor(uow, patientId)
    const ref = await nextReference(tx, 'MEM', uow.now)
    const row = await tx.patientMembership.create({ data: { ref, patientId, planId: plan.id, locationId: args.locationId, payerId: account.id, status: 'pending_agreement' } })
    auditCreate(uow, actor, 'PatientMembership', row.id, 'membership.enrolled', { plan: plan.name, ref })
    return { id: row.id, ref, status: 'pending_agreement' }
  })
  return { replay: result.replay, ...result.value }
}

async function chargePeriod(uow: any, membership: any, plan: any, kind: 'activate' | 'renew', periodStart: string, periodEnd: string, postedById: string | null) {
  const { tx } = uow
  const today = await todayAt(tx, membership.locationId, uow.now)
  const entry = await postEntry(tx, {
    accountId: membership.payerId, patientId: membership.patientId, kind: 'charge', amountMinor: plan.priceMinor, currencyCode: await currencyOf(tx),
    businessDate: dayOf(today), locationId: membership.locationId, memo: `${plan.name}, ${periodStart} to ${periodEnd}`, postedById,
  }, uow.now)
  await tx.membershipLedgerEntry.create({ data: { membershipId: membership.id, kind, ledgerEntryId: entry.id, at: uow.now } })
  await tx.membershipLedgerEntry.create({ data: { membershipId: membership.id, kind: 'charge', ledgerEntryId: entry.id, at: uow.now } })
  for (const b of parseBenefits(plan.includedBenefits)) {
    await tx.membershipLedgerEntry.create({ data: { membershipId: membership.id, kind: 'benefit_issue', codeFamily: b.codeFamily, quantity: b.countPerPeriod, at: uow.now } })
  }
  return entry
}

/** Sign the agreement: terms hash, price, disclosures and an affirmative consent. Activates the membership and charges the first period. */
export async function signMembershipAgreement(_root: unknown, args: { membershipId: string; expectedVersion: number; signerName: string; consent: boolean; startsOn?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageMemberships')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'membership.sign', actor, idempotencyKey, params }, async uow => {
    const { tx } = uow
    const row = await lockRow<any>(tx, 'PatientMembership', args.membershipId)
    assertLocation(locationIds, row.locationId)
    const signer = requireText(args.signerName, 'signerName', 120)
    if (args.consent !== true) throw new DomainError(Codes.CONSENT_REQUIRED, 'The member must agree to the terms before the plan starts.', { field: 'consent' })
    const plan = await tx.membershipPlan.findUniqueOrThrow({ where: { id: row.planId } })
    if (plan.status !== 'active') throw new DomainError(Codes.GUARD_FAILED, 'That plan is no longer offered.')
    const today = await todayAt(tx, row.locationId, uow.now)
    await membershipGate(tx, row.locationId, today)
    const start = args.startsOn || today
    if (start < today) throw new DomainError(Codes.INVALID_INPUT, 'The plan cannot start in the past.', { field: 'startsOn' })
    const end = nextPeriodEnd(start, plan.interval)
    const agreement = await tx.membershipAgreement.create({
      data: { membershipId: row.id, termsHash: plan.termsHash, priceSnapshotMinor: plan.priceMinor, disclosures: DISCLOSURES as never, affirmativeConsentHash: sha256(`${plan.termsHash}|${signer}|agreed`), signerName: signer, signedAt: uow.now },
    })
    await tx.patientMembership.update({ where: { id: row.id }, data: { agreementId: agreement.id, currentPeriodStart: dayOf(start), currentPeriodEnd: dayOf(end) } })
    const active = await transition<any>(uow, { model: 'PatientMembership', id: row.id, from: ['pending_agreement'], to: 'active', expectedVersion: args.expectedVersion, actor, eventType: 'membership.activated' })
    const entry = await chargePeriod(uow, { ...row, id: row.id }, plan, 'activate', start, end, actor.kind === 'user' ? actor.userId : null)
    auditCreate(uow, actor, 'MembershipAgreement', agreement.id, 'membership.agreement_signed', { termsHash: plan.termsHash, priceMinor: plan.priceMinor.toString(), signer })
    return { id: active.id, status: 'active', periodEnd: end, chargeEntryId: entry.id, charged: formatMinor(plan.priceMinor) }
  })
  return { replay: result.replay, ...result.value }
}

export async function freezeMembership(_root: unknown, args: { membershipId: string; expectedVersion: number; freeze: boolean; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageMemberships')
  const reason = requireReason(args.reason)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: args.freeze ? 'membership.freeze' : 'membership.unfreeze', actor, idempotencyKey, params }, async uow => {
    const row = await lockRow<any>(uow.tx, 'PatientMembership', args.membershipId)
    assertLocation(locationIds, row.locationId)
    const to = args.freeze ? 'frozen' : 'active'
    const next = await transition<any>(uow, { model: 'PatientMembership', id: row.id, from: args.freeze ? ['active'] : ['frozen'], to, expectedVersion: args.expectedVersion, actor, eventType: args.freeze ? 'membership.frozen' : 'membership.unfrozen', reason })
    await uow.tx.membershipLedgerEntry.create({ data: { membershipId: row.id, kind: args.freeze ? 'freeze' : 'unfreeze', at: uow.now } })
    return { id: next.id, status: to }
  })
  return { replay: result.replay, ...result.value }
}

export async function cancelMembership(_root: unknown, args: { membershipId: string; expectedVersion: number; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canManageMemberships')
  const reason = requireReason(args.reason)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'membership.cancel', actor, idempotencyKey, params }, async uow => {
    const row = await lockRow<any>(uow.tx, 'PatientMembership', args.membershipId)
    assertLocation(locationIds, row.locationId)
    const next = await transition<any>(uow, { model: 'PatientMembership', id: row.id, from: ['pending_agreement', 'active', 'past_due', 'frozen'], to: 'cancelled', expectedVersion: args.expectedVersion, actor, eventType: 'membership.cancelled', reason, data: { cancelledReason: reason, autoRenew: false } })
    await uow.tx.membershipLedgerEntry.create({ data: { membershipId: row.id, kind: 'cancel', at: uow.now } })
    return { id: next.id, status: 'cancelled' }
  })
  return { replay: result.replay, ...result.value }
}

/**
 * Daily: renew memberships whose period ended, mark unpaid ones past due after a grace, and cancel those still unpaid a month later
 * (benefits stop). The renewal is a charge on the account (invoice policy); an unpaid first charge is what makes a membership past due.
 */
export async function runMembershipRenewals(db: any, now: Date) {
  const actor = systemActor('job:membership-renewals')
  const out = { renewed: 0, pastDue: 0, cancelled: 0 }
  const candidates = await db.patientMembership.findMany({ where: { status: { in: ['active', 'past_due'] } }, select: { id: true } })
  for (const c of candidates) {
    await command(db, { name: 'membership.renewal', actor, idempotencyKey: `membership.renewal:${c.id}:${now.toISOString().slice(0, 10)}`, params: { id: c.id }, now }, async (uow: any) => {
      const { tx } = uow
      const m = await lockRow<any>(tx, 'PatientMembership', c.id)
      if (!['active', 'past_due'].includes(m.status)) return
      const plan = await tx.membershipPlan.findUniqueOrThrow({ where: { id: m.planId } })
      const today = await todayAt(tx, m.locationId, now)
      const lastCharge = await tx.membershipLedgerEntry.findFirst({ where: { membershipId: m.id, kind: 'charge' }, orderBy: { at: 'desc' } })
      const unpaid = async () => {
        if (!lastCharge?.ledgerEntryId) return null
        const entries = await tx.ledgerEntry.findMany({ where: { accountId: m.payerId }, select: { id: true, kind: true, amountMinor: true, businessDate: true, createdAt: true } })
        const left = chargesOutstanding(entries).find(o => o.id === lastCharge.ledgerEntryId)?.left ?? 0n
        return left > 0n ? entries.find((e: any) => e.id === lastCharge.ledgerEntryId)!.businessDate : null
      }
      const unpaidSince = await unpaid()
      if (unpaidSince) {
        const days = Math.floor((dayOf(today).getTime() - unpaidSince.getTime()) / 86_400_000)
        if (m.status === 'active' && days >= PAST_DUE_AFTER_DAYS) {
          await transition<any>(uow, { model: 'PatientMembership', id: m.id, from: ['active'], to: 'past_due', actor, eventType: 'membership.past_due' })
          out.pastDue++
        } else if (m.status === 'past_due' && days >= PAST_DUE_AFTER_DAYS + CANCEL_AFTER_PAST_DUE_DAYS) {
          await transition<any>(uow, { model: 'PatientMembership', id: m.id, from: ['past_due'], to: 'cancelled', actor, eventType: 'membership.cancelled', reason: 'Unpaid', data: { cancelledReason: 'Unpaid after the grace period', autoRenew: false } })
          await tx.membershipLedgerEntry.create({ data: { membershipId: m.id, kind: 'cancel', at: now } })
          out.cancelled++
        }
        return
      }
      if (m.status === 'past_due') {
        await transition<any>(uow, { model: 'PatientMembership', id: m.id, from: ['past_due'], to: 'active', actor, eventType: 'membership.paid_up' })
      }
      const end = m.currentPeriodEnd.toISOString().slice(0, 10)
      if (m.autoRenew && end < today) {
        const start = addDays(end, 1)
        const newEnd = nextPeriodEnd(start, plan.interval)
        await tx.patientMembership.update({ where: { id: m.id }, data: { currentPeriodStart: dayOf(start), currentPeriodEnd: dayOf(newEnd) } })
        await chargePeriod(uow, m, plan, 'renew', start, newEnd, null)
        auditCreate(uow, actor, 'PatientMembership', m.id, 'membership.renewed', { periodStart: start, periodEnd: newEnd })
        out.renewed++
      } else if (!m.autoRenew && end < today && m.status === 'active') {
        await transition<any>(uow, { model: 'PatientMembership', id: m.id, from: ['active'], to: 'expired', actor, eventType: 'membership.expired' })
      }
    })
  }
  return out
}
