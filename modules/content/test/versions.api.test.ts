import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { permissionsModule } from '@blixis/permissions'
import { spacesModule, TENANCY_SERVICE } from '@blixis/spaces'
import { asUser, captureEvents, createTestBlixis, type TestBlixis } from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { USER_SERVICE, usersModule } from '@blixis/users'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  CONTENT_TYPE_SERVICE,
  type ContentTypeView,
  contentModule,
  type EntryVersionView,
  type EntryView,
} from '../src/index.ts'

const modules = () => [
  databaseModule(),
  usersModule(),
  spacesModule(),
  permissionsModule(),
  contentModule(),
]

describe.skipIf(!databaseTestsEnabled())('version history (Postgres)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function setup() {
    const events = captureEvents()
    const t = await createTestBlixis({ modules: [...modules(), events.module()], database: db })
    const seeded = await t.app.runInScope({}, async ({ services }) => {
      const owner = (
        await services.get(USER_SERVICE).create({ email: 'o@example.com', displayName: 'O' })
      ).id
      const tenancy = services.get(TENANCY_SERVICE)
      const org = await tenancy.createOrganization(asUser(owner), { name: 'Org', slug: 'org' })
      const space = await tenancy.createSpace(asUser(owner), org.id, { name: 'Site', slug: 'site' })
      const tenant = {
        organizationId: org.id,
        spaceId: space.id,
        environmentId: space.environments[0]?.id ?? '',
      }
      const type = await services.get(CONTENT_TYPE_SERVICE).create(asUser(owner), tenant, {
        apiId: 'note',
        name: 'Note',
        fields: [
          { apiId: 'title', name: 'Title', type: 'text' },
          { apiId: 'rating', name: 'Rating', type: 'text' },
        ],
      })
      return { owner, spaceId: space.id, tenant, type }
    })
    return { t, events, ...seeded }
  }
  const call = (t: TestBlixis, method: string, path: string, userId: string, json?: unknown) =>
    t.request(`/api/v1${path}`, {
      method,
      actor: asUser(userId),
      ...(json === undefined ? {} : { json }),
    })

  it('lists versions newest first, pages, reads one, and restores as a new version', async () => {
    const { t, events, owner, spaceId } = await setup()
    const entry = (await (
      await call(t, 'POST', `/spaces/${spaceId}/entries`, owner, {
        contentType: 'note',
        fields: { title: 'v1' },
      })
    ).json()) as EntryView
    const path = `/entries/${entry.sys.id}`
    for (const [i, title] of ['v2', 'v3'].entries())
      await call(t, 'PATCH', path, owner, { expectedVersion: i + 1, fields: { title } })
    await call(t, 'POST', `${path}/publish`, owner)

    const page = (await (await call(t, 'GET', `${path}/versions?limit=2`, owner)).json()) as {
      versions: EntryVersionView[]
      nextBefore: number | null
    }
    expect(
      page.versions.map((v) => [
        v.sys.number,
        v.fields['title'],
        v.sys.isCurrent,
        v.sys.isPublished,
      ]),
    ).toEqual([
      [3, 'v3', true, true],
      [2, 'v2', false, false],
    ])
    const rest = (await (
      await call(t, 'GET', `${path}/versions?limit=2&before=${page.nextBefore}`, owner)
    ).json()) as {
      versions: EntryVersionView[]
      nextBefore: number | null
    }
    expect(rest.versions.map((v) => v.sys.number)).toEqual([1])
    expect(rest.nextBefore).toBeNull()
    const first = rest.versions[0]
    expect(
      (
        (await (
          await call(t, 'GET', `${path}/versions/${first?.sys.id}`, owner)
        ).json()) as EntryVersionView
      ).fields,
    ).toEqual({
      title: 'v1',
    })

    const restored = await call(t, 'POST', `${path}/versions/${first?.sys.id}/restore`, owner, {
      expectedVersion: 3,
    })
    expect(restored.headers.get('etag')).toBe('"4"')
    const body = (await restored.json()) as EntryView
    expect(body.fields).toEqual({ title: 'v1' })
    expect(body.sys.status).toBe('changed')
    expect(events.emitted.filter((e) => e.type === 'entry.updated').at(-1)?.payload).toMatchObject({
      restoredFrom: first?.sys.id,
    })
    const latest = (await (await call(t, 'GET', `${path}/versions?limit=1`, owner)).json()) as {
      versions: EntryVersionView[]
    }
    expect(latest.versions[0]?.sys).toMatchObject({ number: 4, restoredFrom: first?.sys.id })
    // Stale or missing versions.
    expect(
      (
        await call(t, 'POST', `${path}/versions/${first?.sys.id}/restore`, owner, {
          expectedVersion: 3,
        })
      ).status,
    ).toBe(409)
    expect(
      (await call(t, 'POST', `${path}/versions/${first?.sys.id}/restore`, owner, {})).status,
    ).toBe(400)
    expect((await call(t, 'GET', `${path}/versions/not-a-version`, owner)).status).toBe(404)
    expect((await call(t, 'GET', `${path}/versions?limit=0`, owner)).status).toBe(400)
  })

  it('reports values that no longer fit the current content type when restoring', async () => {
    const { t, owner, spaceId, type } = await setup()
    const entry = (await (
      await call(t, 'POST', `/spaces/${spaceId}/entries`, owner, {
        contentType: 'note',
        fields: { rating: 'excellent' },
      })
    ).json()) as EntryView
    const v1 = entry.sys.id
    await call(t, 'PATCH', `/entries/${v1}`, owner, { expectedVersion: 1, fields: {} })
    // Tighten the model: rating may now be at most 5 characters.
    const updated = (await (
      await call(t, 'PATCH', `/spaces/${spaceId}/content-types/${type.id}`, owner, {
        version: 1,
        fields: type.fields.map((f) =>
          f.apiId === 'rating' ? { ...f, settings: { maxLength: 5 } } : f,
        ),
      })
    ).json()) as ContentTypeView
    expect(updated.version).toBe(2)
    const versions = (await (await call(t, 'GET', `/entries/${v1}/versions`, owner)).json()) as {
      versions: EntryVersionView[]
    }
    const oldest = versions.versions.at(-1)?.sys.id
    const res = await call(t, 'POST', `/entries/${v1}/versions/${oldest}/restore`, owner, {
      expectedVersion: 2,
    })
    expect(res.status).toBe(400)
    expect(
      ((await res.json()) as { errors: { path: string[] }[] }).errors.map((e) => e.path.join('.')),
    ).toEqual(['fields.rating'])
  })
})
