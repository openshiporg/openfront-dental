import { createHash } from 'node:crypto'

/*
 * Import parsing (Phase 6). Pure: no database. Two sources: an Open Dental-shaped dump (JSON with the table and column names Open Dental uses:
 * patient, appointment, procedurelog) and a generic patient CSV. Both normalise to the same shape, so one apply routine handles them. Money is
 * exact minor units; no float ever touches a balance. Every problem is reported by row, and a bad row is skipped, never guessed at.
 */

export const MAX_PATIENTS = 5000
export const MAX_ROWS = 40_000

export type ImportPatient = { ext: string; firstName: string; lastName: string; middleName: string; preferredName: string; dateOfBirth: string; sex: 'female' | 'male' | 'unknown'; phone: string; email: string; address: Record<string, string>; balanceMinor: bigint }
export type ImportAppointment = { ext: string; patientExt: string; date: string; time: string; minutes: number; status: 'scheduled' | 'completed' | 'broken' | 'planned'; note: string }
export type ImportProcedure = { ext: string; patientExt: string; date: string; status: ImportProcStatus; feeMinor: bigint; tooth: string; surfaces: string; codeText: string }
export type Problem = { entity: string; row: number; ext: string; problem: string }
export type Normalised = { patients: ImportPatient[]; appointments: ImportAppointment[]; procedures: ImportProcedure[]; problems: Problem[]; source: 'open_dental' | 'generic_csv' }

const DATE = /^\d{4}-\d{2}-\d{2}$/
const validDate = (d: string) => DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d
const str = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max)

/** "123.45", "-20", "$1,200.5" to minor units; anything else is refused. */
export function moneyToMinor(value: unknown): bigint | null {
  const m = /^(-)?\$?(\d{1,9}(?:,\d{3})*|\d{1,9})(?:\.(\d{1,2}))?$/.exec(String(value ?? '').trim())
  if (!m) return null
  const minor = BigInt(m[2].replaceAll(',', '')) * 100n + BigInt((m[3] ?? '').padEnd(2, '0') || '0')
  return m[1] ? -minor : minor
}

const SEX: Record<string, 'male' | 'female' | 'unknown'> = { '0': 'male', '1': 'female', '2': 'unknown', male: 'male', female: 'female', m: 'male', f: 'female' }
/**
 * Open Dental procedurelog.ProcStatus: 1 TP (treatment planned), 2 C (complete), 3 EC (existing, this office), 4 EO (existing, elsewhere),
 * 5 R (referred out), 6 D (deleted), 7 Cn (a condition, not a procedure). Deleted rows are read and counted but never charted; a condition
 * becomes a finding on the chart, never a procedure.
 */
export type ImportProcStatus = 'planned' | 'existing_other' | 'existing_current' | 'referred_out' | 'deleted' | 'condition'
export const OD_PROC_STATUS: Record<string, ImportProcStatus> = { '1': 'planned', '2': 'existing_other', '3': 'existing_current', '4': 'existing_other', '5': 'referred_out', '6': 'deleted', '7': 'condition' }
const OD_APT_STATUS: Record<string, ImportAppointment['status']> = { '1': 'scheduled', '2': 'completed', '5': 'broken', '6': 'planned' }

const phoneOf = (r: Record<string, unknown>) => str(r.WirelessPhone) || str(r.HmPhone) || str(r.WkPhone)

export function parseOpenDental(input: unknown): Normalised {
  const problems: Problem[] = []
  const dump = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const table = (name: string) => (Array.isArray(dump[name]) ? (dump[name] as Record<string, unknown>[]) : [])
  const patients: ImportPatient[] = []
  const seen = new Set<string>()
  table('patient').forEach((r, i) => {
    const ext = str(r.PatNum, 40)
    const bad = (problem: string) => problems.push({ entity: 'patient', row: i + 1, ext, problem })
    if (!ext) return bad('No patient number.')
    if (seen.has(ext)) return bad('Patient number appears twice.')
    const lastName = str(r.LName, 100), firstName = str(r.FName, 100)
    if (!lastName || !firstName) return bad('Name is missing.')
    const dob = str(r.Birthdate, 10)
    if (!validDate(dob) || dob < '1880-01-01' || dob > '2100-01-01') return bad('Date of birth is not a real date.')
    const balance = r.EstBalance === undefined || r.EstBalance === '' || r.EstBalance === null ? 0n : moneyToMinor(r.EstBalance)
    if (balance === null) return bad('Balance is not an amount.')
    seen.add(ext)
    patients.push({
      ext, firstName, lastName, middleName: str(r.MiddleI, 100), preferredName: str(r.Preferred, 100), dateOfBirth: dob, sex: SEX[str(r.Gender).toLowerCase()] ?? 'unknown',
      phone: phoneOf(r), email: str(r.Email), address: { line1: str(r.Address), city: str(r.City, 80), state: str(r.State, 40), postalCode: str(r.Zip, 20) }, balanceMinor: balance,
    })
  })
  const appointments: ImportAppointment[] = []
  const aptSeen = new Set<string>()
  table('appointment').forEach((r, i) => {
    const ext = str(r.AptNum, 40), patientExt = str(r.PatNum, 40)
    const bad = (problem: string) => problems.push({ entity: 'appointment', row: i + 1, ext, problem })
    if (!ext) return bad('No appointment number.')
    if (aptSeen.has(ext)) return bad('Appointment number appears twice.')
    if (!seen.has(patientExt)) return bad('Belongs to a patient that is not in the file.')
    const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(str(r.AptDateTime, 30))
    if (!m || !validDate(m[1]) || Number(m[2]) > 23 || Number(m[3]) > 59) return bad('Date and time are not valid.')
    const status = OD_APT_STATUS[str(r.AptStatus)]
    if (!status) return bad('Status is not one this import understands.')
    const pattern = str(r.Pattern, 200)
    aptSeen.add(ext)
    appointments.push({ ext, patientExt, date: m[1], time: `${m[2]}:${m[3]}`, minutes: Math.min(480, Math.max(10, (pattern.length || 6) * 5)), status, note: str(r.ProcDescript, 300) || str(r.Note, 300) })
  })
  const procedures: ImportProcedure[] = []
  const procSeen = new Set<string>()
  table('procedurelog').forEach((r, i) => {
    const ext = str(r.ProcNum, 40), patientExt = str(r.PatNum, 40)
    const bad = (problem: string) => problems.push({ entity: 'procedure', row: i + 1, ext, problem })
    if (!ext) return bad('No procedure number.')
    if (procSeen.has(ext)) return bad('Procedure number appears twice.')
    if (!seen.has(patientExt)) return bad('Belongs to a patient that is not in the file.')
    const date = str(r.ProcDate, 10)
    if (!validDate(date)) return bad('Date is not valid.')
    const status = OD_PROC_STATUS[str(r.ProcStatus)]
    if (!status) return bad('Status is not one this import understands.')
    const fee = moneyToMinor(r.ProcFee ?? '0')
    if (fee === null || fee < 0n) return bad('Fee is not an amount.')
    procSeen.add(ext)
    procedures.push({ ext, patientExt, date, status, feeMinor: fee, tooth: str(r.ToothNum, 8), surfaces: str(r.Surf, 8).toUpperCase(), codeText: str(r.ProcCode, 20) })
  })
  return { patients, appointments, procedures, problems, source: 'open_dental' }
}

/** Minimal CSV reader: quoted fields, doubled quotes, CRLF. Returns rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++ } else quoted = false } else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x.trim())) rows.push(row); row = [] }
    else cell += c
  }
  row.push(cell)
  if (row.some(x => x.trim())) rows.push(row)
  return rows
}

/** Generic patient CSV: header names (case-insensitive) first_name, last_name, date_of_birth, sex, phone, email, balance, id. */
export function parseGenericCsv(text: string): Normalised {
  const [head = [], ...body] = parseCsv(text)
  const names = head.map(h => h.trim().toLowerCase().replaceAll(' ', '_'))
  const at = (row: string[], key: string) => row[names.indexOf(key)] ?? ''
  const table = body.map(row => ({ PatNum: at(row, 'id') || at(row, 'patient_id'), LName: at(row, 'last_name'), FName: at(row, 'first_name'), Birthdate: at(row, 'date_of_birth'), Gender: at(row, 'sex'), WirelessPhone: at(row, 'phone'), Email: at(row, 'email'), EstBalance: at(row, 'balance') }))
  const parsed = parseOpenDental({ patient: table })
  return { ...parsed, source: 'generic_csv' }
}

export function previewOf(n: Normalised, existing: { matched: number; byExt: number }) {
  const count = (e: string) => n.problems.filter(p => p.entity === e).length
  return {
    source: n.source,
    patients: { read: n.patients.length + count('patient'), importable: n.patients.length, problems: count('patient'), alreadyInChart: existing.matched, alreadyImported: existing.byExt },
    appointments: { read: n.appointments.length + count('appointment'), importable: n.appointments.length, problems: count('appointment') },
    procedures: { read: n.procedures.length + count('procedure'), importable: n.procedures.filter(p => p.status !== 'deleted').length, conditions: n.procedures.filter(p => p.status === 'condition').length, deleted: n.procedures.filter(p => p.status === 'deleted').length, problems: count('procedure') },
    balanceMinor: n.patients.reduce((s, p) => s + p.balanceMinor, 0n).toString(),
    problems: n.problems.slice(0, 50),
    problemCount: n.problems.length,
  }
}

export const fileHash = (text: string) => createHash('sha256').update(text).digest('hex')

/** The batch rows are stored as JSON, so bigint becomes text and back. */
export const freeze = (n: Normalised) => ({ ...n, patients: n.patients.map(p => ({ ...p, balanceMinor: p.balanceMinor.toString() })), procedures: n.procedures.map(p => ({ ...p, feeMinor: p.feeMinor.toString() })) })
export const thaw = (j: any): Normalised => ({ ...j, patients: (j.patients ?? []).map((p: any) => ({ ...p, balanceMinor: BigInt(p.balanceMinor) })), procedures: (j.procedures ?? []).map((p: any) => ({ ...p, feeMinor: BigInt(p.feeMinor) })) })

export type Reconciliation = {
  patients: { source: number; created: number; matchedExisting: number; skipped: number }
  appointments: { source: number; created: number; skipped: number; skippedReasons: Record<string, number> }
  /** source = chart + conditions + historyOnly + deleted + skipped. */
  procedures: { source: number; chart: number; conditions: number; historyOnly: number; deleted: number; skipped: number }
  balances: { sourceMinor: string; ledgerMinor: string; patientsChecked: number; mismatches: number; differenceMinor: string }
  balanced: boolean
}
