import { databaseModule } from '@blixis/database'
import { idempotencyModule } from '@blixis/database/idempotency'
import { eventsModule } from '@blixis/events'
import { permissionsModule } from '@blixis/permissions'
import { MEMBER_SERVICE, spacesModule, TENANCY_SERVICE } from '@blixis/spaces'
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
  idempotencyModule(),
  usersModule(),
  spacesModule(),
  permissionsModule(),
  contentModule(),
]

interface Problem {
  status: number
  detail: string
  errors?: { path: (string | number)[]; message: string }[]
}

describe.skipIf(!databaseTestsEnabled())('publishing (Postgres)', () => {
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
      const users = services.get(USER_SERVICE)
      const owner = (await users.create({ email: 'o@example.com', displayName: 'O' })).id
      const viewer = (await users.create({ email: 'v@example.com', displayName: 'V' })).id
      const tenancy = services.get(TENANCY_SERVICE)
      const org = await tenancy.createOrganization(asUser(owner), { name: 'Org', slug: 'org' })
      const space = await tenancy.createSpace(asUser(owner), org.id, { name: 'Site', slug: 'site' })
      await services
        .get(MEMBER_SERVICE)
        .addOrganizationMember(asUser(owner), org.id, { email: 'v@example.com', role: 'viewer' })
      const tenant = {
        organizationId: org.id,
        spaceId: space.id,
        environmentId: space.environments[0]?.id ?? '',
      }
      const types = services.get(CONTENT_TYPE_SERVICE)
      const author = await types.create(asUser(owner), tenant, {
        apiId: 'author',
        name: 'Author',
        fields: [{ apiId: 'name', name: 'Name', type: 'text', required: true }],
      })
      await types.create(asUser(owner), tenant, {
        apiId: 'post',
        name: 'Post',
        fields: [
          { apiId: 'title', name: 'Title', type: 'text', required: true, localized: true },
          {
            apiId: 'author',
            name: 'Author',
            type: 'reference',
            settings: { contentTypeIds: [author.id] },
          },
        ],
      })
      return { owner, viewer, spaceId: space.id }
    })
    return { t, events, ...seeded }
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
  const create = async (
    t: TestBlixis,
    spaceId: string,
    userId: string,
    contentType: string,
    fields: object,
  ) =>
    (await (
      await call(t, 'POST', `/spaces/${spaceId}/entries`, userId, { json: { contentType, fields } })
    ).json()) as EntryView
  const errors = async (res: Response) =>
    ((await res.json()) as Problem).errors?.map((e) => `${e.path.join('.')}: ${e.message}`)

  it('validates strictly on publish and reports paths', async () => {
    const { t, events, owner, spaceId } = await setup()
    const post = await create(t, spaceId, owner, 'post', {})
    const invalid = await call(t, 'POST', `/entries/${post.sys.id}/publish`, owner)
    expect(invalid.status).toBe(400)
    expect(await errors(invalid)).toEqual(['fields.title.en-US: Required'])
    await call(t, 'PATCH', `/entries/${post.sys.id}`, owner, {
      json: { expectedVersion: 1, fields: { title: { 'en-US': 'Hello' } } },
    })
    const published = await call(t, 'POST', `/entries/${post.sys.id}/publish`, owner)
    expect(published.status).toBe(200)
    const body = (await published.json()) as EntryView
    expect(body.sys).toMatchObject({ status: 'published', version: 2 })
    expect(body.sys.publishedAt).not.toBeNull()
    expect(events.emitted.filter((e) => e.type === 'entry.published')).toHaveLength(1)
    // Publishing the live version again changes nothing.
    expect((await call(t, 'POST', `/entries/${post.sys.id}/publish`, owner)).status).toBe(200)
    expect(events.emitted.filter((e) => e.type === 'entry.published')).toHaveLength(1)
  })

  it('keeps serving the published version while a newer draft exists', async () => {
    const { t, owner, spaceId } = await setup()
    const post = await create(t, spaceId, owner, 'post', { title: { 'en-US': 'Live' } })
    await call(t, 'POST', `/entries/${post.sys.id}/publish`, owner)
    const draft = (await (
      await call(t, 'PATCH', `/entries/${post.sys.id}`, owner, {
        json: { expectedVersion: 1, fields: { title: { 'en-US': 'Next' } } },
      })
    ).json()) as EntryView
    expect(draft.sys.status).toBe('changed')
    const live = (await (
      await call(t, 'GET', `/entries/${post.sys.id}?state=published`, owner)
    ).json()) as EntryView
    expect(live.fields).toEqual({ title: { 'en-US': 'Live' } })
    expect(live.sys.fieldsVersion).toBe(1)
    // Publishing an explicit older version, and a stale expectedVersion.
    expect(
      (
        await call(t, 'POST', `/entries/${post.sys.id}/publish`, owner, {
          headers: { 'if-match': '"1"' },
        })
      ).status,
    ).toBe(409)
    const next = await call(t, 'POST', `/entries/${post.sys.id}/publish`, owner, {
      json: { expectedVersion: 2 },
    })
    expect(((await next.json()) as EntryView).sys.status).toBe('published')
  })

  it('requires linked entries to be published and of an allowed type', async () => {
    const { t, owner, spaceId } = await setup()
    const author = await create(t, spaceId, owner, 'author', { name: 'Ada' })
    const other = await create(t, spaceId, owner, 'post', { title: { 'en-US': 'Other' } })
    const post = await create(t, spaceId, owner, 'post', {
      title: { 'en-US': 'Hello' },
      author: { type: 'entry', id: author.sys.id },
    })
    const blocked = await call(t, 'POST', `/entries/${post.sys.id}/publish`, owner)
    expect(await errors(blocked)).toEqual([
      'fields.author: Links to an unpublished entry: publish it first',
    ])
    await call(t, 'POST', `/entries/${author.sys.id}/publish`, owner)
    expect((await call(t, 'POST', `/entries/${post.sys.id}/publish`, owner)).status).toBe(200)

    // The published post protects the author from being unpublished.
    const unpublish = await call(t, 'POST', `/entries/${author.sys.id}/unpublish`, owner)
    expect(unpublish.status).toBe(409)
    expect(((await unpublish.json()) as Problem).detail).toContain(post.sys.id)
    const forced = await call(t, 'POST', `/entries/${author.sys.id}/unpublish`, owner, {
      json: { force: true },
    })
    expect(((await forced.json()) as EntryView).sys.status).toBe('draft')

    // A link to an entry of a type the field does not allow.
    await call(t, 'POST', `/entries/${other.sys.id}/publish`, owner)
    const wrong = await create(t, spaceId, owner, 'post', {
      title: { 'en-US': 'Wrong' },
      author: { type: 'entry', id: other.sys.id },
    })
    expect(await errors(await call(t, 'POST', `/entries/${wrong.sys.id}/publish`, owner))).toEqual([
      'fields.author: Links to an entry of a type this field does not allow',
    ])
  })

  it('honours Idempotency-Key on publish', async () => {
    const { t, events, owner, spaceId } = await setup()
    const post = await create(t, spaceId, owner, 'post', { title: { 'en-US': 'Hello' } })
    const send = (body: object) =>
      call(t, 'POST', `/entries/${post.sys.id}/publish`, owner, {
        json: body,
        headers: { 'idempotency-key': 'k-1' },
      })
    const first = await send({})
    const repeat = await send({})
    expect(repeat.status).toBe(200)
    expect(repeat.headers.get('idempotent-replayed')).toBe('true')
    expect(await repeat.json()).toEqual(await first.json())
    expect((await send({ expectedVersion: 1 })).status).toBe(409)
    expect(events.emitted.filter((e) => e.type === 'entry.published')).toHaveLength(1)
  })

  it('unpublishes, then allows deletion; viewers cannot publish', async () => {
    const { t, events, owner, viewer, spaceId } = await setup()
    const post = await create(t, spaceId, owner, 'post', { title: { 'en-US': 'Hello' } })
    expect((await call(t, 'POST', `/entries/${post.sys.id}/publish`, viewer)).status).toBe(403)
    await call(t, 'POST', `/entries/${post.sys.id}/publish`, owner)
    expect((await call(t, 'DELETE', `/entries/${post.sys.id}`, owner)).status).toBe(409)
    const res = await call(t, 'POST', `/entries/${post.sys.id}/unpublish`, owner)
    expect(((await res.json()) as EntryView).sys).toMatchObject({
      status: 'draft',
      publishedVersionId: null,
    })
    expect(events.expectEvent('entry.unpublished').payload).toMatchObject({
      entryId: post.sys.id,
      versionId: expect.any(String),
    })
    expect((await call(t, 'DELETE', `/entries/${post.sys.id}`, owner)).status).toBe(204)
  })
})
