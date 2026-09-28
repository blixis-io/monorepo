// The plugin boots with first-party modules installed from tarballs, as in a real app. Tests may
// import them; the plugin's source may not (public packages only).

import { contentModule } from '@blixis/content'
import { CONTENT_SERVICE, CONTENT_TYPE_SERVICE, type EnvironmentTenant } from '@blixis/content-api'
import type { Actor } from '@blixis/contracts'
import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { graphqlModule } from '@blixis/graphql'
import { permissionsModule } from '@blixis/permissions'
import { MEMBER_SERVICE, spacesModule, TENANCY_SERVICE } from '@blixis/spaces'
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
import seo, { SEO_SERVICE } from '../src/index.ts'

const firstParty = () => [
  databaseModule(),
  usersModule(),
  spacesModule(),
  permissionsModule(),
  contentModule(),
  graphqlModule(),
]

describe.skipIf(!databaseTestsEnabled())('@blixis-example/seo', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...firstParty(), eventsModule(), seo()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function setup() {
    const events = captureEvents({ mode: 'deferred' })
    const t = await createTestBlixis({
      modules: [...firstParty(), events.module(), seo({ defaultTitle: 'My site' })],
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
      const tenant: EnvironmentTenant = {
        organizationId: org.id,
        spaceId: space.id,
        environmentId: space.environments[0]?.id ?? '',
      }
      await services.get(CONTENT_TYPE_SERVICE).create(owner, tenant, {
        apiId: 'page',
        name: 'Page',
        fields: [{ apiId: 'title', name: 'Title', type: 'text' }],
      })
      const content = services.get(CONTENT_SERVICE)
      const entry = await content.create(owner, tenant, {
        contentType: 'page',
        fields: { title: 'Home' },
      })
      return { owner, viewer, outsider, tenant, entryId: entry.sys.id }
    })
    return { t, events, ...seeded }
  }

  const seoOf = async (t: TestBlixis, actor: Actor, entryId: string) =>
    t.request(`/api/v1/entries/${entryId}/seo`, { actor })

  it('serves and stores SEO metadata, with permissions per role', async () => {
    const { t, owner, viewer, outsider, entryId } = await setup()
    const initial = await seoOf(t, owner, entryId)
    expect(initial.status).toBe(200)
    expect(await initial.json()).toEqual({
      entryId,
      title: 'My site',
      description: null,
      lastPublishedAt: null,
    })

    const put = await t.request(`/api/v1/entries/${entryId}/seo`, {
      method: 'PUT',
      actor: owner,
      json: { title: 'Welcome home', description: 'The start page' },
    })
    expect(put.status).toBe(200)
    expect(await (await seoOf(t, viewer, entryId)).json()).toMatchObject({ title: 'Welcome home' })

    const denied = await t.request(`/api/v1/entries/${entryId}/seo`, {
      method: 'PUT',
      actor: viewer,
      json: { title: 'Nope', description: null },
    })
    expect(denied.status).toBe(403)
    expect((await seoOf(t, outsider, entryId)).status).toBe(404)

    const invalid = await t.request(`/api/v1/entries/${entryId}/seo`, {
      method: 'PUT',
      actor: owner,
      json: { title: 'x'.repeat(71), description: null },
    })
    expect(invalid.status).toBe(400)
  })

  it('adds seo to delivered entries in GraphQL', async () => {
    const { t, owner, tenant, entryId } = await setup()
    await t.request(`/api/v1/entries/${entryId}/seo`, {
      method: 'PUT',
      actor: owner,
      json: { title: 'Welcome home', description: null },
    })
    await t.app.runInScope({ actor: owner }, ({ services }) =>
      services.get(CONTENT_SERVICE).publish(owner, tenant, entryId),
    )
    const res = await t.request('/graphql', {
      method: 'POST',
      actor: asDeliveryKey(tenant),
      json: { query: `{ page(id: "${entryId}") { sys { id seo { title description } } } }` },
    })
    const body = (await res.json()) as { data?: unknown; errors?: unknown }
    expect(body.errors).toBeUndefined()
    expect(body.data).toEqual({
      page: { sys: { id: entryId, seo: { title: 'Welcome home', description: null } } },
    })
  })

  it('records publishing and cleans up deleted entries and spaces', async () => {
    const { t, events, owner, tenant, entryId } = await setup()
    await t.app.runInScope({ actor: owner }, ({ services }) =>
      services.get(CONTENT_SERVICE).publish(owner, tenant, entryId),
    )
    await events.flush()
    const published = (await (await seoOf(t, owner, entryId)).json()) as { lastPublishedAt: string }
    expect(published.lastPublishedAt).toMatch(/^\d{4}-\d\d-\d\dT/)

    // A second draft entry, deleted: its metadata goes too.
    const other = await t.app.runInScope({ actor: owner }, async ({ services }) => {
      const content = services.get(CONTENT_SERVICE)
      const created = await content.create(owner, tenant, { contentType: 'page', fields: {} })
      await services
        .get(SEO_SERVICE)
        .set(tenant, created.sys.id, { title: 'Other', description: null })
      await content.delete(owner, tenant, created.sys.id)
      return created.sys.id
    })
    await events.flush()
    const count = async () =>
      t.app.runInScope(
        {},
        async ({ services }) =>
          (await services.get(SEO_SERVICE).forDeliveredEntries([entryId, other])).get(other)?.title,
      )
    expect(await count()).toBe('My site') // default: the row is gone

    await t.app.runInScope({ actor: owner }, ({ services }) =>
      services.get(TENANCY_SERVICE).deleteSpace(owner, tenant.spaceId),
    )
    await events.flush()
    const left = await t.app.runInScope({}, async ({ services }) =>
      services.get(SEO_SERVICE).forDeliveredEntries([entryId]),
    )
    expect(left.get(entryId)?.lastPublishedAt).toBeNull()
  })
})
