/** Stedi/X12 AAA reject reason codes mapped to what staff can do (INTEGRATIONS §2; STATE-MACHINES §5.3). */
export const AAA_REASONS: Record<string, { message: string; fixable: boolean; retryable?: boolean }> = {
  '42': { message: 'The payer could not respond. Try again shortly.', fixable: false, retryable: true },
  '43': { message: 'The payer ID was not recognised. Check the payer.', fixable: true },
  '47': { message: 'The payer cannot process this request right now.', fixable: false, retryable: true },
  '51': { message: 'The provider is not on file with this payer.', fixable: true },
  '52': { message: 'The provider is not enrolled for this transaction.', fixable: false },
  '58': { message: 'The patient’s birth date does not match the payer’s record.', fixable: true },
  '71': { message: 'The patient’s birth date does not match the payer’s record.', fixable: true },
  '72': { message: 'The member ID is missing or invalid.', fixable: true },
  '73': { message: 'The patient’s name does not match the payer’s record.', fixable: true },
  '75': { message: 'The payer has no member with these details.', fixable: true },
  '76': { message: 'The payer found more than one match.', fixable: true },
  '79': { message: 'The payer ID is invalid.', fixable: true },
}

export function describeAaa(code: string, fallback?: string) {
  return AAA_REASONS[code] ?? { message: fallback || `The payer rejected the request (code ${code}).`, fixable: false }
}
