import type { Actor } from '@blixis/contracts'
import { DATABASE, databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { graphqlModule } from '@blixis/graphql'
import { serviceOverride } from '@blixis/kernel'
import { permissionsModule } from '@blixis/permissions'
import { LOCALE_SERVICE, spacesModule, TENANCY_SERVICE } from '@blixis/spaces'
import {
  asDeliveryKey,
  asUser,
  captureEvents,
  createTestBlixis,
  type TestBlixis,
} from '@blixis/testing'
import {
  countQueries,
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { USER_SERVICE, usersModule } from '@blixis/users'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CONTENT_SERVICE, CONTENT_TYPE_SERVICE, contentModule } from '../src/index.ts'

const modules = (stampTtlMs = 0) => [
  databaseModule(),
  usersModule(),
  spacesModule(),
  permissionsModule(),
  contentModule({ stampTtlMs }),
  graphqlModule(),
]

describe.skipIf(!databaseTestsEnabled())('delivery caching (Postgres)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function setup(options: { stampTtlMs?: number; database?: TestDatabase['db'] } = {}) {
    const t = await createTestBlixis({
      modules: [...modules(options.stampTtlMs), captureEvents().module()],
      ...(options.database === undefined
        ? { database: db }
        : { overrides: [serviceOverride(DATABASE, options.database)] }),
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
      await services.get(CONTENT_TYPE_SERVICE).create(owner, tenant, {
        apiId: 'page',
        name: 'Page',
        fields: [{ apiId: 'title', name: 'Title', type: 'text', localized: true }],
      })
      const page = await services
        .get(CONTENT_SERVICE)
        .create(owner, tenant, { contentType: 'page', fields: { title: { 'en-US': 'One' } } })
      await services.get(CONTENT_SERVICE).publish(owner, tenant, page.sys.id)
      return { owner, org, space, tenant, pageId: page.sys.id }
    })
    const edit = (title: string, version: number) =>
      t.app.runInScope({}, async ({ services }) => {
        const content = services.get(CONTENT_SERVICE)
        await content.update(seeded.owner, seeded.tenant, seeded.pageId, {
          expectedVersion: version,
          fields: { title: { 'en-US': title } },
        })
        await content.publish(seeded.owner, seeded.tenant, seeded.pageId)
      })
    return { t, edit, ...seeded }
  }
  const QUERY = '{ pageCollection { items { title } } }'
  const ask = async (t: TestBlixis, actor: Actor, params = '', query = QUERY) => {
    const res = await t.request(`/graphql${params}`, { method: 'POST', actor, json: { query } })
    const body = (await res.json()) as {
      data?: { pageCollection?: { items: { title: string }[] } }
    }
    return {
      cache: res.headers.get('x-blixis-cache'),
      titles: body.data?.pageCollection?.items.map((i) => i.title),
    }
  }

  it('serves repeats from the cache and fresh content right after publishing', async () => {
    const { t, org, space, edit } = await setup()
    const key = asDeliveryKey({ organizationId: org.id, spaceId: space.id })
    expect(await ask(t, key)).toEqual({ cache: 'MISS', titles: ['One'] })
    expect(await ask(t, key)).toEqual({ cache: 'HIT', titles: ['One'] })
    await edit('Two', 1)
    expect(await ask(t, key)).toEqual({ cache: 'MISS', titles: ['Two'] })
    expect(await ask(t, key)).toEqual({ cache: 'HIT', titles: ['Two'] })
  })

  it('invalidates on locale changes too', async () => {
    const { t, org, space, owner, tenant } = await setup()
    const key = asDeliveryKey({ organizationId: org.id, spaceId: space.id })
    await ask(t, key)
    expect((await ask(t, key)).cache).toBe('HIT')
    await t.app.runInScope({}, ({ services }) =>
      services.get(LOCALE_SERVICE).create(owner, tenant, { code: 'nl-NL' }),
    )
    expect((await ask(t, key)).cache).toBe('MISS')
  })

  it('bypasses the cache for previews, members, and environment-limited keys', async () => {
    const { t, org, space, owner } = await setup()
    const tenant = { organizationId: org.id, spaceId: space.id }
    for (const [actor, params] of [
      [asDeliveryKey(tenant, 'preview'), ''],
      [owner, `?space=${space.id}`],
      [
        asDeliveryKey(tenant, 'delivery', { environmentIds: [space.environments[0]?.id ?? ''] }),
        '',
      ],
    ] as const) {
      await ask(t, actor, params)
      expect((await ask(t, actor, params)).cache).toBe('BYPASS')
    }
    // A preview query by a delivery key fails (FORBIDDEN) and is never stored.
    const key = asDeliveryKey(tenant)
    const preview = '{ pageCollection(preview: true) { items { title } } }'
    await ask(t, key, '', preview)
    expect((await ask(t, key, '', preview)).cache).toBe('BYPASS')
  })

  it('answers cache hits without any SQL while the stamp is remembered', async () => {
    const counter = countQueries(db)
    try {
      const { t, org, space } = await setup({ stampTtlMs: 60_000, database: counter.db })
      const key = asDeliveryKey({ organizationId: org.id, spaceId: space.id })
      await ask(t, key)
      counter.reset()
      expect((await ask(t, key)).cache).toBe('HIT')
      expect(counter.queries).toEqual([])
    } finally {
      await counter.close()
    }
  })
})
