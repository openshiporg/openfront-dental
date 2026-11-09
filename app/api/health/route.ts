import { NextResponse } from 'next/server'
import { keystoneContext } from '@/features/keystone/context'

export const dynamic = 'force-dynamic'

// Readiness is this process and PostgreSQL. Nothing else runs beside the web process.
export async function GET() {
  const headers = { 'cache-control': 'no-store' }
  try {
    await (keystoneContext.prisma as any).$queryRaw`SELECT 1`
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 503, headers })
  }
  return NextResponse.json({ status: 'ok', database: 'ok' }, { status: 200, headers })
}
