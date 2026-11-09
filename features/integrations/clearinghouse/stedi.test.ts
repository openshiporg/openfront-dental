import { describe, expect, it } from 'vitest'
import { fakeStedi } from '../../../tests/fakes/stedi'
import { dollarsToMinor, eligibilityRequestHash, mapBenefits, percentText } from './canonical'
import { clearinghouseFor } from './index'
import { buildStediBody, parseStediResponse, STEDI_ELIGIBILITY_PATH } from './stedi'
import type { EligibilityRequest } from './types'

const req = (memberId: string): EligibilityRequest => ({
  payerId: 'SUMMIT', providerNpi: '1234567893', providerName: 'Bayview Family Dental',
  subscriber: { memberId, firstName: 'Marisol', lastName: 'Okafor', dateOfBirth: '1988-04-12' }, serviceTypeCode: '35', controlNumber: '000000001',
})
const ctx = (fetch: typeof globalThis.fetch) => ({ mode: 'sandbox' as const, apiKey: 'sandbox-test-key', baseUrl: 'https://stedi.invalid', fetch })

describe('Stedi eligibility contract (recorded fixtures)', () => {
  it('sends the documented request shape to the eligibility-check path', async () => {
    const fake = fakeStedi()
    await clearinghouseFor('stedi').checkEligibility(req('SUM-4401-A'), ctx(fake.fetch))
    expect(fake.calls[0].url).toBe(`https://stedi.invalid${STEDI_ELIGIBILITY_PATH}`)
    expect(fake.calls[0].headers.authorization).toBe('sandbox-test-key')
    expect(fake.calls[0].body).toEqual(buildStediBody(req('SUM-4401-A')))
    expect(Object.keys(fake.calls[0].body).sort()).toEqual(['controlNumber', 'encounter', 'provider', 'subscriber', 'tradingPartnerServiceId'])
    expect(fake.calls[0].body.subscriber.dateOfBirth).toBe('19880412')
    expect(fake.calls[0].body.dependents).toBeUndefined()
  })
  it('maps an active response into facts and nothing the payer did not return', async () => {
    const fake = fakeStedi()
    const { outcome } = await clearinghouseFor('stedi').checkEligibility(req('SUM-4401-A'), ctx(fake.fetch))
    expect(outcome.kind).toBe('responded')
    if (outcome.kind !== 'responded') return
    expect(outcome.planActive).toBe(true)
    const facts = mapBenefits(outcome.benefits, true)
    const pct = facts.filter(f => f.field === 'coverage_pct').map(f => [f.appliesTo.category, (f.value as any).pct])
    expect(pct).toEqual([['preventive', '100.0000'], ['basic', '80.0000'], ['major', '50.0000']])
    expect(facts.find(f => f.field === 'annual_max')?.value).toEqual({ amountMinor: '150000' })
    expect(facts.find(f => f.field === 'annual_max_used')?.value).toEqual({ remainingMinor: '110000' })
    expect(facts.find(f => f.field === 'deductible')?.value).toEqual({ amountMinor: '5000' })
    expect(facts.some(f => f.field === 'waiting_period')).toBe(false)
    const out = mapBenefits(outcome.benefits, false)
    expect(out.find(f => f.field === 'coverage_pct' && f.appliesTo.category === 'basic')?.value).toEqual({ pct: '60.0000' })
  })
  it('the Evergreen sandbox member answers with its own benefits, not Harbor\'s', async () => {
    const { outcome } = await clearinghouseFor('stedi').checkEligibility(req('EVG-5501-K'), ctx(fakeStedi().fetch))
    expect(outcome.kind).toBe('responded')
    if (outcome.kind !== 'responded') return
    const facts = mapBenefits(outcome.benefits, true)
    expect(facts.filter(f => f.field === 'coverage_pct').map(f => [f.appliesTo.category, (f.value as any).pct])).toEqual([['preventive', '100.0000'], ['basic', '70.0000'], ['major', '40.0000']])
    expect(facts.find(f => f.field === 'annual_max')?.value).toEqual({ amountMinor: '100000' })
    expect(facts.find(f => f.field === 'deductible')?.value).toEqual({ amountMinor: '2500' })
  })
  it('maps an inactive plan', async () => {
    const { outcome } = await clearinghouseFor('stedi').checkEligibility(req('SUM-4402-B'), ctx(fakeStedi().fetch))
    expect(outcome.kind === 'responded' && outcome.planActive).toBe(false)
  })
  it('maps AAA 75 to a rejection staff can fix and AAA 42 to a retryable error', async () => {
    const a = (await clearinghouseFor('stedi').checkEligibility(req('SUM-4403-C'), ctx(fakeStedi().fetch))).outcome
    expect(a.kind).toBe('rejected')
    if (a.kind === 'rejected') expect(a.codes[0]).toMatchObject({ code: '75', field: 'memberId', fixable: true })
    expect((await clearinghouseFor('stedi').checkEligibility(req('SUM-4404-D'), ctx(fakeStedi().fetch))).outcome.kind).toBe('error_retryable')
  })
  it('turns a timeout into unknown after exactly one call (no duplicate)', async () => {
    const fake = fakeStedi()
    const { outcome } = await clearinghouseFor('stedi').checkEligibility(req('SUM-4405-E'), ctx(fake.fetch))
    expect(outcome.kind).toBe('unknown')
    expect(fake.calls).toHaveLength(1)
  })
  it('treats a gateway timeout as unknown', async () => {
    expect((await clearinghouseFor('stedi').checkEligibility(req('SUM-4406-F'), ctx(fakeStedi().fetch))).outcome.kind).toBe('unknown')
  })
  it('refuses live mode and a missing key without calling out', async () => {
    const fake = fakeStedi()
    expect((await clearinghouseFor('stedi').checkEligibility(req('SUM-4401-A'), { ...ctx(fake.fetch), mode: 'live' })).outcome.kind).toBe('error_retryable')
    expect((await clearinghouseFor('stedi').checkEligibility(req('SUM-4401-A'), { ...ctx(fake.fetch), apiKey: undefined })).outcome.kind).toBe('error_retryable')
    expect(fake.calls).toHaveLength(0)
  })
  it('keeps the request hash stable across control numbers and different per member', () => {
    expect(eligibilityRequestHash(req('A'), 'stedi')).toBe(eligibilityRequestHash({ ...req('A'), controlNumber: '999' }, 'stedi'))
    expect(eligibilityRequestHash(req('A'), 'stedi')).not.toBe(eligibilityRequestHash(req('B'), 'stedi'))
  })
  it('manual provider sends nothing and unreadable bodies are unknown', async () => {
    expect((await clearinghouseFor('manual').checkEligibility(req('x'), { mode: 'manual_export' })).outcome.kind).toBe('error_retryable')
    expect(parseStediResponse({ benefitsInformation: 'nope' }).kind).toBe('unknown')
  })
  it('parses money and percent strictly', () => {
    expect(dollarsToMinor('109.2')).toBe(10920n)
    expect(() => dollarsToMinor('1.005')).toThrow()
    expect(percentText('0.8')).toBe('80.0000')
    expect(percentText('80')).toBe('80.0000')
  })
})
