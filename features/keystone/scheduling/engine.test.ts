import { describe, expect, it } from 'vitest'
import { zonedInstant, localTime } from '../lib/time'
import {
  chairClash, dentistsOnSite, expandPattern, findSlots, inQuietHours, materialiseBlocks, parsePattern, patternUnits, planSegments, providerClashes,
  MS_PER_MINUTE, type OpenWindow, type TemplateBlockInput,
} from './engine'

const TZ = 'America/New_York'
const block = (over: Partial<TemplateBlockInput> = {}): TemplateBlockInput => ({
  id: 'b1', weekday: 1, operatoryId: 'op1', providerId: 'dds1', providerType: 'dentist', startLocal: '08:00', endLocal: '12:00', allowedTypeIds: [], onlineBookable: false, ...over,
})
const at = (date: string, hhmm: string) => zonedInstant(TZ, date, hhmm).getTime()

describe('unit patterns', () => {
  it('parses a pattern and refuses unknown roles or silly unit counts', () => {
    expect(parsePattern([{ role: 'assistant', units: 1 }, { role: 'provider', units: 4 }])).toHaveLength(2)
    expect(() => parsePattern([])).toThrow()
    expect(() => parsePattern([{ role: 'janitor', units: 1 }])).toThrow(/unknown role/)
    expect(() => parsePattern([{ role: 'provider', units: 0 }])).toThrow(/whole number/)
    expect(() => parsePattern([{ role: 'provider', units: 2.5 }])).toThrow(/whole number/)
  })

  it('lays out segments in order; assistant time uses no provider; exam goes to the examining dentist', () => {
    const start = at('2026-11-09', '08:00')
    const segs = expandPattern(parsePattern([{ role: 'assistant', units: 1 }, { role: 'hygienist', units: 4 }, { role: 'exam', units: 1 }, { role: 'hygienist', units: 1 }]), 10, start, { providerId: 'rdh1', examProviderId: 'dds1' })
    expect(segs.map(s => [s.role, s.providerId, (s.endMs - s.startMs) / MS_PER_MINUTE])).toEqual([['assistant', null, 10], ['hygienist', 'rdh1', 40], ['exam', 'dds1', 10], ['hygienist', 'rdh1', 10]])
    expect(segs.find(s => s.role === 'exam')!.concurrencyKind).toBe('hygiene_exam_float')
    expect(patternUnits(parsePattern([{ role: 'provider', units: 3 }, { role: 'assistant', units: 2 }]))).toBe(5)
  })

  it('merges adjacent units of the same role and provider', () => {
    const segs = expandPattern([{ role: 'provider', units: 2 }, { role: 'provider', units: 3 }], 10, 0, { providerId: 'p' })
    expect(segs).toHaveLength(1)
    expect(segs[0].endMs).toBe(50 * MS_PER_MINUTE)
  })
})

describe('template blocks and DST (America/New_York)', () => {
  it('an 08:00 block is 08:00 local on both sides of the November change', () => {
    // 2026-11-01 is the fall-back Sunday; Monday Oct 26 is EDT (UTC-4), Monday Nov 2 is EST (UTC-5).
    const before = materialiseBlocks('2026-10-26', TZ, [block()], [])
    const after = materialiseBlocks('2026-11-02', TZ, [block()], [])
    expect(new Date(before[0].startMs).toISOString()).toBe('2026-10-26T12:00:00.000Z')
    expect(new Date(after[0].startMs).toISOString()).toBe('2026-11-02T13:00:00.000Z')
    expect(localTime(TZ, before[0].startMs)).toBe('08:00')
    expect(localTime(TZ, after[0].startMs)).toBe('08:00')
    expect((after[0].endMs - after[0].startMs) / 3_600_000).toBe(4)
  })

  it('the spring-forward week keeps local hours too (2027-03-15 after the change on 03-14)', () => {
    const w = materialiseBlocks('2027-03-15', TZ, [block()], [])
    expect(new Date(w[0].startMs).toISOString()).toBe('2027-03-15T12:00:00.000Z')
  })

  it('a block on the transition day itself spans the right number of real hours', () => {
    // A Sunday block 00:00–04:00 on the fall-back day lasts five real hours (01:00–02:00 repeats).
    const w = materialiseBlocks('2026-11-01', TZ, [block({ weekday: 0, startLocal: '00:00', endLocal: '04:00' })], [])
    expect((w[0].endMs - w[0].startMs) / 3_600_000).toBe(5)
  })

  it('only blocks for the weekday apply; a full closure removes the day; a half closure cuts its window', () => {
    expect(materialiseBlocks('2026-11-10', TZ, [block()], [])).toHaveLength(0) // Tuesday
    expect(materialiseBlocks('2026-11-09', TZ, [block()], [{ date: '2026-11-09', isHalfDay: false }])).toHaveLength(0)
    const cut = materialiseBlocks('2026-11-09', TZ, [block()], [{ date: '2026-11-09', isHalfDay: true, startLocal: '09:00', endLocal: '10:00' }])
    expect(cut.map(w => [localTime(TZ, w.startMs), localTime(TZ, w.endMs)])).toEqual([['08:00', '09:00'], ['10:00', '12:00']])
  })
})

describe('chair, provider and exam float rules', () => {
  const t0 = at('2026-11-09', '09:00')
  it('chair clash respects turnover buffers on both sides', () => {
    const busy = [{ startMs: t0, endMs: t0 + 60 * MS_PER_MINUTE, bufferAfterMinutes: 10 }]
    expect(chairClash(t0 + 60 * MS_PER_MINUTE, t0 + 90 * MS_PER_MINUTE, 0, busy)).toBe(true) // inside the buffer
    expect(chairClash(t0 + 70 * MS_PER_MINUTE, t0 + 90 * MS_PER_MINUTE, 0, busy)).toBe(false)
    expect(chairClash(t0 - 30 * MS_PER_MINUTE, t0, 5, busy)).toBe(true) // my buffer runs into theirs
    expect(chairClash(t0 - 30 * MS_PER_MINUTE, t0, 0, busy)).toBe(false) // half-open: touching is fine
  })

  it('a dentist exam may float over their own chair time, but not over another exam', () => {
    const chair = { providerId: 'dds1', startMs: t0, endMs: t0 + 60 * MS_PER_MINUTE, concurrencyKind: 'none', role: 'provider' as const }
    const exam = { role: 'exam' as const, providerId: 'dds1', startMs: t0 + 20 * MS_PER_MINUTE, endMs: t0 + 30 * MS_PER_MINUTE, concurrencyKind: 'hygiene_exam_float' as const }
    expect(providerClashes([exam], [chair])).toHaveLength(0)
    expect(providerClashes([exam], [{ ...exam, role: 'exam' }])).toHaveLength(1)
    const ownChair = { role: 'provider' as const, providerId: 'dds1', startMs: t0 + 30 * MS_PER_MINUTE, endMs: t0 + 70 * MS_PER_MINUTE, concurrencyKind: 'none' as const }
    expect(providerClashes([ownChair], [chair])).toHaveLength(1)
    expect(providerClashes([{ ...ownChair, concurrencyKind: 'approved_override' }], [chair])).toHaveLength(0)
  })

  it('planSegments picks a dentist on site whose exam time is free', () => {
    const windows: OpenWindow[] = materialiseBlocks('2026-11-09', TZ, [
      block({ id: 'h', operatoryId: 'h1', providerId: 'rdh1', providerType: 'hygienist' }),
      block({ id: 'a', operatoryId: 'op1', providerId: 'dds1' }),
      block({ id: 'b', operatoryId: 'op2', providerId: 'dds2' }),
    ], [])
    expect(dentistsOnSite(windows, t0, t0 + 3_600_000)).toEqual(['dds1', 'dds2'])
    const pattern = parsePattern([{ role: 'hygienist', units: 4 }, { role: 'exam', units: 1 }, { role: 'hygienist', units: 1 }])
    const examOfDds1 = { providerId: 'dds1', startMs: t0 + 40 * MS_PER_MINUTE, endMs: t0 + 50 * MS_PER_MINUTE, concurrencyKind: 'hygiene_exam_float', role: 'exam' as const }
    const plan = planSegments({ pattern, unitMinutes: 10, startMs: t0, providerId: 'rdh1', windows, providerBusy: [examOfDds1] })
    expect(plan.clashes).toHaveLength(0)
    expect(plan.examProviderId).toBe('dds2')
  })
})

describe('findSlots', () => {
  const windows = materialiseBlocks('2026-11-09', TZ, [block({ startLocal: '08:00', endLocal: '10:00', allowedTypeIds: ['fill'] })], [])
  const base = { windows, typeId: 'fill', durationMinutes: 60, unitMinutes: 10, bufferAfterMinutes: 0, chairBusy: {}, providerBusy: [], pattern: parsePattern([{ role: 'provider', units: 6 }]), nowMs: 0, leadMinutes: 0 }
  it('steps by the unit and keeps whole appointments inside the window', () => {
    const slots = findSlots(base)
    expect(slots.map(s => localTime(TZ, s.startMs))).toEqual(['08:00', '08:10', '08:20', '08:30', '08:40', '08:50', '09:00'])
  })
  it('drops slots that clash with the chair, the patient, the lead time or the allowed types', () => {
    const busy = { op1: [{ startMs: at('2026-11-09', '08:30'), endMs: at('2026-11-09', '09:00') }] }
    expect(findSlots({ ...base, chairBusy: busy }).map(s => localTime(TZ, s.startMs))).toEqual(['09:00'])
    expect(findSlots({ ...base, patientBusy: [{ startMs: at('2026-11-09', '08:00'), endMs: at('2026-11-09', '08:50') }] }).map(s => localTime(TZ, s.startMs))).toEqual(['08:50', '09:00'])
    expect(findSlots({ ...base, nowMs: at('2026-11-09', '08:15'), leadMinutes: 30 }).map(s => localTime(TZ, s.startMs))).toEqual(['08:50', '09:00'])
    expect(findSlots({ ...base, typeId: 'crown' })).toHaveLength(0)
    expect(findSlots({ ...base, onlineOnly: true })).toHaveLength(0)
  })
})

describe('messaging helpers', () => {
  it('quiet hours wrap midnight', () => {
    expect(inQuietHours('21:30', '20:00', '08:00')).toBe(true)
    expect(inQuietHours('07:59', '20:00', '08:00')).toBe(true)
    expect(inQuietHours('08:00', '20:00', '08:00')).toBe(false)
    expect(inQuietHours('12:00', '12:00', '13:00')).toBe(true)
    expect(inQuietHours('13:00', '12:00', '13:00')).toBe(false)
  })
})
