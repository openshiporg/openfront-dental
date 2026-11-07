import { PrismaClient } from '@prisma/client'
import { log } from '../lib/log'
import { runWorkerTick } from './worker'

/** Worker entry point: `tsx features/keystone/messaging/run-worker.ts [--loop]`. */
async function main() {
  const db = new PrismaClient()
  const loop = process.argv.includes('--loop')
  try {
    do {
      const summary = await runWorkerTick(db)
      log.info('worker tick', summary)
      if (loop) await new Promise(resolve => setTimeout(resolve, 30_000))
    } while (loop)
  } finally {
    await db.$disconnect()
  }
}

main().catch(error => {
  log.error('worker stopped', { error })
  process.exit(1)
})
