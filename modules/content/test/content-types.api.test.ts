import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { serviceOverride } from '@blixis/kernel'
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
import { type ContentTypeView, contentModule, ENTRY_USAGE } from '../src/index.ts'

const modules = () => [
  databaseModule(),
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

describe.skipIf(!databaseTestsEnabled())('content types API (Postgres)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function setup(entries = 0) {
    const events = captureEvents()
    const t = await createTestBlixis({
      modules: [...modules(), events.module()],
      database: db,
      overrides: [serviceOverride(ENTRY_USAGE, async () => entries)],
    })
    const seeded = await t.app.runInScope({}, async ({ services }) => {
      const users = services.get(USER_SERVICE)
      const mk = (email: string) => users.create({ email, displayName: email })
      const [owner, viewer, outsider] = [
        await mk('o@example.com'),
        await mk('v@example.com'),
        await mk('x@example.com'),
      ]
      const tenancy = services.get(TENANCY_SERVICE)
      const org = await tenancy.createOrganization(asUser(owner.id), { name: 'Org', slug: 'org' })
      const space = await tenancy.createSpace(asUser(owner.id), org.id, {
        name: 'Site',
        slug: 'site',
      })
      await services
        .get(MEMBER_SERVICE)
        .addOrganizationMember(asUser(owner.id), org.id, { email: viewer.email, role: 'viewer' })
      return { owner: owner.id, viewer: viewer.id, outsider: outsider.id, spaceId: space.id }
    })
    return { t, events, ...seeded }
  }
  const call = (t: TestBlixis, method: string, path: string, userId: string, json?: unknown) =>
    t.request(`/api/v1${path}`, {
      method,
      actor: asUser(userId),
      ...(json === undefined ? {} : { json }),
    })
  const create = async (t: TestBlixis, spaceId: string, userId: string, body: unknown) => {
    const res = await call(t, 'POST', `/spaces/${spaceId}/content-types`, userId, body)
    return { status: res.status, body: (await res.json()) as ContentTypeView & Problem }
  }
  const paths = (p: Problem) => (p.errors ?? []).map((e) => `${e.path.join('.')}: ${e.message}`)

  it('creates an entry type: ids, defaults, display field, event', async () => {
    const { t, events, owner, spaceId } = await setup()
    const { status, body } = await create(t, spaceId, owner, {
      apiId: 'blogPost',
      name: 'Blog post',
      displayField: 'title',
      groups: [{ id: 'seo', name: 'SEO' }],
      fields: [
        { apiId: 'title', name: 'Title', type: 'text', required: true, localized: true },
        {
          apiId: 'metaTitle',
          name: 'Meta title',
          type: 'text',
          group: 'seo',
          settings: { maxLength: 60 },
        },
        { apiId: 'body', name: 'Body', type: 'richText', localized: true, description: 'The post' },
      ],
    })
    expect(status).toBe(201)
    expect(body).toMatchObject({
      kind: 'entry',
      apiId: 'blogPost',
      displayField: 'title',
      version: 1,
      fields: [
        {
          apiId: 'title',
          type: 'text',
          required: true,
          localized: true,
          disabled: false,
          settings: { maxLength: 256, format: 'plain' },
        },
        { apiId: 'metaTitle', group: 'seo', settings: { maxLength: 60 } },
        { apiId: 'body', description: 'The post', settings: { headingLevels: [1, 2, 3, 4, 5, 6] } },
      ],
    })
    for (const f of body.fields) expect(f.id).toMatch(/^[a-zA-Z0-9]{8}$/)
    expect(events.expectEvent('content-type.created').payload).toMatchObject({
      apiId: 'blogPost',
      version: 1,
    })
    const list = await (await call(t, 'GET', `/spaces/${spaceId}/content-types`, owner)).json()
    expect((list as { contentTypes: ContentTypeView[] }).contentTypes.map((c) => c.apiId)).toEqual([
      'blogPost',
    ])
  })

  it('creates a type with every built-in field type', async () => {
    const { t, owner, spaceId } = await setup()
    const hero = (
      await create(t, spaceId, owner, { kind: 'component', apiId: 'hero', name: 'Hero' })
    ).body
    const settings: Record<string, object> = {
      select: { options: [{ value: 'a', label: 'A' }] },
      blocks: { componentIds: [hero.id] },
    }
    const types = [
      'text',
      'longText',
      'richText',
      'number',
      'boolean',
      'date',
      'dateTime',
      'select',
      'reference',
      'asset',
      'link',
      'blocks',
      'json',
    ]
    const { status, body } = await create(t, spaceId, owner, {
      apiId: 'kitchenSink',
      name: 'Kitchen sink',
      fields: types.map((type) => ({
        apiId: `f${type}`,
        name: type,
        type,
        settings: settings[type] ?? {},
      })),
    })
    expect(status).toBe(201)
    expect(body.fields.map((f) => f.type)).toEqual(types)
  })

  it('builds pages from components through a blocks field', async () => {
    const { t, owner, spaceId } = await setup()
    const hero = (
      await create(t, spaceId, owner, {
        kind: 'component',
        apiId: 'hero',
        name: 'Hero',
        fields: [
          { apiId: 'heading', name: 'Heading', type: 'text', required: true },
          { apiId: 'hasButton', name: 'Button?', type: 'boolean' },
          {
            apiId: 'button',
            name: 'Button',
            type: 'link',
            showWhen: { field: 'hasButton', equals: true },
          },
        ],
      })
    ).body
    expect(hero.fields[2]?.showWhen).toEqual({ field: 'hasButton', equals: true })
    const page = await create(t, spaceId, owner, {
      apiId: 'page',
      name: 'Page',
      fields: [
        {
          apiId: 'body',
          name: 'Body',
          type: 'blocks',
          localized: true,
          settings: { componentIds: [hero.id] },
        },
      ],
    })
    expect(page.status).toBe(201)
    const filtered = (await (
      await call(t, 'GET', `/spaces/${spaceId}/content-types?kind=component`, owner)
    ).json()) as {
      contentTypes: ContentTypeView[]
    }
    expect(filtered.contentTypes.map((c) => c.apiId)).toEqual(['hero'])
    // Blocks only take components; components cannot be localized themselves.
    const wrong = await create(t, spaceId, owner, {
      apiId: 'wrong',
      name: 'Wrong',
      fields: [
        { apiId: 'body', name: 'Body', type: 'blocks', settings: { componentIds: [page.body.id] } },
      ],
    })
    expect(paths(wrong.body)).toEqual([
      'fields.0.settings.componentIds.0: Not a component of this environment',
    ])
    const localized = await create(t, spaceId, owner, {
      kind: 'component',
      apiId: 'quote',
      name: 'Quote',
      fields: [{ apiId: 'text', name: 'Text', type: 'text', localized: true }],
    })
    expect(localized.status).toBe(400)
  })

  it('reports invalid definitions with paths', async () => {
    const { t, owner, spaceId } = await setup()
    const { status, body } = await create(t, spaceId, owner, {
      apiId: 'broken',
      name: 'Broken',
      fields: [
        { apiId: 'a', name: 'A', type: 'colour' },
        { apiId: 'b', name: 'B', type: 'text', settings: { maxLength: 5000 } },
        { apiId: 'b', name: 'B again', type: 'text', group: 'nope' },
        { apiId: 'c', name: 'C', type: 'text', showWhen: { field: 'c', equals: 1 } },
      ],
    })
    expect(status).toBe(400)
    expect(paths(body)).toEqual([
      'fields.0.type: Unknown field type "colour" (see GET /api/v1/field-types)',
      'fields.1.settings.maxLength: Too big: expected number to be <=256',
      'fields.2.apiId: Duplicate field apiId "b"',
      'fields.2.group: Unknown group "nope"',
      'fields.3.showWhen.field: Must name another field of this type',
    ])
    expect((await create(t, spaceId, owner, { apiId: 'Bad-Id', name: 'x' })).status).toBe(400)
    expect(
      (
        await create(t, spaceId, owner, {
          apiId: 'x',
          name: 'x',
          fields: [{ apiId: 'sys', name: 's', type: 'text' }],
        })
      ).status,
    ).toBe(400)
  })

  it('updates with optimistic versions, keeps field ids, and renames freely', async () => {
    const { t, events, owner, spaceId } = await setup()
    const created = (
      await create(t, spaceId, owner, {
        apiId: 'article',
        name: 'Article',
        fields: [{ apiId: 'title', name: 'Title', type: 'text' }],
      })
    ).body
    const titleId = created.fields[0]?.id
    const patch = (body: unknown) =>
      call(t, 'PATCH', `/spaces/${spaceId}/content-types/${created.id}`, owner, body)
    const res = await patch({
      version: 1,
      apiId: 'newsArticle',
      fields: [
        { id: titleId, apiId: 'headline', name: 'Headline', type: 'text', required: true },
        { apiId: 'summary', name: 'Summary', type: 'longText' },
      ],
    })
    const updated = (await res.json()) as ContentTypeView
    expect(updated).toMatchObject({ apiId: 'newsArticle', version: 2 })
    expect(updated.fields.map((f) => [f.id === titleId, f.apiId])).toEqual([
      [true, 'headline'],
      [false, 'summary'],
    ])
    expect(events.expectEvent('content-type.updated').payload).toMatchObject({ version: 2 })
    expect((await patch({ version: 1, name: 'Stale' })).status).toBe(409)
    expect((await patch({ name: 'No version' })).status).toBe(400)
    expect(
      (
        await patch({
          version: 2,
          fields: [{ id: 'zzzzzzzz', apiId: 'x', name: 'x', type: 'text' }],
        })
      ).status,
    ).toBe(400)
  })

  it('blocks unsafe changes while entries exist', async () => {
    const { t, owner, spaceId } = await setup(3)
    const created = (
      await create(t, spaceId, owner, {
        apiId: 'product',
        name: 'Product',
        fields: [
          { apiId: 'name', name: 'Name', type: 'text', localized: true },
          { apiId: 'price', name: 'Price', type: 'number' },
        ],
      })
    ).body
    const [name, price] = created.fields
    const patch = async (body: unknown) => {
      const res = await call(
        t,
        'PATCH',
        `/spaces/${spaceId}/content-types/${created.id}`,
        owner,
        body,
      )
      return { status: res.status, body: (await res.json()) as ContentTypeView & Problem }
    }
    const typeChange = await patch({
      version: 1,
      fields: [{ ...name, type: 'longText', settings: {} }, price],
    })
    expect(typeChange.status).toBe(409)
    expect(typeChange.body.detail).toContain('field "name" cannot change type while entries exist')
    expect(
      (await patch({ version: 1, fields: [{ ...name, localized: false }, price] })).status,
    ).toBe(409)
    const removal = await patch({ version: 1, fields: [name] })
    expect(removal.body.detail).toContain('set disabled: true first')
    // Disable, then remove: allowed.
    expect((await patch({ version: 1, fields: [name, { ...price, disabled: true }] })).status).toBe(
      200,
    )
    expect((await patch({ version: 2, fields: [name] })).status).toBe(200)
    // Additive changes stay free.
    expect(
      (await patch({ version: 3, fields: [name, { apiId: 'sku', name: 'SKU', type: 'text' }] }))
        .status,
    ).toBe(200)
    const del = await call(t, 'DELETE', `/spaces/${spaceId}/content-types/${created.id}`, owner)
    expect(del.status).toBe(409)
  })

  it('deletes unused types; types used by others are protected', async () => {
    const { t, events, owner, spaceId } = await setup()
    const hero = (
      await create(t, spaceId, owner, { kind: 'component', apiId: 'hero', name: 'Hero' })
    ).body
    const page = (
      await create(t, spaceId, owner, {
        apiId: 'page',
        name: 'Page',
        fields: [
          { apiId: 'body', name: 'Body', type: 'blocks', settings: { componentIds: [hero.id] } },
        ],
      })
    ).body
    const del = (id: string) => call(t, 'DELETE', `/spaces/${spaceId}/content-types/${id}`, owner)
    const blocked = await del(hero.id)
    expect(blocked.status).toBe(409)
    expect(((await blocked.json()) as Problem).detail).toContain('Used by page')
    const kindChange = await call(
      t,
      'PATCH',
      `/spaces/${spaceId}/content-types/${hero.id}`,
      owner,
      {
        version: 1,
        kind: 'entry',
      },
    )
    expect(kindChange.status).toBe(409)
    expect((await del(page.id)).status).toBe(204)
    expect((await del(hero.id)).status).toBe(204)
    expect(events.emitted.filter((e) => e.type === 'content-type.deleted')).toHaveLength(2)
    expect(
      (await call(t, 'GET', `/spaces/${spaceId}/content-types/${hero.id}`, owner)).status,
    ).toBe(404)
  })

  it('viewers read, only admins write; outsiders and unknown environments get 404', async () => {
    const { t, owner, viewer, outsider, spaceId } = await setup()
    const type = (await create(t, spaceId, owner, { apiId: 'faq', name: 'FAQ' })).body
    expect(
      (await call(t, 'GET', `/spaces/${spaceId}/content-types/${type.id}`, viewer)).status,
    ).toBe(200)
    expect((await create(t, spaceId, viewer, { apiId: 'x', name: 'X' })).status).toBe(403)
    expect((await call(t, 'GET', `/spaces/${spaceId}/content-types`, outsider)).status).toBe(404)
    expect(
      (await call(t, 'GET', `/spaces/${spaceId}/content-types?environment=staging`, owner)).status,
    ).toBe(404)
    expect((await call(t, 'GET', `/spaces/${spaceId}/content-types/not-an-id`, owner)).status).toBe(
      404,
    )
  })
})
