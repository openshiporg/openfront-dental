import { list } from '@keystone-6/core'
import { checkbox, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { fixedChoice, lifecycle, readOnly, systemText, versionField } from './domainFields'
import { governed } from './listAccess'
import { scopedBy, scopedGoverned } from './scope'
import { trackingFields } from './trackingFields'

/*
 * Signals (SCHEMA §14.1-14.4; DOMAIN §8.1). A detector reads the practice's records on request and writes one
 * Signal per finding. Running a detector twice for the same window never creates a second signal (dedupeKey).
 * Phase 5 override: no jobs, cron or timers; runs start from the AI home page or the "Run checks" button.
 */

export const SIGNAL_STATUSES = ['open', 'proposed', 'resolved_by_execution', 'resolved_by_change', 'dismissed', 'expired'] as const
export const RISK_CLASSES = ['low', 'medium', 'high', 'never_autonomous'] as const

export const SignalType = list({
  access: governed(['canReadSignals', 'canDecideProposals']),
  ui: { labelField: 'key', listView: { initialColumns: ['key', 'isEnabled', 'defaultProposalKind', 'ownerRole'] } },
  fields: {
    key: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    title: systemText(),
    detectorVersion: systemText({ required: true }),
    isEnabled: checkbox({ defaultValue: true, ...readOnly }),
    params: json({ defaultValue: {}, ...readOnly }),
    defaultProposalKind: systemText(),
    ownerRole: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})

export const SignalRun = list({
  access: scopedGoverned(['canReadSignals'], scopedBy(ids => ({ location: { id: { in: ids } } }))),
  ui: { labelField: 'status', listView: { initialColumns: ['signalType', 'location', 'windowStart', 'status', 'createdAt'] } },
  fields: {
    signalType: relationship({ ref: 'SignalType', ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    windowStart: timestamp({ ...readOnly }),
    windowEnd: timestamp({ ...readOnly }),
    status: lifecycle(['started', 'completed', 'failed']),
    counts: json({ defaultValue: {}, ...readOnly }),
    signals: relationship({ ref: 'Signal.run', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const Signal = list({
  access: scopedGoverned(['canReadSignals', 'canDecideProposals'], scopedBy(ids => ({ location: { id: { in: ids } } }))),
  ui: { labelField: 'summary', listView: { initialColumns: ['type', 'summary', 'status', 'createdAt'] } },
  fields: {
    type: relationship({ ref: 'SignalType', ...readOnly }),
    run: relationship({ ref: 'SignalRun.signals', ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    subjectType: systemText(),
    subjectId: systemText({ indexed: true }),
    patient: relationship({ ref: 'Patient', ...readOnly }),
    summary: systemText(),
    /** [{list,id,version,hash}] pointers: the proof a person can follow. Never copied PHI. */
    evidence: json({ defaultValue: [], ...readOnly }),
    impact: json({ defaultValue: {}, ...readOnly }),
    dedupeKey: systemText({ required: true }),
    status: lifecycle(SIGNAL_STATUSES),
    proposals: relationship({ ref: 'Proposal.signals', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const ProposalKind = list({
  access: governed(['canReadSignals', 'canDecideProposals']),
  ui: { label: 'Proposal kinds', labelField: 'key', listView: { initialColumns: ['key', 'riskClass', 'requiredPermission', 'defaultExpiryMinutes'] } },
  fields: {
    key: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    title: systemText(),
    riskClass: fixedChoice(RISK_CLASSES),
    requiredPermission: systemText({ required: true }),
    defaultExpiryMinutes: integer({ defaultValue: 1440, ...readOnly }),
    validatorVersion: systemText({ required: true }),
    version: versionField(),
    ...trackingFields,
  },
})

/**
 * Autonomy policies (DOMAIN §8.3). A policy says a low-risk kind may be carried out without waiting for a person. In v1 nothing
 * runs on a timer, so a policy is only a recorded decision; a kind marked never-autonomous cannot hold one (the database refuses it too).
 */
export const AutonomyPolicy = list({
  access: governed(['canApproveAutonomy', 'canManageAgents']),
  ui: { labelField: 'kind', listView: { initialColumns: ['kind', 'mode', 'isActive', 'createdAt'] } },
  fields: {
    kind: systemText({ required: true, indexed: true }),
    mode: fixedChoice(['suggest_only', 'carry_out_low_risk']),
    isActive: checkbox({ defaultValue: true, ...readOnly }),
    approval: relationship({ ref: 'ApprovalRequest', ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})
