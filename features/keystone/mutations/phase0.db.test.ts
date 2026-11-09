import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { NEVER_DEFAULT, permissionNames } from '../access'
import { verifyAuditChain } from '../lib/audit'
import { PACKS } from '../lib/jurisdiction'
import { loadPracticeSetup } from './setup'
import { cancelApprovalRequest, decideApprovalRequest, requestPracticeControls } from './approvals'
import { APPROVAL_POLICIES, LOCATIONS, ROLES, STAFF } from '../seed/practice'

/** A Keystone-like session for a user with the given permissions. */
const sessionFor = (id: string, granted: string[]) => ({
  itemId: id,
  data: { name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null, role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) } },
})

describe.skipIf(!hasTestDatabase)('Phase 0 commands (database)', () => {
  let prisma: PrismaClient
  let owner: { session: unknown; prisma: PrismaClient }
  let checker: { session: unknown; prisma: PrismaClient }
  let frontDesk: { session: unknown; prisma: PrismaClient }

  beforeAll(async () => {
    prisma = testPrisma(8)
    await resetDatabase(prisma)
    const make = (name: string) => prisma.user.create({ data: { name, email: `${uniqueKey(name)}@test.local`, password: 'x'.repeat(60) } })
    const [o, c, f] = await Promise.all([make('owner'), make('checker'), make('front')])
    owner = { session: sessionFor(o.id, permissionNames.filter(p => !NEVER_DEFAULT.includes(p))), prisma }
    checker = { session: sessionFor(c.id, ['canAccessDashboard', 'canApproveAutonomy', 'canReadAudit']), prisma }
    frontDesk = { session: sessionFor(f.id, ['canAccessDashboard', 'canManagePatients', 'canManageSchedule']), prisma }
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  it('loads the sample practice once: a second load with a new key creates nothing, and a replay returns the first result', async () => {
    const key = uniqueKey('setup')
    const first = await loadPracticeSetup(null, { idempotencyKey: key }, owner)
    expect(first.replay).toBe(false)
    const providers = STAFF.filter(person => person.provider).length
    const assignments = STAFF.reduce((sum, person) => sum + person.locations.length, 0)
    expect(first.created).toMatchObject({ practice: 1, jurisdictionPacks: PACKS.length, locations: LOCATIONS.length, roles: ROLES.length, staff: STAFF.length, assignments, providers, approvalPolicies: APPROVAL_POLICIES.length })

    const replay = await loadPracticeSetup(null, { idempotencyKey: key }, owner)
    expect(replay).toEqual({ ...first, replay: true })

    const again = await loadPracticeSetup(null, { idempotencyKey: uniqueKey('setup') }, owner)
    expect(Object.values(again.created).every(count => count === 0)).toBe(true)

    const practice = await prisma.practiceSettings.findUniqueOrThrow({ where: { id: 1 } })
    expect(practice.isSynthetic).toBe(true)
    expect(practice.displayName).toBe('Bayview Family Dental')
    // Break-glass is never on a seeded role.
    const roles = await prisma.role.findMany({ where: { id: { in: ROLES.map(r => r.id) } } })
    for (const role of roles) for (const name of NEVER_DEFAULT) expect((role as Record<string, unknown>)[name]).toBe(false)
    // Seeded people cannot sign in until an administrator sets a password.
    const users = await prisma.user.findMany({ where: { id: { in: STAFF.map(p => p.id) } } })
    expect(users.every(u => u.password.startsWith('$2'))).toBe(true)
    const tampa = await prisma.location.findUniqueOrThrow({ where: { id: 'seed_loc_tpa' }, include: { jurisdiction: true } })
    expect(tampa.jurisdiction?.label).toBe('US-FL@2026.1')
    expect(tampa.timeZone).toBe('America/New_York')
    expect((await verifyAuditChain(prisma)).ok).toBe(true)
  }, 180_000)

  it('refuses setup without canManageOnboarding', async () => {
    await expect(loadPracticeSetup(null, { idempotencyKey: uniqueKey('setup') }, frontDesk)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
  })

  it('practice controls change only after a second person approves, and the approved payload is what applies', async () => {
    const before = await prisma.practiceSettings.findUniqueOrThrow({ where: { id: 1 } })
    expect(before.breakGlassMinutes).toBe(60)

    await expect(requestPracticeControls(null, { changes: { breakGlassMinutes: 999 }, reason: 'too long', idempotencyKey: uniqueKey('pc') }, owner)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(requestPracticeControls(null, { changes: { breakGlassMinutes: 30 }, reason: '', idempotencyKey: uniqueKey('pc') }, owner)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(requestPracticeControls(null, { changes: { lateCancelHours: 1 } as never, reason: 'x', idempotencyKey: uniqueKey('pc') }, owner)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(requestPracticeControls(null, { changes: { breakGlassMinutes: 30 }, reason: 'tighten', idempotencyKey: uniqueKey('pc') }, frontDesk)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })

    const asked = await requestPracticeControls(null, { changes: { breakGlassMinutes: 30 }, reason: 'Privacy officer asked for a shorter window', idempotencyKey: uniqueKey('pc') }, owner)
    expect(asked.status).toBe('pending')
    expect((await prisma.practiceSettings.findUniqueOrThrow({ where: { id: 1 } })).breakGlassMinutes).toBe(60)

    // The requester holds canApproveAutonomy too, but cannot approve their own request.
    await expect(decideApprovalRequest(null, { requestId: asked.id, decision: 'approve', expectedVersion: 0, idempotencyKey: uniqueKey('d') }, owner)).rejects.toMatchObject({ code: 'SELF_APPROVAL' })
    await expect(decideApprovalRequest(null, { requestId: asked.id, decision: 'approve', expectedVersion: 0, idempotencyKey: uniqueKey('d') }, frontDesk)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    await expect(decideApprovalRequest(null, { requestId: asked.id, decision: 'approve', expectedVersion: 7, idempotencyKey: uniqueKey('d') }, checker)).rejects.toMatchObject({ code: 'STALE_STATE' })

    const key = uniqueKey('d')
    const approved = await decideApprovalRequest(null, { requestId: asked.id, decision: 'approve', expectedVersion: 0, idempotencyKey: key }, checker)
    expect(approved).toMatchObject({ status: 'approved', applied: { applied: ['breakGlassMinutes'] }, replay: false })
    const after = await prisma.practiceSettings.findUniqueOrThrow({ where: { id: 1 } })
    expect(after.breakGlassMinutes).toBe(30)
    expect(after.version).toBe(before.version + 1)

    const replay = await decideApprovalRequest(null, { requestId: asked.id, decision: 'approve', expectedVersion: 0, idempotencyKey: key }, checker)
    expect(replay.replay).toBe(true)
    expect((await prisma.practiceSettings.findUniqueOrThrow({ where: { id: 1 } })).version).toBe(after.version)

    const request = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: asked.id } })
    expect(request.consumedAt).not.toBeNull()
    const events = await prisma.auditEvent.findMany({ where: { entityId: { in: [asked.id, '1'] } }, orderBy: { seq: 'asc' } })
    expect(events.map(e => e.eventType)).toEqual(expect.arrayContaining(['approval.requested', 'approval.approved', 'approval.consumed', 'practice.controls_changed']))
    expect(events.find(e => e.eventType === 'approval.approved')?.approverId).toBeTruthy()
    expect((await verifyAuditChain(prisma)).ok).toBe(true)
  })

  it('a change approved against an old version is refused when applied after another change landed', async () => {
    const one = await requestPracticeControls(null, { changes: { breakGlassMinutes: 45 }, reason: 'first', idempotencyKey: uniqueKey('pc') }, owner)
    const two = await requestPracticeControls(null, { changes: { aiAutonomyAllowed: true, breakGlassMinutes: 20 }, reason: 'second', idempotencyKey: uniqueKey('pc') }, owner)
    await decideApprovalRequest(null, { requestId: one.id, decision: 'approve', expectedVersion: 0, idempotencyKey: uniqueKey('d') }, checker)
    await expect(decideApprovalRequest(null, { requestId: two.id, decision: 'approve', expectedVersion: 0, idempotencyKey: uniqueKey('d') }, checker)).rejects.toMatchObject({ code: 'STALE_STATE' })
    expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: two.id } })).status).toBe('pending')
    const practice = await prisma.practiceSettings.findUniqueOrThrow({ where: { id: 1 } })
    expect(practice.breakGlassMinutes).toBe(45)
    expect(practice.aiAutonomyAllowed).toBe(false)
  })

  it('rejecting needs a reason; only the requester can withdraw', async () => {
    const asked = await requestPracticeControls(null, { changes: { requireStaffMfa: true }, reason: 'confirm', idempotencyKey: uniqueKey('pc') }, owner)
    await expect(decideApprovalRequest(null, { requestId: asked.id, decision: 'reject', reason: ' ', expectedVersion: 0, idempotencyKey: uniqueKey('d') }, checker)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(cancelApprovalRequest(null, { requestId: asked.id, expectedVersion: 0, idempotencyKey: uniqueKey('c') }, checker)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    const withdrawn = await cancelApprovalRequest(null, { requestId: asked.id, expectedVersion: 0, idempotencyKey: uniqueKey('c') }, owner)
    expect(withdrawn.status).toBe('cancelled')
  })

  it('the database refuses a double-booking: btree_gist exclusion on (operatory, time range) is available and enforced', async () => {
    // Phase 0 ships the extension and the constraint pattern; Phase 1 puts it on Appointment and BookingHold.
    const ext = await prisma.$queryRaw<{ extname: string }[]>`SELECT extname FROM pg_extension WHERE extname IN ('btree_gist', 'pg_trgm') ORDER BY extname`
    expect(ext.map(e => e.extname)).toEqual(['btree_gist', 'pg_trgm'])
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(`CREATE TEMP TABLE slot_probe (operatory text NOT NULL, during tstzrange NOT NULL, EXCLUDE USING gist (operatory WITH =, during WITH &&)) ON COMMIT DROP`)
      await tx.$executeRawUnsafe(`INSERT INTO slot_probe VALUES ('op1', tstzrange('2026-11-10 14:00Z', '2026-11-10 15:00Z', '[)'))`)
      // Back-to-back is fine (half-open ranges); another chair at the same time is fine.
      await tx.$executeRawUnsafe(`INSERT INTO slot_probe VALUES ('op1', tstzrange('2026-11-10 15:00Z', '2026-11-10 16:00Z', '[)'))`)
      await tx.$executeRawUnsafe(`INSERT INTO slot_probe VALUES ('op2', tstzrange('2026-11-10 14:30Z', '2026-11-10 15:30Z', '[)'))`)
      await tx.$executeRawUnsafe(`SAVEPOINT overlap`)
      await expect(tx.$executeRawUnsafe(`INSERT INTO slot_probe VALUES ('op1', tstzrange('2026-11-10 14:30Z', '2026-11-10 15:30Z', '[)'))`)).rejects.toThrow(/conflicting key value violates exclusion constraint/)
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT overlap`)
    })
  })

  it('append-only history: audit events cannot be edited or deleted at the database', async () => {
    const event = await prisma.auditEvent.findFirstOrThrow()
    await expect(prisma.auditEvent.update({ where: { id: event.id }, data: { reason: 'edited' } })).rejects.toThrow(/append-only/)
    await expect(prisma.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow(/append-only/)
  })

  it('a PHI adapter cannot go live without a BAA', async () => {
    await expect(prisma.adapterInstallation.create({ data: { area: 'clearinghouse', adapterKey: 'stedi', mode: 'live', handlesPhi: true } })).rejects.toThrow(/AdapterInstallation_live_phi_baa/)
  })
})
