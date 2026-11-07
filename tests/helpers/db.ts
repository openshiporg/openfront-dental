import { PrismaClient } from '@prisma/client'

/**
 * Database tests run against a migrated, disposable Postgres schema named by DENTAL_TEST_DATABASE_URL
 * (the scratch database's `vitest` schema in development). Pass the URL inline for the one command;
 * it is never written to a file. Without it the database suites are skipped, never faked.
 */
export const TEST_DATABASE_URL = process.env.DENTAL_TEST_DATABASE_URL ?? ''
export const hasTestDatabase = /^postgres(ql)?:\/\//.test(TEST_DATABASE_URL) && /[?&]schema=vitest\b/.test(TEST_DATABASE_URL)

export function testPrisma(connectionLimit = 12) {
  const url = new URL(TEST_DATABASE_URL)
  url.searchParams.set('connection_limit', String(connectionLimit))
  url.searchParams.set('pool_timeout', '30')
  return new PrismaClient({ datasourceUrl: url.toString(), log: [] })
}

/** Empties every application table in the test schema. Append-only tables need their triggers off. */
export async function resetDatabase(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`
  if (!tables.length) return
  const list = tables.map(t => `"${t.tablename.replaceAll('"', '')}"`).join(', ')
  // Tables guarded by append-only triggers (dental_deny_update_delete) need them off to truncate.
  const guarded = await prisma.$queryRaw<{ table: string }[]>`
    SELECT DISTINCT c.relname AS table FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname = current_schema()`
  const names = guarded.map(g => `"${g.table.replaceAll('"', '')}"`)
  await prisma.$transaction([
    ...names.map(name => prisma.$executeRawUnsafe(`ALTER TABLE ${name} DISABLE TRIGGER USER`)),
    prisma.$executeRawUnsafe(`TRUNCATE ${list} CASCADE`),
    ...names.map(name => prisma.$executeRawUnsafe(`ALTER TABLE ${name} ENABLE TRIGGER USER`)),
  ])
}

let counter = 0
export const uniqueKey = (prefix = 'test') => `${prefix}-${Date.now().toString(36)}-${(counter += 1).toString(36)}-${Math.random().toString(36).slice(2, 8)}`
