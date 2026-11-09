import { createHash } from 'node:crypto'
import { PdfDoc, MARGIN } from './pdfWriter'
import { formatMinor } from './money'

/*
 * The patient statement as a PDF. Rendered only from the frozen statement (its snapshot and its own fixed columns), so the same
 * statement always produces the same bytes; the sha256 of those bytes is stored when the statement is built and checked before
 * any copy is served. Nothing here reads the ledger, the practice record or the clock.
 */

export type StatementForPdf = {
  ref: string
  cycleDate: string
  dueDate: string
  amountDueMinor: string
  payLinkCode: string
  snapshot: {
    lines?: { date: string; description: string; patient: string; chargedMinor: string; owedMinor: string }[]
    recentActivity?: { date: string; description: string; amountMinor: string }[]
    aging?: { current: string; d31: string; d61: string; d91: string }
    totalMinor?: string
    insurancePendingMinor?: string
  }
}

const money = (minor: string | undefined) => formatMinor(BigInt(minor || '0'))
const day = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${m}/${d}/${y}` }

export function renderStatementPdf(s: StatementForPdf): Uint8Array {
  const doc = new PdfDoc()
  doc.footer = (page, pages) => `Statement ${s.ref}  ·  Page ${page} of ${pages}`
  const right = MARGIN + doc.width
  doc.text('Statement', MARGIN, 20, 'bold'); doc.y += 28
  doc.text(`Statement ${s.ref}`, MARGIN, 10); doc.text(`Statement date ${day(s.cycleDate)}`, right, 10, 'regular', 'right'); doc.y += 14
  doc.text(`Pay online with code ${s.payLinkCode}`, MARGIN, 10); doc.text(`Due ${day(s.dueDate)}`, right, 10, 'regular', 'right'); doc.y += 20
  doc.rule(0.6, 0.8); doc.y += 12
  doc.text('Amount due', MARGIN, 11, 'bold'); doc.text(money(s.amountDueMinor), right, 16, 'bold', 'right'); doc.y += 28
  const a = s.snapshot.aging
  if (a) {
    doc.text('Current', MARGIN, 8, 'regular', 'left', 0.4); doc.text('31 to 60 days', MARGIN + 130, 8, 'regular', 'left', 0.4); doc.text('61 to 90 days', MARGIN + 260, 8, 'regular', 'left', 0.4); doc.text('Over 90 days', MARGIN + 390, 8, 'regular', 'left', 0.4); doc.y += 12
    doc.text(money(a.current), MARGIN, 10); doc.text(money(a.d31), MARGIN + 130, 10); doc.text(money(a.d61), MARGIN + 260, 10); doc.text(money(a.d91), MARGIN + 390, 10); doc.y += 20
  }
  doc.rule(); doc.y += 10
  doc.text('What is owed', MARGIN, 11, 'bold'); doc.y += 18
  doc.text('Date', MARGIN, 8, 'bold', 'left', 0.4); doc.text('Service', MARGIN + 62, 8, 'bold', 'left', 0.4); doc.text('For', MARGIN + 330, 8, 'bold', 'left', 0.4); doc.text('Charged', right - 70, 8, 'bold', 'right', 0.4); doc.text('You owe', right, 8, 'bold', 'right', 0.4); doc.y += 14
  for (const line of s.snapshot.lines ?? []) {
    doc.need(14)
    doc.text(day(line.date), MARGIN, 9); doc.text(line.description.slice(0, 48), MARGIN + 62, 9); doc.text(line.patient.slice(0, 18), MARGIN + 330, 9)
    doc.text(money(line.chargedMinor), right - 70, 9, 'regular', 'right'); doc.text(money(line.owedMinor), right, 9, 'regular', 'right'); doc.y += 14
  }
  if (!(s.snapshot.lines ?? []).length) { doc.text('No open charges.', MARGIN, 9, 'regular', 'left', 0.4); doc.y += 14 }
  const activity = s.snapshot.recentActivity ?? []
  if (activity.length) {
    doc.y += 8; doc.need(40); doc.rule(); doc.y += 10
    doc.text('Payments and credits in the last 30 days', MARGIN, 11, 'bold'); doc.y += 18
    for (const row of activity) { doc.need(14); doc.text(day(row.date), MARGIN, 9); doc.text(row.description.slice(0, 60), MARGIN + 62, 9); doc.text(money(row.amountMinor), right, 9, 'regular', 'right'); doc.y += 14 }
  }
  if (s.snapshot.insurancePendingMinor && BigInt(s.snapshot.insurancePendingMinor) > 0n) {
    doc.y += 8; doc.paragraph(`Insurance is still reviewing ${money(s.snapshot.insurancePendingMinor)}. It is not included in the amount due above.`, 9, 'regular', 0.3)
  }
  doc.y += 10; doc.need(40)
  doc.paragraph('Questions about this statement? Call the front desk. If you cannot pay in full, ask us about a payment plan before the due date.', 9, 'regular', 0.3)
  return doc.toBytes({ title: `Statement ${s.ref}`, author: 'Openfront Dental' })
}

export const pdfSha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** The same refusal the other verticals give: serve a copy only if its bytes still hash to the stored fingerprint, else a 409 and nothing. */
export function servePdf(bytes: Uint8Array, expectedSha256: string | null | undefined, fileName: string) {
  const actual = pdfSha256(bytes)
  if (!expectedSha256 || actual !== expectedSha256) {
    return new Response('This statement no longer matches the copy that was issued. Contact support; nothing was served.', { status: 409, headers: { 'Cache-Control': 'private, no-store' } })
  }
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName.replace(/[^\w.-]+/g, '_')}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-SHA256': actual,
    },
  })
}

/** A statement row (any source) in the shape the renderer takes: dates as plain days, money as text. */
export function statementForPdf(row: { ref: string; cycleDate: Date | string | null; dueDate: Date | string | null; amountDueMinor: bigint | string; payLinkCode: string; snapshot: unknown }): StatementForPdf {
  const iso = (d: Date | string | null) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? '').slice(0, 10))
  return { ref: row.ref, cycleDate: iso(row.cycleDate), dueDate: iso(row.dueDate), amountDueMinor: row.amountDueMinor.toString(), payLinkCode: row.payLinkCode, snapshot: (row.snapshot ?? {}) as StatementForPdf['snapshot'] }
}
