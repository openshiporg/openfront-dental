import { DomainError, Codes } from './errors'

/*
 * Tooth, surface and area rules (SCHEMA §5.1; DOMAIN I-C1). Teeth are stored in Universal numbering
 * (permanent 1–32, primary A–T, supernumerary 51–82 and AS–TS) and displayed in FDI or Palmer.
 */

export const PERMANENT = Array.from({ length: 32 }, (_, i) => String(i + 1))
export const PRIMARY = 'ABCDEFGHIJKLMNOPQRST'.split('')
export const SUPERNUMERARY = [...Array.from({ length: 32 }, (_, i) => String(i + 51)), ...PRIMARY.map(letter => `${letter}S`)]
export const VALID_TEETH = new Set([...PERMANENT, ...PRIMARY, ...SUPERNUMERARY])

/** Canonical surface order: mesial, occlusal, distal, buccal, incisal, lingual, facial, 5 (the fifth surface). */
export const SURFACE_ORDER = 'MODBIFL5'.split('')
const SURFACE_SET = new Set(SURFACE_ORDER)

export const QUADRANTS = ['UR', 'UL', 'LR', 'LL'] as const

export type Dentition = 'permanent' | 'primary' | 'mixed'

export const isPrimary = (tooth: string) => /^[A-T]$/.test(tooth)

export function normalizeTooth(raw: unknown): string {
  const tooth = String(raw ?? '').trim().toUpperCase()
  if (!VALID_TEETH.has(tooth)) throw new DomainError(Codes.INVALID_INPUT, 'Choose a tooth from 1 to 32 or A to T.', { field: 'tooth' })
  return tooth
}

/** Surfaces sorted into canonical order with duplicates refused. */
export function normalizeSurfaces(raw: unknown, max = 5): string {
  const letters = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').split('')
  const seen = new Set<string>()
  for (const letter of letters) {
    if (!SURFACE_SET.has(letter)) throw new DomainError(Codes.INVALID_INPUT, `"${letter}" is not a tooth surface. Use M, O, D, B, I, F, L or 5.`, { field: 'surfaces' })
    if (seen.has(letter)) throw new DomainError(Codes.INVALID_INPUT, `Surface ${letter} is listed twice.`, { field: 'surfaces' })
    seen.add(letter)
  }
  if (seen.size > max) throw new DomainError(Codes.INVALID_INPUT, `This code allows at most ${max} surfaces.`, { field: 'surfaces' })
  return SURFACE_ORDER.filter(letter => seen.has(letter)).join('')
}

/** Universal → quadrant. */
export function quadrantOf(tooth: string): (typeof QUADRANTS)[number] | null {
  if (/^\d+$/.test(tooth)) {
    const n = Number(tooth)
    if (n >= 1 && n <= 8) return 'UR'
    if (n >= 9 && n <= 16) return 'UL'
    if (n >= 17 && n <= 24) return 'LL'
    if (n >= 25 && n <= 32) return 'LR'
    return null
  }
  if (isPrimary(tooth)) {
    const i = PRIMARY.indexOf(tooth)
    return i < 5 ? 'UR' : i < 10 ? 'UL' : i < 15 ? 'LL' : 'LR'
  }
  return null
}

/** Universal → FDI two-digit notation (permanent 11–48, primary 51–85). */
export function toFdi(tooth: string): string {
  if (/^\d+$/.test(tooth) && Number(tooth) <= 32) {
    const n = Number(tooth)
    if (n <= 8) return String(19 - n)
    if (n <= 16) return String(n + 12)
    if (n <= 24) return String(48 - (n - 17))
    return String(n + 6)
  }
  if (isPrimary(tooth)) {
    const i = PRIMARY.indexOf(tooth)
    if (i < 5) return String(55 - i)
    if (i < 10) return String(61 + (i - 5))
    if (i < 15) return String(75 - (i - 10))
    return String(81 + (i - 15))
  }
  return tooth
}

/** Universal → Palmer notation, e.g. "⎿3" shown as `LL3`-style text: quadrant plus position. */
export function toPalmer(tooth: string): string {
  const q = quadrantOf(tooth)
  if (!q) return tooth
  const fdi = toFdi(tooth)
  const position = fdi.slice(-1)
  const label = isPrimary(tooth) ? String.fromCharCode(64 + Number(position)) : position
  return `${q} ${label}`
}

export type AreaRule = 'none' | 'tooth' | 'tooth_surface' | 'quadrant' | 'arch' | 'mouth' | 'sextant'
export type Site = { tooth?: unknown; surfaces?: unknown; quadrant?: unknown; arch?: unknown; sextant?: unknown }

export type NormalizedSite = { area: 'tooth' | 'surface' | 'quadrant' | 'sextant' | 'arch' | 'mouth'; tooth: string; surfaces: string; quadrant: string; arch: string; sextant: number | null }

/** Validates where in the mouth a procedure is done against the code's area rule (I-C1). */
export function normalizeSite(rule: AreaRule, input: Site, options: { requiresSurfaces?: boolean; maxSurfaces?: number | null } = {}): NormalizedSite {
  const empty = { tooth: '', surfaces: '', quadrant: '', arch: '', sextant: null as number | null }
  switch (rule) {
    case 'none':
    case 'mouth':
      return { ...empty, area: 'mouth' }
    case 'arch': {
      const arch = String(input.arch ?? '').toUpperCase()
      if (arch !== 'U' && arch !== 'L') throw new DomainError(Codes.INVALID_INPUT, 'Choose the upper or lower arch.', { field: 'arch' })
      return { ...empty, area: 'arch', arch }
    }
    case 'quadrant': {
      const quadrant = String(input.quadrant ?? '').toUpperCase()
      if (!(QUADRANTS as readonly string[]).includes(quadrant)) throw new DomainError(Codes.INVALID_INPUT, 'Choose a quadrant: UR, UL, LR or LL.', { field: 'quadrant' })
      return { ...empty, area: 'quadrant', quadrant }
    }
    case 'sextant': {
      const sextant = Number(input.sextant)
      if (!Number.isInteger(sextant) || sextant < 1 || sextant > 6) throw new DomainError(Codes.INVALID_INPUT, 'Choose a sextant from 1 to 6.', { field: 'sextant' })
      return { ...empty, area: 'sextant', sextant }
    }
    case 'tooth': {
      const tooth = normalizeTooth(input.tooth)
      return { ...empty, area: 'tooth', tooth, quadrant: quadrantOf(tooth) ?? '' }
    }
    case 'tooth_surface': {
      const tooth = normalizeTooth(input.tooth)
      const surfaces = normalizeSurfaces(input.surfaces, options.maxSurfaces ?? 5)
      if (options.requiresSurfaces !== false && !surfaces) throw new DomainError(Codes.INVALID_INPUT, 'Choose at least one surface.', { field: 'surfaces' })
      return { ...empty, area: 'surface', tooth, surfaces, quadrant: quadrantOf(tooth) ?? '' }
    }
  }
}
