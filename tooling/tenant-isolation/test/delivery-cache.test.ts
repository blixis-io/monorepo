import { DELIVERY_KEY_SERVICE } from '@blixis/auth'
import { CONTENT_SERVICE, CONTENT_TYPE_SERVICE } from '@blixis/content'
import { QUEUE_SENDER } from '@blixis/events'
import { serviceOverride } from '@blixis/kernel'
import { LOCALE_SERVICE, TENANCY_SERVICE } from '@blixis/spaces'
import { asUser, createTestBlixis, type TestBlixis } from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { USER_SERVICE } from '@blixis/users'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiModules } from './api.ts'

/**
 * The delivery cache never crosses tenants (roadmap 013.005, ADR 0012): identical queries in
 * two spaces, other locales, and revoked keys each get their own answer. Runs the API Worker's
 * real module list, so the cache configuration is the one staging serves.
 */
describe.skipIf(!databaseTestsEnabled())('delivery cache isolation', () => {
  let db: TestDatabase
  let t: TestBlixis
  let spaces: {
    owner: string
    spaceId: string
    organizationId: string
    key: string
    keyId: string
  }[]

  beforeAll(async () => {
    const modules = await apiModules()
    db = await createTestDatabase({ modules })
    t = await createTestBlixis({
      modules,
      database: db,
      overrides: [serviceOverride(QUEUE_SENDER, { send: async () => undefined })],
    })
    spaces = await t.app.runInScope({}, async ({ services }) => {
      const seed = async (name: string) => {
        const owner = await services
          .get(USER_SERVICE)
          .create({ email: `${name}@example.com`, displayName: name })
        const tenancy = services.get(TENANCY_SERVICE)
        const org = await tenancy.createOrganization(asUser(owner.id), { name, slug: name })
        const space = await tenancy.createSpace(asUser(owner.id), org.id, { name, slug: name })
        const tenant = {
          organizationId: org.id,
          spaceId: space.id,
          environmentId: space.environments[0]?.id ?? '',
        }
        await services
          .get(LOCALE_SERVICE)
          .create(asUser(owner.id), tenant, { code: 'de', name: 'German' })
        // The same content model in both spaces: only the space tells the responses apart.
        await services.get(CONTENT_TYPE_SERVICE).create(asUser(owner.id), tenant, {
          apiId: 'page',
          name: 'Page',
          fields: [{ apiId: 'title', name: 'Title', type: 'text', localized: true }],
        })
        const content = services.get(CONTENT_SERVICE)
        const page = await content.create(asUser(owner.id), tenant, {
          contentType: 'page',
          fields: { title: { 'en-US': `${name} page`, de: `${name} Seite` } },
        })
        await content.publish(asUser(owner.id), tenant, page.sys.id)
        const { key, record } = await services
          .get(DELIVERY_KEY_SERVICE)
          .create(
            asUser(owner.id),
            { organizationId: org.id, spaceId: space.id },
            { name: 'Site', kind: 'delivery' },
            [],
          )
        return { owner: owner.id, organizationId: org.id, spaceId: space.id, key, keyId: record.id }
      }
      return [await seed('alpha'), await seed('beta')]
    })
  })
  afterAll(() => db.drop())

  const QUERY =
    'query Pages($locale: Locale) { pageCollection(locale: $locale) { items { title } } }'
  async function ask(key: string, variables: Record<string, unknown> = {}) {
    const res = await t.request('/graphql', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      json: { query: QUERY, variables },
    })
    const body = (await res.json()) as { data?: { pageCollection: { items: { title: string }[] } } }
    return {
      status: res.status,
      cache: res.headers.get('x-blixis-cache'),
      titles: body.data?.pageCollection.items.map((i) => i.title),
    }
  }

  it('never serves one space the cached response of another', async () => {
    const [alpha, beta] = spaces
    expect(await ask(alpha?.key ?? '')).toEqual({
      status: 200,
      cache: 'MISS',
      titles: ['alpha page'],
    })
    expect(await ask(alpha?.key ?? '')).toMatchObject({ cache: 'HIT', titles: ['alpha page'] })
    // Byte-identical request, other key: a miss with its own content.
    expect(await ask(beta?.key ?? '')).toEqual({
      status: 200,
      cache: 'MISS',
      titles: ['beta page'],
    })
    expect(await ask(beta?.key ?? '')).toMatchObject({ cache: 'HIT', titles: ['beta page'] })
  })

  it('keeps locales apart', async () => {
    const [alpha] = spaces
    const key = alpha?.key ?? ''
    await ask(key, { locale: 'en-US' })
    expect(await ask(key, { locale: 'de' })).toMatchObject({
      cache: 'MISS',
      titles: ['alpha Seite'],
    })
    expect(await ask(key, { locale: 'de' })).toMatchObject({
      cache: 'HIT',
      titles: ['alpha Seite'],
    })
    expect(await ask(key, { locale: 'en-US' })).toMatchObject({
      cache: 'HIT',
      titles: ['alpha page'],
    })
  })

  it('refuses a revoked key even though its response is cached', async () => {
    const [, beta] = spaces
    const key = beta?.key ?? ''
    await ask(key)
    expect((await ask(key)).cache).toBe('HIT')
    const revoked = await t.request(
      `/api/v1/spaces/${beta?.spaceId}/delivery-keys/${beta?.keyId}`,
      { method: 'DELETE', actor: asUser(beta?.owner ?? '') },
    )
    expect(revoked.status).toBe(204)
    // Authentication runs before the cache lookup, and revoking forgets the key in this isolate.
    expect(await ask(key)).toEqual({ status: 401, cache: null, titles: undefined })
  })
})
