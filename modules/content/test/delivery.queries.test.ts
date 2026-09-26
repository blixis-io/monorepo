import { DATABASE, databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { graphqlModule } from '@blixis/graphql'
import { serviceOverride } from '@blixis/kernel'
import { permissionsModule } from '@blixis/permissions'
import { spacesModule, TENANCY_SERVICE } from '@blixis/spaces'
import { asDeliveryKey, asUser, captureEvents, createTestBlixis } from '@blixis/testing'
import {
  countQueries,
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

/** A representative delivery query: a page list with references, links, rich text, and blocks. */
const QUERY = `{
  pageCollection(limit: 20) {
    items {
      title
      author { ... on Author { name } }
      cta { entry { sys { id } } }
      content { entries { ... on Author { name } } }
      body { ... on Hero { heading } }
    }
  }
}`

describe.skipIf(!databaseTestsEnabled())('delivery query budget (Postgres)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function measure(pages: number): Promise<{ queries: number; items: number }> {
    await db.reset()
    const counter = countQueries(db)
    try {
      const t = await createTestBlixis({
        modules: [...modules(), captureEvents().module()],
        // Only the counting connection: `database` would add a second DATABASE override.
        overrides: [serviceOverride(DATABASE, counter.db)],
      })
      const tenant = await t.app.runInScope({}, async ({ services }) => {
        const owner = asUser(
          (await services.get(USER_SERVICE).create({ email: 'o@example.com', displayName: 'O' }))
            .id,
        )
        const tenancy = services.get(TENANCY_SERVICE)
        const org = await tenancy.createOrganization(owner, { name: 'Org', slug: 'org' })
        const space = await tenancy.createSpace(owner, org.id, { name: 'Site', slug: 'site' })
        const env = {
          organizationId: org.id,
          spaceId: space.id,
          environmentId: space.environments[0]?.id ?? '',
        }
        const types = services.get(CONTENT_TYPE_SERVICE)
        const author = await types.create(owner, env, {
          apiId: 'author',
          name: 'Author',
          fields: [{ apiId: 'name', name: 'Name', type: 'text' }],
        })
        const hero = await types.create(owner, env, {
          kind: 'component',
          apiId: 'hero',
          name: 'Hero',
          fields: [{ apiId: 'heading', name: 'Heading', type: 'text' }],
        })
        await types.create(owner, env, {
          apiId: 'page',
          name: 'Page',
          fields: [
            { apiId: 'title', name: 'Title', type: 'text' },
            {
              apiId: 'author',
              name: 'Author',
              type: 'reference',
              settings: { contentTypeIds: [author.id] },
            },
            { apiId: 'cta', name: 'CTA', type: 'link' },
            { apiId: 'content', name: 'Content', type: 'richText' },
            { apiId: 'body', name: 'Body', type: 'blocks', settings: { componentIds: [hero.id] } },
          ],
        })
        const content = services.get(CONTENT_SERVICE)
        for (let i = 0; i < pages; i++) {
          const a = await content.create(owner, env, {
            contentType: 'author',
            fields: { name: `Author ${i}` },
          })
          await content.publish(owner, env, a.sys.id)
          const p = await content.create(owner, env, {
            contentType: 'page',
            fields: {
              title: `Page ${i}`,
              author: { type: 'entry', id: a.sys.id },
              cta: { kind: 'entry', id: a.sys.id },
              content: {
                type: 'doc',
                content: [{ type: 'embeddedEntry', attrs: { id: a.sys.id } }],
              },
              body: [
                { _id: `hEro${String(i).padStart(4, '0')}`, _type: 'hero', heading: `Hero ${i}` },
              ],
            },
          })
          await content.publish(owner, env, p.sys.id)
        }
        return { organizationId: org.id, spaceId: space.id }
      })
      counter.reset()
      const res = await t.request('/graphql', {
        method: 'POST',
        actor: asDeliveryKey(tenant),
        json: { query: QUERY },
      })
      const body = (await res.json()) as {
        data: { pageCollection: { items: unknown[] } }
        errors?: unknown
      }
      expect(body.errors).toBeUndefined()
      return { queries: counter.queries.length, items: body.data.pageCollection.items.length }
    } finally {
      await counter.close()
    }
  }

  it('costs the same small number of SQL statements for 3 or 12 pages', async () => {
    const small = await measure(3)
    const large = await measure(12)
    expect(small.items).toBe(3)
    expect(large.items).toBe(12)
    // Space, environments, content model, locales, the page, one batch of linked authors.
    expect(large.queries).toBe(small.queries)
    expect(large.queries).toBeLessThanOrEqual(6)
  })
})
