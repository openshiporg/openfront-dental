import { payLinkGate, payLinkError } from '@/features/keystone/security/payLinkGate'
import { confirmPayLinkPayment } from '@/features/keystone/lib/payLink'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  try {
    const db = await payLinkGate(request, 'pay')
    const body = (await request.json().catch(() => ({}))) as { ref?: string }
    return Response.json(await confirmPayLinkPayment(db as never, code, String(body.ref ?? '')), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return payLinkError(error) }
}
