import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { permissionsModule } from '@blixis/permissions'
import { newId } from '@blixis/shared'
import { spacesModule, TENANCY_SERVICE } from '@blixis/spaces'
import { asUser, captureEvents, createTestBlixis, type TestBlixis } from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { USER_SERVICE, usersModule } from '@blixis/users'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CONTENT_TYPE_SERVICE, contentModule, type EntryView } from '../src/index.ts'

const modules = () => [
  databaseModule(),
  usersModule(),
  spacesModule(),
  permissionsModule(),
  contentModule(),
]

describe.skipIf(!databaseTestsEnabled())('entries API (Postgres)', () => {
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
      const owner = (await users.create({ email: 'o@example.com', displayName: 'O' })).id
      const outsider = (await users.create({ email: 'x@example.com', displayName: 'X' })).id
      const tenancy = services.get(TENANCY_SERVICE)
      const org = await tenancy.createOrganization(asUser(owner), { name: 'Org', slug: 'org' })
      const space = await tenancy.createSpace(asUser(owner), org.id, { name: 'Site', slug: 'site' })
      await services.get(CONTENT_TYPE_SERVICE).create(
        asUser(owner),
        {
          organizationId: org.id,
          spaceId: space.id,
          environmentId: space.environments[0]?.id ?? '',
        },
        {
          apiId: 'post',
          name: 'Post',
          fields: [
            { apiId: 'title', name: 'Title', type: 'text', localized: true },
            { apiId: 'slug', name: 'Slug', type: 'text' },
          ],
        },
      )
      return { owner, outsider, spaceId: space.id }
    })
    return { t, ...seeded }
  }
  const call = (
    t: TestBlixis,
    method: string,
    path: string,
    userId: string,
    init: { json?: unknown; headers?: Record<string, string> } = {},
  ) =>
    t.request(`/api/v1${path}`, {
      method,
      actor: asUser(userId),
      ...(init.json === undefined ? {} : { json: init.json }),
      ...(init.headers === undefined ? {} : { headers: init.headers }),
    })

  it('creates, reads, updates with If-Match, lists, and deletes entries', async () => {
    const { t, owner, spaceId } = await setup()
    const created = await call(t, 'POST', `/spaces/${spaceId}/entries`, owner, {
      json: { contentType: 'post', fields: { title: { 'en-US': 'Hello' }, slug: 'hello' } },
    })
    expect(created.status).toBe(201)
    expect(created.headers.get('etag')).toBe('"1"')
    const entry = (await created.json()) as EntryView
    const path = `/entries/${entry.sys.id}`

    const read = await call(t, 'GET', path, owner)
    expect(read.headers.get('etag')).toBe('"1"')
    expect(((await read.json()) as EntryView).fields).toEqual({
      title: { 'en-US': 'Hello' },
      slug: 'hello',
    })
    expect((await call(t, 'GET', `${path}?state=published`, owner)).status).toBe(404)
    expect((await call(t, 'GET', `${path}?state=live`, owner)).status).toBe(400)

    const fields = { title: { 'en-US': 'Hello again' }, slug: 'hello' }
    const updated = await call(t, 'PATCH', path, owner, {
      json: { fields },
      headers: { 'if-match': '"1"' },
    })
    expect(updated.status).toBe(200)
    expect(updated.headers.get('etag')).toBe('"2"')
    expect(
      (await call(t, 'PATCH', path, owner, { json: { fields }, headers: { 'if-match': '"1"' } }))
        .status,
    ).toBe(409)
    expect(
      (await call(t, 'PATCH', path, owner, { json: { fields, expectedVersion: 2 } })).status,
    ).toBe(200)
    expect((await call(t, 'PATCH', path, owner, { json: { fields } })).status).toBe(400)

    const list = (await (
      await call(
        t,
        'GET',
        `/spaces/${spaceId}/entries?contentType=post&fields.slug=hello&limit=10`,
        owner,
      )
    ).json()) as {
      entries: EntryView[]
      nextCursor: string | null
    }
    expect(list.entries.map((e) => e.sys.id)).toEqual([entry.sys.id])
    expect(list.nextCursor).toBeNull()
    expect((await call(t, 'GET', `/spaces/${spaceId}/entries?state=nope`, owner)).status).toBe(400)

    expect((await call(t, 'DELETE', path, owner, { headers: { 'if-match': '"1"' } })).status).toBe(
      409,
    )
    expect((await call(t, 'DELETE', path, owner)).status).toBe(204)
    expect((await call(t, 'GET', path, owner)).status).toBe(404)
  })

  it('entry-id routes never reveal entries of other tenants', async () => {
    const { t, owner, outsider, spaceId } = await setup()
    const entry = (await (
      await call(t, 'POST', `/spaces/${spaceId}/entries`, owner, {
        json: { contentType: 'post', fields: {} },
      })
    ).json()) as EntryView
    for (const method of ['GET', 'PATCH', 'DELETE'])
      expect(
        (
          await call(
            t,
            method,
            `/entries/${entry.sys.id}`,
            outsider,
            method === 'PATCH' ? { json: { fields: {}, expectedVersion: 1 } } : {},
          )
        ).status,
      ).toBe(404)
    expect((await call(t, 'GET', `/entries/${newId()}`, owner)).status).toBe(404)
    expect((await call(t, 'GET', '/entries/not-an-id', owner)).status).toBe(404)
  })
})
