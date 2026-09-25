import { ConflictError, NotFoundError, ValidationError } from '@blixis/contracts'
import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { newId } from '@blixis/shared'
import { captureEvents, createTestBlixis } from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  MEMBERSHIP_SERVICE,
  type MembershipService,
  USER_SERVICE,
  usersModule,
} from '../src/index.ts'

describe.skipIf(!databaseTestsEnabled())('memberships (Postgres)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [databaseModule(), eventsModule(), usersModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function setup() {
    const events = captureEvents()
    const t = await createTestBlixis({
      modules: [databaseModule(), events.module(), usersModule()],
      database: db,
    })
    const run = <T>(fn: (m: MembershipService) => Promise<T>) =>
      t.app.runInScope({}, async ({ services }) => fn(services.get(MEMBERSHIP_SERVICE)))
    const user = (email: string) =>
      t.app.runInScope({}, async ({ services }) =>
        services.get(USER_SERVICE).create({ email, displayName: email }),
      )
    return { events, run, user }
  }
  const org = newId()
  const space = newId()

  it('adds organization and space members; one membership per user and level', async () => {
    const { run, user, events } = await setup()
    const ada = await user('ada@example.com')
    const owner = await run((m) =>
      m.addOrganizationMember({ userId: ada.id, organizationId: org, role: 'owner' }),
    )
    const editor = await run((m) =>
      m.addSpaceMember({ userId: ada.id, organizationId: org, spaceId: space, role: 'editor' }),
    )
    expect(owner).toMatchObject({ spaceId: null, role: 'owner' })
    expect(editor).toMatchObject({ spaceId: space, role: 'editor' })
    // Organization-level duplicates are caught too (NULLS NOT DISTINCT).
    await expect(
      run((m) => m.addOrganizationMember({ userId: ada.id, organizationId: org, role: 'viewer' })),
    ).rejects.toThrowError(new ConflictError('The user is already a member here'))
    expect((await run((m) => m.listMembers({ organizationId: org }))).map((x) => x.id)).toEqual([
      owner.id,
    ])
    expect(
      (await run((m) => m.listMembers({ organizationId: org, spaceId: space }))).map((x) => x.id),
    ).toEqual([editor.id])
    expect(
      (await run((m) => m.listMembershipsForUser(ada.id))).map((x) => [x.spaceId, x.role]),
    ).toEqual([
      [null, 'owner'],
      [space, 'editor'],
    ])
    expect(await run((m) => m.countWithRole(org, 'editor'))).toBe(1)
    expect(events.emitted.filter((e) => e.type === 'membership.created')).toHaveLength(2)
  })

  it('validates roles per level', async () => {
    const { run, user } = await setup()
    const u = await user('r@example.com')
    await expect(
      run((m) => m.addOrganizationMember({ userId: u.id, organizationId: org, role: 'member' })),
    ).rejects.toBeInstanceOf(ValidationError)
    // Custom roles are referenced by id; @blixis/permissions verifies they exist.
    expect(
      (
        await run((m) =>
          m.addOrganizationMember({ userId: u.id, organizationId: org, role: newId() }),
        )
      ).role,
    ).toMatch(/^[0-9a-f-]{36}$/)
    await expect(
      run((m) =>
        m.addSpaceMember({
          userId: u.id,
          organizationId: org,
          spaceId: space,
          role: 'owner',
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('keeps at least one owner; scope mismatches are not found', async () => {
    const { run, user, events } = await setup()
    const a = await user('a@example.com')
    const b = await user('b@example.com')
    const ownerA = await run((m) =>
      m.addOrganizationMember({ userId: a.id, organizationId: org, role: 'owner' }),
    )
    await expect(run((m) => m.remove(ownerA.id, { organizationId: org }))).rejects.toThrowError(
      new ConflictError('An organization must keep at least one owner'),
    )
    await expect(
      run((m) => m.changeRole(ownerA.id, { organizationId: org }, 'admin')),
    ).rejects.toBeInstanceOf(ConflictError)
    const ownerB = await run((m) =>
      m.addOrganizationMember({ userId: b.id, organizationId: org, role: 'owner' }),
    )
    expect((await run((m) => m.changeRole(ownerA.id, { organizationId: org }, 'admin'))).role).toBe(
      'admin',
    )
    await expect(
      run((m) => m.remove(ownerB.id, { organizationId: newId() })),
    ).rejects.toBeInstanceOf(NotFoundError)
    await expect(
      run((m) => m.remove(ownerB.id, { organizationId: org, spaceId: space })),
    ).rejects.toBeInstanceOf(NotFoundError)
    await run((m) => m.remove(ownerA.id, { organizationId: org }))
    expect(events.emitted.filter((e) => e.type === 'membership.removed')).toHaveLength(1)
  })

  it('concurrent removal of the last two owners leaves exactly one', async () => {
    const { run, user } = await setup()
    const a = await user('c1@example.com')
    const b = await user('c2@example.com')
    const o1 = await run((m) =>
      m.addOrganizationMember({ userId: a.id, organizationId: org, role: 'owner' }),
    )
    const o2 = await run((m) =>
      m.addOrganizationMember({ userId: b.id, organizationId: org, role: 'owner' }),
    )
    const results = await Promise.allSettled([
      run((m) => m.remove(o1.id, { organizationId: org })),
      run((m) => m.remove(o2.id, { organizationId: org })),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await run((m) => m.listMembers({ organizationId: org }))).toHaveLength(1)
  })
})
