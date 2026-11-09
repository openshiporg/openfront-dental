/*
 * One-time, idempotent: member-ID hashes made before the keyed scheme were bare SHA-256 (brute-forceable). The migration blanks
 * them; this fills each from the sealed member ID with the HMAC. Rows already on the keyed scheme are left alone.
 */
import { PrismaClient } from '@prisma/client'
import { memberIdHash } from '../features/keystone/lib/canonical'
import { openSecret } from '../features/keystone/lib/secretBox'

async function main() {
  const prisma = new PrismaClient()
  try {
    const rows = await prisma.subscriber.findMany({ where: { NOT: { memberIdHash: { startsWith: 'h1:' } }, memberIdSecretId: { not: null } }, select: { id: true, memberIdSecretId: true } })
    let done = 0
    for (const row of rows) {
      const box = await prisma.secretBox.findUnique({ where: { id: row.memberIdSecretId! } })
      if (!box) continue
      await prisma.subscriber.update({ where: { id: row.id }, data: { memberIdHash: memberIdHash(openSecret(box)) } })
      done += 1
    }
    console.info(`member-id hashes: ${done} rewritten`)
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error('member-id rehash failed:', error?.message ?? error); process.exit(1) })
