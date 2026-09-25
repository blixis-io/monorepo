// The tests from the "Test your module" tutorial — run as part of the Blixis suite.
// #region test
import { databaseModule } from '@blixis/database'
import { idempotencyModule } from '@blixis/database/idempotency'
import { eventsModule } from '@blixis/events'
import { outboxModule } from '@blixis/events/outbox'
import { newId } from '@blixis/shared'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, databaseTestsEnabled, type TestDatabase } from '../../src/database.ts'
import { captureEvents, createTestBlixis } from '../../src/index.ts'
import { notesModule } from './notes-module.ts'

describe.skipIf(!databaseTestsEnabled())('notes module', () => {
  const modules = () => [databaseModule(), outboxModule(), idempotencyModule(), notesModule()]
  let db: TestDatabase
  beforeAll(async () => {
    // Any events module satisfies the capability here; only migrations are applied.
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function setup() {
    const events = captureEvents({ mode: 'deferred' })
    const t = await createTestBlixis({ modules: [...modules(), events.module()], database: db })
    return { t, events }
  }
  const space = newId()

  it('creates a note and reads it back, scoped to its space', async () => {
    const { t } = await setup()
    const created = await t.request(`/api/v1/spaces/${space}/notes`, {
      method: 'POST',
      json: { title: 'Hello', body: 'First note' },
    })
    expect(created.status).toBe(201)
    const note = (await created.json()) as { id: string; title: string }
    expect(note.title).toBe('Hello')

    expect((await t.request(`/api/v1/spaces/${space}/notes/${note.id}`)).status).toBe(200)
    expect((await t.request(`/api/v1/spaces/${newId()}/notes/${note.id}`)).status).toBe(404)
  })

  it('rejects invalid input with 400', async () => {
    const { t } = await setup()
    const res = await t.request(`/api/v1/spaces/${space}/notes`, {
      method: 'POST',
      json: { title: '' },
    })
    expect(res.status).toBe(400)
  })

  it('emits note.created after commit and counts notes exactly once', async () => {
    const { t, events } = await setup()
    await t.request(`/api/v1/spaces/${space}/notes`, { method: 'POST', json: { title: 'Counted' } })
    events.expectEvent('note.created', (e) => (e.payload as { title: string }).title === 'Counted')

    await events.flush()
    await events.flush()
    const counts = await db.db.execute(
      sql`select count from notes.note_counts where space_id = ${space}::uuid`,
    )
    expect(counts.rows).toEqual([{ count: 1 }])
  })

  it('replays a retried create instead of creating a second note', async () => {
    const { t, events } = await setup()
    const create = () =>
      t.request(`/api/v1/spaces/${space}/notes`, {
        method: 'POST',
        json: { title: 'Once' },
        headers: { 'idempotency-key': 'create-once' },
      })
    const first = await create()
    const retry = await create()
    expect(retry.headers.get('idempotent-replayed')).toBe('true')
    expect(await retry.json()).toEqual(await first.json())
    expect(events.emitted).toHaveLength(1)
  })
})
// #endregion test
