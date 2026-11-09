/* eslint-disable openfront-dental/no-number-on-money -- toFixed here formats PDF layout coordinates, never money */
/* adapted from openfront-home-services@07ad9fc lib/pdf.ts */
/**
 * A small, dependency-free PDF writer for text documents (estimates, invoices). US Letter pages,
 * the standard Helvetica fonts (WinAnsi), left/right-aligned text and rules. Enough for a clean,
 * printable document; nothing here does arithmetic on money: callers pass formatted strings.
 */

export type PdfFont = 'regular' | 'bold' | 'mono'
type Op = string

const PAGE_W = 612
const PAGE_H = 792
export const MARGIN = 54

// Helvetica widths (1/1000 em) for WinAnsi 32..126; used to right-align and wrap.
const W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584]
const WB = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584]

/** Map to WinAnsi: common typography to its cp1252 byte, anything else outside Latin-1 to "?". */
function ansi(text: string) {
  const map: Record<string, number> = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99, '−': 0x2d, '·': 0xb7, '§': 0xa7 }
  let out = ''
  for (const ch of text) {
    const c = ch.codePointAt(0)!
    const b = map[ch] ?? (c >= 32 && c <= 255 && !(c >= 127 && c < 160) ? c : 63)
    out += String.fromCharCode(b)
  }
  return out
}
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

export function textWidth(text: string, size: number, font: PdfFont = 'regular') {
  if (font === 'mono') return ansi(text).length * 600 * size / 1000
  const table = font === 'bold' ? WB : W
  let w = 0
  for (const ch of ansi(text)) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? table[c - 32] : 556 }
  return w * size / 1000
}

/** Greedy word wrap to a width in points. */
export function wrap(text: string, width: number, size: number, font: PdfFont = 'regular') {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (textWidth(next, size, font) <= width || !line) line = next
      else { lines.push(line); line = word }
    }
    lines.push(line)
  }
  return lines
}

export class PdfDoc {
  private pages: Op[][] = [[]]
  /** Distance from the top of the current page, in points. */
  y = MARGIN
  readonly width = PAGE_W - MARGIN * 2
  footer?: (page: number, pages: number) => string

  private get ops() { return this.pages[this.pages.length - 1] }

  newPage() { this.pages.push([]); this.y = MARGIN }
  /** Start a new page if fewer than `points` remain. */
  need(points: number) { if (this.y + points > PAGE_H - MARGIN - 18) this.newPage() }

  text(s: string, x: number, size = 10, font: PdfFont = 'regular', align: 'left' | 'right' = 'left', gray = 0) {
    const f = font === 'bold' ? 'F2' : font === 'mono' ? 'F3' : 'F1'
    const left = align === 'right' ? x - textWidth(s, size, font) : x
    this.ops.push(`${gray} g BT /${f} ${size} Tf ${left.toFixed(2)} ${(PAGE_H - this.y - size).toFixed(2)} Td (${esc(ansi(s))}) Tj ET 0 g`)
  }

  /** A wrapped paragraph from the current y; advances y. */
  paragraph(s: string, size = 9, font: PdfFont = 'regular', gray = 0, x = MARGIN, width = this.width) {
    for (const line of wrap(s, width, size, font)) {
      this.need(size * 1.35)
      this.text(line, x, size, font, 'left', gray)
      this.y += size * 1.35
    }
  }

  rule(gray = 0.8, weight = 0.5) {
    const y = (PAGE_H - this.y).toFixed(2)
    this.ops.push(`${gray} G ${weight} w ${MARGIN} ${y} m ${PAGE_W - MARGIN} ${y} l S 0 G`)
  }

  toBytes(meta: { title: string; author?: string } = { title: 'Document' }) {
    const objs: string[] = []
    const add = (body: string) => { objs.push(body); return objs.length }
    const catalog = add('')
    const pagesId = add('')
    const fonts = [add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'), add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>')]
    const kids: number[] = []
    this.pages.forEach((ops, i) => {
      const footer = this.footer ? this.footer(i + 1, this.pages.length) : ''
      const all = footer ? [...ops, `0.45 g BT /F1 8 Tf ${MARGIN} ${MARGIN - 20} Td (${esc(ansi(footer))}) Tj ET 0 g`] : ops
      const stream = all.join('\n')
      const content = add(`<< /Length ${latin1Length(stream)} >>\nstream\n${stream}\nendstream`)
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fonts[0]} 0 R /F2 ${fonts[1]} 0 R /F3 ${fonts[2]} 0 R >> >> /Contents ${content} 0 R >>`))
    })
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`
    const info = add(`<< /Title (${esc(ansi(meta.title))}) /Producer (Openfront Dental)${meta.author ? ` /Author (${esc(ansi(meta.author))})` : ''} >>`)
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
    const offsets: number[] = []
    objs.forEach((body, i) => { offsets.push(latin1Length(out)); out += `${i + 1} 0 obj\n${body}\nendobj\n` })
    const xref = latin1Length(out)
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    const bytes = new Uint8Array(out.length)
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff
    return bytes
  }
}

const latin1Length = (s: string) => s.length
