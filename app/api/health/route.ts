import { NextResponse } from 'next/server'
import { keystoneContext } from '@/features/keystone/context'

export const dynamic = 'force-dynamic'

// Web readiness is this process and PostgreSQL. The background worker (outbox + scheduled jobs) reports through a
// heartbeat row it writes each tick, so a slow or restarting worker never stops the site from serving.
export async function GET() {
  const headers = { 'cache-control': 'no-store' }
  const db = keystoneContext.prisma as any
  try {
    await db.$queryRaw`SELECT 1`
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 503, headers })
  }
  let worker: 'fresh' | 'stale' | 'unknown' = 'unknown'
  let outboxOldestPendingSeconds: number | null = null
  try {
    const beat = await db.lease.findUnique({ where: { key: 'heartbeat:worker' } })
    worker = beat && beat.expiresAt.getTime() > Date.now() ? 'fresh' : 'stale'
    const oldest = await db.outboxEvent.findFirst({ where: { status: 'pending' }, orderBy: { nextAttemptAt: 'asc' }, select: { nextAttemptAt: true } })
    outboxOldestPendingSeconds = oldest ? Math.max(0, Math.round((Date.now() - oldest.nextAttemptAt.getTime()) / 1000)) : 0
  } catch { /* the site is up; worker status stays unknown */ }
  return NextResponse.json({ status: 'ok', database: 'ok', worker, outboxOldestPendingSeconds }, { status: 200, headers })
}
