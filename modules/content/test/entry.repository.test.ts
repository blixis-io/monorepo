import { databaseModule, withTransaction } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { permissionsModule } from '@blixis/permissions'
import { newId } from '@blixis/shared'
import { spacesModule } from '@blixis/spaces'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { usersModule } from '@blixis/users'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { entryStatus } from '../src/domain/entry.ts'
import { contentModule } from '../src/index.ts'
import { contentTypeRepository } from '../src/infrastructure/content-type.repository.ts'
import { entryRepository, type VersionInput } from '../src/infrastructure/entry.repository.ts'

describe.skipIf(!databaseTestsEnabled())('entry repository (Postgres)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({
      modules: [
        databaseModule(),
        eventsModule(),
        usersModule(),
        spacesModule(),
        permissionsModule(),
        contentModule(),
      ],
    })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  const tenant = { organizationId: newId(), spaceId: newId(), environmentId: newId() }
  const input = (
    fields: Record<string, unknown>,
    links: VersionInput['links'] = [],
  ): VersionInput => ({
    fields,
    contentTypeVersion: 1,
    actor: 'user:u1',
    links,
  })
  const type = (apiId: string, kind: 'entry' | 'component' = 'entry') =>
    contentTypeRepository.insert(db.db, tenant, {
      kind,
      apiId,
      name: apiId,
      description: '',
      displayFieldId: null,
      groups: [],
      fields: [],
    })
  const tx = <T>(fn: Parameters<typeof withTransaction<T>>[1]) => withTransaction(db.db, fn)

  it('creates entries with immutable, numbered versions and optimistic appends', async () => {
    const page = await type('page')
    const { entry, version } = await tx((t) =>
      entryRepository.create(t, tenant, page.id, input({ a: 1 })),
    )
    expect(entry).toMatchObject({
      version: 1,
      currentVersionId: version.id,
      publishedVersionId: null,
    })
    expect(version).toMatchObject({ number: 1, fields: { a: 1 }, createdBy: 'user:u1' })
    const second = await tx((t) => entryRepository.append(t, tenant, entry.id, 1, input({ a: 2 })))
    expect(second?.entry.version).toBe(2)
    expect(
      await tx((t) => entryRepository.append(t, tenant, entry.id, 1, input({ a: 3 }))),
    ).toBeUndefined()
    const versions = await entryRepository.versions(db.db, tenant, entry.id, { limit: 10 })
    expect(versions.map((v) => [v.number, v.fields])).toEqual([
      [2, { a: 2 }],
      [1, { a: 1 }],
    ])
    expect(
      (await entryRepository.versions(db.db, tenant, entry.id, { limit: 10, before: 2 })).map(
        (v) => v.number,
      ),
    ).toEqual([1])
    // Another tenant sees nothing.
    expect(
      await entryRepository.findById(db.db, { ...tenant, spaceId: newId() }, entry.id),
    ).toBeUndefined()
    expect((await entryRepository.findForResolution(db.db, entry.id))?.spaceId).toBe(tenant.spaceId)
  })

  it('publishes a version, records history, and derives the status', async () => {
    const page = await type('page')
    const { entry, version } = await tx((t) =>
      entryRepository.create(t, tenant, page.id, input({ a: 1 })),
    )
    expect(entryStatus(entry)).toBe('draft')
    const published = await tx((t) =>
      entryRepository.setPublished(t, tenant, entry.id, version.id, 'user:u1'),
    )
    expect(entryStatus(published)).toBe('published')
    expect(published.firstPublishedAt).toBe(published.publishedAt)
    const changed = await tx((t) => entryRepository.append(t, tenant, entry.id, 1, input({ a: 2 })))
    expect(entryStatus(changed?.entry ?? published)).toBe('changed')
    const unpublished = await tx((t) =>
      entryRepository.setPublished(t, tenant, entry.id, null, 'user:u1'),
    )
    expect(unpublished).toMatchObject({
      publishedVersionId: null,
      publishedAt: null,
      firstPublishedAt: published.firstPublishedAt,
    })
    const history = await db.db.execute(
      sql`select action from content.entry_publications where entry_id = ${entry.id} order by at`,
    )
    expect(history.rows.map((r) => r['action'])).toEqual(['publish', 'unpublish'])
  })

  it('lists newest first with keyset pagination, type and field filters', async () => {
    const page = await type('page')
    const post = await type('post')
    const made: string[] = []
    for (let i = 0; i < 5; i++) {
      const created = await tx((t) =>
        entryRepository.create(
          t,
          tenant,
          i % 2 === 0 ? page.id : post.id,
          input({ slug: `s${i}`, n: i }),
        ),
      )
      made.push(created.entry.id)
      await db.db.execute(
        sql`update content.entries set updated_at = now() + ${`${i} seconds`}::interval where id = ${created.entry.id}`,
      )
    }
    const first = await entryRepository.list(db.db, tenant, { state: 'draft', limit: 2 })
    expect(first.map((r) => r.entry.id)).toEqual([made[4], made[3]])
    const last = first.at(-1)?.entry
    const next = await entryRepository.list(db.db, tenant, {
      state: 'draft',
      limit: 10,
      cursor: { updatedAt: last?.updatedAt ?? '', id: last?.id ?? '' },
    })
    expect(next.map((r) => r.entry.id)).toEqual([made[2], made[1], made[0]])
    expect(
      (
        await entryRepository.list(db.db, tenant, {
          state: 'draft',
          limit: 10,
          contentTypeId: post.id,
        })
      ).length,
    ).toBe(2)
    const filtered = await entryRepository.list(db.db, tenant, {
      state: 'draft',
      limit: 10,
      fieldFilters: { slug: 's3' },
    })
    expect(filtered.map((r) => r.version.fields['n'])).toEqual([3])
    expect(await entryRepository.list(db.db, tenant, { state: 'published', limit: 10 })).toEqual([])
  })

  it('tracks links per version and finds referrers by state', async () => {
    const page = await type('page')
    const target = await tx((t) => entryRepository.create(t, tenant, page.id, input({})))
    const from = await tx((t) =>
      entryRepository.create(
        t,
        tenant,
        page.id,
        input({}, [
          { type: 'entry', id: target.entry.id },
          { type: 'entry', id: target.entry.id },
        ]),
      ),
    )
    const link = { type: 'entry' as const, id: target.entry.id }
    expect(
      (await entryRepository.referrers(db.db, tenant, link, 'draft')).map((e) => e.id),
    ).toEqual([from.entry.id])
    expect(await entryRepository.referrers(db.db, tenant, link, 'published')).toEqual([])
    await tx((t) =>
      entryRepository.setPublished(t, tenant, from.entry.id, from.version.id, 'user:u1'),
    )
    // A newer draft without the link: still referenced by the published version.
    await tx((t) => entryRepository.append(t, tenant, from.entry.id, 1, input({})))
    expect(await entryRepository.referrers(db.db, tenant, link, 'draft')).toEqual([])
    expect(
      (await entryRepository.referrers(db.db, tenant, link, 'published')).map((e) => e.id),
    ).toEqual([from.entry.id])
  })

  it('counts entries per type and per contained component', async () => {
    const page = await type('page')
    const hero = await type('hero', 'component')
    await tx((t) =>
      entryRepository.create(
        t,
        tenant,
        page.id,
        input({ body: { 'en-US': [{ _id: 'x', _type: 'other' }] } }),
      ),
    )
    expect(await entryRepository.countContainingComponent(db.db, tenant, hero.id)).toBe(0)
    await tx((t) =>
      entryRepository.create(
        t,
        tenant,
        page.id,
        input({ body: [{ _id: 'y', _type: 'section', children: [{ _id: 'z', _type: hero.id }] }] }),
      ),
    )
    expect(await entryRepository.countByContentType(db.db, tenant, page.id)).toBe(2)
    expect(await entryRepository.countContainingComponent(db.db, tenant, hero.id)).toBe(1)
  })

  it('deletes entries with their versions', async () => {
    const page = await type('page')
    const { entry } = await tx((t) => entryRepository.create(t, tenant, page.id, input({})))
    expect(await tx((t) => entryRepository.delete(t, tenant, entry.id))).toBe(true)
    const left = await db.db.execute(
      sql`select count(*)::int as n from content.entry_versions where entry_id = ${entry.id}`,
    )
    expect(left.rows[0]?.['n']).toBe(0)
  })
})
