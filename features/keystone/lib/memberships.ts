import type { Tx } from './db'
import { Codes, DomainError } from './errors'
import { postEntry } from './ledger'
import type { UnitOfWork } from './unitOfWork'
import { addDays, localDate } from './time'

/*
 * Membership rules (STATE-MACHINES §8, DOMAIN I-M1, I-M2). The jurisdiction gate, the benefit counter and the
 * discount that is applied when a procedure is completed live here; commands in mutations/memberships.ts call them.
 */

const dayOf = (date: string) => new Date(`${date}T00:00:00Z`)
const iso = (d: Date) => d.toISOString().slice(0, 10)

export type Benefit = { codeFamily: string; countPerPeriod: number }

export function parseBenefits(value: unknown): Benefit[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(b => (b && typeof b.codeFamily === 'string' && Number.isInteger(b.countPerPeriod) && b.countPerPeriod >= 0 ? [{ codeFamily: b.codeFamily, countPerPeriod: b.countPerPeriod }] : []))
}

/**
 * I-M1: the office's jurisdiction pack says whether in-house plans are allowed, need a licence or registration on file, or are
 * prohibited. With a licence or registration required, an unexpired record for the pack's jurisdiction must exist.
 */
export async function membershipGate(tx: Tx, locationId: string, today: string) {
  const location = await tx.location.findUnique({ where: { id: locationId }, select: { jurisdiction: true, name: true } })
  const pack = location?.jurisdiction
  const rule = (pack?.rules as any)?.membershipPlans?.value as { mode?: string; licenceKind?: string | null } | undefined
  const mode = rule?.mode ?? 'licence_required'
  if (mode === 'prohibited') throw new DomainError(Codes.GUARD_FAILED, 'Membership plans are not allowed in this office’s state. Nobody can be enrolled.')
  if (mode === 'allowed') return { mode, licenceId: null as string | null }
  const day = dayOf(today)
  const licence = await tx.regulatoryLicence.findFirst({
    where: { jurisdiction: pack?.key ?? '', kind: 'discount_plan_operator', OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: day } }], AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }] }] },
    orderBy: { effectiveFrom: 'desc' },
  })
  if (!licence) {
    throw new DomainError(Codes.GUARD_FAILED, mode === 'registration_required'
      ? `${pack?.key ?? 'This state'} requires the practice to be registered as a discount plan operator. Record the registration first.`
      : `${pack?.key ?? 'This state'} requires a discount plan operator licence. Record the licence first.`)
  }
  return { mode, licenceId: licence.id as string }
}

/** The covered-visit counter for one period: issued minus reversed uses of a code family. */
export async function benefitsUsed(tx: Tx, membershipId: string, codeFamily: string, periodStart: Date) {
  const rows = await tx.membershipLedgerEntry.findMany({ where: { membershipId, codeFamily, kind: { in: ['benefit_use', 'benefit_reverse'] }, at: { gte: periodStart } }, select: { kind: true, quantity: true } })
  return rows.reduce((n, r) => n + (r.kind === 'benefit_use' ? 1 : -1) * (r.quantity ?? 1), 0)
}

const percentOf = (amount: bigint, pct: unknown) => (amount * BigInt(Math.round(Number(pct) * 10000))) / 1_000_000n

/**
 * Applied when a procedure is completed (STATE-MACHINES §8: the discount applies at completed → posted). A covered visit is
 * credited in full; other work gets the plan's percentage off the office fee. The charge itself stays at the office fee, so the
 * ledger shows both; the credit is linked to the chart entry so a correction reverses it too.
 */
export async function applyMembershipToCharge(uow: UnitOfWork, input: { patientId: string; accountId: string; locationId: string; chartEntryId: string; providerId: string; category: string; feeMinor: bigint; serviceDate: string; businessDate: Date; currencyCode: string; postedById: string | null }) {
  const { tx } = uow
  const day = dayOf(input.serviceDate)
  const membership = await tx.patientMembership.findFirst({
    where: { patientId: input.patientId, status: 'active', currentPeriodStart: { lte: day }, currentPeriodEnd: { gte: day } },
    include: { plan: true },
  })
  if (!membership?.plan || input.feeMinor <= 0n) return null
  const plan = membership.plan
  const benefits = parseBenefits(plan.includedBenefits)
  const benefit = benefits.find(b => b.codeFamily === input.category)
  const covered = benefit ? (await benefitsUsed(tx, membership.id, input.category, membership.currentPeriodStart!)) < benefit.countPerPeriod : false
  const creditMinor = covered ? input.feeMinor : percentOf(input.feeMinor, plan.discountPct)
  if (creditMinor <= 0n) return null
  const entry = await postEntry(tx, {
    accountId: input.accountId, patientId: input.patientId, kind: 'patient_adjustment', amountMinor: -creditMinor, currencyCode: input.currencyCode,
    businessDate: input.businessDate, originalBusinessDate: input.businessDate, locationId: input.locationId, providerId: input.providerId, chartEntryId: input.chartEntryId,
    memo: covered ? `Included in ${plan.name}` : `${plan.name} member discount`, postedById: input.postedById,
  }, uow.now)
  await tx.membershipLedgerEntry.create({ data: { membershipId: membership.id, kind: covered ? 'benefit_use' : 'discount', codeFamily: input.category, quantity: 1, chartEntryId: input.chartEntryId, ledgerEntryId: entry.id, at: uow.now } })
  return { ledgerEntryId: entry.id, covered, creditMinor }
}

/** A corrected procedure takes its membership credit back with the charge (a mirrored reversal, then the benefit goes back to the member). */
export async function reverseMembershipForChart(uow: UnitOfWork, input: { chartEntryId: string; reason: string; businessDate: Date; postedById: string | null }) {
  const { tx } = uow
  const uses = await tx.membershipLedgerEntry.findMany({ where: { chartEntryId: input.chartEntryId, kind: { in: ['benefit_use', 'discount'] } } })
  const done: string[] = []
  for (const use of uses) {
    if (!use.ledgerEntryId) continue
    const already = await tx.ledgerEntry.findFirst({ where: { reversesId: use.ledgerEntryId }, select: { id: true } })
    if (already) continue
    const original = await tx.ledgerEntry.findUniqueOrThrow({ where: { id: use.ledgerEntryId } })
    const reversal = await postEntry(tx, {
      accountId: original.accountId!, patientId: original.patientId, kind: 'reversal', amountMinor: -original.amountMinor, currencyCode: original.currencyCode, businessDate: input.businessDate,
      originalBusinessDate: original.originalBusinessDate ?? undefined, locationId: original.locationId!, providerId: original.providerId, chartEntryId: original.chartEntryId, adjustmentId: original.adjustmentId,
      reversesId: original.id, memo: `Reversal: ${input.reason}`.slice(0, 200), postedById: input.postedById,
    }, uow.now)
    await tx.membershipLedgerEntry.create({ data: { membershipId: use.membershipId, kind: use.kind === 'benefit_use' ? 'benefit_reverse' : 'discount_reverse', codeFamily: use.codeFamily, quantity: 1, chartEntryId: input.chartEntryId, ledgerEntryId: reversal.id, at: uow.now } })
    done.push(reversal.id)
  }
  return done
}

/** The next period for a plan interval. */
export function nextPeriodEnd(start: string, interval: string) {
  const [y, m, d] = start.split('-').map(Number)
  const months = interval === 'annual' ? 12 : 1
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  const end = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, lastDay)))
  return addDays(iso(end), -1)
}

export const todayAt = async (tx: Tx, locationId: string, now: Date) => {
  const location = await tx.location.findUnique({ where: { id: locationId }, select: { timeZone: true } })
  return localDate(location?.timeZone ?? 'America/New_York', now)
}
