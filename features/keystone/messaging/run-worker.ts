import { PrismaClient } from '@prisma/client'
import { log } from '../lib/log'
import { runWorkerTick } from './worker'

/** Worker entry point: `tsx features/keystone/messaging/run-worker.ts [--loop]`. */
async function main() {
  const db = new PrismaClient()
  const loop = process.argv.includes('--loop')
  try {
    do {
      try {
        const summary = await runWorkerTick(db)
        log.info('worker tick', summary)
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
