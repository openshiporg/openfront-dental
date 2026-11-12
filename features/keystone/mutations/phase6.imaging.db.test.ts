import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { NEVER_DEFAULT, permissionNames, type Permission } from '../access'
import { loadPracticeSetup } from './setup'
import { TRANSACTION_OPTIONS } from '../lib/db'
import { decideExternalFinding, receiveExternalFinding, recordManualStudy } from './phase6'

const sessionFor = (id: string, granted: Permission[]) => ({
  itemId: id, listKey: 'User',
  data: { name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null, role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) } },
})

describe.skipIf(!hasTestDatabase)('Phase 6: manual imaging and external findings (database)', () => {
  let prisma: PrismaClient
  let ctx: any, patientId = ''
  const key = () => uniqueKey('img')

  beforeAll(async () => {
    process.env.SESSION_SECRET ||= 'dental-vitest-session-secret-0123456789abcdef'
    process.env.DENTAL_SECRET_KEY ||= Buffer.alloc(32, 7).toString('base64')
    process.env.DENTAL_INLINE_EFFECTS = 'off'
    Object.assign(TRANSACTION_OPTIONS as object, { timeout: 180_000, maxWait: 60_000 })
    prisma = testPrisma(2)
    await resetDatabase(prisma)
    const u = await prisma.user.create({ data: { name: 'owner', email: `${uniqueKey('o')}@test.local`, password: 'x'.repeat(60) } })
    ctx = { session: sessionFor(u.id, permissionNames.filter(p => !NEVER_DEFAULT.includes(p))), prisma }
    await loadPracticeSetup(null, { idempotencyKey: uniqueKey('setup') }, ctx)
    patientId = (await prisma.patient.findFirstOrThrow()).id
  }, 540_000)
  afterAll(async () => { await prisma?.$disconnect() })

  let studyId = '', findingId = ''

  it('records a study by hand, once per key, and refuses a future date and a bad kind', async () => {
    const k = key()
    const a = await recordManualStudy(null, { patientId, modality: 'bitewing', teeth: ['3', '4'], idempotencyKey: k }, ctx)
    const b = await recordManualStudy(null, { patientId, modality: 'bitewing', teeth: ['3', '4'], idempotencyKey: k }, ctx)
    expect(b.replay).toBe(true); expect(b.id).toBe(a.id); studyId = a.id
    expect(await prisma.imagingStudy.count({ where: { patientId } })).toBe(1)
    const row = await prisma.imagingStudy.findUniqueOrThrow({ where: { id: a.id } })
    expect(row.source).toBe('upload'); expect(row.status).toBe('acquired')
    await expect(recordManualStudy(null, { patientId, modality: 'bitewing', acquiredAt: '2999-01-01', idempotencyKey: key() }, ctx)).rejects.toThrow(/future/)
    await expect(recordManualStudy(null, { patientId, modality: 'hologram', idempotencyKey: key() }, ctx)).rejects.toThrow(/kind of image/)
  }, 120_000)

  it('stores an outside finding as a record only, and refuses one with no device', async () => {
    await expect(receiveExternalFinding(null, { studyId, device: '', modelVersion: '1', findingType: 'x', idempotencyKey: key() }, ctx)).rejects.toThrow()
    const charts = await prisma.chartEntry.count()
    const f = await receiveExternalFinding(null, { studyId, vendor: 'Example Reader Co', device: 'Reader A', modelVersion: '1.2', findingType: 'possible decay', tooth: '3', confidence: '0.85', idempotencyKey: key() }, ctx)
    findingId = f.id
    const row = await prisma.externalFinding.findUniqueOrThrow({ where: { id: f.id } })
    expect(row.status).toBe('received'); expect(row.patientId).toBe(patientId)
    expect(await prisma.chartEntry.count()).toBe(charts)
  }, 120_000)

  it('dismissing needs a reason; accepting changes nothing in the chart; a decided finding cannot be decided again', async () => {
    let row = await prisma.externalFinding.findUniqueOrThrow({ where: { id: findingId } })
    await expect(decideExternalFinding(null, { findingId, expectedVersion: row.version, decision: 'dismissed', idempotencyKey: key() }, ctx)).rejects.toThrow(/reason/)
    const charts = await prisma.chartEntry.count()
    const r = await decideExternalFinding(null, { findingId, expectedVersion: row.version, decision: 'accepted', idempotencyKey: key() }, ctx)
    expect(r.status).toBe('accepted')
    expect(await prisma.chartEntry.count()).toBe(charts)
    row = await prisma.externalFinding.findUniqueOrThrow({ where: { id: findingId } })
    expect(row.decidedById).toBeTruthy()
    await expect(decideExternalFinding(null, { findingId, expectedVersion: row.version, decision: 'dismissed', reason: 'late', idempotencyKey: key() }, ctx)).rejects.toThrow()
  }, 120_000)
})
