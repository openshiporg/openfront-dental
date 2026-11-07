'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

/**
 * The only custom operations the dashboard screens can call. Each takes an idempotency key that the
 * client makes once per intent and reuses on retry, so a lost response never acts twice.
 */
const OPS: Record<string, Record<string, string>> = {
  decideApprovalRequest: { requestId: 'ID!', decision: 'String!', reason: 'String', expectedVersion: 'Int!' },
  cancelApprovalRequest: { requestId: 'ID!', expectedVersion: 'Int!', reason: 'String' },
  requestPracticeControls: { changes: 'JSON!', reason: 'String!' },
  // Phase 1: patients, scheduling and portal administration (staff only; the public and portal
  // APIs are called by the practice's own front end, never through this allowlist).
  registerPatient: { data: 'JSON!', acknowledgeDuplicates: 'Boolean' },
  updatePatientDemographics: { patientId: 'ID!', expectedVersion: 'Int!', changes: 'JSON!', reason: 'String' },
  addContactPoint: { patientId: 'ID!', kind: 'String!', value: 'String!', isPrimary: 'Boolean' },
  deactivateContactPoint: { contactPointId: 'ID!', reason: 'String!' },
  recordConsent: { contactPointId: 'ID!', channel: 'String!', purpose: 'String!', granted: 'Boolean!', source: 'String', evidence: 'JSON', reason: 'String' },
  addPatientAlert: { patientId: 'ID!', kind: 'String!', severity: 'String!', text: 'String!' },
  endPatientAlert: { alertId: 'ID!', reason: 'String!' },
  linkGuarantor: { patientId: 'ID!', guarantorPatientId: 'ID', personName: 'JSON', relationship: 'String!' },
  setPatientStatus: { patientId: 'ID!', status: 'String!', expectedVersion: 'Int!', dateOfDeath: 'String', reason: 'String!' },
  proposeMerge: { survivorId: 'ID!', mergedId: 'ID!', reason: 'String!' },
  revertMerge: { mergeCaseId: 'ID!', expectedVersion: 'Int!', reason: 'String!' },
  holdSlot: { locationId: 'ID!', operatoryId: 'ID!', typeId: 'ID!', startsAt: 'String!', providerId: 'ID', patientId: 'ID' },
  releaseHold: { holdId: 'ID!' },
  bookAppointment: { locationId: 'ID!', operatoryId: 'ID!', typeId: 'ID!', startsAt: 'String!', providerId: 'ID', patientId: 'ID!', holdId: 'ID', note: 'String', overrideTemplate: 'Boolean', overrideProviderClash: 'Boolean', overrideReason: 'String' },
  confirmAppointment: { appointmentId: 'ID!', expectedVersion: 'Int!', method: 'String!' },
  markArrived: { appointmentId: 'ID!', expectedVersion: 'Int!', overrideLabGate: 'Boolean', reason: 'String' },
  seatPatient: { appointmentId: 'ID!', expectedVersion: 'Int!', acknowledgeAlerts: 'Boolean' },
  markReadyForCheckout: { appointmentId: 'ID!', expectedVersion: 'Int!', reason: 'String' },
  completeAppointment: { appointmentId: 'ID!', expectedVersion: 'Int!' },
  cancelAppointment: { appointmentId: 'ID!', expectedVersion: 'Int!', reason: 'String!' },
  markBroken: { appointmentId: 'ID!', expectedVersion: 'Int!', kind: 'String!', reason: 'String' },
  rescheduleAppointment: { appointmentId: 'ID!', expectedVersion: 'Int!', locationId: 'ID!', operatoryId: 'ID!', typeId: 'ID!', startsAt: 'String!', providerId: 'ID', holdId: 'ID', overrideTemplate: 'Boolean', overrideProviderClash: 'Boolean', overrideReason: 'String', reason: 'String' },
  addAsapEntry: { patientId: 'ID!', locationId: 'ID!', appointmentTypeId: 'ID', providerId: 'ID', preferredWindows: 'JSON', earliestDate: 'String', note: 'String', priority: 'Int' },
  closeAsapEntry: { asapEntryId: 'ID!', status: 'String!', expectedVersion: 'Int!', reason: 'String' },
  publishScheduleTemplate: { templateId: 'ID!', expectedVersion: 'Int!' },
  grantPortalAccess: { patientId: 'ID!', email: 'String!', relationship: 'String!', capabilities: '[String!]', expiresAt: 'String', validUntilMajority: 'Boolean' },
  revokePortalScope: { portalScopeId: 'ID!', reason: 'String!' },
  reviewBookingRequest: { requestId: 'ID!', decision: 'String!', expectedVersion: 'Int!', existingPatientId: 'ID', note: 'String' },
  suspendPortalAccount: { portalAccountId: 'ID!', reason: 'String!' },
};

const KEY = /^[A-Za-z0-9._:-]{8,200}$/;

export async function runCommand(op: string, variables: Record<string, unknown>, idempotencyKey: string, paths: string[] = []) {
  const spec = OPS[op];
  if (!spec) return { ok: false as const, error: 'Unknown action' };
  if (!KEY.test(idempotencyKey)) return { ok: false as const, error: 'Missing request key. Reload the page and try again.' };
  const keys = Object.keys(variables).filter((k) => k in spec && variables[k] !== undefined && variables[k] !== '');
  const decl = [...keys.map((k) => `$${k}: ${spec[k]}`), '$idempotencyKey: String!'];
  const args = [...keys.map((k) => `${k}: $${k}`), 'idempotencyKey: $idempotencyKey'];
  const vars: Record<string, unknown> = { ...Object.fromEntries(keys.map((k) => [k, variables[k]])), idempotencyKey };
  const res = await keystoneClient(`mutation Run(${decl.join(', ')}) { ${op}(${args.join(', ')}) }`, vars);
  if (!res.success) return { ok: false as const, error: res.error || 'Action failed' };
  for (const p of paths) revalidatePath(p);
  return { ok: true as const, data: (res.data as Record<string, unknown>)?.[op] };
}
