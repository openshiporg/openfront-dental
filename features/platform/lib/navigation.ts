import {
  Activity, BookOpenCheck, CalendarCheck2, CalendarClock, CalendarDays, ClipboardCheck, FileSignature, Inbox, Landmark, BadgeCheck, ListChecks, Receipt, KeyRound, LucideIcon, MapPin, Settings, ShieldCheck, Users,
} from 'lucide-react'

export interface PlatformNavItem {
  title: string
  href: string
  color: string
  description: string
  icon: LucideIcon
  group?: string
}

export interface PlatformNavGroup {
  id: string
  title: string
  icon: LucideIcon
  items: PlatformNavItem[]
}

/**
 * Staff dashboard screens (BUILD-PLAN §2). Each route is a thin wrapper in app/dashboard/(admin)/platform
 * over a feature slice in features/platform/<slice>. A screen appears in the menu once its phase ships.
 */
export const platformNavItems: PlatformNavItem[] = [
  { title: 'Schedule', href: '/platform/schedule', color: 'blue', description: 'Day and week by operatory and provider, production against goal.', icon: CalendarDays, group: 'standalone' },
  { title: 'Patients', href: '/platform/patients', color: 'emerald', description: 'Patients, families, guarantors and alerts.', icon: Users, group: 'standalone' },
  { title: 'Approvals', href: '/platform/approvals', color: 'amber', description: 'Requests waiting for a second person.', icon: ClipboardCheck, group: 'standalone' },

  { title: 'Forms & consents', href: '/platform/forms', color: 'teal', description: 'Send forms, record signatures, withdraw consents.', icon: FileSignature, group: 'clinical' },
  { title: 'Procedure codes', href: '/platform/codes', color: 'sky', description: 'Practice codes, licensed code imports and approvals.', icon: ListChecks, group: 'clinical' },
  { title: 'Fee schedules', href: '/platform/fees', color: 'lime', description: 'Fee versions: draft, second-person publish.', icon: Receipt, group: 'clinical' },

  { title: 'Claims', href: '/platform/claims', color: 'teal', description: 'Build, check and send claims; follow them to payment.', icon: Receipt, group: 'billing' },
  { title: 'Patient payments', href: '/platform/payments', color: 'emerald', description: 'Refunds, statements and credits on patient accounts.', icon: Landmark, group: 'billing' },
  { title: 'Memberships', href: '/platform/memberships', color: 'teal', description: 'In-house plans, members and the licence the state asks for.', icon: BadgeCheck, group: 'billing' },
  { title: 'Day and month close', href: '/platform/close', color: 'amber', description: 'Close the day, bank the cash, close and reopen the month.', icon: ClipboardCheck, group: 'billing' },
  { title: 'Insurance payments', href: '/platform/remittances', color: 'emerald', description: 'Payments received, lines to match, denied lines to work.', icon: Landmark, group: 'billing' },

  { title: 'Insurance plans', href: '/platform/insurance', color: 'sky', description: 'Payers, plans, fee schedules and coordination rules.', icon: Landmark, group: 'front-desk' },
  { title: 'Verification', href: '/platform/verifications', color: 'teal', description: 'Benefit checks, failed checks and questions still to ask.', icon: BadgeCheck, group: 'front-desk' },
  { title: 'ASAP list', href: '/platform/schedule/asap', color: 'cyan', description: 'Patients who want an earlier appointment.', icon: CalendarClock, group: 'front-desk' },
  { title: 'Confirmations', href: '/platform/schedule/confirmations', color: 'green', description: 'Tomorrow and the next two days: who has confirmed.', icon: CalendarCheck2, group: 'front-desk' },
  { title: 'Booking requests', href: '/platform/schedule/booking-requests', color: 'orange', description: 'Online booking requests waiting for review.', icon: Inbox, group: 'front-desk' },

  { title: 'Locations & operatories', href: '/platform/settings/locations', color: 'slate', description: 'Offices, chairs, appointment types and schedule templates.', icon: MapPin, group: 'practice' },
  { title: 'Audit log', href: '/platform/audit', color: 'slate', description: 'Hash-chained audit events and chain verification.', icon: BookOpenCheck, group: 'practice' },
  { title: 'Privacy', href: '/platform/privacy', color: 'rose', description: 'PHI access log and break-glass reviews.', icon: ShieldCheck, group: 'practice' },
  { title: 'Operations', href: '/platform/operations', color: 'slate', description: 'Outbox, jobs and leases.', icon: Activity, group: 'practice' },
  { title: 'Sign-in security', href: '/platform/settings/security', color: 'slate', description: 'Two-step verification and recovery codes.', icon: KeyRound, group: 'practice' },
  { title: 'Practice settings', href: '/platform/settings', color: 'slate', description: 'Practice profile, jurisdiction packs and approval policies.', icon: Settings, group: 'practice' },
]

/** Routes that exist in this build. Others stay out of the menu until their phase ships. */
export const SHIPPED_ROUTES = new Set<string>([
  '/platform/approvals', '/platform/audit', '/platform/settings/security',
  // Phase 1
  '/platform/schedule', '/platform/patients', '/platform/schedule/asap', '/platform/schedule/confirmations', '/platform/schedule/booking-requests', '/platform/settings/locations',
  // Phase 2
  '/platform/forms', '/platform/codes', '/platform/fees',
  // Phase 3
  '/platform/insurance', '/platform/verifications',
  // Phase 4
  '/platform/claims', '/platform/remittances', '/platform/payments', '/platform/memberships', '/platform/close',
])

const shipped = () => platformNavItems.filter(item => SHIPPED_ROUTES.has(item.href))

export const platformStandaloneItems = shipped().filter(item => item.group === 'standalone')

export const platformNavGroups: PlatformNavGroup[] = [
  { id: 'clinical', title: 'Clinical', icon: ListChecks, items: shipped().filter(i => i.group === 'clinical') },
  { id: 'billing', title: 'Billing', icon: Receipt, items: shipped().filter(i => i.group === 'billing') },
  { id: 'front-desk', title: 'Front desk', icon: CalendarCheck2, items: shipped().filter(i => i.group === 'front-desk') },
  { id: 'practice', title: 'Practice', icon: Settings, items: shipped().filter(i => i.group === 'practice') },
]

export function getPlatformNavItemsWithBasePath(basePath: string) {
  return shipped().map(item => ({ ...item, href: `${basePath}${item.href}` }))
}
