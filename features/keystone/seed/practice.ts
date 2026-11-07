import { NEVER_DEFAULT, permissionNames, type Permission } from '../access'
import { PACKS } from '../lib/jurisdiction'

/** Pack labels the sample practice loads, for the onboarding summary. */
export const PACK_LABELS = PACKS.map(pack => `${pack.key}@${pack.version}`)

/**
 * Bayview Family Dental, a fictional two-office group on Tampa Bay (DOMAIN §13, BUILD-PLAN §5).
 * Sample practice: synthetic data. Every name, address, NPI and email is invented. Ids are
 * deterministic (`seed_…`) so loading twice changes nothing.
 */

export const PRACTICE = {
  legalName: 'Bayview Family Dental, PLLC',
  displayName: 'Bayview Family Dental',
  defaultTimeZone: 'America/New_York',
  currencyCode: 'USD',
  toothNumbering: 'universal',
  scheduleUnitMinutes: 10,
}

export const LOCATIONS = [
  {
    id: 'seed_loc_tpa', code: 'TPA', name: 'Bayview Family Dental — Tampa', timeZone: 'America/New_York',
    address: { line1: '4100 Harbour Light Way', line2: 'Suite 210', city: 'Tampa', state: 'FL', postal: '33609', country: 'US' },
    phone: '(813) 555-0142', email: 'tampa@bayviewdental.example',
    hours: { 1: [['07:30', '17:00']], 2: [['07:30', '17:00']], 3: [['08:00', '18:00']], 4: [['07:30', '17:00']], 5: [['07:30', '14:00']] },
  },
  {
    id: 'seed_loc_stp', code: 'STP', name: 'Bayview Family Dental — St. Petersburg', timeZone: 'America/New_York',
    address: { line1: '880 Pelican Shore Drive', line2: '', city: 'St. Petersburg', state: 'FL', postal: '33701', country: 'US' },
    phone: '(727) 555-0187', email: 'stpete@bayviewdental.example',
    hours: { 1: [['08:00', '17:00']], 2: [['08:00', '17:00']], 3: [['08:00', '17:00']], 4: [['08:00', '17:00']] },
  },
] as const

type RoleSeed = { id: string; name: string; description: string; permissions: Permission[] }

const BASE: Permission[] = ['canAccessDashboard', 'canSeeOtherPeople', 'canReadSchedule', 'canReadDemographics']
const FRONT: Permission[] = [...BASE, 'canManagePatients', 'canManageSchedule', 'canMessagePatients', 'canTakePayments', 'canVerifyBenefits', 'canReadInsurance', 'canReadLedger']
const CLINICAL: Permission[] = [...BASE, 'canReadClinical', 'canChart', 'canManagePerio', 'canReadInsurance']
const DENTIST: Permission[] = [...CLINICAL, 'canCompleteProcedures', 'canSignClinicalNotes', 'canPrescribe', 'canManageLabCases', 'canManageTreatmentPlans', 'canPresentPlans', 'canReadSensitive', 'canManageSchedule', 'canDecideClinicalProposals']
const BILLING: Permission[] = [...BASE, 'canReadInsurance', 'canManageInsurance', 'canVerifyBenefits', 'canManageClaims', 'canSubmitClaims', 'canPostRemittances', 'canReadLedger', 'canTakePayments', 'canAdjust', 'canDecideClaimProposals', 'canDecideFinancialProposals']

const ALL_BUT_BREAK_GLASS = permissionNames.filter(name => !NEVER_DEFAULT.includes(name))

export const ROLES: RoleSeed[] = [
  { id: 'seed_role_org_admin', name: 'Organisation Admin', description: 'Setup, users, locations, adapters and the BAA register. Activating a live adapter needs a second person.', permissions: [...BASE, 'canManagePeople', 'canManageRoles', 'canEditOtherPeople', 'canManageOnboarding', 'canManagePractice', 'canManageAdapters', 'canAccessAllLocations', 'canImportCodes', 'canImportData', 'canExportData', 'canManageAgents', 'canReadAudit', 'canManageCompliance'] },
  { id: 'seed_role_owner', name: 'Practice Owner', description: 'Runs the practice. Approver for write-offs, refunds, period reopen and autonomy policies.', permissions: ALL_BUT_BREAK_GLASS },
  { id: 'seed_role_office_manager', name: 'Office Manager', description: 'Templates, draft fee schedules, day close, statements and staff.', permissions: [...FRONT, 'canManagePeople', 'canOverrideSchedule', 'canOverrideTemplate', 'canManageFees', 'canCloseDay', 'canAdjust', 'canManageTemplates', 'canManageMemberships', 'canReadSignals', 'canDecideProposals', 'canReplyReviews', 'canApproveAdjustments', 'canReadAudit'] },
  { id: 'seed_role_dentist', name: 'Dentist', description: 'Charts, signs notes, plans treatment, prescribes and supervises hygiene.', permissions: [...DENTIST, 'canApproveClinicalCorrections'] },
  { id: 'seed_role_associate', name: 'Associate Dentist', description: 'As Dentist, scoped to assigned locations; production credited to the rendering provider.', permissions: DENTIST },
  { id: 'seed_role_hygienist', name: 'Hygienist', description: 'Perio, hygiene notes within scope, recall and radiographs.', permissions: [...CLINICAL, 'canCompleteProcedures', 'canSignClinicalNotes', 'canManageSchedule'] },
  { id: 'seed_role_assistant', name: 'Dental Assistant', description: 'Chart entry drafts, vitals, images and lab case handling. Does not sign provider notes.', permissions: [...CLINICAL, 'canManageLabCases'] },
  { id: 'seed_role_front_office', name: 'Front Office', description: 'Patients, families, scheduling, confirmations, forms, verification tasks and payments.', permissions: FRONT },
  { id: 'seed_role_tc', name: 'Treatment Coordinator', description: 'Presents plans, financing and good faith estimates; follows up.', permissions: [...FRONT, 'canPresentPlans', 'canReadClinical'] },
  { id: 'seed_role_insurance', name: 'Insurance Coordinator', description: 'Coverage, verifications, claims, attachments, ERA posting, denials and appeals.', permissions: BILLING },
  { id: 'seed_role_central_billing', name: 'Central Billing (DSO)', description: 'Payment-scoped access across locations; no clinical notes beyond what a claim needs.', permissions: [...BILLING, 'canAccessAllLocations'] },
  { id: 'seed_role_privacy', name: 'Privacy Officer', description: 'PHI read audit, break-glass review, rights requests, retention and holds.', permissions: [...BASE, 'canAccessAllLocations', 'canReviewPrivacy', 'canReadPhiAudit', 'canReadAudit', 'canManageCompliance', 'canApproveRetention', 'canExportData'] },
  { id: 'seed_role_bookkeeper', name: 'Bookkeeper', description: 'Reports, close exports and the read-only ledger. Time-boxed by the access expiry.', permissions: ['canAccessDashboard', 'canReadLedger', 'canAccessAllLocations'] },
  { id: 'seed_role_auditor', name: 'Auditor', description: 'Read-only, time-boxed by the user access expiry.', permissions: ['canAccessDashboard', 'canReadAudit', 'canReadLedger', 'canReadPhiAudit', 'canAccessAllLocations'] },
  { id: 'seed_role_patient', name: 'Patient', description: 'Portal only (through the portal API); no dashboard.', permissions: [] },
]

export type StaffSeed = {
  id: string; name: string; email: string; title: string; roleId: string; kind: 'staff' | 'auditor'; accessDays?: number
  locations: ('seed_loc_tpa' | 'seed_loc_stp')[]
  provider?: { id: string; abbreviation: string; type: 'dentist' | 'hygienist' | 'assistant'; npi?: string; colour: string; supervisionClass: string }
}

/** NPIs are Luhn-valid (80840 prefix) numbers from a fictional range; they are not real providers *(verify the test-number approach)*. */
export const STAFF: StaffSeed[] = [
  { id: 'seed_user_okafor', name: 'Dr. Maya Okafor', email: 'maya.okafor@bayviewdental.example', title: 'Owner dentist', roleId: 'seed_role_owner', kind: 'staff', locations: ['seed_loc_tpa', 'seed_loc_stp'], provider: { id: 'seed_prov_okafor', abbreviation: 'MOK', type: 'dentist', npi: '1999000015', colour: '#2563eb', supervisionClass: 'dentist' } },
  { id: 'seed_user_reyes', name: 'Dr. Daniel Reyes', email: 'daniel.reyes@bayviewdental.example', title: 'Associate dentist', roleId: 'seed_role_associate', kind: 'staff', locations: ['seed_loc_tpa'], provider: { id: 'seed_prov_reyes', abbreviation: 'DRE', type: 'dentist', npi: '1999000023', colour: '#7c3aed', supervisionClass: 'dentist' } },
  { id: 'seed_user_natarajan', name: 'Dr. Priya Natarajan', email: 'priya.natarajan@bayviewdental.example', title: 'Associate dentist', roleId: 'seed_role_associate', kind: 'staff', locations: ['seed_loc_stp'], provider: { id: 'seed_prov_natarajan', abbreviation: 'PNA', type: 'dentist', npi: '1999000031', colour: '#0891b2', supervisionClass: 'dentist' } },
  { id: 'seed_user_hale', name: 'Jenna Hale, RDH', email: 'jenna.hale@bayviewdental.example', title: 'Hygienist', roleId: 'seed_role_hygienist', kind: 'staff', locations: ['seed_loc_tpa'], provider: { id: 'seed_prov_hale', abbreviation: 'JHA', type: 'hygienist', npi: '1999000049', colour: '#059669', supervisionClass: 'rdh_general' } },
  { id: 'seed_user_brandt', name: 'Marcus Brandt, RDH', email: 'marcus.brandt@bayviewdental.example', title: 'Hygienist', roleId: 'seed_role_hygienist', kind: 'staff', locations: ['seed_loc_tpa'], provider: { id: 'seed_prov_brandt', abbreviation: 'MBR', type: 'hygienist', npi: '1999000056', colour: '#16a34a', supervisionClass: 'rdh_general' } },
  { id: 'seed_user_ortiz', name: 'Lucia Ortiz, RDH', email: 'lucia.ortiz@bayviewdental.example', title: 'Hygienist', roleId: 'seed_role_hygienist', kind: 'staff', locations: ['seed_loc_tpa', 'seed_loc_stp'], provider: { id: 'seed_prov_ortiz', abbreviation: 'LOR', type: 'hygienist', npi: '1999000064', colour: '#65a30d', supervisionClass: 'rdh_general' } },
  { id: 'seed_user_kim', name: 'Grace Kim, RDH', email: 'grace.kim@bayviewdental.example', title: 'Hygienist', roleId: 'seed_role_hygienist', kind: 'staff', locations: ['seed_loc_stp'], provider: { id: 'seed_prov_kim', abbreviation: 'GKI', type: 'hygienist', npi: '1999000072', colour: '#0d9488', supervisionClass: 'rdh_general' } },
  { id: 'seed_user_dupree', name: 'Tasha Dupree', email: 'tasha.dupree@bayviewdental.example', title: 'Dental assistant', roleId: 'seed_role_assistant', kind: 'staff', locations: ['seed_loc_tpa'] },
  { id: 'seed_user_novak', name: 'Eli Novak', email: 'eli.novak@bayviewdental.example', title: 'Dental assistant', roleId: 'seed_role_assistant', kind: 'staff', locations: ['seed_loc_tpa'] },
  { id: 'seed_user_mendes', name: 'Carla Mendes', email: 'carla.mendes@bayviewdental.example', title: 'Dental assistant', roleId: 'seed_role_assistant', kind: 'staff', locations: ['seed_loc_stp'] },
  { id: 'seed_user_baptiste', name: 'Rene Baptiste', email: 'rene.baptiste@bayviewdental.example', title: 'Dental assistant', roleId: 'seed_role_assistant', kind: 'staff', locations: ['seed_loc_stp'] },
  { id: 'seed_user_walsh', name: 'Kerry Walsh', email: 'kerry.walsh@bayviewdental.example', title: 'Front desk', roleId: 'seed_role_front_office', kind: 'staff', locations: ['seed_loc_tpa'] },
  { id: 'seed_user_ibrahim', name: 'Noor Ibrahim', email: 'noor.ibrahim@bayviewdental.example', title: 'Front desk', roleId: 'seed_role_front_office', kind: 'staff', locations: ['seed_loc_tpa'] },
  { id: 'seed_user_tran', name: 'Vivian Tran', email: 'vivian.tran@bayviewdental.example', title: 'Front desk', roleId: 'seed_role_front_office', kind: 'staff', locations: ['seed_loc_stp'] },
  { id: 'seed_user_foster', name: 'Dana Foster', email: 'dana.foster@bayviewdental.example', title: 'Insurance coordinator', roleId: 'seed_role_insurance', kind: 'staff', locations: ['seed_loc_tpa', 'seed_loc_stp'] },
  { id: 'seed_user_morales', name: 'Rosa Morales', email: 'rosa.morales@bayviewdental.example', title: 'Office manager', roleId: 'seed_role_office_manager', kind: 'staff', locations: ['seed_loc_tpa', 'seed_loc_stp'] },
  { id: 'seed_user_quinn', name: 'Avery Quinn', email: 'avery.quinn@bayviewdental.example', title: 'Treatment coordinator', roleId: 'seed_role_tc', kind: 'staff', locations: ['seed_loc_tpa'] },
  { id: 'seed_user_shah', name: 'Imran Shah', email: 'imran.shah@bayviewdental.example', title: 'Privacy officer', roleId: 'seed_role_privacy', kind: 'staff', locations: [] },
  { id: 'seed_user_lindqvist', name: 'M. Lindqvist', email: 'm.lindqvist@gulfcoastcpa.example', title: 'Bookkeeper, Gulf Coast CPA', roleId: 'seed_role_bookkeeper', kind: 'auditor', locations: [], accessDays: 30 },
]

export type PolicySeed = { action: string; description: string; requiredPermission: Permission; expiresAfterMinutes: number; thresholdMinor?: bigint }

/** Maker-checker actions (SCHEMA §18; I-G1, I-L5). Approvals expire after 24 hours by default (SM§0). */
export const APPROVAL_POLICIES: PolicySeed[] = [
  { action: 'practice.controls', description: 'Change practice-wide controls (AI autonomy, agent-owner separation, break-glass window, staff MFA).', requiredPermission: 'canApproveAutonomy', expiresAfterMinutes: 1440 },
  { action: 'refund.execute', description: 'Refund money to a patient or payer.', requiredPermission: 'canApproveRefunds', expiresAfterMinutes: 1440 },
  { action: 'adjustment.post', description: 'Post an adjustment above its type threshold, or any bad-debt write-off.', requiredPermission: 'canApproveAdjustments', expiresAfterMinutes: 1440, thresholdMinor: 10_000n },
  { action: 'period.reopen', description: 'Reopen a closed ledger period (creates a restatement record).', requiredPermission: 'canApprovePeriodReopen', expiresAfterMinutes: 1440 },
  { action: 'autonomy.activate', description: 'Activate an AI autonomy policy.', requiredPermission: 'canApproveAutonomy', expiresAfterMinutes: 1440 },
  { action: 'agent_grant.activate', description: 'Activate a tool grant for an AI agent.', requiredPermission: 'canApproveAgentGrants', expiresAfterMinutes: 1440 },
  { action: 'adapter.go_live', description: 'Switch an adapter to live mode (needs a verified installation, a test receipt and a BAA when it handles PHI).', requiredPermission: 'canApproveAdapters', expiresAfterMinutes: 1440 },
  { action: 'code_import.activate', description: 'Activate an imported code set (licence attestation on file).', requiredPermission: 'canApproveCodeImport', expiresAfterMinutes: 1440 },
  { action: 'fee_schedule.publish', description: 'Publish a fee schedule version.', requiredPermission: 'canApproveFeePublish', expiresAfterMinutes: 1440 },
  { action: 'patient.merge', description: 'Merge two patient records (revertible within the merge window).', requiredPermission: 'canApprovePatientMerge', expiresAfterMinutes: 1440 },
  { action: 'import.apply', description: 'Apply an import batch from another system.', requiredPermission: 'canApproveImports', expiresAfterMinutes: 1440 },
  { action: 'retention.dispose', description: 'Dispose of records past retention (no legal hold).', requiredPermission: 'canApproveRetention', expiresAfterMinutes: 1440 },
  { action: 'clinical.correct', description: 'Correct a completed, posted procedure.', requiredPermission: 'canApproveClinicalCorrections', expiresAfterMinutes: 1440 },
  { action: 'claim.void_paid', description: 'Void a claim that has been paid.', requiredPermission: 'canApproveAdjustments', expiresAfterMinutes: 1440 },
  { action: 'role.assign_approval', description: 'Give a person a role that can approve.', requiredPermission: 'canManageRoles', expiresAfterMinutes: 1440 },
]
