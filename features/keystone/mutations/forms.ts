import { requirePermission } from '../lib/actor'
import { canonicalJson, sha256 } from '../lib/canonical'
import { auditCreate, lockRow, transition } from '../lib/cas'
import { command } from '../lib/command'
import { DomainError, Codes } from '../lib/errors'
import { verifyPassword, requireReason, oneOf, dayOf } from './clinicalShared'
import { assertPatientInScope, requireText, staff, type Ctx } from './shared'

/*
 * Forms and consents (SM§6; SCHEMA §15.1–15.2). A consent record is evidence: it names the exact
 * template version, who signed and how. It is never edited; withdrawing is a new row.
 */

export async function requestForm(_root: unknown, args: { patientId: string; templateVersionId: string; channel?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart', 'canManagePatients')
  const channel = oneOf(args.channel ?? 'tablet', ['tablet', 'email_link', 'sms_link', 'portal_api'] as const, 'channel')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'form.request', actor, idempotencyKey, params }, async uow => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const template = await uow.tx.formTemplateVersion.findUnique({ where: { id: args.templateVersionId } })
    if (!template || template.status !== 'published') throw new DomainError(Codes.INVALID_INPUT, 'That form is not published.', { field: 'templateVersionId' })
    const request = await uow.tx.formRequest.create({ data: { patientId: args.patientId, templateId: template.id, channel, status: 'requested', requestedById: actor.kind === 'user' ? actor.userId : null, expiresAt: new Date(uow.now.getTime() + 7 * 86_400_000) } })
    auditCreate(uow, actor, 'FormRequest', request.id, 'form.requested', { patientId: args.patientId, template: template.id, channel })
    return { requestId: request.id }
  })
  return { replay: result.replay, ...result.value }
}

/** Record a signed form, taken at the chair or on a tablet. Consents also write a ConsentRecord. */
export async function submitForm(_root: unknown, args: { requestId: string; expectedVersion: number; data: Record<string, unknown>; signerName: string; signerRole: string; password: string; witnessUserId?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart', 'canManagePatients')
  if (actor.kind !== 'user') throw new DomainError(Codes.AGENT_CANNOT_APPROVE, 'Only staff record a signed form.')
  await verifyPassword(context as never, actor.userId, args.password)
  const signerName = requireText(args.signerName, 'signer name', 120)
  const signerRole = oneOf(args.signerRole, ['patient', 'guardian'] as const, 'signer role')
  const { idempotencyKey, password: _password, ...params } = args
  const result = await command(context.prisma, { name: 'form.submit', actor, idempotencyKey, params }, async uow => {
    const request = await lockRow<any>(uow.tx, 'FormRequest', args.requestId)
    await assertPatientInScope(uow.tx, locationIds, request.patientId)
    if (request.expiresAt && new Date(request.expiresAt) < uow.now) throw new DomainError(Codes.GUARD_FAILED, 'This form request has expired. Send a new one.')
    const template = await uow.tx.formTemplateVersion.findUnique({ where: { id: request.templateId }, include: { template: true } })
    if (!template) throw new DomainError(Codes.NOT_FOUND, 'Form not found.')
    if (template.requiresWitness && !args.witnessUserId) throw new DomainError(Codes.GUARD_FAILED, 'This form needs a staff witness.', { field: 'witnessUserId' })
    if (args.witnessUserId === actor.userId) throw new DomainError(Codes.SELF_APPROVAL, 'The witness must be a different person from the one recording the form.')
    await transition<any>(uow, { model: 'FormRequest', id: request.id, from: ['requested', 'opened'], to: 'submitted', expectedVersion: args.expectedVersion, actor, eventType: 'form.submitted', metadata: { template: template.id } })
    const submission = await uow.tx.formSubmission.create({ data: { requestId: request.id, data: args.data as never, submittedAt: uow.now, submitterRole: signerRole } })
    let consentId: string | null = null
    if (template.template?.kind?.startsWith('consent') || ['hipaa_npp_ack', 'financial_policy', 'photo_consent'].includes(template.template?.kind ?? '')) {
      const consent = await uow.tx.consentRecord.create({ data: { patientId: request.patientId, templateVersionId: template.id, signerName, signerRole, signatureEvidence: { method: 'password_reauth', recordedBy: actor.userId, at: uow.now.toISOString(), contentHash: template.contentHash } as never, witnessId: args.witnessUserId ?? null, signedAt: uow.now, scope: { submissionId: submission.id } as never } })
      consentId = consent.id
      auditCreate(uow, actor, 'ConsentRecord', consent.id, 'consent.recorded', { patientId: request.patientId, template: template.id, signerRole })
    }
    return { submissionId: submission.id, consentId }
  })
  return { replay: result.replay, ...result.value }
}

export async function withdrawConsent(_root: unknown, args: { consentId: string; reason: string; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart', 'canManagePatients')
  const reason = requireReason(args.reason)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'consent.withdraw', actor, idempotencyKey, params }, async uow => {
    const record = await uow.tx.consentRecord.findUnique({ where: { id: args.consentId } })
    if (!record) throw new DomainError(Codes.NOT_FOUND, 'Consent record not found.')
    await assertPatientInScope(uow.tx, locationIds, String(record.patientId))
    const done = await uow.tx.consentAction.findFirst({ where: { recordId: record.id, kind: { in: ['withdraw', 'expire'] } } })
    if (done) throw new DomainError(Codes.INVALID_TRANSITION, 'This consent was already withdrawn.')
    const action = await uow.tx.consentAction.create({ data: { recordId: record.id, kind: 'withdraw', at: uow.now, byId: actor.kind === 'user' ? actor.userId : null, reason } })
    auditCreate(uow, actor, 'ConsentAction', action.id, 'consent.withdrawn', { consentId: record.id }, { reason })
    return { actionId: action.id }
  })
  return { replay: result.replay, ...result.value }
}

/** Publish a new version of a form: the text is hashed, and a version once published never changes. */
export async function publishFormVersion(_root: unknown, args: { templateKey: string; body: string; fields?: unknown[] | null; requiresWitness?: boolean | null; idempotencyKey: string }, context: Ctx) {
  const { actor } = staff(context)
  requirePermission(actor, 'canManagePatients', 'canManageTemplates')
  const body = requireText(args.body, 'form text', 20_000)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'form.publish_version', actor, idempotencyKey, params }, async uow => {
    const template = await uow.tx.formTemplate.findUnique({ where: { key: args.templateKey } })
    if (!template) throw new DomainError(Codes.NOT_FOUND, 'Unknown form.', { field: 'templateKey' })
    const last = await uow.tx.formTemplateVersion.findFirst({ where: { templateId: template.id }, orderBy: { number: 'desc' } })
    const number = (last?.number ?? 0) + 1
    const version = await uow.tx.formTemplateVersion.create({ data: { templateId: template.id, number, body, fields: (args.fields ?? []) as never, requiresWitness: args.requiresWitness === true, contentHash: sha256(canonicalJson({ key: template.key, number, body, fields: args.fields ?? [] })), status: 'published' } })
    if (last) await uow.tx.formTemplateVersion.update({ where: { id: last.id }, data: { status: 'retired' } })
    auditCreate(uow, actor, 'FormTemplateVersion', version.id, 'form.version_published', { key: template.key, number })
    return { versionId: version.id, number }
  })
  return { replay: result.replay, ...result.value }
}

export async function recordImagingStudy(_root: unknown, args: { patientId: string; modality: string; teeth?: string[] | null; acquiredAt?: string | null; idempotencyKey: string }, context: Ctx) {
  const { actor, locationIds } = staff(context)
  requirePermission(actor, 'canChart')
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: 'imaging.record', actor, idempotencyKey, params }, async uow => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId)
    const study = await uow.tx.imagingStudy.create({ data: { patientId: args.patientId, modality: args.modality, teeth: (args.teeth ?? []) as never, acquiredAt: args.acquiredAt ? new Date(args.acquiredAt) : uow.now, source: 'upload', status: 'acquired' } })
    auditCreate(uow, actor, 'ImagingStudy', study.id, 'imaging.recorded', { patientId: args.patientId, modality: args.modality })
    return { studyId: study.id, day: dayOf(uow.now.toISOString().slice(0, 10)).toISOString().slice(0, 10) }
  })
  return { replay: result.replay, ...result.value }
}
