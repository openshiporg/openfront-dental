import { randomUUID } from 'node:crypto'
import { keystoneContext } from '../../features/keystone/context'
import { useMcpScopeGuard as mcpScopeGuardPlugin } from '../../features/keystone/mcp-oauth/guard'
import { phiReadAuditPlugin } from '../../features/keystone/security/phiReadAudit'
import { authRateLimitPlugin } from '../../features/keystone/security/rateLimit'
import { queryLimitsPlugin } from '../../features/keystone/security/queryLimits'
import { createYoga } from 'graphql-yoga'
// @ts-ignore
import processRequest from 'graphql-upload/processRequest.js'
import { type NextApiRequest, type NextApiResponse } from 'next'

export const config = {
  api: {
    bodyParser: false,
  },
}

const PURPOSES = new Set(['treatment', 'payment', 'operations', 'patient_request', 'break_glass'])

const yoga = createYoga({
  graphqlEndpoint: '/api/graphql',
  schema: keystoneContext.graphql.schema,
  context: async ({ req, res }: { req: any; res: any }) => {
    const context: any = await keystoneContext.withRequest(req, res)
    // HIPAA purpose of use for the PHI read audit; staff screens send it, the default is operations.
    const purpose = String(req.headers['x-openfront-purpose'] || '')
    context.openfrontPurpose = PURPOSES.has(purpose) ? purpose : 'operations'
    context.openfrontCorrelationReference = String(req.headers['x-request-id'] || randomUUID()).slice(0, 100)
    return context
  },
  multipart: false,
  graphiql: process.env.NODE_ENV !== 'production',
  maskedErrors: process.env.NODE_ENV === 'production',
  plugins: [
    // Bounded query depth and size (list sizes are bounded per list by graphql.maxTake).
    queryLimitsPlugin(),
    // Sign-in, MFA, reset and first-user mutations are counted per client and per account.
    authRateLimitPlugin({ prisma: () => keystoneContext.prisma as any, secret: () => process.env.SESSION_SECRET || 'local-development-session-secret-change-me-now' }),
    // MCP OAuth scopes only narrow: read-only tokens can't mutate, no token can manage credentials.
    mcpScopeGuardPlugin(),
    // Every selection of a tiered field writes a PhiReadAudit row; a failed write withholds the data.
    phiReadAuditPlugin({ schema: keystoneContext.graphql.schema, prisma: () => keystoneContext.prisma, secret: () => process.env.SESSION_SECRET || 'local-development-session-secret-change-me-now' }),
  ],
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const contentType = req.headers['content-type']
  if (contentType?.startsWith('multipart/form-data')) {
    req.body = await processRequest(req, res)
  }
  return yoga(req, res)
}
