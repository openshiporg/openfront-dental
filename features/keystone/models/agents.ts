import { list } from '@keystone-6/core'
import { integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { permissions, sys } from '../access'
import { choice, fixedChoice, lifecycle, minor, readOnly, systemText, versionField } from './domainFields'
import { governed } from './listAccess'
import { allOfficesOnly, scopedBy, scopedGoverned } from './scope'
import { trackingFields } from './trackingFields'

/*
 * AI action layer identities, grants, runs and proposals (SCHEMA §14.5, §14.7; DOMAIN §8, I-P5, I-AI1).
 * Every write goes through a server command; these lists are read-only through the API.
 * adapted from openfront-hedge-fund@48199d9 features/keystone/models/agents.ts
 */

/** Proposal kinds (DOMAIN §8.2). The catalogue rows (ProposalKind) arrive in Phase 5. */
export const PROPOSAL_KINDS = [
  'fill_slot', 'outreach_message', 'verify_eligibility', 'verification_task', 'fix_claim', 'corrected_claim', 'appeal', 'claim_status_inquiry',
  'payment_reminder', 'payment_plan_offer', 'refund_request', 'write_off_request', 'note_draft', 'perio_entry_draft', 'review_reply', 'booking',
] as const
export type ProposalKind = (typeof PROPOSAL_KINDS)[number]

/**
 * Agent scopes (SCHEMA §14.7). No scope is granted by default (I-P5); an external MCP client's
 * effective scope is the intersection of its OAuth token and the agent grant.
 */
export const AGENT_READ_SCOPES = [
  'schedule.read', 'availability.read', 'patient.read_demographics', 'patient.read_clinical_summary', 'clinical.read',
  'coverage.read', 'claims.read', 'ledger.read', 'messages.read',
] as const
export const AGENT_WRITE_SCOPES = ['messages.send_within_policy', 'holds.create', 'booking.create_within_policy', 'eligibility.run', 'benefits.record_fact'] as const
export const AGENT_SCOPES = [...AGENT_READ_SCOPES, ...AGENT_WRITE_SCOPES, ...PROPOSAL_KINDS.map(kind => `propose:${kind}` as const)] as const
export type AgentScope = (typeof AGENT_SCOPES)[number]

/** Scopes that expose PHI: the agent's inference provider must be allowed PHI (I-AI5). */
export const PHI_SCOPES = new Set<string>(['patient.read_demographics', 'patient.read_clinical_summary', 'clinical.read', 'coverage.read', 'claims.read', 'ledger.read', 'messages.read'])

export const AgentIdentity = list({
  access: { operation: { query: permissions.canAccessDashboard, create: permissions.canManageAgents, update: sys, delete: sys } },
  ui: { labelField: 'name' },
  fields: {
    name: text({ validation: { isRequired: true }, isIndexed: 'unique' }),
    purpose: text({ ui: { displayMode: 'textarea' } }),
    kind: choice(['llm_agent', 'rules_engine', 'external_mcp_client'], 'llm_agent'),
    inferenceProvider: relationship({ ref: 'InferenceProvider' }),
    owner: relationship({ ref: 'User' }),
    status: lifecycle(['active', 'paused', 'revoked']),
    oauthApp: relationship({ ref: 'OAuthApp' }),
    grants: relationship({ ref: 'AgentToolGrant.agent', many: true, ...readOnly }),
    runs: relationship({ ref: 'AgentRun.agent', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const AgentToolGrant = list({
  access: governed(['canManageAgents', 'canApproveAgentGrants']),
  ui: { labelField: 'scope', listView: { initialColumns: ['agent', 'scope', 'status', 'createdAt'] } },
  fields: {
    agent: relationship({ ref: 'AgentIdentity.grants', ...readOnly }),
    scope: fixedChoice(AGENT_SCOPES),
    constraints: json({ ...readOnly, ui: { ...readOnly.ui, description: 'Limits, e.g. {"locations":["…"],"maxPerDay":40}.' } }),
    status: lifecycle(['requested', 'active', 'revoked']),
    approval: relationship({ ref: 'ApprovalRequest', ...readOnly }),
    revokedAt: timestamp({ ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const AgentRun = list({
  // r2 N3: a run's tool calls can name any office's patients; only a reader with every office lists runs.
  access: scopedGoverned(['canManageAgents', 'canReadSignals'], allOfficesOnly()),
  ui: { labelField: 'promptHash', listView: { initialColumns: ['agent', 'status', 'startedAt', 'endedAt'] } },
  fields: {
    agent: relationship({ ref: 'AgentIdentity.runs', ...readOnly }),
    inferenceProvider: relationship({ ref: 'InferenceProvider', ...readOnly }),
    model: systemText(),
    startedAt: timestamp({ defaultValue: { kind: 'now' }, ...readOnly }),
    endedAt: timestamp({ ...readOnly }),
    status: lifecycle(['started', 'completed', 'failed', 'aborted']),
    promptHash: systemText(),
    toolCalls: json({ ...readOnly, ui: { ...readOnly.ui, description: 'Tool names and argument hashes, never raw arguments.' } }),
    tokens: json({ ...readOnly }),
    costMinor: minor(),
    proposals: relationship({ ref: 'Proposal.agentRun', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const Proposal = list({
  access: scopedGoverned(['canReadSignals', 'canDecideProposals'], scopedBy(ids => ({ location: { id: { in: ids } } }))),
  ui: { labelField: 'kind', listView: { initialColumns: ['kind', 'status', 'proposedByAgent', 'proposedByUser', 'createdAt'] } },
  fields: {
    kind: fixedChoice(PROPOSAL_KINDS),
    payload: json({ ...readOnly }),
    payloadHash: systemText({ required: true }),
    expectedImpact: json({ ...readOnly }),
    status: lifecycle(['proposed', 'validated', 'invalid', 'approved', 'rejected', 'expired', 'executing', 'executed', 'failed', 'unknown']),
    agentRun: relationship({ ref: 'AgentRun.proposals', ...readOnly }),
    proposedByAgent: relationship({ ref: 'AgentIdentity', ...readOnly }),
    proposedByUser: relationship({ ref: 'User', ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    targetList: systemText(),
    targetId: systemText({ indexed: true }),
    approval: relationship({ ref: 'ApprovalRequest', ...readOnly }),
    signals: relationship({ ref: 'Signal.proposals', many: true, ...readOnly }),
    summary: systemText(),
    validation: json({ ...readOnly, ui: { ...readOnly.ui, description: 'Check results recorded when the proposal was validated.' } }),
    execution: json({ ...readOnly }),
    realised: json({ ...readOnly }),
    expiresAt: timestamp({ ...readOnly }),
    autonomyPolicyVersion: integer({ ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})
