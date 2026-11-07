import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { buildSchema, getNamedType, isListType, isNonNullType, parse, type GraphQLOutputType } from 'graphql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma } from '../../../tests/helpers/db'
import { PHI_FIELDS } from './phiFields'
import { phiReadAuditDescriptor, phiReadAuditPlugin, recordPhiReadAudit } from './phiReadAudit'

const schema = buildSchema(readFileSync(join(__dirname, '../../../schema.graphql'), 'utf8'))
const SECRET = 'x'.repeat(40)
const unwrapList = (type: GraphQLOutputType) => {
  const inner = isNonNullType(type) ? type.ofType : type
  return isListType(inner) ? getNamedType(inner).name : null
}

/** One generated query per tiered list: its many-query root field selecting id + every tiered field. */
const GENERATED = Object.entries(PHI_FIELDS).map(([list, fields]) => {
  const root = Object.values(schema.getQueryType()!.getFields()).find(field => unwrapList(field.type) === list)
  if (!root) throw new Error(`No list query for ${list}`)
  return { list, root: root.name, fields: Object.keys(fields), source: `query Read${list} { ${root.name} { id ${Object.keys(fields).join(' ')} } }` }
})

describe('PHI read audit (generated across every tiered list)', () => {
  it.each(GENERATED)('$list: every tiered field is recorded, with reference tokens instead of ids', ({ list, root, fields, source }) => {
    const descriptor = phiReadAuditDescriptor(parse(source), null, { data: { [root]: [{ id: 'rec_1' }, { id: 'rec_2' }] } }, schema, SECRET)
    expect(descriptor?.listKeys).toEqual([list])
    expect(descriptor?.fields).toEqual(fields.map(f => `${list}.${f}`).sort())
    expect(descriptor?.recordCount).toBe(2)
    expect(JSON.stringify(descriptor)).not.toContain('rec_1')
  })

  it('records a selection even when no rows came back (the query asked for PHI)', () => {
    const { root, source } = GENERATED[0]
    expect(phiReadAuditDescriptor(parse(source), null, { data: { [root]: [] } }, schema, SECRET)?.recordCount).toBe(0)
  })

  it('ignores reads that select no tiered field', () => {
    expect(phiReadAuditDescriptor(parse('{ locations { id name } }'), null, { data: { locations: [] } }, schema, SECRET)).toBeNull()
  })

  it('fails closed: if the audit row cannot be written, the data is withheld', async () => {
    const { root, source } = GENERATED[0]
    const plugin = phiReadAuditPlugin({ schema, prisma: () => ({ phiReadAudit: { create: async () => { throw new Error('db down') } } }), secret: () => SECRET })
    let replaced: any = null
    const hooks = plugin.onExecute({ args: { document: parse(source), operationName: null, contextValue: { session: { itemId: 'u1' } } } })
    await hooks.onExecuteDone({ result: { data: { [root]: [{ id: 'a' }] } }, setResult: (r: unknown) => { replaced = r } })
    expect(replaced).toMatchObject({ data: null, errors: [{ extensions: { code: 'PHI_AUDIT_FAILED' } }] })
  })
})

describe.skipIf(!hasTestDatabase)('PHI read audit (database)', () => {
  let prisma: PrismaClient
  beforeAll(async () => {
    prisma = testPrisma(4)
    await resetDatabase(prisma)
  })
  afterAll(async () => prisma?.$disconnect())

  it('writes the row, and the row is append-only at the database', async () => {
    const { root, source } = GENERATED.find(g => g.list === 'AuditEvent')!
    const descriptor = phiReadAuditDescriptor(parse(source), null, { data: { [root]: [{ id: 'evt_1' }] } }, schema, SECRET)!
    await recordPhiReadAudit(prisma, { purpose: 'operations', correlationReference: 'req-1' }, descriptor)
    const row = await prisma.phiReadAudit.findFirstOrThrow({ where: { correlationReference: 'req-1' } })
    expect(row.recordCount).toBe(1)
    expect(row.fields).toEqual(descriptor.fields)
    await expect(prisma.phiReadAudit.update({ where: { id: row.id }, data: { recordCount: 0 } })).rejects.toThrow(/append-only/)
    await expect(prisma.phiReadAudit.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/)
  })
})
