// Role permissions (SCHEMA §1.5). Operate and approve permissions come in pairs so one person never
// needs both halves of a control; the separation-of-duties check still blocks self-approval when a
// user happens to hold both.
// adapted from openfront-hedge-fund@48199d9 features/keystone/access.ts
export const permissionNames = [
  // Starter and fleet-standard
  'canSeeOtherPeople', 'canEditOtherPeople', 'canManagePeople', 'canManageRoles', 'canAccessDashboard',
  'canManageOnboarding', 'canManagePayments', 'canIssueRefunds', 'canReadAudit',
  // Practice, locations and adapters
  'canManagePractice', 'canManageAdapters', 'canApproveAdapters', 'canAccessAllLocations',
  // Patients
  'canManagePatients', 'canApprovePatientMerge', 'canReadDemographics',
  // Scheduling
  'canManageSchedule', 'canOverrideSchedule', 'canOverrideTemplate', 'canOverrideLabGate', 'canReadSchedule',
  // Clinical
  'canChart', 'canCompleteProcedures', 'canSignClinicalNotes', 'canPrescribe', 'canManagePerio', 'canManageLabCases',
  'canApproveClinicalCorrections', 'canReadClinical', 'canReadSensitive',
  // Treatment
  'canManageTreatmentPlans', 'canPresentPlans',
  // Codes and fees
  'canManageFees', 'canImportCodes', 'canApproveCodeImport', 'canApproveFeePublish',
  // Insurance
  'canManageInsurance', 'canVerifyBenefits', 'canReadInsurance',
  // Claims
  'canManageClaims', 'canSubmitClaims', 'canOverrideScrub', 'canPostRemittances',
  // Ledger
  'canTakePayments', 'canAdjust', 'canCloseDay', 'canClosePeriod', 'canApproveAdjustments', 'canApproveRefunds',
  'canApprovePeriodReopen', 'canReadLedger',
  // Memberships
  'canManageMemberships',
  // Communications
  'canMessagePatients', 'canManageTemplates', 'canReplyReviews',
  // AI action layer
  'canManageAgents', 'canDecideProposals', 'canDecideClaimProposals', 'canDecideClinicalProposals',
  'canDecideFinancialProposals', 'canApproveAgentGrants', 'canApproveAutonomy', 'canReadSignals',
  // Privacy and compliance. canBreakGlass and canBreakGlassRecords are never on a default role.
  'canManageCompliance', 'canBreakGlass', 'canBreakGlassRecords', 'canReviewPrivacy', 'canApproveRetention', 'canReadPhiAudit',
  // Data
  'canImportData', 'canExportData', 'canApproveImports',
] as const

export type Permission = typeof permissionNames[number]

/** Never granted by a default or first-user role: each use is an audited emergency. */
export const NEVER_DEFAULT: readonly Permission[] = ['canBreakGlass', 'canBreakGlassRecords']

/** Permissions that let a user decide someone else's request. Assigning a role holding one of these is maker-checker. */
export const approvalPermissions = permissionNames.filter(name => name.startsWith('canApprove') || name === 'canBreakGlass' || name === 'canBreakGlassRecords') as Permission[]

export type SessionAssignment = { startsOn?: string | null; endsOn?: string | null; location: { id: string } | null; role: ({ id: string } & Partial<Record<Permission, boolean>>) | null }

export type Session = {
  itemId: string
  listKey: string
  data: {
    name: string
    email?: string
    kind?: string | null
    accessExpiresAt?: string | null
    mfaEnrolled?: boolean | null
    role: ({ id: string; name: string } & Record<Permission, boolean>) | null
    assignments?: SessionAssignment[] | null
  }
  /** Set by the session strategy: the second factor was checked for this session. */
  mfaVerified?: boolean
  /** Set when an MCP OAuth bearer token resolved the session. */
  mcp?: unknown
}

type AccessArgs = { session?: Session | null }

/** Signed in, a staff-type account, and not past a time-boxed access window (bookkeepers, auditors). */
export const isSignedIn = ({ session }: AccessArgs) => {
  if (!session) return false
  const expires = session.data?.accessExpiresAt
  return !expires || Date.parse(expires) > Date.now()
}

export const hasPermission = (session: Session | null | undefined, permission: Permission) =>
  isSignedIn({ session }) && session?.data.role?.[permission] === true

export const permissions = Object.fromEntries(
  permissionNames.map(name => [name, ({ session }: AccessArgs) => hasPermission(session, name)])
) as Record<Permission, (args: AccessArgs) => boolean>

/** Any of the given permissions. */
export const anyOf = (...names: Permission[]) => ({ session }: AccessArgs) => names.some(name => hasPermission(session, name))

/** Only server code (through context.sudo()) may perform the operation. */
export const sys = () => false

/** Today as a UTC calendar day string (assignment windows are whole days). */
const today = () => new Date().toISOString().slice(0, 10)

/**
 * Location ids the user may work in today (SCHEMA §1.6, the `loc` filter). `null` means every
 * location (canAccessAllLocations: owner, organisation admin, central billing, privacy officer).
 */
export function sessionLocationIds(session: Session | null | undefined): string[] | null {
  if (!isSignedIn({ session })) return []
  if (session!.data.role?.canAccessAllLocations) return null
  const day = today()
  return (session!.data.assignments ?? [])
    .filter(a => a.location?.id && (!a.startsOn || a.startsOn <= day) && (!a.endsOn || a.endsOn >= day))
    .map(a => a.location!.id)
}

export const rules = {
  canReadPeople: ({ session }: AccessArgs) =>
    !isSignedIn({ session }) ? false : session!.data.role?.canSeeOtherPeople || session!.data.role?.canManagePeople ? true : { id: { equals: session!.itemId } },
  canUpdatePeople: ({ session }: AccessArgs) =>
    !isSignedIn({ session }) ? false : session!.data.role?.canEditOtherPeople || session!.data.role?.canManagePeople ? true : { id: { equals: session!.itemId } },
  /** Row filter for lists with a `location` relationship. */
  atMyLocations: (field = 'location') => ({ session }: AccessArgs) => {
    const ids = sessionLocationIds(session)
    if (ids === null) return true
    return { [field]: { id: { in: ids } } }
  },
}
