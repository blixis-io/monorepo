import {
  type Actor,
  ConflictError,
  type EventEnvelope,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@blixis/contracts'
import { databaseModule } from '@blixis/database'
import { eventsModule, QUEUE_SENDER, queueTransport } from '@blixis/events'
import { outboxModule, outboxTransport } from '@blixis/events/outbox'
import { serviceOverride } from '@blixis/kernel'
import { permissionsModule } from '@blixis/permissions'
import { LOCALE_SERVICE, MEMBER_SERVICE, spacesModule, TENANCY_SERVICE } from '@blixis/spaces'
import { asUser, captureEvents, createTestBlixis, type TestBlixis } from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { USER_SERVICE, usersModule } from '@blixis/users'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  ASSET_SERVICE,
  type AssetService,
  assetsModule,
  type EnvironmentTenant,
} from '../src/index.ts'

const base = () => [
  databaseModule(),
  usersModule(),
  spacesModule(),
  permissionsModule(),
  assetsModule({ maxAssetBytes: 1000 }),
]

describe.skipIf(!databaseTestsEnabled())('AssetService (Postgres)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...base(), eventsModule(), outboxModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function seed(t: TestBlixis) {
    return t.app.runInScope({}, async ({ services }) => {
      const users = services.get(USER_SERVICE)
      const mk = async (email: string) =>
        asUser((await users.create({ email, displayName: email })).id)
      const [owner, editor, viewer, outsider] = [
        await mk('o@example.com'),
        await mk('e@example.com'),
        await mk('v@example.com'),
        await mk('x@example.com'),
      ]
      const tenancy = services.get(TENANCY_SERVICE)
      const org = await tenancy.createOrganization(owner, { name: 'Org', slug: 'org' })
      const space = await tenancy.createSpace(owner, org.id, { name: 'Site', slug: 'site' })
      const members = services.get(MEMBER_SERVICE)
      await members.addOrganizationMember(owner, org.id, { email: 'e@example.com', role: 'editor' })
      await members.addOrganizationMember(owner, org.id, { email: 'v@example.com', role: 'viewer' })
      const tenant: EnvironmentTenant = {
        organizationId: org.id,
        spaceId: space.id,
        environmentId: space.environments[0]?.id ?? '',
      }
      await services.get(LOCALE_SERVICE).create(owner, tenant, { code: 'nl-NL' })
      return { owner, editor, viewer, outsider, tenant }
    })
  }

  async function setup() {
    const events = captureEvents()
    const t = await createTestBlixis({ modules: [...base(), events.module()], database: db })
    const seeded = await seed(t)
    const as = <T>(fn: (assets: AssetService) => Promise<T>) =>
      t.app.runInScope({}, ({ services }) => fn(services.get(ASSET_SERVICE)))
    return { t, events, as, ...seeded }
  }

  it('runs the lifecycle pending → ready → published → draft → deleted', async () => {
    const { as, events, editor, tenant } = await setup()
    const { asset, objectKey } = await as((a) =>
      a.createPending(editor, tenant, {
        filename: '../photos/Team photo.JPG',
        mimeType: 'Image/JPEG; charset=binary',
        title: { 'en-US': 'Team', 'nl-NL': 'Team' },
      }),
    )
    expect(asset.sys).toMatchObject({ type: 'asset', status: 'pending', version: 1 })
    expect(asset.fields).toMatchObject({
      filename: 'Team photo.JPG',
      mimeType: 'image/jpeg',
      size: null,
      title: { 'en-US': 'Team', 'nl-NL': 'Team' },
    })
    expect(objectKey).toMatch(new RegExp(`^${tenant.spaceId}/${asset.sys.id}/[0-9a-f-]{36}$`))
    // Pending uploads emit nothing and stay out of the default list.
    const assetEvents = () => events.emitted.filter((e) => e.type.startsWith('asset.'))
    expect(assetEvents()).toEqual([])
    expect((await as((a) => a.list(editor, tenant))).assets).toEqual([])
    expect((await as((a) => a.list(editor, tenant, { state: 'pending' }))).assets).toHaveLength(1)
    await expect(as((a) => a.publish(editor, tenant, asset.sys.id))).rejects.toThrow(ConflictError)

    const ready = await as((a) =>
      a.markReady(editor, tenant, asset.sys.id, { sizeBytes: 512, sha256: 'ab', width: 64 }),
    )
    expect(ready.sys.status).toBe('draft')
    expect(ready.fields).toMatchObject({ size: 512, sha256: 'ab', width: 64, height: null })
    expect(events.expectEvent('asset.created').payload).toEqual({
      assetId: asset.sys.id,
      ...tenant,
      objectKey,
      version: 1,
    })
    await expect(
      as((a) => a.markReady(editor, tenant, asset.sys.id, { sizeBytes: 1 })),
    ).rejects.toThrow('already uploaded')

    const published = await as((a) => a.publish(editor, tenant, asset.sys.id))
    expect(published.sys.status).toBe('published')
    expect(published.sys.firstPublishedAt).not.toBeNull()
    await as((a) => a.publish(editor, tenant, asset.sys.id))
    expect(assetEvents().filter((e) => e.type === 'asset.published')).toHaveLength(1)
    expect(
      (await as((a) => a.list(editor, tenant, { state: 'published' }))).assets.map((x) => x.sys.id),
    ).toEqual([asset.sys.id])
    await expect(as((a) => a.delete(editor, tenant, asset.sys.id))).rejects.toThrow(
      'unpublish it first',
    )

    const draft = await as((a) => a.unpublish(editor, tenant, asset.sys.id))
    expect(draft.sys).toMatchObject({ status: 'draft', publishedAt: null })
    expect(draft.sys.firstPublishedAt).toBe(published.sys.firstPublishedAt)
    await as((a) => a.delete(editor, tenant, asset.sys.id))
    expect(events.expectEvent('asset.deleted').payload).toMatchObject({ objectKey })
    await expect(as((a) => a.get(editor, tenant, asset.sys.id))).rejects.toThrow(NotFoundError)
  })

  it('validates names, types, locales, and sizes', async () => {
    const { as, editor, tenant } = await setup()
    const issues = async (input: Parameters<AssetService['createPending']>[2]) => {
      const error = await as((a) => a.createPending(editor, tenant, input)).catch((e) => e)
      expect(error).toBeInstanceOf(ValidationError)
      return (error as ValidationError).issues.map((i) => [i.path.join('.'), i.message])
    }
    expect(await issues({ filename: 'a/ ', mimeType: 'text/html' })).toEqual([
      ['filename', 'Give the file a name (at most 255 characters)'],
      ['mimeType', "Files of type text/html can't be uploaded here"],
    ])
    expect(await issues({ filename: 'x.exe', mimeType: 'application/x-msdownload' })).toEqual([
      ['mimeType', "Files of type application/x-msdownload can't be uploaded here"],
    ])
    expect(
      await issues({ filename: 'a.png', mimeType: 'image/png', title: { 'de-DE': 'Bild' } }),
    ).toEqual([['title.de-DE', 'Unknown locale']])
    const { asset } = await as((a) =>
      a.createPending(editor, tenant, { filename: 'a.png', mimeType: 'image/png' }),
    )
    await expect(
      as((a) => a.markReady(editor, tenant, asset.sys.id, { sizeBytes: 1001 })),
    ).rejects.toThrow('too large')
  })

  it('updates metadata with optimistic concurrency and replaces files', async () => {
    const { as, events, editor, tenant } = await setup()
    const { asset, objectKey } = await as((a) =>
      a.createPending(editor, tenant, { filename: 'a.png', mimeType: 'image/png' }),
    )
    await as((a) => a.markReady(editor, tenant, asset.sys.id, { sizeBytes: 10 }))
    const renamed = await as((a) =>
      a.updateMetadata(editor, tenant, asset.sys.id, {
        filename: 'b.png',
        description: { 'en-US': 'Logo' },
        expectedVersion: 1,
      }),
    )
    expect(renamed.sys.version).toBe(2)
    expect(renamed.fields).toMatchObject({ filename: 'b.png', description: { 'en-US': 'Logo' } })
    await expect(
      as((a) =>
        a.updateMetadata(editor, tenant, asset.sys.id, { filename: 'c.png', expectedVersion: 1 }),
      ),
    ).rejects.toThrow('now version 2')

    const next = await as((a) =>
      a.prepareReplacement(editor, tenant, asset.sys.id, { mimeType: 'image/webp' }),
    )
    expect(next.objectKey).not.toBe(objectKey)
    await expect(
      as((a) =>
        a.replaceFile(editor, tenant, asset.sys.id, {
          objectKey: `${tenant.spaceId}/other/file`,
          mimeType: 'image/webp',
          file: { sizeBytes: 5 },
          expectedVersion: 2,
        }),
      ),
    ).rejects.toThrow('Invalid storage key')
    const replaced = await as((a) =>
      a.replaceFile(editor, tenant, asset.sys.id, {
        objectKey: next.objectKey,
        filename: 'b.webp',
        mimeType: 'image/webp',
        file: { sizeBytes: 5, width: 10, height: 20 },
        expectedVersion: 2,
      }),
    )
    expect(replaced.fields).toMatchObject({
      filename: 'b.webp',
      mimeType: 'image/webp',
      size: 5,
      width: 10,
      height: 20,
    })
    expect(
      events.expectEvent<{ replacedObjectKey?: string }>(
        'asset.updated',
        (e) => e.payload.replacedObjectKey !== undefined,
      ).payload,
    ).toMatchObject({ objectKey: next.objectKey, replacedObjectKey: objectKey, version: 3 })
  })

  it('pages newest first and filters by media type', async () => {
    const { as, editor, tenant } = await setup()
    const ids: string[] = []
    for (const [name, type] of [
      ['a.png', 'image/png'],
      ['b.pdf', 'application/pdf'],
      ['c.jpg', 'image/jpeg'],
    ] as const) {
      const { asset } = await as((a) =>
        a.createPending(editor, tenant, { filename: name, mimeType: type }),
      )
      await as((a) => a.markReady(editor, tenant, asset.sys.id, { sizeBytes: 1 }))
      ids.push(asset.sys.id)
    }
    const first = await as((a) => a.list(editor, tenant, { limit: 2 }))
    expect(first.assets.map((a) => a.fields.filename)).toEqual(['c.jpg', 'b.pdf'])
    const second = await as((a) =>
      a.list(editor, tenant, { limit: 2, cursor: first.nextCursor ?? '' }),
    )
    expect(second).toMatchObject({ nextCursor: null })
    expect(second.assets.map((a) => a.fields.filename)).toEqual(['a.png'])
    const images = await as((a) => a.list(editor, tenant, { mimeType: 'image/' }))
    expect(images.assets.map((a) => a.fields.filename)).toEqual(['c.jpg', 'a.png'])
    await expect(as((a) => a.list(editor, tenant, { cursor: 'x' }))).rejects.toThrow(
      ValidationError,
    )
  })

  it('authorizes: viewers read, editors write, outsiders see nothing', async () => {
    const { as, editor, viewer, outsider, tenant } = await setup()
    const { asset } = await as((a) =>
      a.createPending(editor, tenant, { filename: 'a.png', mimeType: 'image/png' }),
    )
    const denied = (actor: Actor, fn: (a: AssetService) => Promise<unknown>) =>
      as(fn).catch((e) => e.constructor)
    expect(await as((a) => a.get(viewer, tenant, asset.sys.id))).toBeDefined()
    expect(
      await denied(viewer, (a) =>
        a.createPending(viewer, tenant, { filename: 'b.png', mimeType: 'image/png' }),
      ),
    ).toBe(ForbiddenError)
    expect(await denied(viewer, (a) => a.delete(viewer, tenant, asset.sys.id))).toBe(ForbiddenError)
    expect(await denied(outsider, (a) => a.get(outsider, tenant, asset.sys.id))).toBe(NotFoundError)
    expect(await denied(outsider, (a) => a.resolveTenant(outsider, asset.sys.id))).toBe(
      NotFoundError,
    )
    expect(await as((a) => a.resolveTenant(viewer, asset.sys.id))).toEqual(tenant)
  })

  it('records asset events in the outbox within the transaction', async () => {
    const sent: EventEnvelope[] = []
    const t = await createTestBlixis({
      modules: [
        ...base(),
        eventsModule({ transport: queueTransport({ transactional: outboxTransport() }) }),
        outboxModule(),
      ],
      database: db,
      overrides: [serviceOverride(QUEUE_SENDER, { send: async (e) => void sent.push(...e) })],
    })
    const { editor, tenant } = await seed(t)
    const as = <T>(fn: (assets: AssetService) => Promise<T>) =>
      t.app.runInScope({}, ({ services }) => fn(services.get(ASSET_SERVICE)))
    const { asset } = await as((a) =>
      a.createPending(editor, tenant, { filename: 'a.png', mimeType: 'image/png' }),
    )
    await as((a) => a.markReady(editor, tenant, asset.sys.id, { sizeBytes: 3 }))
    await as((a) => a.delete(editor, tenant, asset.sys.id))
    const rows = await db.db.execute<{ type: string }>(
      sql`select type from events.outbox where type like 'asset.%' order by created_at, id`,
    )
    expect(rows.rows.map((r) => r.type)).toEqual(['asset.created', 'asset.deleted'])
    expect(sent.map((e) => e.type).filter((type) => type.startsWith('asset.'))).toEqual([
      'asset.created',
      'asset.deleted',
    ])
  })
})
