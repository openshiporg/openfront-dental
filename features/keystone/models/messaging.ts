import { list } from '@keystone-6/core'
import { checkbox, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { choice, fixedChoice, lifecycle, readOnly, systemText, versionField } from './domainFields'
import { managed } from './listAccess'
import { peopleFilter, scopedGoverned } from './scope'
import { trackingFields } from './trackingFields'

/*
 * Consent and patient messaging (SCHEMA §15.3–§15.5; DOMAIN I-X1–I-X4; SM§11).
 * Consent is per contact point × channel × purpose; it is rechecked when a message is dispatched,
 * not only when it is queued (catalog C12). Message bodies are PHI and live behind tiers.
 */

export const CONSENT_CHANNELS = ['sms', 'voice', 'email'] as const
export const CONSENT_PURPOSES = [
  'appointment_reminders', 'recall', 'treatment_follow_up', 'billing_statements', 'payment_reminders', 'marketing', 'reviews', 'ai_text_outbound', 'ai_voice_outbound',
] as const
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number]
export const MESSAGE_CHANNELS = ['sms', 'email', 'web_chat', 'portal', 'voice', 'manual'] as const

export const ConsentGrant = list({
  access: scopedGoverned(['canMessagePatients', 'canManagePatients', 'canReadDemographics'], peopleFilter({ patients: [['contactPoint', 'patient']], guarantors: [['contactPoint', 'guarantor']] })),
  ui: { listView: { initialColumns: ['contactPoint', 'channel', 'purpose', 'status', 'source', 'grantedAt'] } },
  fields: {
    contactPoint: relationship({ ref: 'ContactPoint.consentGrants', ...readOnly }),
    channel: fixedChoice(CONSENT_CHANNELS),
    purpose: fixedChoice(CONSENT_PURPOSES),
    status: lifecycle(['granted', 'revoked', 'expired']),
    source: fixedChoice(['intake_form', 'portal_api', 'verbal_staff', 'sms_keyword', 'import']),
    evidence: json({ defaultValue: {}, ...readOnly }),
    recordedBy: relationship({ ref: 'User', ...readOnly }),
    grantedAt: timestamp({ ...readOnly }),
    revokedAt: timestamp({ ...readOnly }),
    revokeReason: systemText(),
    needsReconfirmation: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const MessageTemplate = list({
  access: managed(['canMessagePatients', 'canManageTemplates'], 'canManageTemplates'),
  ui: { labelField: 'key', listView: { initialColumns: ['key', 'channel', 'purpose', 'phiLevel', 'locale', 'status'] } },
  fields: {
    key: text({ validation: { isRequired: true, match: { regex: /^[a-z0-9_.]{3,60}$/, explanation: 'lowercase letters, digits, dots and underscores' } } }),
    channel: choice(['sms', 'email', 'voice', 'portal'], 'email'),
    purpose: choice(CONSENT_PURPOSES, 'appointment_reminders'),
    phiLevel: choice(['none', 'minimal', 'clinical'], 'minimal'),
    subject: text(),
    body: text({ validation: { isRequired: true }, ui: { displayMode: 'textarea', description: 'Variables: {{patient.preferredName}}, {{appointment.when}}, {{location.name}}, {{location.phone}}, {{confirm.url}}.' } }),
    locale: text({ defaultValue: 'en' }),
    templateVersion: integer({ defaultValue: 1 }),
    status: choice(['draft', 'active', 'retired'], 'active'),
    ...trackingFields,
  },
})

export const Conversation = list({
  access: scopedGoverned(['canMessagePatients', 'canManagePatients'], peopleFilter({ patients: [['patient'], ['contactPoint', 'patient']], guarantors: [['contactPoint', 'guarantor']] })),
  ui: { listView: { initialColumns: ['patient', 'channel', 'status', 'assignedTo', 'updatedAt'] } },
  fields: {
    patient: relationship({ ref: 'Patient', ...readOnly }),
    contactPoint: relationship({ ref: 'ContactPoint', ...readOnly }),
    channel: fixedChoice(MESSAGE_CHANNELS),
    status: lifecycle(['open', 'agent_active', 'human_active', 'closed']),
    aiDisclosureAt: timestamp({ ...readOnly }),
    agent: relationship({ ref: 'AgentIdentity', ...readOnly }),
    assignedTo: relationship({ ref: 'User', ...readOnly }),
    messages: relationship({ ref: 'Message.conversation', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const Message = list({
  access: scopedGoverned(['canMessagePatients', 'canManagePatients'], peopleFilter({ patients: [['conversation', 'patient'], ['conversation', 'contactPoint', 'patient']], guarantors: [['conversation', 'contactPoint', 'guarantor']] })),
  ui: { listView: { initialColumns: ['conversation', 'direction', 'channel', 'purpose', 'status', 'sentAt'] } },
  fields: {
    conversation: relationship({ ref: 'Conversation.messages', ...readOnly }),
    direction: fixedChoice(['outbound', 'inbound']),
    channel: fixedChoice(MESSAGE_CHANNELS),
    template: relationship({ ref: 'MessageTemplate', ...readOnly }),
    toAddress: systemText(),
    subject: systemText(),
    body: systemText(),
    purpose: systemText(),
    status: lifecycle(['draft', 'queued', 'suppressed', 'accepted', 'delivered', 'failed', 'unknown', 'received']),
    suppressedReason: systemText(),
    adapterKey: systemText(),
    adapterMode: systemText(),
    providerMessageId: systemText({ indexed: true }),
    proposal: relationship({ ref: 'Proposal', ...readOnly }),
    sentAt: timestamp({ ...readOnly }),
    isSynthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})
