import { CONTENT_SERVICE, CONTENT_TYPE_SERVICE, contentModule } from '@blixis/content'
import type { EventEnvelope } from '@blixis/contracts'
import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { permissionsModule } from '@blixis/permissions'
import { spacesModule, TENANCY_SERVICE } from '@blixis/spaces'
import { asUser, captureEvents, createTestBlixis, serviceOverride } from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { USER_SERVICE, usersModule } from '@blixis/users'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PUBLIC_EVENT_DEFINITIONS } from '../src/application/public-events.ts'
import {
  generateWebhookKey,
  PUBLIC_WEBHOOK_EVENTS,
  WEBHOOK_FETCH,
  WEBHOOK_SERVICE,
  WEBHOOKS_CONFIG,
  webhookBody,
  webhooksModule,
} from '../src/index.ts'

describe('public webhook events', () => {
  it('subscribes to exactly the documented public event types', () => {
    expect(PUBLIC_EVENT_DEFINITIONS.map((e) => e.type).sort()).toEqual(
      [...PUBLIC_WEBHOOK_EVENTS].sort(),
    )
  })

  it('builds the public body with ids only, never internal fields', () => {
    const envelope = (type: string, payload: object): EventEnvelope => ({
      id: 'evt-1',
      type,
      version: 1,
      timestamp: '2026-09-27T10:00:00.000Z',
      payload,
    })
    const tenant = { organizationId: 'org', spaceId: 'space', environmentId: 'env' }
    expect(
      webhookBody(
        envelope('asset.updated', {
          ...tenant,
          assetId: 'a1',
          objectKey: 's/a/f',
          replacedObjectKey: 's/a/g',
          version: 3,
        }),
      ),
    ).toEqual({
      id: 'evt-1',
      type: 'asset.updated',
      version: 1,
      createdAt: '2026-09-27T10:00:00.000Z',
      spaceId: 'space',
      environmentId: 'env',
      data: { assetId: 'a1', version: 3 },
    })
    expect(
      webhookBody(
        envelope('entry.published', {
          ...tenant,
          entryId: 'e1',
          contentTypeId: 'c1',
          versionId: 'v1',
        }),
      ).data,
    ).toEqual({ entryId: 'e1', contentTypeId: 'c1', versionId: 'v1' })
  })
})

const modules = () => [
  databaseModule(),
  usersModule(),
  spacesModule(),
  permissionsModule(),
  contentModule(),
  webhooksModule(),
]

describe.skipIf(!databaseTestsEnabled())('webhook fan-out (Postgres)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  it('creates one delivery per matching webhook, exactly once even when the event is redelivered', async () => {
    const events = captureEvents()
    const t = await createTestBlixis({
      modules: [...modules(), events.module()],
      database: db,
      overrides: [
        serviceOverride(WEBHOOKS_CONFIG, {
          secretKeys: generateWebhookKey('t'),
          allowPrivateUrls: false,
        }),
        // No network in tests: any delivery attempt fails loudly.
        serviceOverride(WEBHOOK_FETCH, async () => {
          throw new Error('unexpected network call')
        }),
      ],
    })
    const { hooks, entryId } = await t.app.runInScope({}, async ({ services }) => {
      const owner = asUser(
        (await services.get(USER_SERVICE).create({ email: 'o@example.com', displayName: 'O' })).id,
      )
      const tenancy = services.get(TENANCY_SERVICE)
      const org = await tenancy.createOrganization(owner, { name: 'Org', slug: 'org' })
      const space = await tenancy.createSpace(owner, org.id, { name: 'Site', slug: 'site' })
      const tenant = { organizationId: org.id, spaceId: space.id }
      const webhooks = services.get(WEBHOOK_SERVICE)
      const make = async (name: string, eventTypes: string[], active = true) =>
        (
          await webhooks.create(owner, tenant, {
            name,
            url: `https://hooks.example.com/${name}`,
            eventTypes,
            active,
          })
        ).webhook.id
      const hooks = {
        all: await make('all', ['entry.*']),
        published: await make('published', ['entry.published']),
        assets: await make('assets', ['asset.*']),
        inactive: await make('inactive', ['*'], false),
      }
      const environment = { ...tenant, environmentId: space.environments[0]?.id ?? '' }
      await services
        .get(CONTENT_TYPE_SERVICE)
        .create(owner, environment, { apiId: 'page', name: 'Page' })
      const content = services.get(CONTENT_SERVICE)
      const entry = await content.create(owner, environment, { contentType: 'page', fields: {} })
      await content.publish(owner, environment, entry.sys.id)
      return { hooks, entryId: entry.sys.id }
    })

    const rows = async () =>
      (
        await db.db.execute<{
          webhook_id: string
          event_type: string
          status: string
          payload: { data: { entryId?: string } }
        }>(
          sql`select webhook_id, event_type, status, payload from webhooks.deliveries order by event_type, webhook_id`,
        )
      ).rows
    const published = (await rows()).filter((r) => r.event_type === 'entry.published')
    expect(published.map((r) => r.webhook_id).sort()).toEqual([hooks.all, hooks.published].sort())
    expect(
      published.every((r) => r.status === 'pending' && r.payload.data.entryId === entryId),
    ).toBe(true)
    // entry.* also caught entry.created; the asset and inactive webhooks got nothing.
    expect(
      (await rows()).map(
        (r) => `${r.event_type}→${r.webhook_id === hooks.all ? 'all' : 'published'}`,
      ),
    ).toEqual(['entry.created→all', 'entry.published→all', 'entry.published→published'].sort())
    const requested = () =>
      events.emitted.filter((e) => e.type === 'webhook.delivery.requested').length
    expect(requested()).toBe(3)

    // Redeliver entry.published to the fan-out subscription: nothing new.
    const envelope = events.expectEvent('entry.published')
    const fan = webhooksModule().events?.find((s) => s.id === 'fan-out.entry.published')
    await t.app.runInScope({}, async ({ services }) => {
      await fan?.handle(envelope as never, { services } as never)
      await fan?.handle(envelope as never, { services } as never)
    })
    expect((await rows()).length).toBe(3)
    expect(requested()).toBe(3)
  })
})
