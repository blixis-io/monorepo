import { ConflictError } from '@blixis/contracts'
import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { newId } from '@blixis/shared'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { usersModule } from '@blixis/users'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { spacesModule } from '../src/index.ts'
import {
  environmentRepository,
  localeRepository,
  organizationRepository,
  spaceRepository,
} from '../src/infrastructure/repositories.ts'

describe.skipIf(!databaseTestsEnabled())('spaces schema and repositories (Postgres)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({
      modules: [databaseModule(), eventsModule(), usersModule(), spacesModule()],
    })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  it('creates the hierarchy and keeps slugs unique globally (orgs) and per organization (spaces)', async () => {
    const acme = await organizationRepository.insert(db.db, { name: 'Acme', slug: 'acme' })
    const other = await organizationRepository.insert(db.db, { name: 'Other', slug: 'other' })
    await expect(
      organizationRepository.insert(db.db, { name: 'Acme 2', slug: 'acme' }),
    ).rejects.toBeInstanceOf(ConflictError)
    const blog = await spaceRepository.insert(db.db, {
      organizationId: acme.id,
      name: 'Blog',
      slug: 'blog',
    })
    await spaceRepository.insert(db.db, { organizationId: other.id, name: 'Blog', slug: 'blog' })
    const duplicate = await spaceRepository
      .insert(db.db, { organizationId: acme.id, name: 'Blog again', slug: 'blog' })
      .catch((e: unknown) => e)
    expect(duplicate).toBeInstanceOf(ConflictError)
    expect((duplicate as ConflictError).details).toEqual({ constraint: 'spaces_org_slug_key' })
    expect(await spaceRepository.listInOrganization(db.db, acme.id)).toEqual([blog])
  })

  it('never returns a space through another organization (§31)', async () => {
    const acme = await organizationRepository.insert(db.db, { name: 'Acme', slug: 'acme' })
    const other = await organizationRepository.insert(db.db, { name: 'Other', slug: 'other' })
    const space = await spaceRepository.insert(db.db, {
      organizationId: acme.id,
      name: 'Blog',
      slug: 'blog',
    })
    expect(await spaceRepository.findInOrganization(db.db, acme.id, space.id)).toEqual(space)
    expect(await spaceRepository.findInOrganization(db.db, other.id, space.id)).toBeUndefined()
    expect(
      await spaceRepository.update(db.db, other.id, space.id, { name: 'Hijacked' }),
    ).toBeUndefined()
    expect(await spaceRepository.findInOrganization(db.db, acme.id, newId())).toBeUndefined()
  })

  it('allows exactly one default environment and locale per space, scoped by tenant', async () => {
    const org = await organizationRepository.insert(db.db, { name: 'Acme', slug: 'acme' })
    const space = await spaceRepository.insert(db.db, {
      organizationId: org.id,
      name: 'Blog',
      slug: 'blog',
    })
    const tenant = { organizationId: org.id, spaceId: space.id }
    await environmentRepository.insert(db.db, tenant, { key: 'main', isDefault: true })
    await expect(
      environmentRepository.insert(db.db, tenant, { key: 'staging', isDefault: true }),
    ).rejects.toBeInstanceOf(ConflictError)
    await localeRepository.insert(db.db, tenant, {
      code: 'en',
      name: 'English',
      isDefault: true,
      fallbackCode: null,
    })
    await localeRepository.insert(db.db, tenant, {
      code: 'nl-NL',
      name: 'Dutch',
      isDefault: false,
      fallbackCode: 'en',
    })
    await expect(
      localeRepository.insert(db.db, tenant, {
        code: 'de',
        name: 'German',
        isDefault: true,
        fallbackCode: null,
      }),
    ).rejects.toBeInstanceOf(ConflictError)
    expect((await localeRepository.list(db.db, tenant)).map((l) => l.code)).toEqual(['en', 'nl-NL'])
    const foreign = { organizationId: org.id, spaceId: newId() }
    expect(await localeRepository.list(db.db, foreign)).toEqual([])
    expect(await environmentRepository.list(db.db, foreign)).toEqual([])
  })
})
