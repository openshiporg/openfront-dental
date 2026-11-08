import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { NEVER_DEFAULT, permissionNames, type Permission } from '../access'
import { verifyAuditChain } from '../lib/audit'
import { decideApprovalRequest } from './approvals'
import { PHASE2_OPS } from './phase2Ops'
import { loadPracticeSetup } from './setup'

/*
 * Phase 2 exit gate (BUILD-PLAN Phase 2) against the seeded practice:
 *   - a procedure goes diagnosed → planned → accepted → scheduled → completed → posted with exactly one charge;
 *   - a signed note can't change (database trigger);
 *   - perio inputs out of range are rejected (command and CHECK);
 *   - a plan version is immutable after it is presented;
 *   - a code import with a fixture generated at test time (fake D9xxx-shaped codes) validates and activates
 *     through a second person's approval.
 */

const TPA = 'seed_loc_tpa'
const PASSWORD = 'correct horse battery'

const sessionFor = (id: string, granted: Permission[], locations: string[] = []) => ({
  itemId: id, listKey: 'User',
  data: {
    name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null,
    role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) },
    assignments: locations.map(l => ({ location: { id: l }, role: null, startsOn: null, endsOn: null })),
  },
})

// Password re-authentication reads the Keystone secret field; the test stands in for it.
const graphql = { schema: { getType: () => ({ getFields: () => ({ password: { extensions: { keystoneSecretField: { compare: async (plain: string) => plain === PASSWORD } } } }) }) } }

const run = (name: string, args: Record<string, unknown>, ctx: unknown) => PHASE2_OPS[name].fn(null, { ...args, idempotencyKey: uniqueKey(name) }, ctx) as Promise<any>

describe.skipIf(!hasTestDatabase)('Phase 2: clinical record, plans, codes and fees (database)', () => {
  let prisma: PrismaClient
  let owner: any
  let approver: any
  let patient: { id: string }
  let code: string

  beforeAll(async () => {
    process.env.SESSION_SECRET ||= 'dental-vitest-session-secret-0123456789abcdef'
    prisma = testPrisma(4)
    await resetDatabase(prisma)
    const make = (name: string) => prisma.user.create({ data: { name, email: `${uniqueKey(name)}@test.local`, password: 'x'.repeat(60) } })
    const [o, a] = await Promise.all([make('owner'), make('approver')])
    owner = { session: sessionFor(o.id, permissionNames.filter(p => !NEVER_DEFAULT.includes(p))), prisma, graphql }
    approver = { session: sessionFor(a.id, ['canAccessDashboard', 'canApproveCodeImport', 'canApproveFeePublish', 'canAccessAllLocations']), prisma, graphql }
    await loadPracticeSetup(null, { idempotencyKey: uniqueKey('setup') }, owner)
    // A patient with nothing on the chart yet.
    patient = await prisma.patient.findFirstOrThrow({ where: { status: 'active', homeLocationId: TPA, chartEntries: { none: {} } } as never, orderBy: { chartNumber: 'desc' } }).catch(async () => prisma.patient.findFirstOrThrow({ where: { status: 'active', homeLocationId: TPA }, orderBy: { chartNumber: 'desc' } }))
    code = (await prisma.procedureCode.findFirstOrThrow({ where: { code: 'OF-R011' } })).id
  }, 240_000)

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  it('seeds practice-authored OF- codes, a published fee schedule and charted patients, with no licensed content', async () => {
    const [codes, nonOf, fees, entries] = await Promise.all([
      prisma.procedureCode.count(), prisma.procedureCode.count({ where: { NOT: { code: { startsWith: 'OF-' } } } }),
      prisma.fee.count(), prisma.chartEntry.count(),
    ])
    expect(codes).toBeGreaterThanOrEqual(20)
    expect(nonOf).toBe(0)
    expect(fees).toBeGreaterThan(40)
    expect(entries).toBeGreaterThan(50)
  })

  it('takes a procedure diagnosed → planned → accepted → scheduled → completed → posted with exactly one charge', async () => {
    const added = await run('addChartProcedure', { patientId: patient.id, locationId: TPA, codeId: code, site: { tooth: '14', surfaces: 'DO' }, status: 'diagnosed' }, owner)
    let entry = await prisma.chartEntry.findUniqueOrThrow({ where: { id: added.chartEntryId } })
    expect(entry).toMatchObject({ status: 'diagnosed', tooth: '14', surfaces: 'OD', feeMinor: null }) // surfaces in canonical order

    const plan = await run('buildTreatmentPlan', { patientId: patient.id, title: 'Upper left restoration', chartEntryIds: [entry.id] }, owner)
    entry = await prisma.chartEntry.findUniqueOrThrow({ where: { id: entry.id } })
    expect(entry.status).toBe('planned')
    const presented = await run('presentTreatmentPlan', { planId: plan.planId, expectedVersion: 0 }, owner)
    const item = await prisma.treatmentPlanItem.findFirstOrThrow({ where: { planVersionId: plan.versionId } })
    const planRow = await prisma.treatmentPlan.findUniqueOrThrow({ where: { id: plan.planId } })
    await run('acceptTreatmentPlan', { planId: plan.planId, expectedVersion: planRow.version, versionHash: presented.contentHash, selectedItemIds: [item.id], signer: 'patient', signerName: 'Patient Name', password: PASSWORD }, owner)
    entry = await prisma.chartEntry.findUniqueOrThrow({ where: { id: entry.id } })
    expect(entry.status).toBe('accepted')

    const appointment = await prisma.appointment.findFirstOrThrow({ where: { patientId: patient.id } }).catch(async () => {
      const any = await prisma.appointment.findFirstOrThrow({})
      return prisma.appointment.update({ where: { id: any.id }, data: { patientId: patient.id } })
    })
    await run('scheduleChartEntry', { chartEntryId: entry.id, expectedVersion: entry.version, appointmentId: appointment.id }, owner)
    entry = await prisma.chartEntry.findUniqueOrThrow({ where: { id: entry.id } })
    expect(entry.status).toBe('scheduled')

    const provider = await prisma.providerProfile.findFirstOrThrow({ where: { providerType: 'dentist' } })
    const key = uniqueKey('complete')
    const args = { chartEntryId: entry.id, expectedVersion: entry.version, providerId: provider.id, idempotencyKey: key }
    const done: any = await PHASE2_OPS.completeProcedure.fn(null, args, owner)
    // A retry with the same key replays, and a second completion with a new key is refused: still one charge.
    const replay: any = await PHASE2_OPS.completeProcedure.fn(null, args, owner)
    expect(replay.replay).toBe(true)
    await expect(run('completeProcedure', { chartEntryId: entry.id, expectedVersion: entry.version, providerId: provider.id }, owner)).rejects.toThrow()
    entry = await prisma.chartEntry.findUniqueOrThrow({ where: { id: entry.id } })
    expect(entry.status).toBe('posted')
    expect(entry.providerId).toBe(provider.id)
    expect(entry.dateOfService).not.toBeNull()
    const charges = await prisma.ledgerEntry.findMany({ where: { chartEntryId: entry.id, kind: 'charge' } })
    expect(charges).toHaveLength(1)
    expect(charges[0].amountMinor).toBe(27500n)
    expect(entry.feeMinor).toBe(27500n)
    expect(done.ledgerEntryId).toBe(charges[0].id)

    // The database refuses a second charge for the same entry, and any change to the ledger or the posted fee.
    await expect(prisma.ledgerEntry.create({ data: { accountId: charges[0].accountId, patientId: patient.id, kind: 'charge', amountMinor: 100n, chartEntryId: entry.id, businessDate: new Date(), currencyCode: 'USD' } })).rejects.toThrow()
    await expect(prisma.ledgerEntry.update({ where: { id: charges[0].id }, data: { memo: 'edited' } })).rejects.toThrow(/append-only/)
    await expect(prisma.chartEntry.update({ where: { id: entry.id }, data: { feeMinor: 1n } })).rejects.toThrow(/locked/)

    // Correction is a forward action: a reversal plus a corrected status.
    const fresh = await prisma.chartEntry.findUniqueOrThrow({ where: { id: entry.id } })
    await run('correctProcedure', { chartEntryId: fresh.id, expectedVersion: fresh.version, reason: 'Wrong tooth charted' }, owner)
    const rows = await prisma.ledgerEntry.findMany({ where: { chartEntryId: entry.id } })
    expect(rows.map(r => r.kind).sort()).toEqual(['charge', 'reversal'])
    expect(rows.reduce((s, r) => s + r.amountMinor, 0n)).toBe(0n)
  })

  it('refuses surfaces outside the code area rule and the wrong tooth', async () => {
    await expect(run('addChartProcedure', { patientId: patient.id, locationId: TPA, codeId: code, site: { tooth: '14', surfaces: '' } }, owner)).rejects.toThrow(/surface/i)
    await expect(run('addChartProcedure', { patientId: patient.id, locationId: TPA, codeId: code, site: { tooth: '40', surfaces: 'O' } }, owner)).rejects.toThrow(/tooth/i)
    await expect(run('addChartProcedure', { patientId: patient.id, locationId: TPA, codeId: code, site: { tooth: '14', surfaces: 'MODB' } }, owner)).rejects.toThrow(/at most 2/)
  })

  it('a signed note cannot change: the database trigger refuses edits, and amendment is a new note', async () => {
    const drafted = await run('draftClinicalNote', { patientId: patient.id, title: 'Restorative visit', body: 'Composite placed on 14 after anaesthesia.' }, owner)
    await expect(run('signClinicalNote', { noteId: drafted.noteId, expectedVersion: 0, password: 'wrong' }, owner)).rejects.toThrow(/password/i)
    const signed = await run('signClinicalNote', { noteId: drafted.noteId, expectedVersion: 0, password: PASSWORD }, owner)
    expect(signed.bodyHash).toMatch(/^[0-9a-f]{64}$/)
    await expect(prisma.clinicalNote.update({ where: { id: drafted.noteId }, data: { body: 'quietly changed' } })).rejects.toThrow(/cannot be changed/)
    await expect(prisma.clinicalNote.delete({ where: { id: drafted.noteId } })).rejects.toThrow(/cannot be deleted/)
    await expect(run('updateNoteDraft', { noteId: drafted.noteId, expectedVersion: 1, body: 'x' }, owner)).rejects.toThrow(/signed/)
    const amend = await run('draftClinicalNote', { patientId: patient.id, title: 'Addendum', body: 'Patient reported no sensitivity at 1 week.', amendsNoteId: drafted.noteId }, owner)
    expect(amend.noteId).not.toBe(drafted.noteId)
    const original = await prisma.clinicalNote.findUniqueOrThrow({ where: { id: drafted.noteId } })
    expect(original.body).toBe('Composite placed on 14 after anaesthesia.')
    // Only a reviewer with a reason may mark it entered in error; the content stays.
    await run('markNoteEnteredInError', { noteId: drafted.noteId, expectedVersion: original.version, reason: 'Charted on the wrong patient' }, owner)
    expect((await prisma.clinicalNote.findUniqueOrThrow({ where: { id: drafted.noteId } })).body).toBe(original.body)
  })

  it('rejects perio inputs out of range, in the command and in the database, and locks a signed exam', async () => {
    const hygienist = await prisma.providerProfile.findFirstOrThrow({ where: { providerType: 'hygienist' } })
    const exam = await run('startPerioExam', { patientId: patient.id, locationId: TPA, examinerId: hygienist.id, examDate: '2026-01-05' }, owner)
    let version = 0
    const record = async (m: Record<string, unknown>[]) => { const r = await run('recordPerioMeasurements', { examId: exam.examId, expectedVersion: version, measurements: m }, owner); version = r.version }
    await expect(record([{ tooth: '3', site: 'MB', probingDepthMm: 16 }])).rejects.toThrow(/0 and 15/)
    await expect(record([{ tooth: '3', site: 'MB', probingDepthMm: -1 }])).rejects.toThrow(/0 and 15/)
    await expect(record([{ tooth: '3', site: 'MB', probingDepthMm: 3, gingivalMarginMm: 16 }])).rejects.toThrow(/-10 and 15/)
    await expect(prisma.perioSiteMeasurement.create({ data: { examId: exam.examId, tooth: '3', site: 'MB', probingDepthMm: 20 } })).rejects.toThrow()
    await record([{ tooth: '3', site: 'MB', probingDepthMm: 3, gingivalMarginMm: 1, bleeding: true }, { tooth: '3', site: 'B', probingDepthMm: 6, gingivalMarginMm: 0 }])
    const done = await run('completePerioExam', { examId: exam.examId, expectedVersion: version, password: PASSWORD }, owner)
    expect(done.summary).toMatchObject({ sites: 2, sitesGe5: 1 })
    const classification = await prisma.perioClassification.findFirstOrThrow({ where: { examId: exam.examId } })
    expect(classification.status).toBe('suggested') // a clinician must confirm it
    await expect(prisma.perioSiteMeasurement.update({ where: { examId_tooth_site: { examId: exam.examId, tooth: '3', site: 'MB' } }, data: { probingDepthMm: 2 } })).rejects.toThrow(/read-only/)
    await run('confirmPerioClassification', { classificationId: classification.id, expectedVersion: classification.version, stage: classification.suggestedStage, grade: classification.suggestedGrade }, owner)
  })

  it('freezes a plan version when it is presented, and revising makes a new version', async () => {
    const added = await run('addChartProcedure', { patientId: patient.id, locationId: TPA, codeId: code, site: { tooth: '19', surfaces: 'MO' } }, owner)
    const plan = await run('buildTreatmentPlan', { patientId: patient.id, title: 'Lower left', chartEntryIds: [added.chartEntryId] }, owner)
    const item = await prisma.treatmentPlanItem.findFirstOrThrow({ where: { planVersionId: plan.versionId } })
    await run('updatePlanItem', { itemId: item.id, priority: 'urgent' }, owner) // allowed while still a draft
    const presented = await run('presentTreatmentPlan', { planId: plan.planId, expectedVersion: 0 }, owner)
    expect(presented.contentHash).toMatch(/^[0-9a-f]{64}$/)
    await expect(run('updatePlanItem', { itemId: item.id, priority: 'elective' }, owner)).rejects.toThrow(/frozen/)
    await expect(prisma.treatmentPlanItem.update({ where: { id: item.id }, data: { feeMinor: 1n } })).rejects.toThrow(/frozen/)
    await expect(prisma.treatmentPlanVersion.update({ where: { id: plan.versionId }, data: { phases: [] } })).rejects.toThrow(/frozen/)
    await expect(prisma.treatmentPlanItem.create({ data: { planVersionId: plan.versionId, feeMinor: 5n, priority: 'elective' } })).rejects.toThrow(/frozen/)
    // A stale hash cannot be accepted.
    const row = await prisma.treatmentPlan.findUniqueOrThrow({ where: { id: plan.planId } })
    await expect(run('acceptTreatmentPlan', { planId: plan.planId, expectedVersion: row.version, versionHash: 'f'.repeat(64), selectedItemIds: [item.id], signer: 'patient', signerName: 'Patient Name', password: PASSWORD }, owner)).rejects.toThrow(/changed/)
    const revised = await run('reviseTreatmentPlan', { planId: plan.planId, reason: 'Patient asked to add a second option' }, owner)
    expect(revised.number).toBe(2)
    const stillFrozen = await prisma.treatmentPlanVersion.findUniqueOrThrow({ where: { id: plan.versionId } })
    expect(stillFrozen.contentHash).toBe(presented.contentHash)
  })

  it('imports a code set from a fixture generated at test time: validate, attest, a second person activates', async () => {
    // Fake D9xxx-shaped codes with invented text: nothing here is a real, licensed code.
    const rows = Array.from({ length: 12 }, (_, i) => ({ code: `D9${String(100 + i)}`, nomenclature: `Fixture procedure ${i + 1}`, category: 'adjunctive', areaRule: i % 2 ? 'tooth' : 'mouth', effectiveFrom: '2026-01-01' }))
    const bad = await run('uploadCodeImport', { systemKey: 'CDT', label: 'Fixture with errors', editionYear: 2026, fileName: 'bad.csv', rows: [...rows, { code: '??', category: 'adjunctive' }] }, owner)
    expect(bad.status).toBe('rejected')
    expect(bad.problems.length).toBe(1)
    const uploaded = await run('uploadCodeImport', { systemKey: 'CDT', label: 'Fixture 2026', editionYear: 2026, fileName: 'fixture.csv', rows }, owner)
    expect(uploaded.status).toBe('validated')
    let batch = await prisma.codeImportBatch.findUniqueOrThrow({ where: { id: uploaded.batchId } })
    await expect(run('requestCodeActivation', { batchId: batch.id, expectedVersion: batch.version }, owner)).rejects.toThrow(/Attest/)
    await run('attestCodeLicence', { batchId: batch.id, expectedVersion: batch.version, licenceType: 'practice_end_user', licenceHolder: 'Bayview Family Dental, PLLC', agreementRef: 'FIXTURE-0001' }, owner)
    batch = await prisma.codeImportBatch.findUniqueOrThrow({ where: { id: batch.id } })
    const requested = await run('requestCodeActivation', { batchId: batch.id, expectedVersion: batch.version }, owner)
    // The requester cannot approve their own request; a second person does.
    const request = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: requested.approvalId } })
    await expect(decideApprovalRequest(null, { requestId: request.id, decision: 'approve', expectedVersion: request.version, idempotencyKey: uniqueKey() }, owner)).rejects.toThrow()
    await decideApprovalRequest(null, { requestId: request.id, decision: 'approve', expectedVersion: request.version, idempotencyKey: uniqueKey() }, approver)
    batch = await prisma.codeImportBatch.findUniqueOrThrow({ where: { id: batch.id } })
    expect(batch.status).toBe('active')
    expect(await prisma.procedureCode.count({ where: { code: { startsWith: 'D9' } } })).toBe(12)
    const system = await prisma.codeSystem.findUniqueOrThrow({ where: { key: 'CDT' } })
    expect(system.activeImportId).toBe(batch.id)
  })

  it('publishes a fee schedule only after a second person approves, and published fees cannot change', async () => {
    const schedule = await prisma.feeSchedule.findFirstOrThrow({ where: { isDefault: true } })
    const version = await run('createFeeVersion', { scheduleId: schedule.id, label: '2027 office fees', effectiveFrom: '2027-01-01' }, owner)
    await run('setFee', { versionId: version.versionId, codeId: code, amountMinor: '29500' }, owner)
    const draft = await prisma.feeScheduleVersion.findUniqueOrThrow({ where: { id: version.versionId } })
    const requested = await run('requestFeePublish', { versionId: draft.id, expectedVersion: draft.version }, owner)
    const request = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: requested.approvalId } })
    await decideApprovalRequest(null, { requestId: request.id, decision: 'approve', expectedVersion: request.version, idempotencyKey: uniqueKey() }, approver)
    expect((await prisma.feeScheduleVersion.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('published')
    await expect(run('setFee', { versionId: draft.id, codeId: code, amountMinor: '1' }, owner)).rejects.toThrow()
    await expect(prisma.fee.updateMany({ where: { feeVersionId: draft.id }, data: { amountMinor: 1n } })).rejects.toThrow(/cannot change/)
  })

  it('records medical-history review, raising alerts from answers, and keeps the audit chain intact', async () => {
    const form = await prisma.medicalHistoryForm.findFirstOrThrow({ where: { status: 'published' } })
    const submitted = await run('submitMedicalHistory', { patientId: patient.id, formId: form.id, answers: { allergy_penicillin: 'yes', on_blood_thinner: 'no', medications: [{ name: 'Atorvastatin', dose: '20 mg', frequency: 'nightly' }] }, via: 'tablet' }, owner)
    const response = await prisma.medicalHistoryResponse.findUniqueOrThrow({ where: { id: submitted.responseId } })
    await expect(run('reviewMedicalHistory', { responseId: response.id, expectedVersion: response.version, acknowledgedChanges: [], password: PASSWORD }, owner)).rejects.toThrow(/Acknowledge/)
    const reviewed = await run('reviewMedicalHistory', { responseId: response.id, expectedVersion: response.version, acknowledgedChanges: ['allergy_penicillin'], password: PASSWORD }, owner)
    expect(reviewed.alertsCreated).toBeGreaterThanOrEqual(1)
    expect(await prisma.patientAlert.count({ where: { patientId: patient.id, kind: 'allergy', endedAt: null } })).toBeGreaterThanOrEqual(1)
    expect(await prisma.medicationEntry.count({ where: { patientId: patient.id, name: 'Atorvastatin', endedAt: null } })).toBe(1)
    await expect(prisma.medicalHistoryReview.update({ where: { id: reviewed.reviewId }, data: { overrideReason: 'x' } })).rejects.toThrow(/append-only/)
    const chain = await verifyAuditChain(prisma)
    expect(chain.ok).toBe(true)
  })

  it('refuses clinical writes from a role without the permission', async () => {
    const reader = { session: sessionFor('reader', ['canAccessDashboard', 'canReadClinical'], [TPA]), prisma, graphql }
    await expect(run('addChartProcedure', { patientId: patient.id, locationId: TPA, codeId: code, site: { tooth: '3', surfaces: 'O' } }, reader)).rejects.toThrow()
    await expect(run('signClinicalNote', { noteId: 'x', expectedVersion: 0, password: PASSWORD }, reader)).rejects.toThrow()
  })
})
