import type { ClaimPayload } from '../../integrations/clearinghouse/types'
import { addDays } from './time'
import type { Tx } from './db'

/*
 * Building a claim from posted chart entries, and the scrub (STATE-MACHINES §7). Pure reads: nothing here writes.
 * The scrub rule rows decide which checks run and how hard they block; the checks themselves live here.
 */

export type Finding = { rule: string; kind: string; severity: 'blocking' | 'warning'; message: string; lineId?: string | null }

const isoDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '')

/** Days between two ISO dates (b - a). */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/** The filing deadline: earliest service date plus the payer's window. Null when the payer has no window on file. */
export function filingDeadline(earliestService: string, timelyFilingDays: number | null | undefined) {
  return timelyFilingDays ? addDays(earliestService, timelyFilingDays) : null
}

const SIDE_WORDS: Record<string, string> = { M: 'mesial', O: 'occlusal', D: 'distal', B: 'buccal', L: 'lingual', F: 'facial', I: 'incisal' }
export const surfacesInWords = (surfaces: string) => surfaces.split('').map(s => SIDE_WORDS[s] ?? s).join(', ')

/** Our canonical claim from the stored rows. The member ID is added by the worker at send time; only its last four digits are frozen here. */
export async function buildPayload(tx: Tx, claimId: string, frequency: 'original' | 'replacement' | 'void', originalPayerClaimControlNumber?: string): Promise<ClaimPayload> {
  const claim = await tx.claim.findUniqueOrThrow({
    where: { id: claimId },
    include: {
      patient: true, location: true, billingEntity: true, renderingProvider: true,
      coverage: { include: { subscriber: { include: { plan: { include: { payer: true } }, patient: true } } } },
      lines: { orderBy: { lineControlNumber: 'asc' }, include: { code: true, localCode: true } },
    },
  })
  const subscriber = claim.coverage!.subscriber!
  const payer = subscriber.plan!.payer!
  const named = (subscriber.personName ?? {}) as { first?: string; last?: string }
  const person = subscriber.patient ?? null
  const entity = claim.billingEntity
  const address = (entity?.address ?? {}) as Record<string, string>
  const provider = claim.renderingProvider
  const [first, ...rest] = (provider?.displayName ?? '').replace(/^Dr\.?\s+/i, '').split(' ')
  return {
    patientControlNumber: claim.patientControlNumber,
    frequency,
    kind: claim.kind,
    payer: { id: payer.id, name: payer.name, adapterPayerId: String((payer.adapterPayerIds as Record<string, string> | null)?.stedi ?? '') },
    billing: { legalName: entity?.legalName ?? '', npi: entity?.npiType2 ?? '', address },
    rendering: { name: { first: first ?? '', last: rest.join(' ') }, npi: provider?.npiType1 ?? '', taxonomy: provider?.taxonomyCode ?? '' },
    patient: { first: claim.patient!.firstName, last: claim.patient!.lastName, dateOfBirth: isoDay(claim.patient!.dateOfBirth), sex: claim.patient!.sexAssignedAtBirth },
    subscriber: { first: person?.firstName ?? named.first ?? '', last: person?.lastName ?? named.last ?? '', dateOfBirth: isoDay(subscriber.dateOfBirth), relationship: claim.coverage!.relationship, memberIdLast4: subscriber.memberIdLast4 },
    placeOfServiceCode: claim.placeOfServiceCode || '11',
    ...(originalPayerClaimControlNumber ? { originalPayerClaimControlNumber } : {}),
    lines: claim.lines.map(l => ({ controlNumber: l.lineControlNumber, code: l.code?.code ?? '', localCode: l.localCode?.code ?? '', tooth: l.tooth, surfaces: l.surfaces, dateOfService: isoDay(l.dateOfService), chargeMinor: l.feeMinor.toString(), units: l.units })),
    totalChargeMinor: claim.totalChargeMinor.toString(),
  }
}

type RuleRow = { key: string; kind: string; severity: string; message: string; appliesTo: any }

/** Run every active rule against the claim. Returns findings; the caller stores them. */
export async function scrubClaim(tx: Tx, claimId: string, today: string): Promise<{ findings: Finding[]; rulesetVersion: string }> {
  const rules = (await tx.scrubRule.findMany({ where: { isActive: true }, orderBy: { key: 'asc' } })) as RuleRow[]
  const rulesetVersion = rules.length ? String((await tx.scrubRule.findFirst({ where: { isActive: true }, orderBy: { rulesetVersion: 'desc' }, select: { rulesetVersion: true } }))?.rulesetVersion ?? '') : ''
  const claim = await tx.claim.findUniqueOrThrow({
    where: { id: claimId },
    include: {
      coverage: { include: { subscriber: { include: { plan: { include: { payer: true } } } } } },
      lines: { include: { code: true, localCode: { include: { codeSystem: true } } } },
      attachments: true,
    },
  })
  const payer = claim.coverage?.subscriber?.plan?.payer
  const findings: Finding[] = []
  const add = (rule: RuleRow, message?: string, lineId?: string | null) => findings.push({ rule: rule.key, kind: rule.kind, severity: rule.severity as 'blocking' | 'warning', message: message ?? rule.message, lineId: lineId ?? null })

  for (const rule of rules) {
    switch (rule.kind) {
      case 'coverage_active':
        if (!claim.coverage || claim.coverage.status !== 'active') add(rule)
        break
      case 'primary_first':
        if (claim.kind === 'secondary' || claim.kind === 'tertiary') {
          const primary = claim.primaryClaimId ? await tx.claim.findUnique({ where: { id: claim.primaryClaimId }, select: { status: true } }) : null
          if (!primary || !['adjudicated', 'closed'].includes(primary.status)) add(rule)
        }
        break
      case 'crosswalk_required':
        for (const line of claim.lines) if (!line.code) add(rule, `${line.localCode?.code ?? 'This procedure'} has no confirmed insurance code. Confirm its match in the code crosswalk.`, line.id)
        break
      case 'tooth_required':
        for (const line of claim.lines) if (['tooth', 'tooth_surface'].includes(line.localCode?.areaRule ?? line.code?.areaRule ?? '') && !line.tooth) add(rule, undefined, line.id)
        break
      case 'surface_required':
        for (const line of claim.lines) if ((line.localCode?.requiresSurfaces || line.code?.requiresSurfaces) && !line.surfaces) add(rule, undefined, line.id)
        break
      case 'timely_filing':
        if (claim.timelyFilingDeadline && isoDay(claim.timelyFilingDeadline) < today) add(rule, `The payer’s filing window closed on ${isoDay(claim.timelyFilingDeadline)}. Add proof of timely filing or write the balance off.`)
        break
      case 'duplicate': {
        const entryIds = claim.lines.map(l => l.chartEntryId).filter(Boolean) as string[]
        if (entryIds.length && claim.kind !== 'predetermination') {
          const other = await tx.claimLine.findFirst({ where: { chartEntryId: { in: entryIds }, claimId: { not: claim.id }, claim: { kind: claim.kind, coverageId: claim.coverageId, status: { notIn: ['voided', 'rejected', 'draft'] } } }, select: { id: true } })
          if (other) add(rule)
        }
        break
      }
      case 'enrollment_required': {
        if (payer && claim.billingEntityId) {
          const live = await tx.payerEnrollment.findFirst({ where: { billingEntityId: claim.billingEntityId, payerId: payer.id, transaction: 'claims', status: 'live' }, select: { id: true } })
          if (!live) add(rule)
        }
        break
      }
      case 'attachment_required': {
        const categories: string[] = rule.appliesTo?.categories ?? []
        const needs = claim.lines.some(l => categories.includes(l.localCode?.category ?? l.code?.category ?? ''))
        if (needs && !claim.attachments.some(a => a.kind === 'radiograph' || a.kind === 'perio_chart')) add(rule)
        break
      }
      case 'narrative_required': {
        const categories: string[] = rule.appliesTo?.categories ?? []
        const needs = claim.lines.some(l => categories.includes(l.localCode?.category ?? l.code?.category ?? ''))
        if (needs && !claim.narrative.trim()) add(rule)
        break
      }
    }
  }
  return { findings, rulesetVersion }
}

export const hasBlocking = (findings: Finding[]) => findings.some(f => f.severity === 'blocking')
