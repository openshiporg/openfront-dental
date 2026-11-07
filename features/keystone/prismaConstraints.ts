/**
 * Compound uniques Keystone can't express on a field (SCHEMA G9; openfront-convenience pattern).
 * Partial uniques, CHECK constraints and triggers live in raw-SQL migrations instead.
 */
export const COMPOUND_UNIQUES: Record<string, string[]> = {
  StaffAssignment: ['@@index([userId, locationId], map: "StaffAssignment_user_location_idx")'],
  AgentToolGrant: ['@@index([agentId, scope], map: "AgentToolGrant_agent_scope_idx")'],
  // Phase 1 (SCHEMA §2–§4, §21 hot paths)
  Operatory: ['@@unique([locationId, code], map: "Operatory_location_code_key")'],
  PatientIdentifier: ['@@unique([system, value], map: "PatientIdentifier_system_value_key")'],
  Patient: ['@@index([lastName, firstName, dateOfBirth], map: "Patient_name_dob_idx")'],
  Appointment: [
    '@@index([locationId, localDate, status], map: "Appointment_location_day_status_idx")',
    '@@index([operatoryId, startsAt], map: "Appointment_operatory_start_idx")',
  ],
  AppointmentSegment: ['@@index([providerId, startsAt], map: "AppointmentSegment_provider_start_idx")'],
  BookingHold: ['@@index([status, expiresAt], map: "BookingHold_status_expiry_idx")'],
  ConfirmationAttempt: ['@@index([status, scheduledFor], map: "ConfirmationAttempt_status_due_idx")'],
  Message: ['@@index([conversationId, createdAt], map: "Message_conversation_created_idx")'],
}

export function addDatabaseConstraints(schema: string): string {
  for (const [modelName, directives] of Object.entries(COMPOUND_UNIQUES)) {
    const pattern = new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`)
    const model = schema.match(pattern)?.[0]
    if (!model) throw new Error(`Generated Prisma schema is missing ${modelName}`)
    const missing = directives.filter(directive => !model.includes(directive))
    if (!missing.length) continue
    schema = schema.replace(model, model.replace(/\n\}$/, `\n${missing.map(directive => `  ${directive}`).join('\n')}\n}`))
  }
  return schema
}
