import type { UnitOfWork } from '../lib/unitOfWork'

/* Practice adjustment types (reference data). The migration inserts the same rows for existing databases; both skip duplicates by code. */
export const ADJUSTMENT_TYPES = [
  { id: 'seed_adjtype_courtesy', code: 'COURTESY', name: 'Courtesy discount', direction: 'credit', category: 'courtesy', approvalThresholdMinor: 5000n, requiresApproval: false },
  { id: 'seed_adjtype_professional', code: 'PROFESSIONAL', name: 'Professional courtesy', direction: 'credit', category: 'professional', approvalThresholdMinor: 2500n, requiresApproval: false },
  { id: 'seed_adjtype_small', code: 'SMALL-BAL', name: 'Small balance write-off', direction: 'credit', category: 'small_balance', approvalThresholdMinor: 1000n, requiresApproval: false },
  { id: 'seed_adjtype_baddebt', code: 'BAD-DEBT', name: 'Bad debt write-off', direction: 'credit', category: 'bad_debt', approvalThresholdMinor: 0n, requiresApproval: true },
  { id: 'seed_adjtype_broken', code: 'BROKEN-FEE', name: 'Missed appointment fee', direction: 'debit', category: 'broken_appt_fee', approvalThresholdMinor: 5000n, requiresApproval: false },
  { id: 'seed_adjtype_member', code: 'MEMBER-DISC', name: 'Membership discount', direction: 'credit', category: 'membership_discount', approvalThresholdMinor: 10000n, requiresApproval: false },
  { id: 'seed_adjtype_other', code: 'OTHER-CR', name: 'Other credit', direction: 'credit', category: 'other', approvalThresholdMinor: 2500n, requiresApproval: false },
]

export async function seedLedger(uow: UnitOfWork) {
  const made = await uow.tx.adjustmentType.createMany({ data: ADJUSTMENT_TYPES, skipDuplicates: true })
  return { adjustmentTypes: made.count }
}
