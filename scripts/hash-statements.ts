/* Statements built before the PDF existed get their document fingerprint once, from their frozen snapshot (idempotent: only rows with none). */
import { PrismaClient } from '@prisma/client'
import { pdfSha256, renderStatementPdf, statementForPdf } from '../features/keystone/lib/statementPdf'

async function main() {
  const prisma = new PrismaClient()
  try {
    const rows = await prisma.statement.findMany({ where: { pdfSha256: '' } })
    for (const row of rows) await prisma.statement.update({ where: { id: row.id }, data: { pdfSha256: pdfSha256(renderStatementPdf(statementForPdf(row))) } })
    console.log(`statement fingerprints set: ${rows.length}`)
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(error); process.exit(0) })
