/*
 * Idempotent: recomputes every guarantor account's cached balance from its ledger entries, so the cache is never
 * stale after seed data or an import. A failure here must not stop the site.
 */
import { PrismaClient } from '@prisma/client'
import { rebuildBalance } from '../features/keystone/lib/ledger'

async function main() {
  const prisma = new PrismaClient()
  try {
    const accounts = await prisma.guarantorAccount.findMany({ select: { id: true } })
    for (const a of accounts) await prisma.$transaction(tx => rebuildBalance(tx, a.id, new Date()))
    console.info(`ledger balances: ${accounts.length} rebuilt`)
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error('ledger rebuild failed:', error?.message ?? error); process.exit(1) })
