import type { Actor } from '@blixis/contracts'
import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { graphqlModule } from '@blixis/graphql'
import { permissionsModule } from '@blixis/permissions'
import { spacesModule, TENANCY_SERVICE } from '@blixis/spaces'
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

describe.skipIf(!databaseTestsEnabled())('preview delivery (Postgres)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  /**
   * post (published v1, draft v2) → author "Ada" (published v1 "Ada", draft v2 "Ada L.")
   *                              → editor "Bob" (never published)
   */
  async function setup() {
    const t = await createTestBlixis({
      modules: [...modules(), captureEvents().module()],
      database: db,
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
      const types = services.get(CONTENT_TYPE_SERVICE)
      await types.create(owner, tenant, {
        apiId: 'person',
        name: 'Person',
        fields: [{ apiId: 'name', name: 'Name', type: 'text' }],
      })
      await types.create(owner, tenant, {
        apiId: 'post',
        name: 'Post',
        fields: [
          { apiId: 'title', name: 'Title', type: 'text' },
          { apiId: 'author', name: 'Author', type: 'reference' },
          { apiId: 'editor', name: 'Editor', type: 'reference' },
        ],
      })
      const content = services.get(CONTENT_SERVICE)
      const ada = await content.create(owner, tenant, {
        contentType: 'person',
        fields: { name: 'Ada' },
      })
      await content.publish(owner, tenant, ada.sys.id)
      await content.update(owner, tenant, ada.sys.id, {
        expectedVersion: 1,
        fields: { name: 'Ada L.' },
      })
      const bob = await content.create(owner, tenant, {
        contentType: 'person',
        fields: { name: 'Bob' },
      })
      const post = await content.create(owner, tenant, {
        contentType: 'post',
        fields: { title: 'Live', author: { type: 'entry', id: ada.sys.id } },
      })
      await content.publish(owner, tenant, post.sys.id)
      await content.update(owner, tenant, post.sys.id, {
        expectedVersion: 1,
        fields: {
          title: 'Next',
          author: { type: 'entry', id: ada.sys.id },
          editor: { type: 'entry', id: bob.sys.id },
        },
      })
      return { owner, tenant: { organizationId: org.id, spaceId: space.id }, postId: post.sys.id }
    })
    return { t, ...seeded }
  }

  const query = (postId: string, preview: boolean) =>
    `{ post(id: "${postId}", preview: ${preview}) { title author { ... on Person { name } } editor { ... on Person { name } } } }`
  const send = async (t: TestBlixis, actor: Actor, body: string, params = '') => {
    const res = await t.request(`/graphql${params}`, {
      method: 'POST',
      actor,
      json: { query: body },
    })
    return {
      cacheControl: res.headers.get('cache-control'),
      json: (await res.json()) as { data?: unknown; errors?: { extensions?: { code?: string } }[] },
    }
  }

  it('resolves links consistently in the state that was asked for', async () => {
    const { t, tenant, postId } = await setup()
    const preview = asDeliveryKey(tenant, 'preview')
    const live = await send(t, preview, query(postId, false))
    // Published: the live post links to Ada's published version; the unpublished editor is left out.
    expect(live.json.data).toEqual({
      post: { title: 'Live', author: { name: 'Ada' }, editor: null },
    })
    expect(live.cacheControl).not.toBe('private, no-store')
    const drafts = await send(t, preview, query(postId, true))
    // Preview: drafts all the way down, including never-published entries.
    expect(drafts.json.data).toEqual({
      post: { title: 'Next', author: { name: 'Ada L.' }, editor: { name: 'Bob' } },
    })
    expect(drafts.cacheControl).toBe('private, no-store')
  })

  it('allows preview to preview keys and members, never to delivery keys', async () => {
    const { t, owner, tenant, postId } = await setup()
    const denied = await send(t, asDeliveryKey(tenant), query(postId, true))
    expect(denied.json.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(denied.json.data).toEqual({ post: null })
    const member = await send(t, owner, query(postId, true), `?space=${tenant.spaceId}`)
    expect(member.json.data).toEqual({
      post: { title: 'Next', author: { name: 'Ada L.' }, editor: { name: 'Bob' } },
    })
    expect(member.cacheControl).toBe('private, no-store')
  })
})
