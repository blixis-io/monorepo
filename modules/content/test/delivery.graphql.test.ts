import type { Actor } from '@blixis/contracts'
import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { graphqlModule } from '@blixis/graphql'
import { permissionsModule } from '@blixis/permissions'
import { LOCALE_SERVICE, MEMBER_SERVICE, spacesModule, TENANCY_SERVICE } from '@blixis/spaces'
import {
  asDeliveryKey,
  asUser,
  captureEvents,
  createTestBlixis,
  type TestBlixis,
} from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { USER_SERVICE, usersModule } from '@blixis/users'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CONTENT_SERVICE, CONTENT_TYPE_SERVICE, contentModule } from '../src/index.ts'

const modules = () => [
  databaseModule(),
  usersModule(),
  spacesModule(),
  permissionsModule(),
  contentModule(),
  graphqlModule(),
]

interface Result {
  data?: Record<string, unknown> | null
  errors?: { message: string; extensions?: { code?: string } }[]
}

describe.skipIf(!databaseTestsEnabled())('GraphQL delivery (Postgres)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function setup() {
    const t = await createTestBlixis({
      modules: [...modules(), captureEvents().module()],
      database: db,
    })
    const seeded = await t.app.runInScope({}, async ({ services }) => {
      const users = services.get(USER_SERVICE)
      const owner = asUser((await users.create({ email: 'o@example.com', displayName: 'O' })).id)
      const viewer = asUser((await users.create({ email: 'v@example.com', displayName: 'V' })).id)
      const outsider = asUser((await users.create({ email: 'x@example.com', displayName: 'X' })).id)
      const tenancy = services.get(TENANCY_SERVICE)
      const org = await tenancy.createOrganization(owner, { name: 'Org', slug: 'org' })
      const space = await tenancy.createSpace(owner, org.id, { name: 'Site', slug: 'site' })
      await services
        .get(MEMBER_SERVICE)
        .addOrganizationMember(owner, org.id, { email: 'v@example.com', role: 'viewer' })
      const tenant = {
        organizationId: org.id,
        spaceId: space.id,
        environmentId: space.environments[0]?.id ?? '',
      }
      await services
        .get(LOCALE_SERVICE)
        .create(owner, tenant, { code: 'nl-NL', fallbackCode: 'en-US' })
      const types = services.get(CONTENT_TYPE_SERVICE)
      const author = await types.create(owner, tenant, {
        apiId: 'author',
        name: 'Author',
        fields: [{ apiId: 'name', name: 'Name', type: 'text' }],
      })
      const hero = await types.create(owner, tenant, {
        kind: 'component',
        apiId: 'hero',
        name: 'Hero',
        fields: [{ apiId: 'heading', name: 'Heading', type: 'text' }],
      })
      const page = await types.create(owner, tenant, {
        apiId: 'page',
        name: 'Page',
        fields: [
          {
            apiId: 'title',
            name: 'Title',
            type: 'text',
            localized: true,
            description: 'Page title',
          },
          { apiId: 'slug', name: 'Slug', type: 'text' },
          { apiId: 'rating', name: 'Rating', type: 'number', settings: { integer: true } },
          {
            apiId: 'author',
            name: 'Author',
            type: 'reference',
            settings: { contentTypeIds: [author.id] },
          },
          {
            apiId: 'body',
            name: 'Body',
            type: 'blocks',
            localized: true,
            settings: { componentIds: [hero.id] },
          },
          { apiId: 'cta', name: 'CTA', type: 'link' },
          { apiId: 'content', name: 'Content', type: 'richText' },
        ],
      })
      const content = services.get(CONTENT_SERVICE)
      const ada = await content.create(owner, tenant, {
        contentType: 'author',
        fields: { name: 'Ada' },
      })
      await content.publish(owner, tenant, ada.sys.id)
      const home = await content.create(owner, tenant, {
        contentType: 'page',
        fields: {
          title: { 'en-US': 'Home', 'nl-NL': 'Thuis' },
          slug: 'home',
          rating: 5,
          author: { type: 'entry', id: ada.sys.id },
          body: { 'en-US': [{ _id: 'hEro0001', _type: 'hero', heading: 'Welcome' }] },
          cta: { kind: 'entry', id: ada.sys.id, text: 'About' },
          content: {
            type: 'doc',
            content: [{ type: 'embeddedEntry', attrs: { id: ada.sys.id } }],
          },
        },
      })
      await content.publish(owner, tenant, home.sys.id)
      // A newer draft that delivery must not show.
      await content.update(owner, tenant, home.sys.id, {
        expectedVersion: 1,
        fields: { title: { 'en-US': 'Home (draft)' }, slug: 'home' },
      })
      const about = await content.create(owner, tenant, {
        contentType: 'page',
        fields: { title: { 'en-US': 'About' }, slug: 'about' },
      })
      return {
        owner,
        viewer,
        outsider,
        org,
        space,
        tenant,
        page,
        adaId: ada.sys.id,
        homeId: home.sys.id,
        aboutId: about.sys.id,
      }
    })
    return { t, ...seeded }
  }

  const gql = async (t: TestBlixis, actor: Actor, query: string, params = ''): Promise<Result> => {
    const res = await t.request(`/graphql${params}`, { method: 'POST', actor, json: { query } })
    return (await res.json()) as Result
  }

  it('serves a typed schema per content model to delivery keys', async () => {
    const { t, org, space, adaId, homeId } = await setup()
    const key = asDeliveryKey({ organizationId: org.id, spaceId: space.id })
    const result = await gql(
      t,
      key,
      `{
        pageCollection(where: { slug: "home" }) {
          items {
            sys { id contentType version locale }
            title slug rating
            author { name sys { id } }
            body { __typename _type ... on Hero { heading } }
            cta { kind text entry { sys { id } ... on Author { name } } }
            content { json entries { ... on Author { name } } }
          }
          nextCursor
        }
      }`,
    )
    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      pageCollection: {
        items: [
          {
            sys: { id: homeId, contentType: 'page', version: 1, locale: 'en-US' },
            title: 'Home',
            slug: 'home',
            rating: 5,
            author: { name: 'Ada', sys: { id: adaId } },
            body: [{ __typename: 'Hero', _type: 'hero', heading: 'Welcome' }],
            cta: { kind: 'entry', text: 'About', entry: { sys: { id: adaId }, name: 'Ada' } },
            content: {
              json: { type: 'doc', content: [{ type: 'embeddedEntry', attrs: { id: adaId } }] },
              entries: [{ name: 'Ada' }],
            },
          },
        ],
        nextCursor: null,
      },
    })
  })

  it('resolves locales through the fallback chain, blocks included', async () => {
    const { t, org, space, homeId } = await setup()
    const key = asDeliveryKey({ organizationId: org.id, spaceId: space.id })
    const nl = await gql(
      t,
      key,
      `{ page(id: "${homeId}", locale: "nl-NL") { title body { ... on Hero { heading } } sys { locale } } }`,
    )
    // title has nl-NL; body only en-US → fallback.
    expect(nl.data).toEqual({
      page: { title: 'Thuis', body: [{ heading: 'Welcome' }], sys: { locale: 'nl-NL' } },
    })
    const bad = await gql(t, key, `{ page(id: "${homeId}", locale: "de-DE") { title } }`)
    expect(bad.errors?.[0]?.extensions?.code).toBe('VALIDATION_FAILED')
  })

  it('shows published content by default and drafts only with preview access', async () => {
    const { t, org, space, homeId, aboutId, viewer } = await setup()
    const tenant = { organizationId: org.id, spaceId: space.id }
    const delivery = asDeliveryKey(tenant)
    const titles = (r: Result) =>
      ((r.data?.['pageCollection'] as { items: { title: string }[] } | undefined)?.items ?? []).map(
        (i) => i.title,
      )
    expect(titles(await gql(t, delivery, '{ pageCollection { items { title } } }'))).toEqual([
      'Home',
    ])
    expect((await gql(t, delivery, `{ page(id: "${aboutId}") { title } }`)).data).toEqual({
      page: null,
    })
    const forbidden = await gql(
      t,
      delivery,
      '{ pageCollection(preview: true) { items { title } } }',
    )
    expect(forbidden.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    const preview = asDeliveryKey(tenant, 'preview')
    expect(
      titles(await gql(t, preview, '{ pageCollection(preview: true) { items { title } } }')).sort(),
    ).toEqual(['About', 'Home (draft)'])
    // Signed-in members choose the space; the generic entry field resolves any type.
    const byUser = await gql(
      t,
      viewer,
      `{ entry(id: "${homeId}") { ... on Page { title } } }`,
      `?space=${space.id}`,
    )
    expect(byUser.data).toEqual({ entry: { title: 'Home' } })
  })

  it('never serves other tenants or environments', async () => {
    const { t, org, space, outsider, homeId } = await setup()
    const other = await gql(
      t,
      outsider,
      '{ pageCollection { items { title } } }',
      `?space=${space.id}`,
    )
    expect(other.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
    const limited = asDeliveryKey({ organizationId: org.id, spaceId: space.id }, 'delivery', {
      environmentIds: ['01a0d8f9-0000-7000-8000-000000000000'],
    })
    expect((await gql(t, limited, '{ _platform { version } }')).errors?.[0]?.extensions?.code).toBe(
      'NOT_FOUND',
    )
    const wrongSpace = await gql(
      t,
      asDeliveryKey({ organizationId: org.id, spaceId: space.id }),
      '{ _platform { version } }',
      '?space=01a0d8f9-0000-7000-8000-000000000001',
    )
    expect(wrongSpace.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
    // Without a space, only the static schema: content fields ask for one.
    const none = await gql(t, outsider, `{ entry(id: "${homeId}") { sys { id } } }`)
    expect(none.errors?.[0]?.extensions?.code).toBe('VALIDATION_FAILED')
  })

  it('serves spaces without any content type', async () => {
    const { t, owner, org } = await setup()
    const empty = await t.app.runInScope({}, ({ services }) =>
      services.get(TENANCY_SERVICE).createSpace(owner, org.id, { name: 'Empty', slug: 'empty' }),
    )
    const key = asDeliveryKey({ organizationId: org.id, spaceId: empty.id })
    expect((await gql(t, key, '{ _platform { version } }')).data).toEqual({
      _platform: { version: 'local' },
    })
    const unknown = await gql(t, key, '{ entries(contentType: "page") { items { sys { id } } } }')
    expect(unknown.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
  })

  it('follows content model changes immediately', async () => {
    const { t, org, space, owner, tenant, page } = await setup()
    const key = asDeliveryKey({ organizationId: org.id, spaceId: space.id })
    expect(
      (await gql(t, key, '{ pageCollection { items { subtitle } } }')).errors?.[0]?.message,
    ).toContain('subtitle')
    await t.app.runInScope({}, ({ services }) =>
      services.get(CONTENT_TYPE_SERVICE).update(owner, tenant, page.id, {
        version: page.version,
        fields: [
          ...page.fields.map(({ showWhen: _, ...f }) => f),
          { apiId: 'subtitle', name: 'Subtitle', type: 'text' },
        ],
      }),
    )
    expect((await gql(t, key, '{ pageCollection { items { subtitle } } }')).errors).toBeUndefined()
  })
})
