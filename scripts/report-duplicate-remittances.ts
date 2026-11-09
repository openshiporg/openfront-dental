/*
 * Forward-only check (Phase 4 review r1, B2): list live remittances that share a payer and trace key (letters and digits only,
 * upper case) — the same payment posted more than once before the normalised unique index existed. Reads only; never deletes or
 * edits a row. A duplicate posting is corrected with a takeback (status 22) entered through the app, which reverses its entries.
 * Exit code 0 always; prints `duplicates: N` and one line per extra remittance.
 */
import { PrismaClient } from '@prisma/client'

type Row = { payer: string | null; key: string; refs: string[]; statuses: string[]; traces: string[] }

async function main() {
  const prisma = new PrismaClient()
  try {
    const groups = await prisma.$queryRaw<Row[]>`
      SELECT payer, dental_trace_key("traceNumber") AS key,
             array_agg(ref ORDER BY "createdAt", id) AS refs, array_agg(status ORDER BY "createdAt", id) AS statuses,
             array_agg("traceNumber" ORDER BY "createdAt", id) AS traces
      FROM "Remittance"
      WHERE status <> 'duplicate' AND dental_trace_key("traceNumber") <> ''
      GROUP BY payer, dental_trace_key("traceNumber")
      HAVING count(*) > 1
      ORDER BY min("createdAt")`
    const extra = groups.reduce((n, g) => n + g.refs.length - 1, 0)
    console.log(`duplicates: ${extra}`)
    for (const g of groups) console.log(`payer ${g.payer ?? '(none)'} trace ${g.key}: first ${g.refs[0]}; also ${g.refs.slice(1).map((r, i) => `${r} (${g.statuses[i + 1]}, "${g.traces[i + 1]}")`).join(', ')}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => { console.error(`report-duplicate-remittances: ${error instanceof Error ? error.message : String(error)}`) })
