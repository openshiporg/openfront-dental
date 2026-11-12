import { createHash } from 'node:crypto'
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib'

/*
 * The electronic health information (EHI) export bundle (Phase 6). A zip with a manifest that names every file, its SHA-256 and its record count.
 * No zip library: the format is small and Node has crc32 and raw deflate. `validateBundle` reads a bundle back and checks the zip structure, every
 * CRC, every hash and every count, so a bundle that validates is complete as far as its own manifest says. Synchronous: built and returned in the request.
 */

export const BUNDLE_VERSION = 'dental-ehi-1'
export type BundleFile = { name: string; data: Buffer | string }
export type Manifest = { version: string; generatedAt: string; patientChart: string; files: { name: string; sha256: string; bytes: number; records: number }[] }

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b }
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b }
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1

export function zip(files: BundleFile[]): Buffer {
  const locals: Buffer[] = [], central: Buffer[] = []
  let offset = 0
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8')
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8')
    const packed = deflateRawSync(raw)
    const crc = crc32(raw)
    const local = Buffer.concat([u32(0x04034b50), u16(20), u16(0x0800), u16(8), u16(0), u16(DOS_DATE), u32(crc), u32(packed.length), u32(raw.length), u16(name.length), u16(0), name, packed])
    central.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(8), u16(0), u16(DOS_DATE), u32(crc), u32(packed.length), u32(raw.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]))
    locals.push(local)
    offset += local.length
  }
  const dir = Buffer.concat(central)
  return Buffer.concat([...locals, dir, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(dir.length), u32(offset), u16(0)])
}

export function unzip(buf: Buffer): { name: string; data: Buffer; crcOk: boolean }[] {
  let end = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70_000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break }
  if (end < 0) throw new Error('Not a zip file.')
  const count = buf.readUInt16LE(end + 10)
  let p = buf.readUInt32LE(end + 16)
  const out: { name: string; data: Buffer; crcOk: boolean }[] = []
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Zip directory is damaged.')
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20)
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8')
    const lname = buf.readUInt16LE(off + 26), lextra = buf.readUInt16LE(off + 28)
    const body = buf.subarray(off + 30 + lname + lextra, off + 30 + lname + lextra + csize)
    const data = method === 8 ? inflateRawSync(body) : Buffer.from(body)
    out.push({ name, data, crcOk: crc32(data) >>> 0 === crc >>> 0 })
    p += 46 + nlen + elen + clen
  }
  return out
}

export function buildBundle(input: { patientChart: string; now: Date; sections: { name: string; records: unknown[] }[] }) {
  const files: BundleFile[] = input.sections.map(s => ({ name: s.name, data: JSON.stringify(s.records, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2) }))
  const manifest: Manifest = {
    version: BUNDLE_VERSION, generatedAt: input.now.toISOString(), patientChart: input.patientChart,
    files: files.map((f, i) => { const b = Buffer.from(f.data as string, 'utf8'); return { name: f.name, sha256: sha(b), bytes: b.length, records: input.sections[i].records.length } }),
  }
  const readme = `Electronic health information export for chart ${input.patientChart}.\nEach file is JSON. manifest.json lists every file with its SHA-256 and record count.\nMoney amounts are whole cents in text form.\n`
  const bytes = zip([{ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) }, { name: 'README.txt', data: readme }, ...files])
  return { bytes, manifest, sha256: sha(bytes) }
}

export function validateBundle(buf: Buffer): { ok: boolean; problems: string[]; manifest: Manifest | null } {
  const problems: string[] = []
  let entries
  try { entries = unzip(buf) } catch (e: any) { return { ok: false, problems: [String(e.message)], manifest: null } }
  for (const e of entries) if (!e.crcOk) problems.push(`${e.name}: checksum does not match.`)
  const m = entries.find(e => e.name === 'manifest.json')
  if (!m) return { ok: false, problems: [...problems, 'manifest.json is missing.'], manifest: null }
  let manifest: Manifest
  try { manifest = JSON.parse(m.data.toString('utf8')) } catch { return { ok: false, problems: [...problems, 'manifest.json is not valid.'], manifest: null } }
  if (manifest.version !== BUNDLE_VERSION) problems.push('Unknown bundle version.')
  const listed = new Set<string>()
  for (const f of manifest.files ?? []) {
    listed.add(f.name)
    const e = entries.find(x => x.name === f.name)
    if (!e) { problems.push(`${f.name}: listed but missing.`); continue }
    if (sha(e.data) !== f.sha256) problems.push(`${f.name}: contents differ from the manifest.`)
    if (e.data.length !== f.bytes) problems.push(`${f.name}: size differs from the manifest.`)
    try { const j = JSON.parse(e.data.toString('utf8')); if (!Array.isArray(j) || j.length !== f.records) problems.push(`${f.name}: record count differs from the manifest.`) } catch { problems.push(`${f.name}: is not valid JSON.`) }
  }
  for (const e of entries) if (e.name !== 'manifest.json' && e.name !== 'README.txt' && !listed.has(e.name)) problems.push(`${e.name}: present but not in the manifest.`)
  return { ok: problems.length === 0, problems, manifest }
}
