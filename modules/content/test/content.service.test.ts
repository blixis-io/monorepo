import {
  type Actor,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@blixis/contracts'
import { databaseModule, withTransaction } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { permissionsModule } from '@blixis/permissions'
import { newId } from '@blixis/shared'
import { LOCALE_SERVICE, MEMBER_SERVICE, spacesModule, TENANCY_SERVICE } from '@blixis/spaces'
import { asUser, captureEvents, createTestBlixis } from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { USER_SERVICE, usersModule } from '@blixis/users'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  CONTENT_SERVICE,
  CONTENT_TYPE_SERVICE,
  type ContentService,
  contentModule,
  type EnvironmentTenant,
} from '../src/index.ts'
import { entryRepository } from '../src/infrastructure/entry.repository.ts'

const modules = () => [
  databaseModule(),
  usersModule(),
  spacesModule(),
  permissionsModule(),
  contentModule(),
]

describe.skipIf(!databaseTestsEnabled())('ContentService: draft lifecycle (Postgres)', () => {
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
      const mk = async (email: string) =>
        asUser((await users.create({ email, displayName: email })).id)
      const [owner, editor, viewer, outsider] = [
        await mk('o@example.com'),
        await mk('e@example.com'),
        await mk('v@example.com'),
        await mk('x@example.com'),
      ]
      const tenancy = services.get(TENANCY_SERVICE)
      const org = await tenancy.createOrganization(owner, { name: 'Org', slug: 'org' })
      const space = await tenancy.createSpace(owner, org.id, { name: 'Site', slug: 'site' })
      const members = services.get(MEMBER_SERVICE)
      await members.addOrganizationMember(owner, org.id, { email: 'e@example.com', role: 'editor' })
      await members.addOrganizationMember(owner, org.id, { email: 'v@example.com', role: 'viewer' })
      const tenant: EnvironmentTenant = {
        organizationId: org.id,
        spaceId: space.id,
        environmentId: space.environments[0]?.id ?? '',
      }
      await services.get(LOCALE_SERVICE).create(owner, tenant, { code: 'nl-NL' })
      const types = services.get(CONTENT_TYPE_SERVICE)
      const author = await types.create(owner, tenant, {
        apiId: 'author',
        name: 'Author',
        fields: [{ apiId: 'name', name: 'Name', type: 'text', required: true }],
      })
      const post = await types.create(owner, tenant, {
        apiId: 'post',
        name: 'Post',
        displayField: 'title',
        fields: [
          { apiId: 'title', name: 'Title', type: 'text', required: true, localized: true },
          { apiId: 'slug', name: 'Slug', type: 'text', settings: { format: 'slug' } },
          { apiId: 'featured', name: 'Featured', type: 'boolean' },
          {
            apiId: 'author',
            name: 'Author',
            type: 'reference',
            settings: { contentTypeIds: [author.id] },
          },
        ],
      })
      return { owner, editor, viewer, outsider, tenant, post, author }
    })
    const as = <T>(fn: (content: ContentService) => Promise<T>) =>
      t.app.runInScope({}, ({ services }) => fn(services.get(CONTENT_SERVICE)))
    return { t, events, as, ...seeded }
  }

  it('creates drafts (incomplete is fine), validates types, and reads them back', async () => {
    const { as, events, owner, tenant } = await setup()
    const draft = await as((c) =>
      c.create(owner, tenant, { contentType: 'post', fields: { slug: 'hello' } }),
    )
    expect(draft.sys).toMatchObject({
      type: 'entry',
      contentType: { apiId: 'post' },
      version: 1,
      fieldsVersion: 1,
      status: 'draft',
      publishedVersionId: null,
      createdBy: `user:${owner.type === 'user' ? owner.userId : ''}`,
    })
    expect(draft.fields).toEqual({ slug: 'hello' })
    expect(events.expectEvent('entry.created').payload).toMatchObject({ entryId: draft.sys.id })
    const invalid = await as((c) =>
      c.create(owner, tenant, {
        contentType: 'post',
        fields: { slug: 'Not A Slug', title: { 'de-DE': 'x' } },
      }),
    ).catch((e: unknown) => e)
    expect(invalid).toBeInstanceOf(ValidationError)
    expect((invalid as ValidationError).issues.map((i) => i.path.join('.'))).toEqual([
      'fields.title.de-DE',
      'fields.slug',
    ])
    expect((await as((c) => c.get(owner, tenant, draft.sys.id))).fields).toEqual({ slug: 'hello' })
    await expect(
      as((c) => c.get(owner, tenant, draft.sys.id, { state: 'published' })),
    ).rejects.toThrowError('Entry is not published')
    await expect(
      as((c) => c.create(owner, tenant, { contentType: 'nope', fields: {} })),
    ).rejects.toThrowError(NotFoundError)
  })

  it('saves new versions with optimistic concurrency and records links', async () => {
    const { as, events, owner, editor, tenant } = await setup()
    const author = await as((c) =>
      c.create(owner, tenant, { contentType: 'author', fields: { name: 'Ada' } }),
    )
    const post = await as((c) => c.create(editor, tenant, { contentType: 'post', fields: {} }))
    const fields = {
      title: { 'en-US': 'Hello', 'nl-NL': 'Hallo' },
      author: { type: 'entry', id: author.sys.id },
    }
    const saved = await as((c) =>
      c.update(editor, tenant, post.sys.id, { fields, expectedVersion: 1 }),
    )
    expect(saved.sys).toMatchObject({ version: 2, fieldsVersion: 2 })
    expect(saved.fields).toEqual(fields)
    expect(events.expectEvent('entry.updated').payload).toMatchObject({ entryId: post.sys.id })
    await expect(
      as((c) => c.update(editor, tenant, post.sys.id, { fields, expectedVersion: 1 })),
    ).rejects.toThrowError(ConflictError)
    const links = await db.db.execute(
      sql`select to_type, to_id from content.entry_references where from_entry_id = ${post.sys.id}`,
    )
    expect(links.rows).toEqual([{ to_type: 'entry', to_id: author.sys.id }])
    const versions = await db.db.execute(
      sql`select count(*)::int as n from content.entry_versions where entry_id = ${post.sys.id}`,
    )
    expect(versions.rows[0]?.['n']).toBe(2)
  })

  it('lists with filters and cursor pagination', async () => {
    const { as, owner, tenant } = await setup()
    for (let i = 0; i < 5; i++)
      await as((c) =>
        c.create(owner, tenant, {
          contentType: 'post',
          fields: { slug: `p${i}`, featured: i % 2 === 0 },
        }),
      )
    await as((c) => c.create(owner, tenant, { contentType: 'author', fields: { name: 'Ada' } }))
    const page1 = await as((c) => c.list(owner, tenant, { contentType: 'post', limit: 3 }))
    expect(page1.entries.map((e) => e.fields['slug'])).toEqual(['p4', 'p3', 'p2'])
    const page2 = await as((c) =>
      c.list(owner, tenant, { contentType: 'post', limit: 3, cursor: page1.nextCursor ?? '' }),
    )
    expect(page2.entries.map((e) => e.fields['slug'])).toEqual(['p1', 'p0'])
    expect(page2.nextCursor).toBeNull()
    expect((await as((c) => c.list(owner, tenant))).entries).toHaveLength(6)
    const featured = await as((c) =>
      c.list(owner, tenant, { contentType: 'post', fields: { featured: 'true' } }),
    )
    expect(featured.entries.map((e) => e.fields['slug'])).toEqual(['p4', 'p2', 'p0'])
    const bySlug = await as((c) =>
      c.list(owner, tenant, { contentType: 'post', fields: { slug: 'p3' } }),
    )
    expect(bySlug.entries).toHaveLength(1)
    await expect(
      as((c) => c.list(owner, tenant, { fields: { slug: 'p3' } })),
    ).rejects.toMatchObject({
      issues: [{ path: ['contentType'], message: 'Field filters need a contentType' }],
    })
    await expect(
      as((c) => c.list(owner, tenant, { contentType: 'post', fields: { title: 'x' } })),
    ).rejects.toThrowError(ValidationError)
    await expect(as((c) => c.list(owner, tenant, { cursor: 'garbage' }))).rejects.toThrowError(
      ValidationError,
    )
    await expect(as((c) => c.list(owner, tenant, { limit: 500 }))).rejects.toThrowError(
      ValidationError,
    )
    expect((await as((c) => c.list(owner, tenant, { state: 'published' }))).entries).toEqual([])
  })

  it('deletes unpublished entries only', async () => {
    const { as, events, owner, tenant } = await setup()
    const entry = await as((c) => c.create(owner, tenant, { contentType: 'post', fields: {} }))
    await withTransaction(db.db, async (tx) => {
      const stored = await entryRepository.findById(tx, tenant, entry.sys.id)
      await entryRepository.setPublished(
        tx,
        tenant,
        entry.sys.id,
        stored?.currentVersionId ?? '',
        'user:x',
      )
    })
    await expect(as((c) => c.delete(owner, tenant, entry.sys.id))).rejects.toThrowError(
      /unpublish it first/,
    )
    await withTransaction(db.db, (tx) =>
      entryRepository.setPublished(tx, tenant, entry.sys.id, null, 'user:x'),
    )
    await expect(
      as((c) => c.delete(owner, tenant, entry.sys.id, { expectedVersion: 7 })),
    ).rejects.toThrowError(ConflictError)
    await as((c) => c.delete(owner, tenant, entry.sys.id))
    expect(events.expectEvent('entry.deleted').payload).toMatchObject({ entryId: entry.sys.id })
    await expect(as((c) => c.get(owner, tenant, entry.sys.id))).rejects.toThrowError(NotFoundError)
  })

  it('checks permissions: viewers read, editors write, outsiders see nothing', async () => {
    const { as, owner, viewer, outsider, tenant } = await setup()
    const entry = await as((c) => c.create(owner, tenant, { contentType: 'post', fields: {} }))
    expect((await as((c) => c.get(viewer, tenant, entry.sys.id))).sys.id).toBe(entry.sys.id)
    await expect(
      as((c) => c.create(viewer, tenant, { contentType: 'post', fields: {} })),
    ).rejects.toThrowError(ForbiddenError)
    await expect(as((c) => c.delete(viewer, tenant, entry.sys.id))).rejects.toThrowError(
      ForbiddenError,
    )
    await expect(as((c) => c.resolveTenant(outsider, entry.sys.id))).rejects.toThrowError(
      NotFoundError,
    )
    expect(await as((c) => c.resolveTenant(viewer, entry.sys.id))).toEqual(tenant)
    await expect(as((c) => c.resolveTenant(viewer, newId()))).rejects.toThrowError(NotFoundError)
    const component = await as((c) =>
      c.create(owner as Actor, tenant, { contentType: 'missing', fields: {} }),
    ).catch((e) => e)
    expect(component).toBeInstanceOf(NotFoundError)
  })
})
