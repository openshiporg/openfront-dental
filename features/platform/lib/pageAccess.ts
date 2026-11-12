/**
 * Platform screens that need a permission the role may lack (R3-5, P6 r1 B5). The sidebar shows the link and the page renders only
 * when the role holds one of them; otherwise the page is a 404. Each set is the screen's own work (the commands it runs), so a role
 * that could only read part of the list does not get a page of forms it cannot use.
 * Plain module: no 'use server' / 'use client', no @/ imports.
 */
import type { Permission } from '../../keystone/access'

export const PLATFORM_PAGE_PERMISSIONS = {
  audit: ['canReadAudit'],
  labs: ['canManageLabCases'],
  prescriptions: ['canPrescribe'],
  reviews: ['canReplyReviews'],
  compliance: ['canManageCompliance', 'canReviewPrivacy', 'canApproveRetention'],
  data: ['canImportData', 'canExportData', 'canApproveImports'],
  privacy: ['canReviewPrivacy', 'canReadPhiAudit'],
} as const satisfies Record<string, readonly Permission[]>

export type GatedPage = keyof typeof PLATFORM_PAGE_PERMISSIONS

/** Every permission a gated page checks, for the signed-in user query. */
export const PAGE_GATE_PERMISSIONS = [...new Set(Object.values(PLATFORM_PAGE_PERMISSIONS).flat())] as Permission[]
