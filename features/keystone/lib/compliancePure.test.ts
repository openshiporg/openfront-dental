import { describe, expect, it } from 'vitest'
import { breachNoticeBy, checkReviewReply, clockOf, credentialState, draftReviewReply, eligibleOn, rightsDueOn, rightsExtendedDueOn } from './compliancePure'
import { BUNDLE_VERSION, buildBundle, unzip, validateBundle, zip } from './bundle'
import { moneyToMinor, parseGenericCsv, parseOpenDental } from './importPure'

describe('clocks', () => {
  it('rights: 30 days, one 30-day extension', () => {
    expect(rightsDueOn('2026-01-15')).toBe('2026-02-14')
    expect(rightsExtendedDueOn('2026-02-14')).toBe('2026-03-16')
  })
  it('breach: 60 days from discovery', () => expect(breachNoticeBy('2026-03-05')).toBe('2026-05-04'))
  it('clock states', () => {
    expect(clockOf('2026-02-14', '2026-02-01').state).toBe('on_track')
    expect(clockOf('2026-02-14', '2026-02-10')).toMatchObject({ state: 'due_soon', daysLeft: 4 })
    expect(clockOf('2026-02-14', '2026-02-15')).toMatchObject({ state: 'overdue', daysLeft: -1 })
  })
  it('credentials', () => {
    expect(credentialState(null, '2026-01-01')).toBe('no_date')
    expect(credentialState('2026-12-31', '2026-01-01')).toBe('valid')
    expect(credentialState('2026-02-15', '2026-01-01')).toBe('expiring')
    expect(credentialState('2025-12-31', '2026-01-01')).toBe('expired')
  })
})

describe('retention eligibility', () => {
  it('adults: ten years after the last visit', () => expect(eligibleOn({ lastActivityOn: '2010-05-31', dateOfBirth: '1980-01-01', years: 10, minorsUntilAge: 21 })).toBe('2020-05-31'))
  it('minors: kept until 21 if that is later', () => expect(eligibleOn({ lastActivityOn: '2012-03-01', dateOfBirth: '2008-06-15', years: 10, minorsUntilAge: 21 })).toBe('2029-06-15'))
})

describe('review reply policy', () => {
  it('passes the draft templates', () => { for (const r of [1, 3, 5]) expect(checkReviewReply(draftReviewReply(r, 'Bayview Family Dental'), 'Pat Jones')).toEqual([]) })
  it('stops anything that confirms care, names the reviewer, gives contact details or offers a deal', () => {
    for (const bad of ['We enjoyed seeing you at your appointment last week.', 'Sorry about the billing problem, Pat Jones.', 'Call us on 407-555-0100.', 'Come back for a free whitening.', 'Your root canal went well.'])
      expect(checkReviewReply(bad, 'Pat Jones').length, bad).toBeGreaterThan(0)
  })
})

describe('import parsing', () => {
  it('reads money exactly', () => { expect(moneyToMinor('1,234.5')).toBe(123450n); expect(moneyToMinor('-20')).toBe(-2000n); expect(moneyToMinor('12.345')).toBeNull(); expect(moneyToMinor('abc')).toBeNull() })
  it('skips bad rows with a reason and keeps good ones', () => {
    const n = parseOpenDental({ patient: [{ PatNum: '1', LName: 'Rivera', FName: 'Ana', Birthdate: '1985-04-12', Gender: '1', EstBalance: '25.00' }, { PatNum: '1', LName: 'Dup', FName: 'Dup', Birthdate: '1985-04-12' }, { PatNum: '2', LName: 'Lee', FName: 'Sam', Birthdate: '1985-02-30' }, { PatNum: '3', LName: 'Cho', FName: 'Min', Birthdate: '1990-01-01', EstBalance: 'oops' }],
      appointment: [{ AptNum: 'a1', PatNum: '9', AptDateTime: '2026-01-01 09:00:00', AptStatus: '1' }] })
    expect(n.patients.map(p => p.ext)).toEqual(['1'])
    expect(n.problems.map(p => `${p.entity}:${p.ext}`).sort()).toEqual(['appointment:a1', 'patient:1', 'patient:2', 'patient:3'])
  })
  it('reads a generic csv with quoted commas', () => {
    const n = parseGenericCsv('id,first_name,last_name,date_of_birth,sex,phone,balance\r\n7,Ana,"Rivera, Jr",1985-04-12,female,407-555-0101,10.50\r\n')
    expect(n.patients[0]).toMatchObject({ ext: '7', lastName: 'Rivera, Jr', balanceMinor: 1050n })
  })
})

describe('export bundle', () => {
  const build = () => buildBundle({ patientChart: '1001', now: new Date('2026-05-01T12:00:00Z'), sections: [{ name: 'patient.json', records: [{ id: 'p1' }] }, { name: 'ledger.json', records: [{ amountMinor: 1250n }, { amountMinor: -50n }] }] })
  it('round-trips and validates', () => {
    const b = build()
    expect(b.manifest.version).toBe(BUNDLE_VERSION)
    const back = validateBundle(b.bytes)
    expect(back).toMatchObject({ ok: true, problems: [] })
    expect(back.manifest?.files.map(f => `${f.name}:${f.records}`)).toEqual(['patient.json:1', 'ledger.json:2'])
    expect(unzip(b.bytes).find(e => e.name === 'ledger.json')!.data.toString()).toContain('"1250"')
  })
  it('catches a changed file, a missing file and an extra file', () => {
    const b = build()
    const files = unzip(b.bytes).map(e => ({ name: e.name, data: e.data }))
    const tamper = (fn: (f: typeof files) => typeof files) => validateBundle(zip(fn(files.map(f => ({ ...f })))))
    expect(tamper(f => f.map(x => (x.name === 'patient.json' ? { ...x, data: Buffer.from('[{"id":"p2"}]') } : x))).problems.join()).toMatch(/differ/)
    expect(tamper(f => f.filter(x => x.name !== 'ledger.json')).problems.join()).toMatch(/missing/)
    expect(tamper(f => [...f, { name: 'extra.json', data: Buffer.from('[]') }]).problems.join()).toMatch(/not in the manifest/)
  })
  it('catches a damaged byte and a non-zip', () => {
    const b = build()
    const bad = Buffer.from(b.bytes); const at = 30 + 'manifest.json'.length + 20; bad[at] = bad[at] ^ 0xff
    expect(validateBundle(bad).ok).toBe(false)
    expect(validateBundle(Buffer.from('hello')).ok).toBe(false)
  })
})
