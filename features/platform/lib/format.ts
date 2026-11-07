/**
 * Display formatting for exact values. Inputs are the strings GraphQL returns for bigInt and
 * decimal fields; nothing here turns money into a float.
 */

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

function splitDecimal(value: string) {
  const text = value.trim()
  const negative = text.startsWith('-')
  const [whole = '0', fraction = ''] = text.replace(/^[+-]/, '').split('.')
  return { negative, whole: whole.replace(/^0+(?=\d)/, '') || '0', fraction }
}

/** Minor units ("123456") → "$1,234.56". */
export function money(minor: string | bigint | null | undefined, currency = 'USD', digits = 2) {
  if (minor === null || minor === undefined || minor === '') return '—'
  const text = String(minor)
  if (!/^-?\d+$/.test(text)) return '—'
  const negative = text.startsWith('-')
  const abs = text.replace('-', '').padStart(digits + 1, '0')
  const whole = abs.slice(0, abs.length - digits)
  const fraction = digits ? `.${abs.slice(-digits)}` : ''
  const symbol = currency === 'USD' ? '$' : `${currency} `
  return `${negative ? '−' : ''}${symbol}${group(whole.replace(/^0+(?=\d)/, ''))}${fraction}`
}

/** An exact decimal string trimmed to at most `maxPlaces` (truncating display only) and at least `minPlaces`. */
export function decimalText(value: string | null | undefined, options: { minPlaces?: number; maxPlaces?: number; prefix?: string } = {}) {
  if (value === null || value === undefined || value === '') return '—'
  if (!/^[+-]?\d*(\.\d*)?$/.test(String(value).trim())) return '—'
  const { negative, whole, fraction } = splitDecimal(String(value))
  const max = options.maxPlaces ?? 10
  const min = options.minPlaces ?? 0
  let f = fraction.slice(0, max).replace(/0+$/, '')
  if (f.length < min) f = f.padEnd(min, '0')
  const isZero = /^0*$/.test(whole + f)
  return `${negative && !isZero ? '−' : ''}${options.prefix ?? ''}${group(whole)}${f ? `.${f}` : ''}`
}

/** Price in dollars from a decimal string: at least cents, up to 4 places. */
export const price = (value: string | null | undefined) => decimalText(value, { minPlaces: 2, maxPlaces: 4, prefix: '$' })

/** Quantity: up to 6 places (micro-shares). */
export const quantity = (value: string | null | undefined) => decimalText(value, { maxPlaces: 6 })

export const bps = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value} bps`)

export function when(iso: string | null | undefined, tz = 'America/New_York', style: 'full' | 'time' | 'day' | 'seconds' = 'full') {
  if (!iso) return ''
  const d = new Date(iso)
  const opts: Intl.DateTimeFormatOptions =
    style === 'time' ? { hour: 'numeric', minute: '2-digit' }
    : style === 'seconds' ? { hour: 'numeric', minute: '2-digit', second: '2-digit' }
    : style === 'day' ? { weekday: 'short', month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: style === 'day' ? undefined : 'short', ...opts }).format(d)
}

export const label = (value: string | null | undefined) => (value || '').replaceAll('_', ' ')
