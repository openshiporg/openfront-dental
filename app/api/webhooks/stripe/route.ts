import { NextResponse } from 'next/server'
import { keystoneContext } from '@/features/keystone/context'
import { verifyWebhook } from '@/features/integrations/payments/stripe'
import { receiveStripeEvent } from '@/features/keystone/messaging/paymentWorker'

export const dynamic = 'force-dynamic'

// Stripe posts here (events: payment succeeded/failed, charge refunded, dispute created). The signature is checked against the raw
// body first; an event id is recorded once, so a repeat delivery is acknowledged and does nothing.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? ''
  const raw = await request.text()
  if (!secret || !verifyWebhook(raw, request.headers.get('stripe-signature'), secret)) return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  let event: any
  try { event = JSON.parse(raw) } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }
  if (!event?.id || !event?.type) return NextResponse.json({ error: 'invalid event' }, { status: 400 })
  try {
    const out = await receiveStripeEvent(keystoneContext.prisma as any, raw, event)
    return NextResponse.json({ received: true, replay: out.replay })
  } catch {
    return NextResponse.json({ error: 'retry' }, { status: 500 })
  }
}
