import { keystoneContext } from '../context'
import { DomainError, Codes } from '../lib/errors'
import { enforcePublicLimit } from './publicRateLimit'

/** Every pay-link request is counted per client and for the whole surface before the code is even looked at, so codes cannot be tried quickly. */
export async function payLinkGate(request: Request, scope: 'view' | 'pay' | 'pdf') {
  const req = { headers: Object.fromEntries(request.headers), socket: undefined }
  await enforcePublicLimit(keystoneContext.prisma, { scope: `paylink:${scope}`, req, limits: scope === 'pay' ? { perClientPerHour: 20, perContactPerDay: 5, globalPerMinute: 60 } : { perClientPerHour: 60, perContactPerDay: 5, globalPerMinute: 240 } })
  return keystoneContext.prisma
}

export const payLinkError = (error: unknown) => {
  if (error instanceof DomainError) {
    const status = error.code === Codes.NOT_FOUND ? 404 : error.code === Codes.RATE_LIMITED ? 429 : error.code === Codes.INVALID_INPUT || error.code === Codes.GUARD_FAILED ? 422 : 400
    return Response.json({ error: error.message }, { status, headers: { 'Cache-Control': 'no-store' } })
  }
  return Response.json({ error: 'Something went wrong. Nothing was charged. Please call the front desk.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
}
