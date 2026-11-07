import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * Licensing guard (BUILD-PLAN §0, RESEARCH §licensing). No CDT code text, no X12 implementation
 * guide content and no ADA claim form artwork may enter git:
 *   - no literal CDT-shaped codes (D followed by four digits) outside the allow-list;
 *   - no X12 interchange/group/837 transaction envelopes (ISA*, GS*, ST*837);
 *   - no file whose bytes hash to a known ADA claim form artwork file.
 * CDT arrives at runtime through CodeImportBatch with a licence attestation; the app ships OF-
 * local codes. Test fixtures that need CDT-shaped codes generate them at test time.
 */

const ROOT = join(__dirname, '..')
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.keystone', '.runtime', 'migrations', 'coverage'])
const TEXT = /\.(ts|tsx|js|mjs|cjs|json|md|mdx|sql|prisma|graphql|csv|txt|yml|yaml|html|css)$/i
const BINARY = /\.(pdf|png|jpe?g|gif|webp|svg)$/i

/** Files that may mention the patterns because they assert their absence or describe the rule. */
const ALLOW = new Set(['tests/no-licensed-content.test.ts', 'package-lock.json'])

/**
 * SHA-256 of ADA Dental Claim Form artwork files. Extend whenever a copy is identified; any file with
 * a matching digest fails regardless of its name. Binary files are also scanned for the form's title.
 */
const ADA_FORM_HASHES = new Set<string>([])
const ADA_TITLE = /ADA\s*Dental\s*Claim\s*Form|American Dental Association.{0,40}Claim Form/i

const CDT = /(?<![A-Za-z0-9_-])D\d{4}(?![0-9])/
const X12 = /(^|[^A-Za-z])(ISA\*\d{2}\*|GS\*HC\*|ST\*837\*)/m

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) yield* files(path)
    else yield path
  }
}

describe('no licensed content in the repository', () => {
  const all = [...files(ROOT)].map(path => ({ path, rel: relative(ROOT, path) })).filter(f => !ALLOW.has(f.rel))

  it('has no CDT-shaped code literals', () => {
    const hits = all.filter(f => TEXT.test(f.rel)).flatMap(f => {
      const lines = readFileSync(f.path, 'utf8').split('\n')
      return lines.flatMap((line, i) => (CDT.test(line) ? [`${f.rel}:${i + 1}`] : []))
    })
    expect(hits).toEqual([])
  })

  it('has no X12 interchange or 837 envelopes', () => {
    const hits = all.filter(f => TEXT.test(f.rel) && X12.test(readFileSync(f.path, 'utf8'))).map(f => f.rel)
    expect(hits).toEqual([])
  })

  it('has no ADA claim form artwork', () => {
    const hits = all.filter(f => BINARY.test(f.rel)).filter(f => {
      const bytes = readFileSync(f.path)
      return ADA_FORM_HASHES.has(createHash('sha256').update(bytes).digest('hex')) || ADA_TITLE.test(bytes.toString('latin1'))
    }).map(f => f.rel)
    expect(hits).toEqual([])
  })

  it('the detectors catch generated samples (so a passing run means something)', () => {
    const fakeCode = ['D', String(9000 + 99)].join('')
    expect(CDT.test(`code ${fakeCode} here`)).toBe(true)
    expect(CDT.test('OF-0120 local code')).toBe(false)
    expect(X12.test(['ISA', '00', ''].join('*'))).toBe(true)
    expect(X12.test(['ST', '837', '0001'].join('*'))).toBe(true)
  })
})
