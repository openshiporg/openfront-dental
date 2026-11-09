import { PrismaClient } from '@prisma/client'
import { seedClaimReference, seedClaimSample } from '../features/keystone/seed/claims'

/* Start-up: claim reference data (scrub rules, denial reasons) for every database; sample-practice codes and enrollments only where sample payers exist. Idempotent. */
async function main() {
  const db = new PrismaClient()
  try {
    const reference = await seedClaimReference(db as never)
    const sample = (await db.payer.count({ where: { isSynthetic: true } })) ? await seedClaimSample(db as never) : null
    console.log('claim reference', JSON.stringify({ reference, sample }))
  } finally {
    await db.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exit(1) })
