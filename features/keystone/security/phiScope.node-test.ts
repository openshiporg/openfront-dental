import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { graphql } from 'graphql'
import { getContext } from '@keystone-6/core/context'
import * as PrismaModule from '@prisma/client'
import { NEVER_DEFAULT, permissionNames, sys, type Permission } from '../access'

/*
 * Phase 4 review r2, N3/N4: every list that holds a patient's data (directly, or through an appointment, contact point, claim,
 * approval or family) is filtered by office and patient for a reader limited to some offices, both ways: Tampa-only staff see no
 * St. Petersburg patient's rows, St. Petersburg-only staff see no Tampa patient's rows. The sweep reads every list the schema
 * exposes, as each role, with lists, counts, single items, relation filters (the oracle), OR and aliases; MCP queryData and
 * modelSpecificSearch run these same GraphQL queries under the caller's session. A new patient-data list with no filter fails here.
 */

const TPA = 'seed_loc_tpa'
const STP = 'seed_loc_stp'
const BASE: Permission[] = ['canAccessDashboard', 'canSeeOtherPeople', 'canReadSchedule', 'canReadDemographics']
const FRONT: Permission[] = [...BASE, 'canManagePatients', 'canManageSchedule', 'canMessagePatients', 'canTakePayments', 'canVerifyBenefits', 'canReadInsurance', 'canReadLedger']
const CLINICAL: Permission[] = [...BASE, 'canReadClinical', 'canChart', 'canManagePerio', 'canReadInsurance', 'canCompleteProcedures', 'canSignClinicalNotes', 'canManageSchedule']
const BILLING: Permission[] = [...BASE, 'canReadInsurance', 'canManageInsurance', 'canVerifyBenefits', 'canManageClaims', 'canSubmitClaims', 'canPostRemittances', 'canReadLedger', 'canTakePayments', 'canAdjust', 'canDecideClaimProposals', 'canDecideFinancialProposals']
const MANAGER: Permission[] = [...FRONT, 'canManagePeople', 'canAdjust', 'canReadSignals', 'canDecideProposals', 'canApproveAdjustments', 'canReadAudit']
const EVERYTHING = permissionNames.filter(p => !NEVER_DEFAULT.includes(p) && p !== 'canAccessAllLocations')

const sessionOf = (id: string, granted: Permission[], locations: string[] | 'all') => ({
  itemId: id, listKey: 'User',
  data: {
    name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null,
    role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])), canAccessAllLocations: locations === 'all' },
    assignments: locations === 'all' ? [] : locations.map(id => ({ location: { id }, role: null, startsOn: null, endsOn: null })),
  },
})

/** Lists that hold no patient's data: reference data, configuration and staff records. Anything not here must be filtered. */
const NOT_PATIENT_DATA = new Set([
  'User', 'Role', 'OAuthApp', 'OAuthToken', 'AdapterInstallation', 'ApprovalPolicy', 'BillingEntity', 'BusinessAssociate', 'CommandReceipt', 'Credential',
  'InferenceProvider', 'Job', 'JurisdictionPack', 'Lease', 'Location', 'MachineCredential', 'PracticeSettings', 'ProviderProfile', 'RateLimitBucket',
  'SecretBox', 'Sequence', 'StaffAssignment', 'AgentIdentity', 'AgentToolGrant', 'ReferralSource', 'AppointmentType', 'MessageTemplate', 'StorefrontSite',
  'CodeImportBatch', 'CodeSystem', 'ExplosionCode', 'Fee', 'FeeSchedule', 'FeeScheduleVersion', 'ProcedureCode', 'ProcedureCodeCrosswalk', 'ConditionType',
  'MedicalHistoryForm', 'NoteTemplate', 'NoteTemplateVersion', 'FormTemplate', 'FormTemplateVersion', 'BenefitRule', 'Employer', 'InsurancePlan', 'Payer',
  'AdjustmentType', 'DenialReasonMap', 'PayerEnrollment', 'ScrubRule', 'MembershipPlan', 'RegulatoryLicence',
  // Phase 5 catalogues and settings, Phase 6 reference data (P6 r1 B4): no patient, no office of their own.
  'SignalType', 'ProposalKind', 'AutonomyPolicy', 'RecallType', 'RecallRule', 'Lab', 'RetentionPolicy',
])

const TEST_DATABASE_URL = process.env.DENTAL_TEST_DATABASE_URL ?? ''
const hasTestDatabase = /^postgres(ql)?:\/\//.test(TEST_DATABASE_URL) && /[?&]schema=vitest\b/.test(TEST_DATABASE_URL)
if (hasTestDatabase) {
  const url = new URL(TEST_DATABASE_URL); url.searchParams.set('connection_limit', '3')
  process.env.DATABASE_URL = url.toString()
}

describe('every list is classified: patient data is filtered by office and patient (N3 sweep)', () => {
  it('no list outside the reference-data allow-list is readable without a query filter', async () => {
    process.env.SESSION_SECRET ||= 'dental-node-test-session-secret-0123456789abcdef'
    const config = (await import('../index')).default as any
    const unfiltered: string[] = []
    for (const [key, list] of Object.entries<any>(config.lists)) {
      if (NOT_PATIENT_DATA.has(key)) continue
      const access = list.access
      const query = access?.operation?.query ?? access?.operation
      const closed = query === false || query === sys
      if (closed || access?.filter?.query) continue
      unfiltered.push(key)
    }
    assert.deepEqual(unfiltered, [], `patient-data lists with no office/patient filter: ${unfiltered.join(', ')}`)
  })
})

describe('patient-data lists, both ways, as Tampa-only and St. Petersburg-only staff (N3, N4)', { skip: !hasTestDatabase }, () => {
  let context: any
  let prisma: any
  let config: any
  const ids: Record<string, string> = {}
  const people: Record<'tpa' | 'stp', string[]> = { tpa: [], stp: [] }

  before(async () => {
    process.env.SESSION_SECRET ||= 'dental-node-test-session-secret-0123456789abcdef'
    process.env.DENTAL_SECRET_KEY ||= Buffer.alloc(32, 7).toString('base64')
    config = (await import('../index')).default
    // Practice setup is one long transaction; the shared scratch database is remote (as in the exit-gate test).
    Object.assign((await import('../lib/db')).TRANSACTION_OPTIONS as object, { timeout: 180_000, maxWait: 60_000 })
    context = getContext(config, PrismaModule)
    prisma = context.prisma
    const { resetDatabase } = await import('../../../tests/helpers/db')
    await resetDatabase(prisma)
    const { loadPracticeSetup } = await import('../mutations/setup')
    const admin = await prisma.user.create({ data: { name: 'owner', email: `owner-${Date.now()}@test.local`, password: 'x'.repeat(60) } })
    await loadPracticeSetup(null, { idempotencyKey: `setup-${Date.now()}` }, { session: sessionOf(admin.id, permissionNames.filter(p => !NEVER_DEFAULT.includes(p)), 'all'), prisma })
    const stamp = Date.now()
    const make = async (name: string, home: string) => {
      const p = await prisma.patient.create({ data: { chartNumber: `PHI-${name}-${stamp}`, firstName: name, lastName: 'Scope', dateOfBirth: new Date('1980-01-01T00:00:00Z'), sexAssignedAtBirth: 'unknown', homeLocationId: home, status: 'active' } })
      const g = await prisma.guarantor.create({ data: { patientId: p.id } })
      await prisma.guarantorLink.create({ data: { patientId: p.id, guarantorId: g.id, relationship: 'self', status: 'active' } })
      const a = await prisma.guarantorAccount.create({ data: { ref: `ACC-${name}-${stamp}`, guarantorId: g.id, balanceCache: { totalMinor: '0' } } })
      const cp = await prisma.contactPoint.create({ data: { patientId: p.id, kind: 'email', value: `${name.toLowerCase()}@example.test`, valueNormalized: `${name.toLowerCase()}@example.test` } })
      const gcp = await prisma.contactPoint.create({ data: { guarantorId: g.id, kind: 'mobile', value: '+17275550100', valueNormalized: '+17275550100' } })
      await prisma.consentGrant.create({ data: { contactPointId: cp.id, channel: 'email', purpose: 'appointment_reminders', source: 'staff', status: 'granted' } })
      const fam = await prisma.familyGroup.create({ data: { name: `${name} family`, members: { connect: [{ id: p.id }] } } })
      // a seeded booking at this office, re-pointed at this test patient (the seed's bookings satisfy every booking rule)
      const appt = await prisma.appointment.findFirst({ where: { locationId: home, operatoryId: { not: null } }, orderBy: { startsAt: 'asc' } })
      if (appt) await prisma.appointment.update({ where: { id: appt.id }, data: { patientId: p.id } })
      const bae = await prisma.brokenAppointmentEvent.create({ data: { appointmentId: appt?.id ?? null, patientId: p.id, kind: 'no_show', at: new Date(), reason: `${name} private reason` } })
      const conv = await prisma.conversation.create({ data: { patientId: p.id, contactPointId: cp.id, channel: 'email' } }).catch(() => null)
      const appr = await prisma.approvalRequest.create({ data: { action: 'adjustment.post', targetList: 'AdjustmentRequest', targetId: `adj-${name}`, payload: { amountMinor: '7500' }, payloadHash: `h-${name}-${stamp}`, requiredPermission: 'canApproveAdjustments', summary: `${name} $75 courtesy discount`, status: 'pending', locationId: home, patientId: p.id, accountId: a.id } })
      const scope = await prisma.portalAccount.create({ data: { email: `${name.toLowerCase()}-portal-${stamp}@example.test`, status: 'active', scopes: { create: [{ patientId: p.id, relationship: 'self', status: 'active' }] } } })
      Object.assign(ids, { [`${name}Account`]: a.id, [`${name}Patient`]: p.id, [`${name}Contact`]: cp.id, [`${name}GuarantorContact`]: gcp.id, [`${name}Family`]: fam.id, [`${name}Broken`]: bae.id, [`${name}Approval`]: appr.id, [`${name}Portal`]: scope.id, ...(conv ? { [`${name}Conversation`]: conv.id } : {}) })
      return p.id
    }
    people.tpa.push(await make('Tampa', TPA))
    people.stp.push(await make('Pete', STP))
    // a practice-wide approval (fee schedule): only a reader with every office sees it
    ids.practiceApproval = (await prisma.approvalRequest.create({ data: { action: 'fee_schedule.publish', targetList: 'FeeScheduleVersion', targetId: 'fsv', payload: {}, payloadHash: `h-practice-${stamp}`, requiredPermission: 'canApproveFeePublish', summary: 'Publish fees', status: 'pending' } })).id
    // a mixed family (one Tampa, one St. Pete member) is visible to neither single-office reader
    ids.mixedFamily = (await prisma.familyGroup.create({ data: { name: 'Mixed family', members: { connect: [{ id: people.tpa[0] }] } } })).id
    const extra = await prisma.patient.create({ data: { chartNumber: `PHI-Mixed-${stamp}`, firstName: 'Mixed', lastName: 'Scope', dateOfBirth: new Date('1990-01-01T00:00:00Z'), sexAssignedAtBirth: 'unknown', homeLocationId: STP, status: 'active', familyId: ids.mixedFamily } })
    ids.mixedPatient = extra.id
  })
  after(async () => { await context?.prisma?.$disconnect() })

  const run = async (session: unknown, source: string, variables?: Record<string, unknown>) => {
    const ctx = context.withSession(session)
    const r = await graphql({ schema: ctx.graphql.schema, source, contextValue: ctx, variableValues: variables })
    assert.equal(r.errors, undefined, String(r.errors?.[0]?.message))
    return JSON.parse(JSON.stringify(r.data)) as any
  }
  const ROLES = {
    kerry: sessionOf('kerry', FRONT, [TPA]), jenna: sessionOf('jenna', CLINICAL, [TPA]), dana: sessionOf('dana', BILLING, [TPA]), tampaManager: sessionOf('tm', MANAGER, [TPA]), tampaAll: sessionOf('ta', EVERYTHING, [TPA]),
    vivian: sessionOf('vivian', FRONT, [STP]), grace: sessionOf('grace', CLINICAL, [STP]), peteManager: sessionOf('pm', MANAGER, [STP]), peteAll: sessionOf('pa', EVERYTHING, [STP]),
  }
  const homeOf = (role: string) => (role.startsWith('kerry') || role.startsWith('jenna') || role.startsWith('dana') || role.startsWith('tampa') ? 'Tampa' : 'Pete')
  const other = (mine: string) => (mine === 'Tampa' ? 'Pete' : 'Tampa')

  it('ContactPoint, ConsentGrant, BrokenAppointmentEvent, FamilyGroup, Conversation, PortalAccount/Scope, ApprovalRequest: the other office is invisible on every path', async () => {
    for (const [role, session] of Object.entries(ROLES)) {
      const mine = homeOf(role); const theirs = other(mine)
      const d = await run(session, `query($p: ID!, $c: ID!, $gc: ID!, $f: ID!, $b: ID!, $a: ID!, $pa: ID!) {
        cp: contactPoints(where: { OR: [{ id: { equals: $c } }, { id: { equals: $gc } }] }) { id value }
        cpOne: contactPoint(where: { id: $c }) { id }
        cpOracle: contactPointsCount(where: { patient: { id: { equals: $p } } })
        cpOrder: contactPoints(orderBy: { value: asc }, take: 500) { id patient { id } guarantor { id } }
        cg: consentGrantsCount(where: { contactPoint: { patient: { id: { equals: $p } } } })
        cgAll: consentGrants(take: 500) { id contactPoint { id } }
        fam: familyGroup(where: { id: $f }) { id name }
        famOracle: familyGroupsCount(where: { members: { some: { id: { equals: $p } } } })
        famAll: familyGroups(take: 500) { id members { id } }
        bae: brokenAppointmentEvent(where: { id: $b }) { id reason }
        baeOracle: brokenAppointmentEventsCount(where: { patient: { id: { equals: $p } } })
        baeAll: brokenAppointmentEvents(take: 500) { id reason }
        appr: approvalRequest(where: { id: $a }) { id summary }
        apprAll: approvalRequests(take: 500) { id summary }
        apprOracle: approvalRequestsCount(where: { patient: { id: { equals: $p } } })
        portal: portalAccount(where: { id: $pa }) { id email }
        portalOracle: portalScopesCount(where: { patient: { id: { equals: $p } } })
      }`, { p: ids[`${theirs}Patient`], c: ids[`${theirs}Contact`], gc: ids[`${theirs}GuarantorContact`], f: ids[`${theirs}Family`], b: ids[`${theirs}Broken`], a: ids[`${theirs}Approval`], pa: ids[`${theirs}Portal`] })
      const label = `${role} (${mine}) reading ${theirs}`
      assert.deepEqual([d.cp, d.cpOne, d.cpOracle, d.cg, d.fam, d.famOracle, d.bae, d.baeOracle, d.appr, d.apprOracle, d.portal, d.portalOracle], [[], null, 0, 0, null, 0, null, 0, null, 0, null, 0], label)
      assert.ok(!d.cpOrder.some((r: any) => r.id === ids[`${theirs}Contact`] || r.id === ids[`${theirs}GuarantorContact`]), label)
      assert.ok(!d.cgAll.some((r: any) => r.contactPoint?.id === ids[`${theirs}Contact`]), label)
      assert.ok(!d.famAll.some((r: any) => r.id === ids.mixedFamily || r.id === ids[`${theirs}Family`]), `${label}: a family with someone I cannot see`)
      assert.ok(!d.baeAll.some((r: any) => r.reason.startsWith(theirs)), label)
      assert.ok(!d.apprAll.some((r: any) => r.id === ids.practiceApproval || r.summary.startsWith(theirs)), `${label}: approvals`)
    }
  })

  it('my own office stays visible, and a reader with every office sees both', async () => {
    const mine = await run(ROLES.vivian, `query($c: ID!, $a: ID!, $b: ID!) { cp: contactPoint(where: { id: $c }) { id } appr: approvalRequest(where: { id: $a }) { id } bae: brokenAppointmentEvent(where: { id: $b }) { id } }`, { c: ids.PeteContact, a: ids.PeteApproval, b: ids.PeteBroken })
    assert.equal(mine.cp?.id, ids.PeteContact)
    assert.equal(mine.appr?.id, ids.PeteApproval)
    assert.equal(mine.bae?.id, ids.PeteBroken)
    const all = await run(sessionOf('owner', EVERYTHING, 'all'), `{ contactPointsCount approvalRequestsCount familyGroupsCount brokenAppointmentEventsCount }`)
    const kerry = await run(ROLES.kerry, `{ contactPointsCount approvalRequestsCount familyGroupsCount brokenAppointmentEventsCount }`)
    for (const key of Object.keys(all)) assert.ok(all[key] > kerry[key], `${key}: all-locations sees more`)
  })

  it('every list the schema exposes: a Tampa-only and a St. Pete-only reader never see the other office\'s test patient', async () => {
    const lists = Object.keys(config.lists)
    const queryName = (key: string) => (config.lists[key].graphql?.plural ?? `${key[0].toLowerCase()}${key.slice(1)}s`)
    const schema = context.withSession(ROLES.kerry).graphql.schema
    const queryFields = schema.getQueryType().getFields()
    const problems: string[] = []
    const checked = new Set<string>()
    for (const [role, session] of Object.entries({ tampaAll: ROLES.tampaAll, peteAll: ROLES.peteAll })) {
      const theirs = other(homeOf(role))
      for (const key of lists) {
        const plural = Object.keys(queryFields).find(f => f.toLowerCase() === queryName(key).toLowerCase() || f.toLowerCase() === `${key.toLowerCase()}s` || f.toLowerCase() === `${key.toLowerCase()}es` || (key.endsWith('y') && f.toLowerCase() === `${key.slice(0, -1).toLowerCase()}ies`))
        if (!plural) continue
        const type = schema.getType(key) as any
        const fields = type?.getFields?.() ?? {}
        // every relation to a Patient on this list, one level deep, is an oracle to try
        const patientPaths = Object.entries<any>(fields).filter(([, f]) => String(f.type).replace(/[[\]!]/g, '') === 'Patient').map(([n, f]) => [n, String(f.type).startsWith('[')] as const)
        for (const [field, many] of patientPaths) {
          const where = many ? `{ ${field}: { some: { id: { equals: "${ids[`${theirs}Patient`]}" } } } }` : `{ ${field}: { id: { equals: "${ids[`${theirs}Patient`]}" } } }`
          const ctx = context.withSession(session)
          const r = await graphql({ schema: ctx.graphql.schema, source: `{ n: ${plural}Count(where: ${where}) }`, contextValue: ctx })
          if (r.errors) continue // no read permission at all is fine
          checked.add(`${plural}.${field}`)
          if ((r.data as any).n > 0) problems.push(`${role}: ${plural}.${field} shows ${(r.data as any).n} ${theirs} row(s)`)
        }
      }
    }
    assert.deepEqual(problems, [])
    for (const path of ['contactPoints.patient', 'brokenAppointmentEvents.patient', 'familyGroups.members', 'approvalRequests.patient', 'portalScopes.patient', 'conversations.patient', 'ledgerEntries.patient', 'claims.patient']) assert.ok(checked.has(path), `the sweep reached ${path}`)
    assert.ok(checked.size > 40, `the sweep checked ${checked.size} patient paths`)
  })

  it('P6 r1 B3/B4: compliance and import rows follow the office, PDMP notes are for prescribers, lab instructions for clinical staff', async () => {
    const stamp = Date.now()
    const lab = await prisma.lab.create({ data: { name: `Scope lab ${stamp}` } })
    const provider = await prisma.providerProfile.findFirstOrThrow()
    for (const [name, office] of [['Tampa', TPA], ['Pete', STP]] as const) {
      const patientId = ids[`${name}Patient`]
      ids[`${name}Aod`] = (await prisma.accountingOfDisclosure.create({ data: { patientId, disclosedOn: new Date('2026-01-05'), recipient: `${name} attorney`, purpose: 'subpoena' } })).id
      ids[`${name}Hold`] = (await prisma.recordHold.create({ data: { patientId, reason: `${name} litigation`, status: 'active' } })).id
      ids[`${name}Rights`] = (await prisma.patientRightsRequest.create({ data: { ref: `PRR-${name}-${stamp}`, patientId, kind: 'access', receivedOn: new Date('2026-01-05'), dueOn: new Date('2026-02-04'), status: 'open' } })).id
      ids[`${name}Disposition`] = (await prisma.retentionDisposition.create({ data: { patientId, eligibleOn: new Date('2020-01-01'), status: 'eligible' } })).id
      ids[`${name}Export`] = (await prisma.exportJob.create({ data: { ref: `EXP-${name}-${stamp}`, kind: 'ehi_bundle', patientId, status: 'completed' } })).id
      const batch = await prisma.importBatch.create({ data: { ref: `IMP-${name}-${stamp}`, source: 'open_dental', fileSha256: `${name}-${stamp}`, locationId: office, rows: { patients: [{ firstName: name }] }, status: 'previewed' } })
      ids[`${name}Batch`] = batch.id
      ids[`${name}Map`] = (await prisma.importRecordMap.create({ data: { batchId: batch.id, source: 'open_dental', entity: 'patient', externalId: `${name}-1`, internalId: patientId } })).id
      const rx = await prisma.prescription.create({ data: { patientId, prescriberId: provider.id, drug: 'Hydrocodone', sig: 'as directed', quantity: '6', isControlled: true, schedule: 'II', mode: 'print', status: 'draft' } })
      ids[`${name}Pdmp`] = (await prisma.pdmpCheck.create({ data: { prescriptionId: rx.id, patientId, checkedAt: new Date(), result: 'reviewed_concern', note: `${name} state record shows 3 opioid fills` } })).id
      ids[`${name}Lab`] = (await prisma.labCase.create({ data: { ref: `LAB-${name}-${stamp}`, patientId, locationId: office, labId: lab.id, workType: 'crown', instructions: `${name} bruxism, zirconia`, status: 'draft' } })).id
    }
    ids.practiceIncident = (await prisma.incidentReport.create({ data: { title: 'Lost laptop', description: 'Tampa and St. Pete schedules', status: 'reported' } })).id
    ids.practiceExport = (await prisma.exportJob.create({ data: { ref: `EXP-journal-${stamp}`, kind: 'csv_journal', status: 'completed' } })).id
    const LISTS = [['accountingOfDisclosure', 'Aod'], ['recordHold', 'Hold'], ['patientRightsRequest', 'Rights'], ['retentionDisposition', 'Disposition'], ['exportJob', 'Export'], ['importBatch', 'Batch'], ['importRecordMap', 'Map'], ['pdmpCheck', 'Pdmp'], ['labCase', 'Lab']] as const
    for (const [role, session] of [['tampaAll', ROLES.tampaAll], ['peteAll', ROLES.peteAll]] as const) {
      const mine = homeOf(role); const theirs = other(mine)
      const d = await run(session, `{ ${LISTS.map(([l, k]) => `${k}Mine: ${l}(where: { id: "${ids[`${mine}${k}`]}" }) { id } ${k}Theirs: ${l}(where: { id: "${ids[`${theirs}${k}`]}" }) { id }`).join(' ')} incident: incidentReport(where: { id: "${ids.practiceIncident}" }) { id } journal: exportJob(where: { id: "${ids.practiceExport}" }) { id } }`)
      for (const [, k] of LISTS) {
        assert.equal(d[`${k}Theirs`], null, `${role}: ${k} of the other office`)
        assert.equal(d[`${k}Mine`]?.id, ids[`${mine}${k}`], `${role}: own ${k}`)
      }
      assert.equal(d.incident, null, `${role}: practice-wide incident`)
      assert.equal(d.journal, null, `${role}: practice-wide export`)
    }
    const owner = await run(sessionOf('owner', EVERYTHING, 'all'), `{ i: incidentReport(where: { id: "${ids.practiceIncident}" }) { id } a: accountingOfDisclosuresCount h: recordHoldsCount }`)
    assert.equal(owner.i?.id, ids.practiceIncident)
    assert.ok(owner.a >= 2 && owner.h >= 2)

    // B3: the live Front Office and Hygienist sets (Tampa only), and a prescriber.
    const KERRY_LIVE: Permission[] = ['canAccessDashboard', 'canReadSchedule', 'canManageSchedule', 'canMessagePatients', 'canReadDemographics']
    const JENNA_LIVE: Permission[] = [...KERRY_LIVE, 'canChart', 'canReadClinical']
    const DENTIST: Permission[] = [...JENNA_LIVE, 'canPrescribe', 'canManageLabCases', 'canReadSensitive']
    const source = `query($p: ID!, $l: ID!) { pdmpCheck(where: { id: $p }) { id result note } labCase(where: { id: $l }) { id workType instructions } }`
    const read = async (granted: Permission[]) => {
      const ctx = context.withSession(sessionOf(`b3-${granted.length}`, granted, [TPA]))
      const r = await graphql({ schema: ctx.graphql.schema, source, contextValue: ctx, variableValues: { p: ids.TampaPdmp, l: ids.TampaLab } })
      return JSON.parse(JSON.stringify(r.data ?? {})) as any
    }
    const kerry = await read(KERRY_LIVE)
    assert.equal(kerry.pdmpCheck?.note ?? null, null, 'front desk: PDMP note')
    assert.equal(kerry.labCase?.instructions ?? null, null, 'front desk: lab instructions')
    const jenna = await read(JENNA_LIVE)
    assert.equal(jenna.pdmpCheck?.note ?? null, null, 'hygienist: PDMP note')
    assert.equal(jenna.labCase?.instructions, 'Tampa bruxism, zirconia', 'hygienist: lab instructions')
    const dentist = await read(DENTIST)
    assert.equal(dentist.pdmpCheck?.note, 'Tampa state record shows 3 opioid fills', 'prescriber: PDMP note')
    // a field the reader cannot see cannot be filtered or sorted on either
    for (const [granted, q] of [[JENNA_LIVE, `{ pdmpChecksCount(where: { note: { contains: "opioid" } }) }`], [KERRY_LIVE, `{ labCasesCount(where: { instructions: { contains: "bruxism" } }) }`], [KERRY_LIVE, `{ labCases(orderBy: { instructions: asc }) { id } }`]] as const) {
      const ctx = context.withSession(sessionOf('b3-filter', granted as Permission[], [TPA]))
      const r = await graphql({ schema: ctx.graphql.schema, source: q, contextValue: ctx })
      assert.ok(r.errors?.length, `refused: ${q}`)
    }
  })

  it('R3-2: relation filters through Restatement.entries and ChartEntry.ledgerEntry cannot reach the other office, both ways', async () => {
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')
    const entry = (name: string, location: string, extra: Record<string, unknown> = {}) => prisma.ledgerEntry.create({ data: { accountId: ids[`${name}Account`], patientId: ids[`${name}Patient`], kind: 'finance_charge', amountMinor: 500n, currencyCode: 'USD', businessDate: today, originalBusinessDate: today, locationId: location, memo: 'r3 oracle test', ...extra } })
    for (const [home, office] of [['Tampa', TPA], ['Pete', STP]] as const) {
      // A restatement at each office, holding an entry about each office's patient (the reviewer's oracle: the restatement is
      // readable, the entry is not), and a chart entry for each patient pointing at a ledger row the reader cannot see.
      const close = await prisma.periodClose.create({ data: { locationId: office, period: `2020-${home === 'Tampa' ? '01' : '02'}`, status: 'reopened' } })
      const restatement = await prisma.restatement.create({ data: { periodCloseId: close.id, reason: 'r3 oracle test' } })
      const theirs = other(home)
      ids[`${home}Restatement`] = restatement.id
      ids[`${theirs}EntryIn${home}Restatement`] = (await entry(theirs, office, { restatementId: restatement.id })).id
      // my patient's ledger row at the other office: hidden from me by its office, but named by my patient's chart entry
      const hidden = await entry(home, home === 'Tampa' ? STP : TPA)
      ids[`${home}HiddenLedger`] = hidden.id
      ids[`${home}Chart`] = (await prisma.chartEntry.create({ data: { patientId: ids[`${home}Patient`], kind: 'procedure', area: 'mouth', source: 'test', ledgerEntryId: hidden.id } })).id
    }
    const sweep: [string, any, string][] = [['kerry', ROLES.kerry, 'Tampa'], ['dana', ROLES.dana, 'Tampa'], ['tampaAll', ROLES.tampaAll, 'Tampa'], ['jenna', ROLES.jenna, 'Tampa'],
      ['vivian', ROLES.vivian, 'Pete'], ['grace', ROLES.grace, 'Pete'], ['peteAll', ROLES.peteAll, 'Pete']]
    let refused = 0
    for (const [role, session, mine] of sweep) {
      const theirs = other(mine)
      for (const selection of [
        `restatementsCount(where: { entries: { some: { patient: { id: { equals: "${ids[`${theirs}Patient`]}" } } } } })`,
        `restatementsCount(where: { entries: { some: { patient: { lastName: { startsWith: "S" } } } } })`,
        `restatementsCount(where: { entries: { some: { amountMinor: { lt: "0" } } } })`,
        `restatementsCount(where: { entries: { none: { location: { id: { equals: "${mine === 'Tampa' ? TPA : STP}" } } } } })`,
        `restatements(where: { entries: { every: { id: { equals: "${ids[`${theirs}EntryIn${mine}Restatement`]}" } } } }, take: 5) { id }`,
        `chartEntriesCount(where: { ledgerEntry: { id: { equals: "${ids[`${mine}HiddenLedger`]}" } } })`,
        `chartEntriesCount(where: { ledgerEntry: { account: { id: { equals: "${ids[`${mine}Account`]}" } } } })`,
        `chartEntries(where: { ledgerEntry: { kind: { equals: "finance_charge" } } }, take: 5) { id }`,
      ]) {
        const ctx = context.withSession(session)
        const r = await graphql({ schema: ctx.graphql.schema, source: `{ n: ${selection} }`, contextValue: ctx })
        if (r.errors?.length) { refused++; continue }
        const value: any = (r.data as any).n
        assert.ok(value === 0 || (Array.isArray(value) && value.length === 0), `${role} (${mine}): ${selection} answered ${JSON.stringify(value)}`)
      }
      // The relations still read, filtered by the related list's own rule: no other-office row comes back.
      const d = await run(session, `query($r: ID!, $c: ID!) { r: restatement(where: { id: $r }) { entries { id } } c: chartEntry(where: { id: $c }) { ledgerEntry { id } } }`, { r: ids[`${mine}Restatement`], c: ids[`${mine}Chart`] })
      assert.ok(!(d.r?.entries ?? []).some((e: any) => e.id === ids[`${theirs}EntryIn${mine}Restatement`]), `${role}: restatement entries`)
      assert.equal(d.c?.ledgerEntry ?? null, null, `${role}: chart entry ledger row`)
    }
    assert.ok(refused > 0, 'the relation filters are refused for single-office readers')
    // A reader with every office may still filter on both relations.
    const owner = await run(sessionOf('owner', EVERYTHING, 'all'), `query($p: ID!, $l: ID!) { a: restatementsCount(where: { entries: { some: { patient: { id: { equals: $p } } } } }) b: chartEntriesCount(where: { ledgerEntry: { id: { equals: $l } } }) }`, { p: ids.PetePatient, l: ids.TampaHiddenLedger })
    assert.deepEqual(owner, { a: 1, b: 1 })
  })

  it('N4: a single-office manager cannot decide another office\'s approval or a practice-wide one; their own office is fine', async () => {
    const { decideApprovalRequest } = await import('../mutations/approvals')
    const decide = (session: any, requestId: string) => decideApprovalRequest(null, { requestId, decision: 'reject', reason: 'scope test', expectedVersion: 0, idempotencyKey: `d-${requestId}-${session.itemId}-${Date.now()}` }, { session, prisma })
    const u = async (name: string) => (await prisma.user.create({ data: { name, email: `${name}-${Date.now()}@test.local`, password: 'x'.repeat(60) } })).id
    const peteManager = sessionOf(await u('pm'), [...MANAGER, 'canApproveFeePublish'], [STP])
    await assert.rejects(decide(peteManager, ids.TampaApproval), /office|location|not found/i)
    await assert.rejects(decide(peteManager, ids.practiceApproval), /every office|whole practice|location/i)
    assert.equal((await prisma.approvalRequest.findUnique({ where: { id: ids.TampaApproval } })).status, 'pending')
    const tampaManager = sessionOf(await u('tm'), MANAGER, [TPA])
    await assert.rejects(decide(tampaManager, ids.PeteApproval), /office|location|not found/i)
    // a manager deciding their own office's request still can
    const own = await decide(tampaManager, ids.TampaApproval)
    assert.equal(own.status, 'rejected')
  })
})
