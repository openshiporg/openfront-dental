import { eligibilityRequestHash } from './canonical'
import type { ClearinghouseAdapter } from './types'

/** No clearinghouse connected: nothing is sent. Staff verify by phone or portal and enter facts with their source. */
export const manualAdapter: ClearinghouseAdapter = {
  key: 'manual',
  displayName: 'Manual verification (no clearinghouse connected)',
  capabilities: { eligibility: false, claims: false, predeterminations: false, claimStatus: false, era: false, attachments: false, enrollment: false, payerDirectory: false },
  async checkEligibility(req, ctx) {
    return { outcome: { kind: 'error_retryable', message: 'No clearinghouse is connected. Verify by phone or the payer portal.' }, requestHash: eligibilityRequestHash(req, 'manual'), adapterKey: 'manual', mode: ctx.mode }
  },
  async submitClaim() { return { kind: 'error_retryable', message: 'No clearinghouse is connected. Print the claim data sheet and send it through the payer portal.' } },
  async checkClaimStatus() { return { kind: 'unknown', message: 'No clearinghouse is connected.' } },
  async listTransactions() { return { ok: false, message: 'No clearinghouse is connected. Enter the payer’s explanation of benefits by hand.' } },
  async fetchTransaction() { return { ok: false, message: 'No clearinghouse is connected.' } },
}
