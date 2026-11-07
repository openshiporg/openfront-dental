import { describe, expect, it } from 'vitest'
import { calendarDate, eventText, label, languageName, options, title, when } from './format'

const now = new Date('2026-11-07T18:00:00Z')

describe('dates read as words, never ISO', () => {
  it('a calendar date in this year has no year; other years carry it', () => {
    expect(calendarDate('2026-11-10', 'day', now)).toBe('Tue, Nov 10')
    expect(calendarDate('2025-12-01', 'day', now)).toBe('Mon, Dec 1, 2025')
    expect(calendarDate('1988-03-14', 'date', now)).toBe('Mar 14, 1988')
  })

  it('a stored midnight-UTC date does not slip to the day before', () => {
    expect(calendarDate('2026-11-10T00:00:00.000Z', 'day', now)).toBe('Tue, Nov 10')
  })

  it('times are in the practice zone and add the year only outside this year', () => {
    expect(when('2026-11-10T19:30:00Z', 'America/New_York', 'dayTime', now)).toBe('Tue, Nov 10, 2:30 PM EST')
    expect(when('2025-11-10T19:30:00Z', 'America/New_York', 'full', now)).toBe('Nov 10, 2025, 2:30 PM EST')
  })

  it('empty or malformed input renders nothing', () => {
    expect(calendarDate(null)).toBe('')
    expect(calendarDate('soon')).toBe('')
    expect(when('not a date')).toBe('')
  })
})

describe('codes read as words', () => {
  it('statuses, acronyms and approval actions', () => {
    expect(title('no_show')).toBe('No-show')
    expect(title('ready_for_checkout')).toBe('Ready for checkout')
    expect(label('sms')).toBe('SMS')
    expect(title('patient.merge')).toBe('Merge two patient charts')
    expect(options(['latex'])).toEqual([{ value: 'latex', label: 'Latex allergy' }])
  })

  it('unknown codes still lose their underscores', () => {
    expect(title('some_new_state')).toBe('Some new state')
  })

  it('audit event types', () => {
    expect(eventText('appointment.confirmed')).toBe('Appointment confirmed')
    expect(eventText('booking_request.reject_spam')).toBe('Online booking rejected as spam')
    expect(eventText('hold.released')).toBe('Slot hold released')
  })
})

describe('languages', () => {
  it('reads as the language name', () => {
    expect(languageName('en')).toBe('English')
    expect(languageName('es')).toBe('Spanish')
    expect(languageName(null)).toBe('—')
  })
})
