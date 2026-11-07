/**
 * Compound uniques Keystone can't express on a field (SCHEMA G9; openfront-convenience pattern).
 * Partial uniques, CHECK constraints and triggers live in raw-SQL migrations instead.
 */
export const COMPOUND_UNIQUES: Record<string, string[]> = {
  StaffAssignment: ['@@index([userId, locationId], map: "StaffAssignment_user_location_idx")'],
  AgentToolGrant: ['@@index([agentId, scope], map: "AgentToolGrant_agent_scope_idx")'],
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
