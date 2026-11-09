import { PrismaClient } from '@prisma/client'
import { log } from '../lib/log'
import { runWorkerTick } from './worker'

/** Worker entry point: `tsx features/keystone/messaging/run-worker.ts [--loop]`. */
async function main() {
  // Its own small pool (WORKER_DATABASE_URL carries connection_limit): web + worker + migrations stay under Postgres max_connections.
  const url = process.env.WORKER_DATABASE_URL || process.env.DATABASE_URL
  const db = url ? new PrismaClient({ datasources: { postgresql: { url } } }) : new PrismaClient()
  const loop = process.argv.includes('--loop')
  try {
    do {
      try {
        const summary = await runWorkerTick(db)
        log.info('worker tick', summary)
        // Heartbeat for /api/health: fresh for 60s after each tick.
        const expiresAt = new Date(Date.now() + 60_000)
        await db.lease.upsert({ where: { key: 'heartbeat:worker' }, create: { key: 'heartbeat:worker', owner: 'worker', expiresAt }, update: { expiresAt } })
      } catch (error) {
        // A failed tick must not stop the loop; the next one retries under the same leases.
        log.error('worker tick failed', { error })
        if (!loop) throw error
      }
      if (loop) await new Promise(resolve => setTimeout(resolve, Math.max(2_000, Number(process.env.WORKER_INTERVAL_MS) || 10_000)))
    } while (loop)
  } finally {
    await db.$disconnect()
  }
}

main().catch(error => {
  log.error('worker stopped', { error })
  process.exit(1)
})
