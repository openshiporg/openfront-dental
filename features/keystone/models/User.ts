import { list } from '@keystone-6/core'
import { allOperations, denyAll } from '@keystone-6/core/access'
import { checkbox, integer, password, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { trackingFields } from './trackingFields'

import { isSignedIn, permissions, rules, sys } from '../access'

/*
 * Staff, auditors, portal and machine principals (SCHEMA §1.4). MFA factor material is sealed and
 * never readable through GraphQL; enrolment and verification go through the MFA commands.
 */
const serverSecret = { access: { read: denyAll, create: sys, update: sys }, ui: { createView: { fieldMode: 'hidden' as const }, itemView: { fieldMode: 'hidden' as const }, listView: { fieldMode: 'hidden' as const } } }

export const User = list({
  access: {
    operation: {
      ...allOperations(isSignedIn),
      create: (args) => {
        if (process.env.PUBLIC_SIGNUPS_ALLOWED === 'true') return true
        return permissions.canManagePeople(args)
      },
      delete: permissions.canManagePeople,
    },
    filter: {
      query: rules.canReadPeople,
      update: rules.canUpdatePeople,
    },
  },
  ui: {
    hideCreate: args => !permissions.canManagePeople(args),
    hideDelete: args => !permissions.canManagePeople(args),
    listView: {
      initialColumns: ['name', 'email', 'title', 'role', 'kind'],
    },
    itemView: {
      defaultFieldMode: ({ session, item }) => {
        if (session?.data.role?.canEditOtherPeople) return 'edit'
        if (session?.itemId === item?.id) return 'edit'
        return 'read'
      },
    },
  },
  fields: {
    name: text({ validation: { isRequired: true } }),
    email: text({ isFilterable: false, isOrderable: false, isIndexed: 'unique', validation: { isRequired: true } }),
    password: password({
      access: {
        read: denyAll,
        update: ({ session, item }) => permissions.canManagePeople({ session }) || session?.itemId === item.id,
      },
      validation: { isRequired: true },
    }),
    role: relationship({
      ref: 'Role.assignedTo',
      access: { create: permissions.canManagePeople, update: permissions.canManagePeople },
      ui: { itemView: { fieldMode: args => (permissions.canManagePeople(args) ? 'edit' : 'read') } },
    }),
    kind: select({
      type: 'enum',
      options: ['staff', 'patient_portal', 'auditor', 'machine'].map(value => ({ label: value.replace('_', ' '), value })),
      defaultValue: 'staff',
      access: { create: permissions.canManagePeople, update: permissions.canManagePeople },
    }),
    title: text(),
    assignments: relationship({ ref: 'StaffAssignment.user', many: true, ui: { itemView: { fieldMode: 'read' } } }),
    providerProfile: relationship({ ref: 'ProviderProfile.user', ui: { itemView: { fieldMode: 'read' } } }),
    accessExpiresAt: timestamp({
      access: { create: permissions.canManagePeople, update: permissions.canManagePeople },
      ui: { description: 'Time-boxed access for auditors and bookkeepers.' },
    }),
    // MFA (BUILD-PLAN Phase 0 auth hardening). Factor material is sealed in SecretBox.
    mfaEnrolled: checkbox({ defaultValue: false, access: { create: sys, update: sys } }),
    mfaSecretId: text({ ...serverSecret, db: { isNullable: true } }),
    mfaPendingSecretId: text({ ...serverSecret, db: { isNullable: true } }),
    mfaPendingExpiresAt: timestamp({ ...serverSecret, db: { isNullable: true } }),
    mfaLastCounter: integer({ defaultValue: -1, ...serverSecret }),
    mfaRecoveryHashes: text({ defaultValue: '[]', ...serverSecret }),
    mfaFailures: integer({ defaultValue: 0, ...serverSecret }),
    mfaLockedUntil: timestamp({ ...serverSecret, db: { isNullable: true } }),
    quickSwitchPinHash: text({ ...serverSecret, db: { isNullable: true } }),
    authVersion: integer({ defaultValue: 1, access: { read: denyAll, create: sys, update: sys }, ui: { itemView: { fieldMode: 'hidden' } } }),
    onboardingStatus: select({
      options: ['not_started', 'in_progress', 'completed', 'dismissed'].map(value => ({ label: value.replaceAll('_', ' '), value })),
      defaultValue: 'not_started',
    }),
    ...trackingFields,
  },
})
