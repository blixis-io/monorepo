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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONTENT_TYPE_SERVICE, contentModule, type EntryView } from '../src/index.ts'
import { entryRepository } from '../src/infrastructure/entry.repository.ts'

const modules = () => [
  databaseModule(),
  usersModule(),
  spacesModule(),
  permissionsModule(),
  contentModule(),
]

describe.skipIf(!databaseTestsEnabled())('references and link resolution (Postgres)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
  })
  beforeEach(() => db.reset())
  afterEach(() => vi.restoreAllMocks())
  afterAll(() => db.drop())

  async function setup() {
    const t = await createTestBlixis({
      modules: [...modules(), captureEvents().module()],
      database: db,
    })
    const seeded = await t.app.runInScope({}, async ({ services }) => {
      const owner = (
        await services.get(USER_SERVICE).create({ email: 'o@example.com', displayName: 'O' })
      ).id
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
          apiId: 'node',
          name: 'Node',
          fields: [
            { apiId: 'name', name: 'Name', type: 'text' },
            { apiId: 'next', name: 'Next', type: 'reference' },
          ],
        },
      )
      return { owner, spaceId: space.id }
    })
    return { t, ...seeded }
  }
  const call = (t: TestBlixis, method: string, path: string, userId: string, json?: unknown) =>
    t.request(`/api/v1${path}`, {
      method,
      actor: asUser(userId),
      ...(json === undefined ? {} : { json }),
    })
  const node = async (t: TestBlixis, spaceId: string, owner: string, name: string) =>
    (await (
      await call(t, 'POST', `/spaces/${spaceId}/entries`, owner, {
        contentType: 'node',
        fields: { name },
      })
    ).json()) as EntryView
  const link = (t: TestBlixis, owner: string, from: EntryView, to: string, version = 1) =>
    call(t, 'PATCH', `/entries/${from.sys.id}`, owner, {
      expectedVersion: version,
      fields: { name: from.fields['name'], next: { type: 'entry', id: to } },
    })
  const included = async (t: TestBlixis, owner: string, path: string) =>
    (
      (await (await call(t, 'GET', path, owner)).json()) as { includes: { entries: EntryView[] } }
    ).includes.entries.map((e) => e.fields['name'])

  it('resolves links level by level, once per entry, with one query per level', async () => {
    const { t, owner, spaceId } = await setup()
    const [a, b, c] = [
      await node(t, spaceId, owner, 'a'),
      await node(t, spaceId, owner, 'b'),
      await node(t, spaceId, owner, 'c'),
    ]
    if (a === undefined || b === undefined || c === undefined) throw new Error('setup')
    await link(t, owner, a, b.sys.id)
    await link(t, owner, b, c.sys.id)
    await link(t, owner, c, a.sys.id) // a cycle back to the root

    expect(await included(t, owner, `/entries/${a.sys.id}?include=1`)).toEqual(['b'])
    const batch = vi.spyOn(entryRepository, 'findManyWithVersions')
    expect(await included(t, owner, `/entries/${a.sys.id}?include=3`)).toEqual(['b', 'c'])
    // Roots + one batch per level that still had entries (a is not loaded twice).
    expect(batch).toHaveBeenCalledTimes(3)
    expect(await included(t, owner, `/entries/${a.sys.id}?include=0`)).toEqual([])
    expect((await call(t, 'GET', `/entries/${a.sys.id}?include=4`, owner)).status).toBe(400)

    const list = (await (
      await call(
        t,
        'GET',
        `/spaces/${spaceId}/entries?contentType=node&fields.name=a&include=2`,
        owner,
      )
    ).json()) as {
      entries: EntryView[]
      includes: { entries: EntryView[] }
    }
    expect(list.entries.map((e) => e.fields['name'])).toEqual(['a'])
    expect(list.includes.entries.map((e) => e.fields['name'])).toEqual(['b', 'c'])
  })

  it('skips links that do not resolve in the requested state', async () => {
    const { t, owner, spaceId } = await setup()
    const a = await node(t, spaceId, owner, 'a')
    const b = await node(t, spaceId, owner, 'b')
    await link(t, owner, a, b.sys.id)
    const orphan = await node(t, spaceId, owner, 'orphan')
    await link(t, owner, orphan, newId()) // an entry that does not exist
    expect(await included(t, owner, `/entries/${orphan.sys.id}?include=1`)).toEqual([])
    await call(t, 'POST', `/entries/${b.sys.id}/publish`, owner)
    await call(t, 'POST', `/entries/${a.sys.id}/publish`, owner)
    // Draft b changes after publishing: published reads see the live version.
    await call(t, 'PATCH', `/entries/${b.sys.id}`, owner, {
      expectedVersion: 1,
      fields: { name: 'b (draft)' },
    })
    expect(await included(t, owner, `/entries/${a.sys.id}?include=1&state=published`)).toEqual([
      'b',
    ])
    expect(await included(t, owner, `/entries/${a.sys.id}?include=1`)).toEqual(['b (draft)'])
  })

  it('lists referrers by state', async () => {
    const { t, owner, spaceId } = await setup()
    const target = await node(t, spaceId, owner, 'target')
    const from = await node(t, spaceId, owner, 'from')
    await link(t, owner, from, target.sys.id)
    const referrers = async (state: string) =>
      (
        (await (
          await call(t, 'GET', `/entries/${target.sys.id}/referrers?state=${state}`, owner)
        ).json()) as {
          entries: EntryView[]
        }
      ).entries.map((e) => e.fields['name'])
    expect(await referrers('draft')).toEqual(['from'])
    expect(await referrers('published')).toEqual([])
    await call(t, 'POST', `/entries/${target.sys.id}/publish`, owner)
    await call(t, 'POST', `/entries/${from.sys.id}/publish`, owner)
    expect(await referrers('published')).toEqual(['from'])
    expect(
      (await call(t, 'GET', `/entries/${target.sys.id}/referrers?state=nope`, owner)).status,
    ).toBe(400)
  })
})
