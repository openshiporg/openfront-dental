import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { applyBps, dec, toScale } from './decimal'
import { allocateMinor, formatMinor, fromMinor, minorOf, toMinor } from './money'

describe('decimal', () => {
  it('is exact where binary floats are not', () => {
    expect(dec('0.1').plus('0.2').toFixed()).toBe('0.3')
    expect(dec('1234567890.1234567891').times('3').toFixed()).toBe('3703703670.3703703673')
  })
  it('refuses fractional JS numbers and malformed text', () => {
    expect(() => dec(0.1)).toThrow(/Refusing float/)
    expect(() => dec('12abc')).toThrow(/Not a decimal/)
    expect(() => dec('NaN')).toThrow(/Not a decimal/)
    expect(dec(42).toFixed()).toBe('42')
  })
  it('rounds half-even to column scale', () => {
    expect(toScale('2.5', 0)).toBe('2')
    expect(toScale('3.5', 0)).toBe('4')
    expect(toScale('1.00000000005', 'px')).toBe('1.0000000000')
    expect(toScale('1.00000000015', 'px')).toBe('1.0000000002')
  })
  it('applies basis points exactly', () => {
    expect(applyBps('187.40', 5).toFixed()).toBe('0.0937')
  })
})

describe('money', () => {
  it('converts to and from minor units half-even', () => {
    expect(toMinor('1234.565')).toBe(123456n)
    expect(toMinor('1234.575')).toBe(123458n)
    expect(toMinor('-0.005')).toBe(0n)
    expect(toMinor('1000', 'JPY')).toBe(1000n)
    expect(fromMinor(123456n).toFixed()).toBe('1234.56')
    expect(formatMinor(-123456789n)).toBe('−$1,234,567.89')
    expect(minorOf('42')).toBe(42n)
    expect(() => minorOf('4.2')).toThrow()
    expect(() => toMinor('1', 'usd')).toThrow(/currency/)
  })

  it('allocates with the largest remainder', () => {
    expect(allocateMinor(100n, ['1', '1', '1'])).toEqual([34n, 33n, 33n])
    expect(allocateMinor(-100n, ['1', '1', '1'])).toEqual([-34n, -33n, -33n])
    expect(allocateMinor(10n, ['0.5', '0.25', '0.25'])).toEqual([5n, 3n, 2n])
    expect(() => allocateMinor(10n, ['0'])).toThrow()
  })

  it('always allocates exactly the total, each share within one unit of pro rata', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n }),
        fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 40 }).filter(ws => ws.some(w => w > 0)),
        (total, weights) => {
          const shares = allocateMinor(total, weights)
          expect(shares.reduce((a, b) => a + b, 0n)).toBe(total)
          const weightSum = weights.reduce((a, b) => a + b, 0)
          shares.forEach((share, i) => {
            const exact = dec(total).times(weights[i]).div(weightSum)
            expect(dec(share).minus(exact).abs().lt(1)).toBe(true)
          })
        }
      ),
      { numRuns: 300 }
    )
  })
})
