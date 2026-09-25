import { ConflictError } from '@blixis/contracts'
import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { permissionsModule } from '@blixis/permissions'
import { newId } from '@blixis/shared'
import { spacesModule, TENANCY_SERVICE } from '@blixis/spaces'
import { asUser, captureEvents, createTestBlixis } from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { USER_SERVICE, usersModule } from '@blixis/users'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CONTENT_PERMISSIONS, contentModule, newShortId } from '../src/index.ts'
import { contentTypeRepository } from '../src/infrastructure/content-type.repository.ts'

const modules = () => [
  databaseModule(),
  usersModule(),
  spacesModule(),
  permissionsModule(),
  contentModule(),
]

describe('newShortId', () => {
  it('produces 8 alphanumeric characters without collisions in a large sample', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => newShortId()))
    expect(ids.size).toBe(5000)
    for (const id of ids) expect(id).toMatch(/^[a-zA-Z0-9]{8}$/)
  })
})

describe('content permissions', () => {
  it('lets every role read and only admins change content types', () => {
    expect(CONTENT_PERMISSIONS.typesRead.defaultRoles).toEqual(['admin', 'editor', 'viewer'])
    expect(CONTENT_PERMISSIONS.typesWrite.defaultRoles).toEqual(['admin'])
  })
})

describe.skipIf(!databaseTestsEnabled())('content type repository (Postgres)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  const tenant = () => ({
    organizationId: newId(),
    spaceId: newId(),
    environmentId: newId(),
  })
  const values = (apiId: string) => ({
    kind: 'entry' as const,
    apiId,
    name: apiId,
    description: '',
    displayFieldId: null,
    groups: [],
    fields: [
      {
        id: newShortId(),
        apiId: 'title',
        name: 'Title',
        type: 'text',
        required: true,
        localized: true,
        disabled: false,
        settings: {},
      },
    ],
  })

  it('stores types per environment, with optimistic versions and tenant scoping', async () => {
    const q = db.db
    const a = tenant()
    const b = { ...a, environmentId: newId() }
    const post = await contentTypeRepository.insert(q, a, values('blogPost'))
    expect(post).toMatchObject({ apiId: 'blogPost', version: 1, fields: [{ apiId: 'title' }] })
    // Same apiId in another environment is fine; twice in one environment is a conflict.
    await contentTypeRepository.insert(q, b, values('blogPost'))
    await expect(contentTypeRepository.insert(q, a, values('blogPost'))).rejects.toThrowError(
      ConflictError,
    )
    expect(await contentTypeRepository.findById(q, b, post.id)).toBeUndefined()
    expect((await contentTypeRepository.list(q, a)).map((t) => t.id)).toEqual([post.id])
    expect(await contentTypeRepository.count(q, a)).toBe(1)

    const updated = await contentTypeRepository.update(q, a, post.id, 1, {
      ...values('article'),
    })
    expect(updated).toMatchObject({ apiId: 'article', version: 2 })
    // A stale version changes nothing.
    expect(await contentTypeRepository.update(q, a, post.id, 1, values('stale'))).toBeUndefined()
    expect(await contentTypeRepository.delete(q, b, post.id)).toBe(false)
    expect(await contentTypeRepository.delete(q, a, post.id)).toBe(true)
  })

  it('deletes the content types of a deleted space', async () => {
    const events = captureEvents()
    const t = await createTestBlixis({ modules: [...modules(), events.module()], database: db })
    await t.app.runInScope({}, async ({ services }) => {
      const owner = asUser(
        (await services.get(USER_SERVICE).create({ email: 'o@example.com', displayName: 'O' })).id,
      )
      const tenancy = services.get(TENANCY_SERVICE)
      const org = await tenancy.createOrganization(owner, { name: 'Org', slug: 'org' })
      const tenantOf = (space: { id: string; environments: readonly { id: string }[] }) => ({
        organizationId: org.id,
        spaceId: space.id,
        environmentId: space.environments[0]?.id ?? '',
      })
      const doomed = tenantOf(await tenancy.createSpace(owner, org.id, { name: 'A', slug: 'a' }))
      const kept = tenantOf(await tenancy.createSpace(owner, org.id, { name: 'B', slug: 'b' }))
      await contentTypeRepository.insert(db.db, doomed, values('page'))
      await contentTypeRepository.insert(db.db, kept, values('page'))
      await tenancy.deleteSpace(owner, doomed.spaceId)
      expect(events.expectEvent('space.deleted').payload).toMatchObject({ spaceId: doomed.spaceId })
      expect(await contentTypeRepository.count(db.db, doomed)).toBe(0)
      expect(await contentTypeRepository.count(db.db, kept)).toBe(1)
    })
  })
})
