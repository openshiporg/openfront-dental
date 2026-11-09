import { DomainError, Codes } from './errors'

/*
 * A database refusal (unique index, CHECK constraint, guard trigger) is the last line of defence: the command
 * should have refused first. When the database is the one that says no (two people at the same moment, or a
 * rule only the database knows), the caller gets a plain sentence and a stable code, never Prisma's text.
 */

/** Unique indexes whose conflict means "someone else just did this". Keyed by model, then by the conflicting columns. */
const UNIQUE_MESSAGES: Record<string, string> = {
  BenefitVerification: 'A verification is already open for this plan. Refresh to see it.',
  EligibilityCheck: 'An eligibility check for this plan is already running. Refresh to see it.',
  Coverage: 'This patient already has a current coverage in that order. Refresh and try again.',
  WorkTask: 'That task is already open.',
  Remittance: 'That payment was already received. Nothing was posted twice.',
  PaymentPosting: 'That payment was already posted. Nothing was posted twice.',
  Denial: 'That denial is already open on this line.',
  ClaimVersion: 'That claim version already exists. Refresh to see it.',
  ClaimLine: 'That claim line already exists.',
  Payment: 'That payment was already recorded. Nothing was charged twice.',
  PaymentAllocation: 'That payment was already applied to that charge.',
  Statement: 'A statement for that account and date already exists.',
  PaymentPlanInstallment: 'That instalment already exists.',
  CreditBalance: 'That account already has an open credit.',
}

/** CHECK constraints and guard triggers, by name prefix, in words a front-desk person can act on. */
const CHECK_MESSAGES: [RegExp, string][] = [
  [/^Estimate_/, 'The estimate could not be saved: its amounts break an insurance rule (for example a plan paying on a line it does not cover). Nothing was changed. Check the plans’ benefits, then estimate again.'],
  [/^BenefitFact_/, 'That benefit answer was refused: it does not fit the plan’s rules (for example a value on an unknown answer, or a percentage out of range).'],
  [/^Coverage_/, 'That coverage change was refused: it would leave the coverage in an impossible state.'],
  [/^EligibilityCheck_/, 'That eligibility check change was refused: the check is not in a state that allows it.'],
  [/^Claim_frozen_version/, 'A claim past the review stage must point at the exact version that was sent. Nothing was changed.'],
  [/^Claim_|^ClaimLine_/, 'That claim change was refused: the amounts or state do not make sense together. Nothing was changed.'],
  [/^RemittanceLine_conservation/, 'A remittance line must balance: the charge equals the payment plus the adjustments. Nothing was posted.'],
  [/^(Remittance|PaymentPosting|Denial|Appeal)_/, 'That payment change was refused: it would break a payment rule. Nothing was changed.'],
  [/^PaymentAllocation_|^Payment_allocation|^Refund_guard|^Refund_/, 'That payment or refund change was refused: it would apply or refund more than was paid, or it needs a second person. Nothing was changed.'],
  [/^(Payment|PaymentPlan|PaymentPlanInstallment|Statement|PaymentMethodToken|CreditBalance)_/, 'That payment change was refused: it would break a payment rule. Nothing was changed.'],
  [/^(LedgerEntry|AdjustmentRequest|AdjustmentType|DayClose|PeriodClose|Restatement)_/, 'That ledger change was refused: the ledger only grows, and a closed period takes no new entries. Nothing was changed.'],
  [/_bound$/, 'That amount is larger than the system allows. Check it and try again.'],
  [/^BenefitVerification_/, 'That verification change was refused: the verification is not in a state that allows it.'],
]

const textOf = (error: any): string => [error?.message, error?.extensions?.prisma?.message, error?.meta?.message, error?.originalError?.message].filter(x => typeof x === 'string').join('\n')

/** The Prisma error code, whether the error is Prisma's own or Keystone's KS_PRISMA_ERROR wrapper. */
export const prismaCodeOf = (error: any): string => String(error?.code ?? error?.extensions?.prisma?.code ?? '')

export const isUniqueConflict = (error: unknown) => prismaCodeOf(error) === 'P2002' || /Unique constraint failed|duplicate key value violates unique constraint/i.test(textOf(error))

/** Turns a database refusal into a DomainError, or returns null when the error is not one. */
export function dbRefusal(error: unknown): DomainError | null {
  const e = error as any
  const text = textOf(e)
  if (isUniqueConflict(e)) {
    const model = String(e?.meta?.modelName ?? e?.extensions?.prisma?.meta?.modelName ?? '')
    const index = /unique constraint "([^"]+)"/i.exec(text)?.[1] ?? ''
    const key = Object.keys(UNIQUE_MESSAGES).find(name => name === model || index.startsWith(`${name}_`)) ?? (/BenefitVerification/.test(text) ? 'BenefitVerification' : /EligibilityCheck/.test(text) ? 'EligibilityCheck' : '')
    return new DomainError(Codes.STALE_STATE, UNIQUE_MESSAGES[key] ?? 'Someone else made the same change at the same moment. Refresh and try again.')
  }
  const check = /violates check constraint "([^"]+)"/i.exec(text)?.[1]
  if (check) {
    const message = CHECK_MESSAGES.find(([pattern]) => pattern.test(check))?.[1] ?? 'The change was refused because it would break a practice rule. Nothing was changed.'
    return new DomainError(Codes.GUARD_FAILED, message, { reason: check })
  }
  // Guard triggers raise their own plain sentence with ERRCODE check_violation (23514): pass the sentence, never the wrapper.
  const raised = /(?:ERROR|db error):\s*([A-Z][^\n"]{8,200}?)(?:\n|$)/.exec(text)?.[1]
  if (raised && /23514|check_violation|RAISE|P0001/i.test(text + prismaCodeOf(e)) && !/prisma|invocation|SQL/i.test(raised)) return new DomainError(Codes.GUARD_FAILED, raised.trim())
  if (prismaCodeOf(e) === 'P2034' || /could not serialize|deadlock detected/i.test(text)) return new DomainError(Codes.STALE_STATE, 'Someone else changed this at the same moment. Refresh and try again.')
  return null
}
