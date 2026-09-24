import { defineMigration, type ModuleHonoEnv } from '@blixis/contracts'
import { DATABASE } from '@blixis/database'
import { defineModule } from '@blixis/kernel'
import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestBlixis } from './create-test-blixis.ts'
import { createTestDatabase, databaseTestsEnabled, type TestDatabase } from './database.ts'

const notes = defineModule({
  meta: { name: '@test/notes', version: '1.0.0' },
  migrations: [
    defineMigration({
      id: '0001_create_notes',
      up: 'create schema notes; create table notes.notes (id serial primary key, body text not null)',
    }),
  ],
  rest: {
    path: '/notes',
    app: new Hono<ModuleHonoEnv>().post('/', async (c) => {
      const db = c.var.services.get(DATABASE)
      const result = await db.execute(
        sql`insert into notes.notes (body) values ('hi') returning id`,
      )
      return c.json(result.rows[0], 201)
    }),
  },
})

describe.skipIf(!databaseTestsEnabled())('createTestDatabase', () => {
  let t: TestDatabase
  beforeAll(async () => {
    t = await createTestDatabase({ modules: [notes()] })
  })
  beforeEach(() => t.reset())
  afterAll(() => t.drop())

  const count = async () =>
    (await t.db.execute<{ n: number }>(sql`select count(*)::int as n from notes.notes`)).rows[0]?.n

  it('creates an isolated database with module migrations applied', async () => {
    await t.db.execute(sql`insert into notes.notes (body) values ('a')`)
    expect(await count()).toBe(1)
    const applied = await t.db.execute<{ id: string }>(sql`select id from blixis.migrations`)
    expect(applied.rows).toEqual([{ id: '0001_create_notes' }])
  })

  it('reset empties module tables and restarts identities but keeps migrations', async () => {
    expect(await count()).toBe(0)
    await t.db.execute(sql`insert into notes.notes (body) values ('b')`)
    const [row] = (await t.db.execute<{ id: number }>(sql`select id from notes.notes`)).rows
    expect(row?.id).toBe(1)
  })

  it('serves DATABASE to createTestBlixis requests without closing it', async () => {
    const app = await createTestBlixis({ modules: [notes()], database: t })
    const first = await app.request('/api/v1/notes', { method: 'POST' })
    const second = await app.request('/api/v1/notes', { method: 'POST' })
    expect([first.status, second.status]).toEqual([201, 201])
    expect(await second.json()).toEqual({ id: 2 })
    expect(await count()).toBe(2)
  })

  it('isolates parallel test files by database name', async () => {
    const other = await createTestDatabase({ modules: [notes()] })
    try {
      expect(other.url).not.toBe(t.url)
      await other.db.execute(sql`insert into notes.notes (body) values ('x')`)
      expect(await count()).toBe(0)
    } finally {
      await other.drop()
    }
  })
})
