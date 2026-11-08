import type { Tx } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import { nextReference } from '../lib/sequence'
import { localDate } from '../lib/time'
import type { UnitOfWork } from '../lib/unitOfWork'

/* Helpers shared by the clinical, treatment and catalogue commands. */

export const dayOf = (date: string) => new Date(`${date}T00:00:00Z`)
export const isoDay = (date: Date | string | null | undefined) => (date ? (date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10)) : null)

export async function locationToday(tx: Tx, locationId: string, now: Date) {
  const location = await tx.location.findUnique({ where: { id: locationId }, select: { timeZone: true } })
  return localDate(location?.timeZone ?? 'America/New_York', now)
}

/**
 * The fee a code carries on a date: the default fee schedule's published version in effect that day.
 * Fees are frozen onto a procedure when it is completed (I-C2), so later schedule changes never touch it.
 */
export async function feeFor(tx: Tx, codeId: string, onDate: string) {
  const day = dayOf(onDate)
  const schedule = await tx.feeSchedule.findFirst({ where: { isDefault: true } })
  if (!schedule) return null
  const version = await tx.feeScheduleVersion.findFirst({
    where: { scheduleId: schedule.id, status: 'published', effectiveFrom: { lte: day }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }] },
    orderBy: { effectiveFrom: 'desc' },
  })
  if (!version) return null
  const fee = await tx.fee.findUnique({ where: { feeVersionId_codeId: { feeVersionId: version.id, codeId } } })
  return fee ? { amountMinor: fee.amountMinor, versionId: version.id } : null
}

/** The guarantor account that carries a patient's charges; created on first use (self-guarantor when none is linked). */
export async function accountFor(uow: UnitOfWork, patientId: string) {
  const { tx } = uow
  const link = await tx.guarantorLink.findFirst({ where: { patientId, status: 'active' }, orderBy: { createdAt: 'asc' } })
  let guarantorId = link?.guarantorId ?? null
  if (!guarantorId) {
    const own = await tx.guarantor.findFirst({ where: { patientId } })
    const guarantor = own ?? (await tx.guarantor.create({ data: { patientId } }))
    guarantorId = guarantor.id
    await tx.guarantorLink.create({ data: { patientId, guarantorId, relationship: 'self', status: 'active' } })
  }
  const existing = await tx.guarantorAccount.findFirst({ where: { guarantorId } })
  if (existing) return existing
  const ref = await nextReference(tx, 'ACC', uow.now)
  return tx.guarantorAccount.create({ data: { guarantorId, ref } })
}

export function requireReason(value: unknown, what = 'reason') {
  const text = String(value ?? '').trim()
  if (text.length < 5) throw new DomainError(Codes.INVALID_INPUT, `Give a ${what} of at least a few words.`, { field: 'reason' })
  return text.slice(0, 1000)
}

export const oneOf = <T extends string>(value: unknown, allowed: readonly T[], field: string): T => {
  if (!(allowed as readonly string[]).includes(String(value))) throw new DomainError(Codes.INVALID_INPUT, `Unknown ${field}.`, { field })
  return String(value) as T
}

/** Signing re-checks the signer's password (SM§3.5); the session alone is not enough. */
export async function verifyPassword(context: { graphql?: any; prisma: any }, userId: string, password: unknown) {
  const user = await context.prisma.user.findUnique({ where: { id: userId }, select: { password: true } })
  const field = context.graphql?.schema?.getType('User')?.getFields()?.password?.extensions?.keystoneSecretField
  if (!user || !field?.compare || typeof password !== 'string' || password.length > 1_000 || !(await field.compare(password, user.password))) {
    throw new DomainError(Codes.NOT_AUTHORIZED, 'Enter your password to sign.')
  }
}
