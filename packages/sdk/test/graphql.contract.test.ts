import { eventsModule } from '@blixis/events'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest'
import {
  BlixisApiError,
  createBlixisClient,
  createBlixisGraphQLClient,
  type TypedDocument,
} from '../src/index.ts'
import { apiModules, createApi } from './harness.ts'

describe.skipIf(!databaseTestsEnabled())('SDK ↔ GraphQL delivery (contract)', () => {
  let db: TestDatabase
  let api: Awaited<ReturnType<typeof createApi>>
  let keys: { delivery: string; preview: string }
  const requests: { method: string; url: string }[] = []

  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...apiModules(), eventsModule()] })
    api = await createApi(db)
    const session = await createBlixisClient({ baseUrl: api.baseUrl, fetch: api.fetch }).call(
      'signUp',
      {
        body: {
          email: 'delivery@example.com',
          displayName: 'D',
          password: 'correct horse battery',
          tokenDelivery: 'body',
        },
      },
    )
    const blixis = createBlixisClient({
      baseUrl: api.baseUrl,
      fetch: api.fetch,
      token: session.accessToken,
    })
    const org = await blixis.organizations.create({ name: 'Delivery', slug: 'delivery' })
    const space = await blixis.spaces.create(org.id, { name: 'Site', slug: 'site' })
    await blixis.call('createLocale', {
      params: { spaceId: space.id },
      body: { code: 'nl-NL', fallbackCode: 'en-US' },
    })
    await blixis.contentTypes.create(space.id, {
      apiId: 'page',
      name: 'Page',
      fields: [{ apiId: 'title', name: 'Title', type: 'text', localized: true }],
    })
    const home = await blixis.entries.create(space.id, 'page', {
      title: { 'en-US': 'Home', 'nl-NL': 'Thuis' },
    })
    await blixis.entries.publish(home.sys.id)
    await blixis.entries.create(space.id, 'page', { title: { 'en-US': 'Draft' } })
    keys = {
      delivery: (await blixis.deliveryKeys.create(space.id, { name: 'Site', kind: 'delivery' }))
        .key,
      preview: (await blixis.deliveryKeys.create(space.id, { name: 'Preview', kind: 'preview' }))
        .key,
    }
  })
  afterAll(async () => {
    expect(api.violations).toEqual([])
    await db.drop()
  })

  const client = (token: string, options: { persistedQueries?: boolean } = {}) =>
    createBlixisGraphQLClient({
      baseUrl: api.baseUrl,
      token,
      ...options,
      fetch: async (request) => {
        requests.push({ method: request.method, url: request.url })
        return api.fetch(request)
      },
    })
  const PAGES = /* GraphQL */ `query Pages($locale: Locale, $preview: Boolean) {
    pageCollection(locale: $locale, preview: $preview) { items { title } }
  }`
  type PagesDocument = TypedDocument<
    { pageCollection: { items: { title: string | null }[] } },
    { locale?: string; preview?: boolean }
  >

  it('reads published content with a delivery key, in the requested locale', async () => {
    const delivery = client(keys.delivery)
    const data = await delivery.query(PAGES as PagesDocument)
    expectTypeOf(data.pageCollection.items).toEqualTypeOf<{ title: string | null }[]>()
    expect(data.pageCollection.items.map((i) => i.title)).toEqual(['Home'])
    const dutch = await delivery.query(PAGES as PagesDocument, {}, { locale: 'nl-NL' })
    expect(dutch.pageCollection.items.map((i) => i.title)).toEqual(['Thuis'])
  })

  it('needs a preview key for drafts', async () => {
    const denied = await client(keys.delivery)
      .query(PAGES, {}, { preview: true })
      .catch((e) => e)
    expect(denied).toBeInstanceOf(BlixisApiError)
    expect(denied).toMatchObject({ code: 'FORBIDDEN' })
    const drafts = await client(keys.preview).query(PAGES as PagesDocument, {}, { preview: true })
    expect(drafts.pageCollection.items.map((i) => i.title).sort()).toEqual(['Draft', 'Home'])
  })

  it('uses persisted queries over GET, served from the delivery cache', async () => {
    const delivery = client(keys.delivery)
    const QUERY = '{ pageCollection { items { title } } }'
    requests.length = 0
    await delivery.query(QUERY)
    // Unknown hash (GET) → registered with the full query (POST).
    expect(requests.map((r) => r.method)).toEqual(['GET', 'POST'])
    expect(requests[0]?.url).toContain('extensions=')
    expect(requests[0]?.url).not.toContain('query=')
    requests.length = 0
    await delivery.query(QUERY)
    expect(requests.map((r) => r.method)).toEqual(['GET'])
    expect(api.lastCache.value).toBe('HIT')
  })

  it('reports GraphQL errors with their code', async () => {
    const error = await client(keys.delivery, { persistedQueries: false })
      .query('{ pageCollection(locale: "xx-XX") { items { title } } }')
      .catch((e) => e)
    expect(error).toMatchObject({ code: 'VALIDATION_FAILED' })
    expect((error as BlixisApiError).details).toMatchObject({
      errors: [{ extensions: { code: 'VALIDATION_FAILED' } }],
    })
  })
})
