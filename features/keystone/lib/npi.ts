// NPI check digit (CMS: Luhn over the 9-digit base prefixed with the 80840 card issuer id).
export function npiCheckDigit(base9: string) {
  if (!/^\d{9}$/.test(base9)) throw new Error('NPI base must be 9 digits')
  const digits = `80840${base9}`.split('').map(Number)
  let sum = 0
  // Double every second digit from the right of the full 15-digit number (excluding the check digit).
  for (let i = digits.length - 1, double = true; i >= 0; i -= 1, double = !double) {
    let d = digits[i]
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return String((10 - (sum % 10)) % 10)
}

export const isValidNpi = (npi: string) => /^[12]\d{9}$/.test(npi) && npiCheckDigit(npi.slice(0, 9)) === npi[9]
