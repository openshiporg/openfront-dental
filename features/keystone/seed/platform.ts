import { NEVER_DEFAULT, permissionNames } from '../access'
import { auditCreate } from '../lib/cas'
import { PACKS } from '../lib/jurisdiction'
import type { Actor } from '../lib/actor'
import type { UnitOfWork } from '../lib/unitOfWork'
import { APPROVAL_POLICIES, LOCATIONS, PRACTICE, ROLES, STAFF } from './practice'

/**
 * Loads the practice spine idempotently: practice settings (marked synthetic), jurisdiction packs,
 * locations, the 15 seeded roles, staff with location assignments, provider profiles and approval
 * policies. Create-only by deterministic id or natural key, so running it again changes nothing and
 * never overwrites edits made since.
 * adapted from openfront-hedge-fund@48199d9 features/keystone/seed/platform.ts
 */

/**
 * Seeded people cannot sign in until an administrator sets a password or sends a reset link.
 * This is a bcrypt hash of 32 random bytes that were discarded when it was made, so no password matches it.
 */
const UNUSABLE_PASSWORD_HASH = '$2a$10$3dITCbIvf5zFA.1U8KZDhOHC3EEexi3KYy5ysZK1cRF6LHMm0H.ya'

const day = (date: string) => new Date(`${date}T00:00:00Z`)

export async function seedPracticePlatform(uow: UnitOfWork, actor: Actor) {
  if (process.env.NODE_ENV === 'production' && process.env.DENTAL_ALLOW_SAMPLE_PRACTICE !== 'true') {
    throw new Error('The sample practice cannot be loaded into a production deployment (I-G3). Set DENTAL_ALLOW_SAMPLE_PRACTICE=true only on a QA deployment.')
  }
  const { tx, now } = uow
  const created: Record<string, number> = { practice: 0, jurisdictionPacks: 0, locations: 0, roles: 0, staff: 0, assignments: 0, providers: 0, approvalPolicies: 0 }
  const meta = { metadata: { seed: true, synthetic: true } }

  if (!(await tx.practiceSettings.findUnique({ where: { id: 1 } }))) {
    await tx.practiceSettings.create({ data: { id: 1, ...PRACTICE, isSynthetic: true } })
    auditCreate(uow, actor, 'PracticeSettings', '1', 'practice.created', PRACTICE, meta)
    created.practice += 1
  }

  for (const pack of PACKS) {
    const label = `${pack.key}@${pack.version}`
    if (await tx.jurisdictionPack.findUnique({ where: { label } })) continue
    const row = await tx.jurisdictionPack.create({ data: { label, key: pack.key, version: pack.version, name: pack.name, rules: pack.rules, sources: pack.sources, status: 'active' } })
    auditCreate(uow, actor, 'JurisdictionPack', row.id, 'jurisdiction_pack.loaded', { label }, meta)
    created.jurisdictionPacks += 1
  }
  const florida = await tx.jurisdictionPack.findUniqueOrThrow({ where: { label: 'US-FL@2026.1' }, select: { id: true } })

  for (const location of LOCATIONS) {
    if (await tx.location.findUnique({ where: { id: location.id } })) continue
    await tx.location.create({ data: { id: location.id, code: location.code, name: location.name, timeZone: location.timeZone, address: location.address, phone: location.phone, email: location.email, hours: location.hours, jurisdictionId: florida.id, isSynthetic: true } })
    auditCreate(uow, actor, 'Location', location.id, 'location.created', { code: location.code, name: location.name }, meta)
    created.locations += 1
  }

  const haveRoles = new Set((await tx.role.findMany({ where: { id: { in: ROLES.map(r => r.id) } }, select: { id: true } })).map(r => r.id))
  const newRoles = ROLES.filter(role => !haveRoles.has(role.id))
  if (newRoles.length) {
    await tx.role.createMany({ data: newRoles.map(role => ({ id: role.id, name: role.name, description: role.description, ...Object.fromEntries(permissionNames.map(name => [name, role.permissions.includes(name) && !NEVER_DEFAULT.includes(name)])) })) })
    for (const role of newRoles) auditCreate(uow, actor, 'Role', role.id, 'role.created', { name: role.name, permissions: role.permissions }, meta)
    created.roles = newRoles.length
  }

  const haveUsers = await tx.user.findMany({ where: { OR: [{ id: { in: STAFF.map(p => p.id) } }, { email: { in: STAFF.map(p => p.email) } }] }, select: { id: true, email: true } })
  const newStaff = STAFF.filter(person => !haveUsers.some(u => u.id === person.id || u.email === person.email))
  if (newStaff.length) {
    await tx.user.createMany({
      data: newStaff.map(person => ({
        id: person.id,
        name: person.name,
        email: person.email,
        title: person.title,
        password: UNUSABLE_PASSWORD_HASH,
        kind: person.kind,
        roleId: person.roleId,
        accessExpiresAt: person.accessDays ? new Date(now.getTime() + person.accessDays * 86_400_000) : null,
        onboardingStatus: 'dismissed',
      })),
    })
    for (const person of newStaff) auditCreate(uow, actor, 'User', person.id, 'user.created', { name: person.name, title: person.title, role: person.roleId, kind: person.kind }, meta)
    created.staff = newStaff.length

    const assignments = newStaff.flatMap(person => person.locations.map(locationId => ({ id: `seed_asg_${person.id.slice(10)}_${locationId.slice(9)}`, userId: person.id, locationId, startsOn: day('2024-01-02') })))
    if (assignments.length) {
      await tx.staffAssignment.createMany({ data: assignments })
      created.assignments = assignments.length
    }

    const providers = newStaff.filter(person => person.provider)
    for (const person of providers) {
      const p = person.provider!
      await tx.providerProfile.create({ data: { id: p.id, userId: person.id, displayName: person.name, abbreviation: p.abbreviation, providerType: p.type, specialty: 'general', npiType1: p.npi ?? null, colour: p.colour, supervisionClass: p.supervisionClass, isSynthetic: true } })
      auditCreate(uow, actor, 'ProviderProfile', p.id, 'provider.created', { abbreviation: p.abbreviation, type: p.type }, meta)
    }
    created.providers = providers.length
  }

  const havePolicies = new Set((await tx.approvalPolicy.findMany({ select: { action: true } })).map(p => p.action))
  for (const policy of APPROVAL_POLICIES.filter(p => !havePolicies.has(p.action))) {
    const row = await tx.approvalPolicy.create({ data: { action: policy.action, description: policy.description, requiredPermission: policy.requiredPermission, minApprovals: 1, expiresAfterMinutes: policy.expiresAfterMinutes, thresholdMinor: policy.thresholdMinor ?? null } })
    auditCreate(uow, actor, 'ApprovalPolicy', row.id, 'approval_policy.created', { action: policy.action, requiredPermission: policy.requiredPermission }, meta)
    created.approvalPolicies += 1
  }

  return created
}
