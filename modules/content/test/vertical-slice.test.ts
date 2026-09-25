import { type EventEnvelope, subscribe } from '@blixis/contracts'
import { databaseModule } from '@blixis/database'
import { idempotencyModule } from '@blixis/database/idempotency'
import { eventsModule } from '@blixis/events'
import { defineModule } from '@blixis/kernel'
import { permissionsModule } from '@blixis/permissions'
import { spacesModule } from '@blixis/spaces'
import { asUser, captureEvents, createTestBlixis } from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { USER_SERVICE, usersModule } from '@blixis/users'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { contentModule, type EntryView, entryPublished, entryUnpublished } from '../src/index.ts'

/**
 * The content vertical slice (roadmap 011.007, checkpoint CP5): HTTP → Hono route →
 * CONTENT_SERVICE → repository → Postgres, and publish → transactional event → a subscriber in
 * another module — exactly how a cache or webhook module would consume it.
 */
const delivered: EventEnvelope[] = []
const cacheModule = defineModule({
  meta: { name: '@acme/cache', version: '1.0.0' },
  events: [
    subscribe(entryPublished, 'purge-on-publish', async (envelope) => {
      delivered.push(envelope as EventEnvelope)
    }),
    subscribe(entryUnpublished, 'purge-on-unpublish', async (envelope) => {
      delivered.push(envelope as EventEnvelope)
    }),
  ],
})

const modules = () => [
  databaseModule(),
  idempotencyModule(),
  usersModule(),
  spacesModule(),
  permissionsModule(),
  contentModule(),
  cacheModule(),
]

describe.skipIf(!databaseTestsEnabled())('content vertical slice (Postgres)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
  })
  beforeEach(async () => {
    delivered.length = 0
    await db.reset()
  })
  afterAll(() => db.drop())

  it('models, writes, publishes, reads, and delivers events end to end', async () => {
    // Deferred delivery: events reach subscribers only when flushed, as after a commit.
    const events = captureEvents({ mode: 'deferred' })
    const t = await createTestBlixis({ modules: [...modules(), events.module()], database: db })
    const owner = await t.app.runInScope({}, async ({ services }) =>
      asUser(
        (await services.get(USER_SERVICE).create({ email: 'o@example.com', displayName: 'O' })).id,
      ),
    )
    const call = async <T>(
      method: string,
      path: string,
      json?: unknown,
      headers?: Record<string, string>,
    ) => {
      const res = await t.request(`/api/v1${path}`, {
        method,
        actor: owner,
        ...(json === undefined ? {} : { json }),
        ...(headers === undefined ? {} : { headers }),
      })
      if (res.status >= 400)
        throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`)
      return (res.status === 204 ? undefined : await res.json()) as T
    }

    // Tenant and model.
    const org = await call<{ id: string }>('POST', '/organizations', { name: 'Acme', slug: 'acme' })
    const space = await call<{ id: string }>('POST', `/organizations/${org.id}/spaces`, {
      name: 'Web',
      slug: 'web',
    })
    const hero = await call<{ id: string }>('POST', `/spaces/${space.id}/content-types`, {
      kind: 'component',
      apiId: 'hero',
      name: 'Hero',
      fields: [{ apiId: 'heading', name: 'Heading', type: 'text', required: true }],
    })
    await call('POST', `/spaces/${space.id}/content-types`, {
      apiId: 'page',
      name: 'Page',
      fields: [
        { apiId: 'title', name: 'Title', type: 'text', required: true, localized: true },
        { apiId: 'slug', name: 'Slug', type: 'text', required: true, settings: { format: 'slug' } },
        {
          apiId: 'body',
          name: 'Body',
          type: 'blocks',
          localized: true,
          settings: { componentIds: [hero.id] },
        },
      ],
    })

    // Draft, then a second version.
    const draft = await call<EntryView>('POST', `/spaces/${space.id}/entries`, {
      contentType: 'page',
      fields: { slug: 'home' },
    })
    const fields = {
      title: { 'en-US': 'Home' },
      slug: 'home',
      body: { 'en-US': [{ _id: 'hEro0001', _type: 'hero', heading: 'Welcome' }] },
    }
    await call('PATCH', `/entries/${draft.sys.id}`, { fields }, { 'if-match': '"1"' })

    // Publish (idempotently): stored, pointed at, and the event reaches the other module.
    const published = await call<EntryView>(
      'POST',
      `/entries/${draft.sys.id}/publish`,
      {},
      { 'idempotency-key': 'p-1' },
    )
    expect(published.sys).toMatchObject({ status: 'published', version: 2 })
    expect(delivered).toEqual([])
    await events.flush()
    expect(delivered).toHaveLength(1)
    expect(delivered[0]).toMatchObject({
      type: 'entry.published',
      tenantId: org.id,
      spaceId: space.id,
      payload: { entryId: draft.sys.id, contentTypeId: published.sys.contentType.id },
    })
    await call('POST', `/entries/${draft.sys.id}/publish`, {}, { 'idempotency-key': 'p-1' })
    await events.flush()
    expect(delivered).toHaveLength(1)

    // Read as delivery would: published state, filtered by slug.
    const live = await call<{ entries: EntryView[] }>(
      'GET',
      `/spaces/${space.id}/entries?state=published&contentType=page&fields.slug=home`,
    )
    expect(live.entries.map((e) => e.fields)).toEqual([fields])

    // Storage is immutable and keyed by stable ids.
    const rows = await db.db.execute(
      sql`select number, fields from content.entry_versions where entry_id = ${draft.sys.id} order by number`,
    )
    expect(rows.rows.map((r) => r['number'])).toEqual([1, 2])
    expect(JSON.stringify(rows.rows[1]?.['fields'])).not.toContain('"title"')

    // Unpublish delivers too.
    await call('POST', `/entries/${draft.sys.id}/unpublish`)
    await events.flush()
    expect(delivered.map((e) => e.type)).toEqual(['entry.published', 'entry.unpublished'])
  })
})
