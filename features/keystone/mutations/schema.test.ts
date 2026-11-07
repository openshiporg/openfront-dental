import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extendGraphqlSchema } from './index'

/*
 * The custom operations merge into Keystone's generated schema at boot. A name that collides with a
 * generated CRUD field (e.g. a custom `createPatient` returning JSON vs Keystone's `createPatient`
 * returning Patient) only fails when the server starts, so check the merge here.
 */
describe('GraphQL schema extension', () => {
  it('merges into the generated Keystone schema without redefining a generated field', () => {
    const generated = readFileSync(join(__dirname, '../../../schema.graphql'), 'utf8')
    // The same graphql module instance @graphql-tools uses (avoids the ESM/CJS dual-package realm check).
    const { buildSchema } = createRequire(require.resolve('@graphql-tools/schema'))('graphql') as typeof import('graphql')
    const base = buildSchema(generated)
    const merged = extendGraphqlSchema(base)
    const mutation = merged.getMutationType()!.getFields()
    expect(mutation.registerPatient).toBeDefined()
    expect(mutation.bookAppointment).toBeDefined()
    expect(String(mutation.createPatient.type)).toBe('Patient')
    expect(merged.getQueryType()!.getFields().publicAvailability).toBeDefined()
  })
})
