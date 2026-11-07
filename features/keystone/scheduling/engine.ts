import { addDays, localDate, minutesOf, overlaps, weekdayOf, zonedInstant } from '../lib/time'

/*
 * The scheduling engine (DOMAIN I-S1–I-S5, SCHEMA §2.3/§4, RESEARCH §3.2). Pure functions: no
 * database, no clock. The commands load rows, call these and then write under ordered locks.
 *
 *   open time = template blocks for the date (in the location's zone, DST-safe)
 *             − closures
 *             − active appointments and live holds in the chair (with turnover buffers)
 *             − the patient's other appointments
 *             − provider time already committed (provider/hygienist segments; exam segments float)
 *
 * adapted from openfront-scheduling@a7d7d32 features/keystone/lib/availability.ts (weekly windows,
 * busy intervals, lead time, half-open overlap) and lib/resourceCapacity.ts (sweep over half-open
 * intervals); dental adds unit patterns, per-operatory blocks, provider segments and supervision.
 */

export const MS_PER_MINUTE = 60_000

export type SegmentRole = 'provider' | 'assistant' | 'hygienist' | 'exam'
export type PatternUnit = { role: SegmentRole; units: number }

export type PlannedSegment = { role: SegmentRole; providerId: string | null; startMs: number; endMs: number; concurrencyKind: 'none' | 'hygiene_exam_float' | 'approved_override' }

/** Parse and check an appointment type's unit pattern (`[{role, units}]`). */
export function parsePattern(value: unknown): PatternUnit[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('An appointment type needs at least one unit in its pattern.')
  return value.map((entry, index) => {
    const role = (entry as any)?.role
    const units = Number((entry as any)?.units)
    if (!['provider', 'assistant', 'hygienist', 'exam'].includes(role)) throw new Error(`Pattern unit ${index + 1} has an unknown role.`)
    if (!Number.isInteger(units) || units < 1 || units > 96) throw new Error(`Pattern unit ${index + 1} needs a whole number of units from 1 to 96.`)
    return { role, units }
  })
}

export const patternUnits = (pattern: PatternUnit[]) => pattern.reduce((sum, unit) => sum + unit.units, 0)

/**
 * Lay a unit pattern out from a start instant. Provider and hygienist units use the appointment's
 * provider; exam units use the examining dentist (the hygiene exam float, I-S3) and are marked so
 * they may overlap that dentist's own chair time; assistant units consume no provider time.
 * Adjacent units with the same role and provider merge into one segment.
 */
export function expandPattern(pattern: PatternUnit[], unitMinutes: number, startMs: number, providers: { providerId: string | null; examProviderId?: string | null }): PlannedSegment[] {
  const segments: PlannedSegment[] = []
  let at = startMs
  for (const unit of pattern) {
    const endMs = at + unit.units * unitMinutes * MS_PER_MINUTE
    const providerId = unit.role === 'assistant' ? null : unit.role === 'exam' ? providers.examProviderId ?? null : providers.providerId
    const concurrencyKind = unit.role === 'exam' ? 'hygiene_exam_float' : 'none'
    const last = segments[segments.length - 1]
    if (last && last.role === unit.role && last.providerId === providerId && last.endMs === at) last.endMs = endMs
    else segments.push({ role: unit.role, providerId, startMs: at, endMs, concurrencyKind })
    at = endMs
  }
  return segments
}

export type TemplateBlockInput = {
  id: string
  weekday: number
  operatoryId: string
  providerId: string | null
  providerType?: string | null
  startLocal: string
  endLocal: string
  allowedTypeIds: string[]
  onlineBookable: boolean
}

export type ClosureInput = { date: string; isHalfDay: boolean; startLocal?: string | null; endLocal?: string | null }

export type OpenWindow = {
  blockId: string
  operatoryId: string
  providerId: string | null
  providerType: string | null
  startMs: number
  endMs: number
  allowedTypeIds: string[]
  onlineBookable: boolean
}

/** Subtract [cut0, cut1) from [start, end): zero, one or two pieces. */
function subtract(start: number, end: number, cut0: number, cut1: number): [number, number][] {
  if (!overlaps(start, end, cut0, cut1)) return [[start, end]]
  const out: [number, number][] = []
  if (cut0 > start) out.push([start, cut0])
  if (cut1 < end) out.push([cut1, end])
  return out
}

/**
 * Template blocks for one local date as UTC windows, with closures removed. A full-day closure
 * removes everything; a half-day closure removes its local window. Wall-clock times convert through
 * the location's zone, so an 08:00 block is 08:00 local on both sides of a DST change.
 */
export function materialiseBlocks(date: string, timeZone: string, blocks: TemplateBlockInput[], closures: ClosureInput[]): OpenWindow[] {
  const weekday = weekdayOf(date)
  const dayClosures = closures.filter(c => c.date === date)
  if (dayClosures.some(c => !c.isHalfDay)) return []
  const cuts = dayClosures.flatMap(c => (c.startLocal && c.endLocal ? [[zonedInstant(timeZone, date, c.startLocal).getTime(), zonedInstant(timeZone, date, c.endLocal).getTime()] as const] : []))
  const windows: OpenWindow[] = []
  for (const block of blocks) {
    if (block.weekday !== weekday) continue
    if (minutesOf(block.endLocal) <= minutesOf(block.startLocal)) continue
    let pieces: [number, number][] = [[zonedInstant(timeZone, date, block.startLocal).getTime(), zonedInstant(timeZone, date, block.endLocal).getTime()]]
    for (const [c0, c1] of cuts) pieces = pieces.flatMap(([s, e]) => subtract(s, e, c0, c1))
    for (const [startMs, endMs] of pieces) {
      if (endMs > startMs) windows.push({ blockId: block.id, operatoryId: block.operatoryId, providerId: block.providerId, providerType: block.providerType ?? null, startMs, endMs, allowedTypeIds: block.allowedTypeIds, onlineBookable: block.onlineBookable })
    }
  }
  return windows.sort((a, b) => a.startMs - b.startMs || a.operatoryId.localeCompare(b.operatoryId))
}

export type BusyInterval = { startMs: number; endMs: number; bufferAfterMinutes?: number }
export type ProviderBusy = { providerId: string; startMs: number; endMs: number; concurrencyKind: string; role: SegmentRole }

/** Does a new chair interval clash with existing chair use (buffers included on both sides)? */
export function chairClash(startMs: number, endMs: number, bufferAfterMinutes: number, busy: BusyInterval[]) {
  const end = endMs + bufferAfterMinutes * MS_PER_MINUTE
  return busy.some(b => overlaps(startMs, end, b.startMs, b.endMs + (b.bufferAfterMinutes ?? 0) * MS_PER_MINUTE))
}

/**
 * Provider time (I-S3). A provider/hygienist segment clashes with the same provider's
 * provider/hygienist segments. An exam segment (the hygiene exam float) may overlap the dentist's
 * own chair time but not another exam. Approved overrides never clash: they were decided with a reason.
 */
export function providerClashes(segments: PlannedSegment[], busy: ProviderBusy[]) {
  const clashes: { segment: PlannedSegment; with: ProviderBusy }[] = []
  for (const segment of segments) {
    if (!segment.providerId || segment.role === 'assistant' || segment.concurrencyKind === 'approved_override') continue
    for (const other of busy) {
      if (other.providerId !== segment.providerId || other.role === 'assistant' || other.concurrencyKind === 'approved_override') continue
      if (!overlaps(segment.startMs, segment.endMs, other.startMs, other.endMs)) continue
      const segmentIsExam = segment.role === 'exam'
      const otherIsExam = other.role === 'exam'
      if (segmentIsExam !== otherIsExam) continue // exam floats over chair time
      clashes.push({ segment, with: other })
    }
  }
  return clashes
}

/** Is [start, end) inside one template window for this operatory that allows the type? */
export function templateWindowFor(windows: OpenWindow[], operatoryId: string, typeId: string, startMs: number, endMs: number, options: { onlineOnly?: boolean } = {}) {
  return windows.find(w =>
    w.operatoryId === operatoryId && w.startMs <= startMs && endMs <= w.endMs &&
    (w.allowedTypeIds.length === 0 || w.allowedTypeIds.includes(typeId)) &&
    (!options.onlineOnly || w.onlineBookable)) ?? null
}

/**
 * Dentists on site for [start, end): a dentist counts as on site while one of their template
 * blocks at the location covers the interval (I-S5). Sorted for a stable choice.
 */
export function dentistsOnSite(windows: OpenWindow[], startMs: number, endMs: number) {
  const ids = windows.filter(w => w.providerType === 'dentist' && w.providerId && w.startMs <= startMs && endMs <= w.endMs).map(w => w.providerId as string)
  return [...new Set(ids)].sort()
}

/**
 * Lay out the pattern and pick the examining dentist for any exam unit: the first dentist on site
 * whose exam time is free. Returns the segments and whether every rule is met.
 */
export function planSegments(input: { pattern: PatternUnit[]; unitMinutes: number; startMs: number; providerId: string | null; windows: OpenWindow[]; providerBusy: ProviderBusy[]; examProviderId?: string | null }) {
  const endMs = input.startMs + patternUnits(input.pattern) * input.unitMinutes * MS_PER_MINUTE
  const needsExam = input.pattern.some(u => u.role === 'exam')
  const candidates = !needsExam ? [null] : input.examProviderId ? [input.examProviderId] : dentistsOnSite(input.windows, input.startMs, endMs)
  let fallback: { segments: PlannedSegment[]; clashes: ReturnType<typeof providerClashes> } | null = null
  for (const examProviderId of candidates.length ? candidates : [null]) {
    const segments = expandPattern(input.pattern, input.unitMinutes, input.startMs, { providerId: input.providerId, examProviderId })
    const clashes = providerClashes(segments, input.providerBusy)
    if (!clashes.length) return { segments, clashes, examProviderId, endMs }
    fallback ??= { segments, clashes }
  }
  return { segments: fallback!.segments, clashes: fallback!.clashes, examProviderId: null, endMs }
}

export type SlotQuery = {
  windows: OpenWindow[]
  typeId: string
  durationMinutes: number
  unitMinutes: number
  bufferAfterMinutes: number
  chairBusy: Record<string, BusyInterval[]>
  patientBusy?: BusyInterval[]
  providerBusy: ProviderBusy[]
  pattern: PatternUnit[]
  nowMs: number
  leadMinutes: number
  onlineOnly?: boolean
  operatoryIds?: string[]
  providerId?: string | null
  limit?: number
}

export type Slot = { operatoryId: string; providerId: string | null; startMs: number; endMs: number; blockId: string }

/**
 * Open slots: each template window stepped by the schedule unit, keeping starts where the whole
 * appointment (and its buffer) fits in the window, the chair is free, the patient is free and the
 * provider's segments don't clash. The exam dentist for a hygiene pattern is any dentist on site.
 */
export function findSlots(q: SlotQuery): Slot[] {
  const out: Slot[] = []
  const step = q.unitMinutes * MS_PER_MINUTE
  const duration = q.durationMinutes * MS_PER_MINUTE
  const earliest = q.nowMs + q.leadMinutes * MS_PER_MINUTE
  for (const w of q.windows) {
    if (q.operatoryIds && !q.operatoryIds.includes(w.operatoryId)) continue
    if (w.allowedTypeIds.length && !w.allowedTypeIds.includes(q.typeId)) continue
    if (q.onlineOnly && !w.onlineBookable) continue
    const providerId = q.providerId ?? w.providerId
    if (q.providerId && w.providerId && w.providerId !== q.providerId) continue
    for (let start = w.startMs; start + duration <= w.endMs; start += step) {
      if (start < earliest) continue
      const end = start + duration
      if (chairClash(start, end, q.bufferAfterMinutes, q.chairBusy[w.operatoryId] ?? [])) continue
      if (q.patientBusy && q.patientBusy.some(b => overlaps(start, end, b.startMs, b.endMs))) continue
      const plan = planSegments({ pattern: q.pattern, unitMinutes: q.unitMinutes, startMs: start, providerId, windows: q.windows, providerBusy: q.providerBusy })
      if (plan.clashes.length) continue
      out.push({ operatoryId: w.operatoryId, providerId, startMs: start, endMs: end, blockId: w.blockId })
      if (q.limit && out.length >= q.limit) return out
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs || a.operatoryId.localeCompare(b.operatoryId))
}

/** Local dates from `from` for `days` days. */
export const dateRange = (from: string, days: number) => Array.from({ length: days }, (_, i) => addDays(from, i))

/** The local business date of an instant at a location. */
export const businessDate = (timeZone: string, at: number | Date) => localDate(timeZone, at)

/** Is a local wall-clock time inside quiet hours that may wrap midnight (20:00–08:00)? */
export function inQuietHours(localHhmm: string, start: string, end: string) {
  const t = minutesOf(localHhmm)
  const s = minutesOf(start)
  const e = minutesOf(end)
  return s <= e ? t >= s && t < e : t >= s || t < e
}
