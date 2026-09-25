import { ConflictError, definePermission, NotFoundError, ValidationError } from '@blixis/contracts'
import { DATABASE, databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { defineModule } from '@blixis/kernel'
import { newId } from '@blixis/shared'
import { captureEvents, createTestBlixis } from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { MEMBERSHIP_SERVICE, USER_SERVICE, usersModule } from '@blixis/users'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ROLE_STORE, type RoleStore } from '../src/application/role.store.ts'
import { permissionsModule } from '../src/index.ts'

const blogModule = defineModule({
  meta: { name: '@acme/blog', version: '1.0.0' },
  permissions: [
    definePermission({
      id: 'blog.posts.read',
      description: 'Read posts',
      defaultRoles: ['admin', 'editor', 'viewer'],
    }),
    definePermission({
      id: 'blog.posts.write',
      description: 'Write posts',
      defaultRoles: ['admin', 'editor'],
    }),
    definePermission({ id: 'blog.danger', description: 'Owner only', scope: 'organization' }),
  ],
})

describe.skipIf(!databaseTestsEnabled())('RoleStore (Postgres)', () => {
  const modules = () => [
    databaseModule(),
    eventsModule(),
    usersModule(),
    permissionsModule(),
    blogModule(),
  ]
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: modules() })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function setup() {
    const t = await createTestBlixis({
      modules: [
        ...modules().filter((m) => m.meta.name !== '@blixis/events'),
        captureEvents().module(),
      ],
      database: db,
    })
    const run = <T>(fn: (roles: RoleStore) => Promise<T>) =>
      t.app.runInScope({}, async ({ services }) => fn(services.get(ROLE_STORE)))
    return { t, run }
  }
  const org = newId()

  it('derives system roles from defaultRoles; owner holds every permission', async () => {
    const { run } = await setup()
    const roles = await run((r) => r.list(org))
    expect(roles.map((role) => [role.id, role.system, role.assignableTo])).toEqual([
      ['owner', true, ['organization']],
      ['admin', true, ['organization', 'space']],
      ['editor', true, ['organization', 'space']],
      ['viewer', true, ['organization', 'space']],
    ])
    const permissions = Object.fromEntries(roles.map((role) => [role.id, role.permissions]))
    expect(permissions['owner']).toEqual(
      expect.arrayContaining(['blog.danger', 'roles.manage', 'blog.posts.write']),
    )
    expect(permissions['admin']).toEqual(
      expect.arrayContaining(['roles.manage', 'blog.posts.write']),
    )
    expect(permissions['admin']).not.toContain('blog.danger')
    expect([...(permissions['editor'] ?? [])].sort()).toEqual([
      'blog.posts.read',
      'blog.posts.write',
      'roles.read',
    ])
    expect([...(permissions['viewer'] ?? [])].sort()).toEqual(['blog.posts.read', 'roles.read'])
  })

  it('creates, lists, and updates custom roles per organization', async () => {
    const { run } = await setup()
    const role = await run((r) =>
      r.create(org, {
        name: ' Reviewer ',
        permissions: ['blog.posts.read', 'blog.posts.read', 'roles.read'],
      }),
    )
    expect(role).toMatchObject({
      organizationId: org,
      name: 'Reviewer',
      description: '',
      permissions: ['blog.posts.read', 'roles.read'],
      system: false,
      assignableTo: ['organization', 'space'],
    })
    expect((await run((r) => r.list(org))).map((r) => r.name)).toEqual([
      'Owner',
      'Admin',
      'Editor',
      'Viewer',
      'Reviewer',
    ])
    expect((await run((r) => r.list(newId()))).map((r) => r.id)).toEqual([
      'owner',
      'admin',
      'editor',
      'viewer',
    ])
    const updated = await run((r) =>
      r.update(org, role.id, { description: 'Reads posts', permissions: ['blog.posts.write'] }),
    )
    expect(updated).toMatchObject({ description: 'Reads posts', permissions: ['blog.posts.write'] })
    expect((await run((r) => r.get(org, role.id))).permissions).toEqual(['blog.posts.write'])
    // Another organization cannot see or change it (§31).
    await expect(run((r) => r.get(newId(), role.id))).rejects.toThrowError(NotFoundError)
    await expect(run((r) => r.update(newId(), role.id, { name: 'Mine' }))).rejects.toThrowError(
      NotFoundError,
    )
  })

  it('rejects unknown permissions, taken names, and changes to system roles', async () => {
    const { run } = await setup()
    await expect(
      run((r) => r.create(org, { name: 'X', permissions: ['blog.posts.publish'] })),
    ).rejects.toThrowError(ValidationError)
    await expect(run((r) => r.create(org, { name: '', permissions: [] }))).rejects.toThrowError(
      ValidationError,
    )
    await expect(
      run((r) => r.create(org, { name: 'admin', permissions: [] })),
    ).rejects.toThrowError(/name of a system role/)
    await run((r) => r.create(org, { name: 'Reviewer', permissions: [] }))
    await expect(
      run((r) => r.create(org, { name: 'REVIEWER', permissions: [] })),
    ).rejects.toThrowError(/already exists/)
    expect((await run((r) => r.create(newId(), { name: 'Reviewer', permissions: [] }))).name).toBe(
      'Reviewer',
    )
    const changes: ((r: RoleStore) => Promise<unknown>)[] = [
      (r: RoleStore) => r.update(org, 'owner', { permissions: [] }),
      (r: RoleStore) => r.update(org, 'viewer', { name: 'Reader' }),
      (r: RoleStore) => r.delete(org, 'admin'),
    ]
    for (const change of changes) {
      await expect(run(change)).rejects.toThrowError(ConflictError)
    }
    await expect(run((r) => r.get(org, 'member'))).rejects.toThrowError(NotFoundError)
  })

  it('deletes custom roles only when no membership uses them', async () => {
    const { t, run } = await setup()
    const role = await run((r) => r.create(org, { name: 'Reviewer', permissions: [] }))
    const membership = await t.app.runInScope({}, async ({ services }) => {
      const user = await services
        .get(USER_SERVICE)
        .create({ email: 'ada@example.com', displayName: 'Ada' })
      return services
        .get(MEMBERSHIP_SERVICE)
        .addSpaceMember({ userId: user.id, organizationId: org, spaceId: newId(), role: role.id })
    })
    await expect(run((r) => r.delete(org, role.id))).rejects.toThrowError(/assigned to 1/)
    await t.app.runInScope({}, ({ services }) =>
      services
        .get(MEMBERSHIP_SERVICE)
        .remove(membership.id, { organizationId: org, spaceId: membership.spaceId ?? '' }),
    )
    await run((r) => r.delete(org, role.id))
    await expect(run((r) => r.get(org, role.id))).rejects.toThrowError(NotFoundError)
    await expect(run((r) => r.delete(org, role.id))).rejects.toThrowError(NotFoundError)
  })

  it('permissionsOf grants nothing for unknown roles and ignores uninstalled permissions', async () => {
    const { t, run } = await setup()
    const role = await run((r) =>
      r.create(org, { name: 'Reviewer', permissions: ['blog.posts.read'] }),
    )
    // A module that declared `legacy.read` was removed after the role was saved.
    await t.app.runInScope({}, ({ services }) =>
      services
        .get(DATABASE)
        .execute(
          sql`update permissions.roles set permissions = array_append(permissions, 'legacy.read') where id = ${role.id}`,
        ),
    )
    expect([...(await run((r) => r.permissionsOf(org, role.id)))]).toEqual(['blog.posts.read'])
    expect([...(await run((r) => r.permissionsOf(org, 'viewer')))].sort()).toEqual([
      'blog.posts.read',
      'roles.read',
    ])
    expect((await run((r) => r.permissionsOf(org, 'member'))).size).toBe(0)
    expect((await run((r) => r.permissionsOf(newId(), role.id))).size).toBe(0)
  })
})
