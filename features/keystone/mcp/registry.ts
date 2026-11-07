/**
 * Openfront Dental MCP domain tools (INTEGRATIONS §6). The generic createData/updateData/
 * deleteData tools are gone: an agent can only read through the list access rules of the user it
 * acts for, or call a named domain command. Each command is one GraphQL mutation that checks
 * permission and agent grants on the server, takes an idempotency key, and is audited.
 * Tool calls never approve anything; approvals are human-only.
 */

export type DomainTool = {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, object>; required: string[]; additionalProperties?: boolean }
  /** GraphQL document; variables come from the validated arguments. */
  document: string
  /** Field of the GraphQL result to return. */
  field: string
  writes: boolean
}

const idempotencyKey = { type: 'string', minLength: 8, maxLength: 200, pattern: '^[A-Za-z0-9._:-]+$', description: 'Unique per intent. Reusing it returns the first result instead of acting twice.' }

export const DOMAIN_TOOLS: DomainTool[] = [
  {
    name: 'verifyAuditChain',
    description: 'Recompute the hash-chained audit log and report whether it is intact (and where it breaks if not). Needs canReadAudit.',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    document: 'query VerifyAuditChain { verifyAuditChain }',
    field: 'verifyAuditChain',
    writes: false,
  },
  {
    name: 'loadPracticeSetup',
    description: 'Load the Bayview Family Dental sample practice (synthetic data): locations, jurisdiction packs, roles, staff, providers and approval policies. Idempotent. Needs canManageOnboarding.',
    inputSchema: { type: 'object', properties: { idempotencyKey }, required: ['idempotencyKey'], additionalProperties: false },
    document: 'mutation LoadPracticeSetup($idempotencyKey: String!) { loadPracticeSetup(idempotencyKey: $idempotencyKey) }',
    field: 'loadPracticeSetup',
    writes: true,
  },
]

export function registerDomainTools(tools: DomainTool[]) {
  for (const tool of tools) {
    if (DOMAIN_TOOLS.some(existing => existing.name === tool.name)) throw new Error(`Duplicate MCP tool ${tool.name}`)
    DOMAIN_TOOLS.push(tool)
  }
}

/** Minimal JSON-schema check for the flat argument objects our tools take. */
export function validateArguments(tool: DomainTool, args: Record<string, unknown>) {
  const problems: string[] = []
  const properties = tool.inputSchema.properties as Record<string, { type?: string; enum?: unknown[]; minLength?: number; maxLength?: number; pattern?: string }>
  for (const key of tool.inputSchema.required) if (args[key] === undefined || args[key] === null || args[key] === '') problems.push(`${key} is required`)
  for (const [key, value] of Object.entries(args)) {
    const spec = properties[key]
    if (!spec) {
      if (tool.inputSchema.additionalProperties === false) problems.push(`${key} is not an argument of ${tool.name}`)
      continue
    }
    if (spec.type === 'string' && typeof value !== 'string') problems.push(`${key} must be a string`)
    if (spec.type === 'integer' && !Number.isSafeInteger(value)) problems.push(`${key} must be an integer`)
    if (spec.type === 'boolean' && typeof value !== 'boolean') problems.push(`${key} must be true or false`)
    if (spec.enum && !spec.enum.includes(value)) problems.push(`${key} must be one of ${spec.enum.join(', ')}`)
    if (typeof value === 'string') {
      if (spec.minLength && value.length < spec.minLength) problems.push(`${key} is too short`)
      if (spec.maxLength && value.length > spec.maxLength) problems.push(`${key} is too long`)
      if (spec.pattern && !new RegExp(spec.pattern).test(value)) problems.push(`${key} has invalid characters`)
    }
  }
  if (problems.length) throw new Error(`Invalid arguments: ${problems.join('; ')}`)
}

export async function runDomainTool(tool: DomainTool, args: Record<string, unknown>, target: { graphqlEndpoint: string; auth: Record<string, string> }) {
  validateArguments(tool, args)
  const response = await fetch(target.graphqlEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...target.auth },
    body: JSON.stringify({ query: tool.document, variables: args }),
  })
  const result = await response.json()
  if (result.errors?.length) {
    return { ok: false, errors: result.errors.map((e: { message?: string; extensions?: { code?: string } }) => ({ message: e.message, code: e.extensions?.code })) }
  }
  return { ok: true, result: result.data?.[tool.field] ?? null }
}
