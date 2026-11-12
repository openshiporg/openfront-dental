import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { NEVER_DEFAULT, permissionNames, type Permission } from '../access'
import { loadPracticeSetup } from './setup'
import { TRANSACTION_OPTIONS } from '../lib/db'
import { decideApprovalRequest } from './approvals'
import { applyImportChunk, exportEhiBundle, exportJournalCsv, previewImport, requestImportApply } from './phase6Data'
import { placeRecordHold, scanRetention, requestDisposition, releaseRecordHold } from './phase6'
import { validateBundle, unzip } from '../lib/bundle'

/* Phase 6 exit gate: an Open Dental-shaped dump round-trips with a reconciliation, the export bundle validates, and a hold blocks a disposition. */

const sessionFor = (id: string, granted: Permission[]) => ({
  itemId: id, listKey: 'User',
  data: { name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null, role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) } },
})

const DUMP = {
  patient: [
    { PatNum: '1001', LName: 'Calloway', FName: 'Imani', Birthdate: '1984-03-09', Gender: '1', WirelessPhone: '(813) 555-0142', Email: 'imani.calloway@example.test', Address: '14 Harbor Way', City: 'Tampa', State: 'FL', Zip: '33602', EstBalance: '125.50' },
    { PatNum: '1002', LName: 'Duarte', FName: 'Felix', Birthdate: '1971-11-30', Gender: '0', HmPhone: '(727) 555-0188', EstBalance: '0.00' },
    { PatNum: '1003', LName: 'Okonkwo', FName: 'Ada', Birthdate: '2012-06-21', Gender: '1', EstBalance: '-40.25' },
    { PatNum: '1004', LName: 'Broken', FName: 'Row', Birthdate: '1990-02-31' },
  ],
  appointment: [
    { AptNum: '5001', PatNum: '1001', AptDateTime: '2024-02-12 09:00:00', AptStatus: '2', Pattern: 'XXXXXXXX', ProcDescript: 'Cleaning' },
    { AptNum: '5002', PatNum: '1002', AptDateTime: '2024-03-04 14:30:00', AptStatus: '5', Pattern: 'XXXXXX' },
    { AptNum: '5003', PatNum: '9999', AptDateTime: '2024-03-04 14:30:00', AptStatus: '1' },
  ],
  procedurelog: [
    { ProcNum: '9001', PatNum: '1001', ProcDate: '2024-02-12', ProcStatus: '2', ProcFee: '120.00', ProcCode: 'LEGACY-1' },
    { ProcNum: '9002', PatNum: '1003', ProcDate: '2023-05-05', ProcStatus: '2', ProcFee: '85.00', ProcCode: 'LEGACY-2', ToothNum: '8' },
    // every other Open Dental ProcStatus: 1 TP, 3 EC, 4 EO, 5 R, 6 D (deleted), 7 Cn (condition)
    { ProcNum: '9011', PatNum: '1001', ProcDate: '2024-02-12', ProcStatus: '1', ProcFee: '95.00', ProcCode: 'OF-P001' },
    { ProcNum: '9013', PatNum: '1001', ProcDate: '2023-01-10', ProcStatus: '3', ProcFee: '0', ProcCode: 'OF-P001' },
    { ProcNum: '9014', PatNum: '1002', ProcDate: '2019-06-01', ProcStatus: '4', ProcFee: '0', ProcCode: 'OF-P001' },
    { ProcNum: '9015', PatNum: '1002', ProcDate: '2024-03-01', ProcStatus: '5', ProcFee: '0', ProcCode: 'OF-P001' },
    { ProcNum: '9016', PatNum: '1001', ProcDate: '2024-02-12', ProcStatus: '6', ProcFee: '45.00', ProcCode: 'OF-P001' },
    { ProcNum: '9017', PatNum: '1003', ProcDate: '2024-01-05', ProcStatus: '7', ProcFee: '0', ProcCode: 'caries', ToothNum: '30', Surf: 'mo' },
    { ProcNum: '9018', PatNum: '1003', ProcDate: '2024-01-05', ProcStatus: '7', ProcFee: '0', ProcCode: 'D9999' },
  ],
}

describe.skipIf(!hasTestDatabase)('Phase 6: import, export, holds (database)', () => {
  let prisma: PrismaClient
  let owner: any, approver: any, locationId: string
  const key = () => uniqueKey('p6')

  beforeAll(async () => {
    process.env.SESSION_SECRET ||= 'dental-vitest-session-secret-0123456789abcdef'
    process.env.DENTAL_SECRET_KEY ||= Buffer.alloc(32, 7).toString('base64')
    process.env.DENTAL_INLINE_EFFECTS = 'off'
    Object.assign(TRANSACTION_OPTIONS as object, { timeout: 180_000, maxWait: 60_000 })
    prisma = testPrisma(2)
    await resetDatabase(prisma)
    const make = (name: string) => prisma.user.create({ data: { name, email: `${uniqueKey(name)}@test.local`, password: 'x'.repeat(60) } })
    const [o, a] = await Promise.all([make('owner'), make('approver')])
    const all = permissionNames.filter(p => !NEVER_DEFAULT.includes(p))
    owner = { session: sessionFor(o.id, all), prisma }
    approver = { session: sessionFor(a.id, all), prisma }
    await loadPracticeSetup(null, { idempotencyKey: uniqueKey('setup') }, owner)
    locationId = (await prisma.location.findFirstOrThrow({ where: { isActive: true } })).id
  }, 540_000)
  afterAll(async () => { await prisma?.$disconnect() })

  let batchId = ''

  it('previews an Open Dental dump without creating anything, and reports the unreadable row', async () => {
    const before = await prisma.patient.count()
    const r: any = await previewImport(null, { source: 'open_dental', fileName: 'dump.json', content: JSON.stringify(DUMP), locationId, idempotencyKey: key() }, owner)
    batchId = r.id
    expect(r.preview.patients.importable).toBe(3)
    expect(r.preview.patients.problems).toBe(1)
    expect(r.preview.balanceMinor).toBe('8525')
    expect(await prisma.patient.count()).toBe(before)
    // The same file is not read twice.
    await expect(previewImport(null, { source: 'open_dental', fileName: 'dump.json', content: JSON.stringify(DUMP), locationId, idempotencyKey: key() }, owner)).rejects.toThrow(/already read/)
  })

  it('will not apply before a second person approves', async () => {
    await expect(applyImportChunk(null, { batchId, idempotencyKey: key() }, owner)).rejects.toThrow(/approve/i)
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId } })
    await requestImportApply(null, { batchId, expectedVersion: batch.version, idempotencyKey: key() }, owner)
    await expect(applyImportChunk(null, { batchId, idempotencyKey: key() }, owner)).rejects.toThrow()
  })

  it('applies after approval; patients, appointments, chart and balances round-trip with a reconciliation', async () => {
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId } })
    const request = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: batch.approvalId! } })
    await decideApprovalRequest(null, { requestId: request.id, decision: 'approve', expectedVersion: request.version, idempotencyKey: key() }, approver)
    const done: any = await applyImportChunk(null, { batchId, idempotencyKey: key() }, owner)
    expect(done.done).toBe(true)
    const rec = done.reconciliation
    expect(rec.patients).toMatchObject({ source: 4, created: 3, skipped: 1 })
    expect(rec.appointments.created).toBe(2)
    expect(rec.appointments.skipped).toBe(1)
    // every status is accounted for, and the counts tie back to the file
    expect(rec.procedures).toMatchObject({ source: 9, chart: 4, conditions: 2, historyOnly: 2, deleted: 1, skipped: 0 })
    const p = rec.procedures
    expect(p.chart + p.conditions + p.historyOnly + p.deleted + p.skipped).toBe(p.source)
    expect(rec.balances).toMatchObject({ sourceMinor: '8525', ledgerMinor: '8525', mismatches: 0, differenceMinor: '0' })
    expect(rec.balanced).toBe(true)

    const imani = await prisma.patient.findFirstOrThrow({ where: { lastName: 'Calloway', firstName: 'Imani' } })
    expect(imani.dateOfBirth.toISOString().slice(0, 10)).toBe('1984-03-09')
    expect(await prisma.appointment.count({ where: { patientId: imani.id, source: 'import' } })).toBe(1)
    const ledger = await prisma.ledgerEntry.findMany({ where: { patientId: imani.id } })
    expect(ledger.reduce((s, e) => s + e.amountMinor, 0n)).toBe(12550n)
    const ada = await prisma.patient.findFirstOrThrow({ where: { lastName: 'Okonkwo' } })
    expect((await prisma.ledgerEntry.findMany({ where: { patientId: ada.id } })).reduce((s, e) => s + e.amountMinor, 0n)).toBe(-4025n)

    // The chart round-trips: TP planned, EC existing here, EO existing elsewhere, R referred out, D left out, Cn a finding.
    const felix = await prisma.patient.findFirstOrThrow({ where: { lastName: 'Duarte' } })
    const chartOf = async (patientId: string) => (await prisma.chartEntry.findMany({ where: { patientId, source: 'import' }, include: { code: true, condition: true }, orderBy: { createdAt: 'asc' } }))
    const imaniChart = await chartOf(imani.id)
    expect(imaniChart.map(e => [e.kind, e.code?.code, e.status]).sort()).toEqual([['procedure', 'OF-P001', 'existing_current'], ['procedure', 'OF-P001', 'planned']])
    expect((await chartOf(felix.id)).map(e => [e.kind, e.status]).sort()).toEqual([['procedure', 'existing_other'], ['procedure', 'referred_out']])
    const adaChart = await chartOf(ada.id)
    expect(adaChart.every(e => e.kind === 'condition' && e.codeId === null)).toBe(true)
    expect(adaChart.map(e => [e.condition?.code, e.tooth, e.surfaces, e.conditionStatus]).sort()).toEqual([['caries', '30', 'MO', 'active'], ['imported', '', '', 'active']])
    const maps = await prisma.importRecordMap.findMany({ where: { batchId, entity: 'procedure' } })
    expect(maps.map(m => m.externalId).sort()).toEqual(['9001', '9002', '9011', '9013', '9014', '9015', '9017', '9018'])
  })

  it('applying the same batch again changes nothing', async () => {
    const patients = await prisma.patient.count()
    const ledger = await prisma.ledgerEntry.count()
    const again: any = await applyImportChunk(null, { batchId, idempotencyKey: key() }, owner)
    expect(again.status).toBe('applied')
    expect(await prisma.patient.count()).toBe(patients)
    expect(await prisma.ledgerEntry.count()).toBe(ledger)
    expect(await prisma.importRecordMap.count({ where: { batchId, entity: 'patient' } })).toBe(3)
  })

  it('exports an EHI bundle that validates, and notices damage', async () => {
    const imani = await prisma.patient.findFirstOrThrow({ where: { lastName: 'Calloway' } })
    const out: any = await exportEhiBundle(null, { patientId: imani.id, idempotencyKey: key() }, owner)
    const bytes = Buffer.from(out.base64, 'base64')
    const check = validateBundle(bytes)
    expect(check.problems).toEqual([])
    expect(check.ok).toBe(true)
    expect(check.manifest?.files.map(f => f.name)).toEqual(expect.arrayContaining(['patient.json', 'chart.json', 'ledger.json']))
    expect(unzip(bytes).every(f => f.crcOk)).toBe(true)
    expect(await prisma.exportJob.count({ where: { kind: 'ehi_bundle', patientId: imani.id } })).toBe(1)
    const damaged = Buffer.from(bytes)
    damaged[Math.floor(damaged.length / 2)] ^= 0xff
    expect(validateBundle(damaged).ok).toBe(false)
  })

  it('exports a csv journal with exact amounts', async () => {
    const day = new Date().toISOString().slice(0, 10)
    const out: any = await exportJournalCsv(null, { locationId, from: new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10), to: day, idempotencyKey: key() }, owner)
    expect(out.text.split('\r\n')[0]).toBe('Date,Chart,Kind,Amount,Currency,Memo')
    expect(out.text).toContain('125.50')
    expect(out.text).toContain('-40.25')
  })

  it('a legal hold blocks a disposition, and releasing it lets the request go through', async () => {
    const felix = await prisma.patient.findFirstOrThrow({ where: { lastName: 'Duarte' } })
    const hold: any = await placeRecordHold(null, { patientId: felix.id, reason: 'Open complaint with the dental board', idempotencyKey: key() }, owner)
    // A second live hold for the same patient is refused by the database.
    await expect(prisma.recordHold.create({ data: { patientId: felix.id, reason: 'again', status: 'active' } })).rejects.toThrow()
    const disp = await prisma.retentionDisposition.create({ data: { patientId: felix.id, eligibleOn: new Date('2020-01-01'), status: 'eligible' } })
    const blocked: any = await requestDisposition(null, { dispositionId: disp.id, expectedVersion: disp.version, idempotencyKey: key() }, owner)
    expect(blocked.blocked).toBe(true)
    const row = await prisma.retentionDisposition.findUniqueOrThrow({ where: { id: disp.id } })
    expect(row.status).toBe('blocked')
    // The database trigger holds even if a command is bypassed.
    await expect(prisma.retentionDisposition.update({ where: { id: disp.id }, data: { status: 'approved' } })).rejects.toThrow()
    await expect(prisma.retentionDisposition.update({ where: { id: disp.id }, data: { status: 'executed' } })).rejects.toThrow()
    const held = await prisma.recordHold.findUniqueOrThrow({ where: { id: hold.id } })
    await releaseRecordHold(null, { holdId: held.id, expectedVersion: held.version, reason: 'Board closed the complaint', idempotencyKey: key() }, owner)
    const fresh = await prisma.retentionDisposition.findUniqueOrThrow({ where: { id: disp.id } })
    const ok: any = await requestDisposition(null, { dispositionId: disp.id, expectedVersion: fresh.version, idempotencyKey: key() }, owner)
    expect(ok.blocked).toBeFalsy()
    expect((await prisma.retentionDisposition.findUniqueOrThrow({ where: { id: disp.id } })).status).toBe('approval_requested')
    void scanRetention
  })
})
