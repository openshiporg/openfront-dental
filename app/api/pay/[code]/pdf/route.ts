import { payLinkGate } from '@/features/keystone/security/payLinkGate'
import { payLinkStatement } from '@/features/keystone/lib/payLink'
import { renderStatementPdf, servePdf, statementForPdf } from '@/features/keystone/lib/statementPdf'

export const dynamic = 'force-dynamic'

/** The statement copy for the holder of a live pay link. Unknown, expired and held codes all get the same 404. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  try {
    const db = await payLinkGate(request, 'pdf')
    const row = await payLinkStatement(db as never, code)
    return servePdf(renderStatementPdf(statementForPdf(row)), row.pdfSha256, row.ref)
  } catch (error) {
    const status = (error as { code?: string })?.code === 'RATE_LIMITED' ? 429 : 404
    return new Response(status === 429 ? 'Too many requests. Try again later.' : 'This link is not available.', { status, headers: { 'Cache-Control': 'no-store' } })
  }
}
