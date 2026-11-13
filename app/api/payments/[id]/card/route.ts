import type { IncomingMessage } from 'node:http'
import { keystoneContext } from '@/features/keystone/context'
import { runInTransaction } from '@/features/keystone/lib/unitOfWork'
import { systemActor } from '@/features/keystone/lib/actor'
import { failPayment, settlePayment } from '@/features/keystone/lib/payments'
import { retrieveIntent } from '@/features/integrations/payments/stripe'

export const dynamic = 'force-dynamic'

/*
 * A card the front desk is taking in the real card form. GET gives the form the intent's client secret; POST, after the form confirmed
 * the card, asks the processor and settles the payment once (the same settlePayment as every other tender, so a repeat changes nothing).
 * Staff only: the signed-in session must be allowed to take payments, and the payment must be one this person can see.
 */
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

async function authorised(request: Request, id: string) {
  const context = await keystoneContext.withRequest({ headers: { cookie: request.headers.get('cookie') || '' }, method: 'GET', url: `/api/payments/${id}/card` } as IncomingMessage)
  if (!context.session?.itemId) return null
  const role = (context.session as any)?.data?.role
  if (!role?.canTakePayments) return null
  const row = (await context.query.Payment.findOne({ where: { id }, query: 'id ref status tender amountMinor providerIntentId source' }).catch(() => null)) as any
  if (!row || row.tender !== 'card' || row.source !== 'front_desk') return null
  return row as { id: string; ref: string; status: string; amountMinor: string; providerIntentId: string }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const pay = await authorised(request, id)
  if (!pay) return json({ error: 'Payment not found.' }, 404)
  if (pay.status !== 'requires_action' || !pay.providerIntentId) return json({ error: 'This payment is not waiting for a card.' }, 409)
  const intent = await retrieveIntent(pay.providerIntentId)
  if (!intent?.clientSecret) return json({ error: 'The card form could not start. Nothing was charged.' }, 502)
  return json({ clientSecret: intent.clientSecret, ref: pay.ref, amountMinor: String(pay.amountMinor) })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const pay = await authorised(request, id)
  if (!pay) return json({ error: 'Payment not found.' }, 404)
  if (['succeeded', 'partially_refunded', 'refunded'].includes(pay.status)) return json({ status: 'paid', ref: pay.ref })
  if (pay.status === 'failed') return json({ status: 'failed', message: 'The card was declined.' })
  if (!pay.providerIntentId) return json({ status: 'pending' })
  const intent = await retrieveIntent(pay.providerIntentId)
  if (!intent) return json({ status: 'pending' })
  const actor = systemActor('payments')
  if (intent.status === 'succeeded') {
    await runInTransaction(keystoneContext.prisma as never, uow => settlePayment(uow, actor, pay.id, { providerIntentId: pay.providerIntentId }))
    return json({ status: 'paid', ref: pay.ref })
  }
  if (intent.status === 'requires_payment_method') {
    await runInTransaction(keystoneContext.prisma as never, uow => failPayment(uow, actor, pay.id, 'The card was declined.', 'failed'))
    return json({ status: 'failed', message: 'The card was declined.' })
  }
  return json({ status: 'pending' })
}
