import { type EventEnvelope, OBJECT_STORAGE } from '@blixis-io/contracts'
import { databaseModule } from '@blixis-io/database'
import { eventsModule } from '@blixis-io/events'
import { permissionsModule } from '@blixis-io/permissions'
import { spacesModule, TENANCY_SERVICE } from '@blixis-io/spaces'
import {
  asUser,
  captureEvents,
  createMemoryObjectStorage,
  createTestBlixis,
  serviceOverride,
} from '@blixis-io/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis-io/testing/database'
import { USER_SERVICE, usersModule } from '@blixis-io/users'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ASSET_SERVICE, assetsModule } from '../src/index.ts'

const modules = () => [
  databaseModule(),
  usersModule(),
  spacesModule(),
  permissionsModule(),
  assetsModule({ multipartPartBytes: 4 }),
]
const stream = (text: string) =>
  new Response(new TextEncoder().encode(text)).body as ReadableStream<Uint8Array>

describe.skipIf(!databaseTestsEnabled())('asset file cleanup (Postgres, memory storage)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function setup() {
    const storage = createMemoryObjectStorage({ minPartBytes: 4 })
    // Records every key that really existed when deleted: "deleted once" is observable.
    const removed: string[] = []
    const del = storage.delete.bind(storage)
    storage.delete = async (keys) => {
      for (const key of typeof keys === 'string' ? [keys] : keys)
        if (storage.keys().includes(key)) removed.push(key)
      await del(keys)
    }
    const events = captureEvents()
    const t = await createTestBlixis({
      modules: [...modules(), events.module()],
      database: db,
      overrides: [serviceOverride(OBJECT_STORAGE, storage)],
    })
    const seeded = await t.app.runInScope({}, async ({ services }) => {
      const owner = asUser(
        (await services.get(USER_SERVICE).create({ email: 'o@example.com', displayName: 'O' })).id,
      )
      const tenancy = services.get(TENANCY_SERVICE)
      const org = await tenancy.createOrganization(owner, { name: 'Org', slug: 'org' })
      const space = await tenancy.createSpace(owner, org.id, { name: 'Site', slug: 'site' })
      const tenant = {
        organizationId: org.id,
        spaceId: space.id,
        environmentId: space.environments[0]?.id ?? '',
      }
      return { owner, org, space, tenant }
    })
    const as = <T>(fn: (a: import('../src/index.ts').AssetService) => Promise<T>) =>
      t.app.runInScope({}, ({ services }) => fn(services.get(ASSET_SERVICE)))
    const upload = (text: string, name = 'a.txt') =>
      as((a) =>
        a.upload(seeded.owner, seeded.tenant, {
          filename: name,
          mimeType: 'text/plain',
          size: text.length,
          body: stream(text),
        }),
      )
    return { t, storage, removed, events, as, upload, ...seeded }
  }

  it('deletes the file after the asset, exactly once even when the event is redelivered', async () => {
    const { t, storage, removed, events, as, upload, owner, tenant } = await setup()
    const asset = await upload('hello')
    const [key] = storage.keys()
    await as((a) => a.delete(owner, tenant, asset.sys.id))
    expect(storage.keys()).toEqual([])
    // Redeliver the same envelope to the module's subscription.
    const envelope = events.expectEvent('asset.deleted') as EventEnvelope
    const subscription = assetsModule().events?.find((s) => s.id === 'delete-file')
    await t.app.runInScope({}, async ({ services }) => {
      await subscription?.handle(envelope as never, { services } as never)
      await subscription?.handle(envelope as never, { services } as never)
    })
    expect(removed).toEqual([key])
  })

  it('deletes replaced files and every file of a deleted space', async () => {
    const { t, storage, as, upload, owner, tenant, space } = await setup()
    const first = await upload('v1')
    const oldKey = storage.keys()[0]
    await as((a) =>
      a.uploadReplacement(owner, tenant, first.sys.id, {
        mimeType: 'text/plain',
        size: 2,
        body: stream('v2'),
        expectedVersion: 1,
      }),
    )
    expect(storage.keys()).toHaveLength(1)
    expect(storage.keys()).not.toContain(oldKey)
    await upload('another', 'b.txt')
    await storage.put(`${space.id}/stray/file`, 'orphan')
    expect(storage.keys()).toHaveLength(3)
    await t.app.runInScope({}, ({ services }) =>
      services.get(TENANCY_SERVICE).deleteSpace(owner, space.id),
    )
    expect(storage.keys()).toEqual([])
    const rows = await db.db.execute(sql`select count(*)::int as n from assets.assets`)
    expect(rows.rows[0]).toEqual({ n: 0 })
  })

  it('removes stale pending uploads on the cleanup cron, and nothing else', async () => {
    const { t, storage, as, upload, owner, tenant } = await setup()
    const ready = await upload('keep me')
    const started = await as((a) =>
      a.startUpload(owner, tenant, { filename: 'big.txt', mimeType: 'text/plain', size: 10 }),
    )
    await as((a) => a.uploadPart(owner, tenant, started.asset.sys.id, 1, stream('abcd'), 4))
    const fresh = await as((a) =>
      a.createPending(owner, tenant, { filename: 'new.txt', mimeType: 'text/plain' }),
    )
    // Age the multipart upload past the 24-hour limit.
    await db.db.execute(
      sql`update assets.assets set created_at = now() - interval '25 hours' where id = ${started.asset.sys.id}::uuid`,
    )
    expect(storage.pendingUploads).toBe(1)
    await t.app.scheduled({ cron: '* * * * *', scheduledTime: Date.now() })
    expect(storage.pendingUploads).toBe(0)
    const left = await db.db.execute<{ id: string }>(sql`select id from assets.assets order by id`)
    expect(left.rows.map((r) => r.id).sort()).toEqual([ready.sys.id, fresh.asset.sys.id].sort())
  })
})
