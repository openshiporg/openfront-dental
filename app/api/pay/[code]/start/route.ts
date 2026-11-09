import { payLinkGate, payLinkError } from '@/features/keystone/security/payLinkGate'
import { startPayLinkPayment } from '@/features/keystone/lib/payLink'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  try {
    const db = await payLinkGate(request, 'pay')
    const body = (await request.json().catch(() => ({}))) as { amount?: string }
    const started = await startPayLinkPayment(db as never, code, typeof body.amount === 'string' ? body.amount : null)
    return Response.json(started, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return payLinkError(error) }
}
