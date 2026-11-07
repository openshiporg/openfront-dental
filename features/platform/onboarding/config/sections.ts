import { APPROVAL_POLICIES, LOCATIONS, PACK_LABELS, PRACTICE, ROLES, STAFF } from '@/features/keystone/seed/practice'

/**
 * What "Load sample practice" creates, section by section. Each section is one idempotent server
 * command; later phases add operatories, patients, fee schedules, payers and claims here.
 * Sample practice: synthetic data.
 */
export const SETUP_SECTIONS = [
  {
    id: 'practice',
    title: 'Practice, locations, people and controls',
    mutation: 'mutation LoadPractice($idempotencyKey: String!) { loadPracticeSetup(idempotencyKey: $idempotencyKey) }',
    field: 'loadPracticeSetup',
    items: [
      `${PRACTICE.displayName} (sample practice: synthetic data)`,
      ...LOCATIONS.map(location => location.name),
      `${PACK_LABELS.length} jurisdiction packs (${PACK_LABELS.join(', ')}), every rule flagged for verification`,
      `${ROLES.length} roles with separated duties`,
      ...STAFF.map(person => `${person.name} · ${person.title}`),
      `${APPROVAL_POLICIES.length} maker-checker approval policies`,
    ],
  },
] as const
