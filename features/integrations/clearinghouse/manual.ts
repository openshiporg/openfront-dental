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
}
