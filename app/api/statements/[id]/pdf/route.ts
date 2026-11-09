import type { IncomingMessage } from 'node:http'
import { keystoneContext } from '@/features/keystone/context'
import { renderStatementPdf, servePdf, statementForPdf } from '@/features/keystone/lib/statementPdf'

export const dynamic = 'force-dynamic'

/** The statement PDF for signed-in staff, read through the session (the statement's location scope applies). Re-rendered from the frozen snapshot and hash-checked before it is served. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const context = await keystoneContext.withRequest({ headers: { cookie: request.headers.get('cookie') || '' }, method: 'GET', url: `/api/statements/${id}/pdf` } as IncomingMessage)
  if (!context.session?.itemId) return new Response('Sign in to view statements.', { status: 401 })
  const row = (await context.query.Statement.findOne({ where: { id }, query: 'ref cycleDate dueDate amountDueMinor payLinkCode snapshot pdfSha256' }).catch(() => null)) as any
  if (!row?.snapshot) return new Response('Statement not found.', { status: 404 })
  return servePdf(renderStatementPdf(statementForPdf(row)), row.pdfSha256, row.ref)
}
