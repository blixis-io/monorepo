import {
  type Actor,
  AUTHORIZATION_SERVICE,
  type AuthorizationCheck,
  definePermission,
  ForbiddenError,
  ModuleError,
  NotFoundError,
  UnauthorizedError,
} from '@blixis/contracts'
import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { defineModule, type ScopeSeed } from '@blixis/kernel'
import { newId } from '@blixis/shared'
import {
  asAnonymous,
  asApiToken,
  asDeliveryKey,
  asUser,
  captureEvents,
  createTestBlixis,
  type TestBlixis,
} from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { MEMBERSHIP_SERVICE, USER_SERVICE, usersModule } from '@blixis/users'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ROLE_STORE } from '../src/application/role.store.ts'
import { permissionsModule } from '../src/index.ts'

const blogModule = defineModule({
  meta: { name: '@acme/blog', version: '1.0.0' },
  permissions: [
    definePermission({
      id: 'blog.posts.read',
      description: 'Read posts',
      defaultRoles: ['admin', 'editor', 'viewer'],
      deliveryKeys: ['delivery', 'preview'],
    }),
    definePermission({
      id: 'blog.drafts.read',
      description: 'Read drafts',
      deliveryKeys: ['preview'],
    }),
    definePermission({
      id: 'blog.posts.write',
      description: 'Write posts',
      defaultRoles: ['admin', 'editor'],
    }),
    definePermission({
      id: 'blog.settings.write',
      description: 'Blog settings',
      scope: 'organization',
      defaultRoles: ['admin'],
    }),
  ],
})

describe.skipIf(!databaseTestsEnabled())('AUTHORIZATION_SERVICE (Postgres)', () => {
  const modules = () => [databaseModule(), usersModule(), permissionsModule(), blogModule()]
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  const org = newId()
  const otherOrg = newId()
  const s1 = newId()
  const s2 = newId()
  const space = (spaceId: string, organizationId = org) => ({
    type: 'post',
    organizationId,
    spaceId,
  })
  const organization = (organizationId = org) => ({
    type: 'organization',
    id: organizationId,
    organizationId,
  })

  async function setup() {
    const t = await createTestBlixis({
      modules: [...modules(), captureEvents().module()],
      database: db,
    })
    let n = 0
    /** A user with memberships: `[organizationId, spaceId | null, role]`. */
    const member = (...memberships: [string, string | null, string][]) =>
      t.app.runInScope({}, async ({ services }) => {
        n += 1
        const user = await services
          .get(USER_SERVICE)
          .create({ email: `u${n}@example.com`, displayName: `U${n}` })
        for (const [organizationId, spaceId, role] of memberships) {
          const m = services.get(MEMBERSHIP_SERVICE)
          if (spaceId === null)
            await m.addOrganizationMember({ userId: user.id, organizationId, role })
          else await m.addSpaceMember({ userId: user.id, organizationId, spaceId, role })
        }
        return user.id
      })
    return { t, member }
  }

  const can = (t: TestBlixis, check: AuthorizationCheck, seed: ScopeSeed = {}) =>
    t.app.runInScope(seed, async ({ services }) => services.get(AUTHORIZATION_SERVICE).can(check))
  const require_ = (t: TestBlixis, check: AuthorizationCheck, seed: ScopeSeed = {}) =>
    t.app.runInScope(seed, async ({ services }) =>
      services.get(AUTHORIZATION_SERVICE).require(check),
    )
  const matrix = async (t: TestBlixis, actor: Actor) => ({
    readS1: await can(t, { actor, action: 'blog.posts.read', resource: space(s1) }),
    writeS1: await can(t, { actor, action: 'blog.posts.write', resource: space(s1) }),
    writeS2: await can(t, { actor, action: 'blog.posts.write', resource: space(s2) }),
    settings: await can(t, { actor, action: 'blog.settings.write', resource: organization() }),
    rolesRead: await can(t, { actor, action: 'roles.read', resource: organization() }),
  })

  it('evaluates organization roles for every space of the organization', async () => {
    const { t, member } = await setup()
    expect(await matrix(t, asUser(await member([org, null, 'owner'])))).toEqual({
      readS1: true,
      writeS1: true,
      writeS2: true,
      settings: true,
      rolesRead: true,
    })
    expect(await matrix(t, asUser(await member([org, null, 'viewer'])))).toEqual({
      readS1: true,
      writeS1: false,
      writeS2: false,
      settings: false,
      rolesRead: true,
    })
  })

  it('space memberships grant space-scoped permissions in that space only', async () => {
    const { t, member } = await setup()
    // Space admin in s1 without an organization membership.
    expect(await matrix(t, asUser(await member([org, s1, 'admin'])))).toEqual({
      readS1: true,
      writeS1: true,
      writeS2: false,
      settings: false,
      rolesRead: false,
    })
    // Organization viewer + space editor: the union, still no organization-level admin rights.
    expect(
      await matrix(t, asUser(await member([org, null, 'viewer'], [org, s1, 'editor']))),
    ).toEqual({
      readS1: true,
      writeS1: true,
      writeS2: false,
      settings: false,
      rolesRead: true,
    })
  })

  it('require: 401 for anonymous, 404 without membership, 403 for members lacking it', async () => {
    const { t, member } = await setup()
    const viewer = asUser(await member([org, null, 'viewer']))
    const spaceOnly = asUser(await member([org, s1, 'viewer']))
    await expect(
      require_(t, { actor: asAnonymous(), action: 'blog.posts.read', resource: space(s1) }),
    ).rejects.toThrowError(UnauthorizedError)
    await expect(
      require_(t, { actor: viewer, action: 'blog.posts.read', resource: space(s1, otherOrg) }),
    ).rejects.toThrowError(new NotFoundError('Post not found'))
    await expect(
      require_(t, { actor: spaceOnly, action: 'blog.posts.read', resource: space(s2) }),
    ).rejects.toThrowError(NotFoundError)
    await expect(
      require_(t, { actor: spaceOnly, action: 'roles.read', resource: organization() }),
    ).rejects.toThrowError(new NotFoundError('Organization not found'))
    await expect(
      require_(t, { actor: viewer, action: 'blog.posts.write', resource: space(s1) }),
    ).rejects.toThrowError(ForbiddenError)
    await require_(t, { actor: viewer, action: 'blog.posts.read', resource: space(s1) })
  })

  it('custom roles grant exactly their permissions', async () => {
    const { t, member } = await setup()
    const role = await t.app.runInScope({}, ({ services }) =>
      services
        .get(ROLE_STORE)
        .create(org, { name: 'Writer', permissions: ['blog.posts.write', 'blog.settings.write'] }),
    )
    expect(await matrix(t, asUser(await member([org, null, role.id])))).toEqual({
      readS1: false,
      writeS1: true,
      writeS2: true,
      settings: true,
      rolesRead: false,
    })
    // At space level the organization-scoped permission does not apply.
    expect(await matrix(t, asUser(await member([org, s1, role.id])))).toMatchObject({
      writeS1: true,
      settings: false,
    })
  })

  it('API tokens get the owner permissions intersected with their scopes', async () => {
    const { t, member } = await setup()
    const owner = await member([org, null, 'owner'])
    expect(await matrix(t, asApiToken(owner, ['blog.posts.read', 'roles.read']))).toEqual({
      readS1: true,
      writeS1: false,
      writeS2: false,
      settings: false,
      rolesRead: true,
    })
    // Explicit scopes are required: a token without scopes can do nothing.
    expect(Object.values(await matrix(t, asApiToken(owner)))).not.toContain(true)
    // Scopes never exceed the owner's own permissions.
    const viewer = await member([org, null, 'viewer'])
    expect(
      (await matrix(t, asApiToken(viewer, ['blog.posts.write', 'blog.posts.read']))).writeS1,
    ).toBe(false)
  })

  it('system actors only when allowed per call', async () => {
    const { t } = await setup()
    const system: Actor = { type: 'system', component: 'test' }
    const check = { actor: system, action: 'blog.posts.write' as const, resource: space(s1) }
    expect(await can(t, check)).toBe(false)
    expect(await can(t, { ...check, allowSystem: true })).toBe(true)
    await expect(require_(t, check)).rejects.toThrowError(ForbiddenError)
  })

  it('delivery keys get exactly the permissions granted to their kind, in their space', async () => {
    const { t } = await setup()
    const delivery = asDeliveryKey({ organizationId: org, spaceId: s1 })
    const preview = asDeliveryKey({ organizationId: org, spaceId: s1 }, 'preview')
    expect(await can(t, { actor: delivery, action: 'blog.posts.read', resource: space(s1) })).toBe(
      true,
    )
    expect(await can(t, { actor: delivery, action: 'blog.drafts.read', resource: space(s1) })).toBe(
      false,
    )
    expect(await can(t, { actor: preview, action: 'blog.drafts.read', resource: space(s1) })).toBe(
      true,
    )
    await expect(
      require_(t, { actor: delivery, action: 'blog.posts.write', resource: space(s1) }),
    ).rejects.toThrowError(ForbiddenError)
    await expect(
      require_(t, { actor: delivery, action: 'blog.posts.read', resource: space(s2) }),
    ).rejects.toThrowError(NotFoundError)
  })

  it('treats unknown permissions and missing tenant ids as programming errors', async () => {
    const { t, member } = await setup()
    const actor = asUser(await member([org, null, 'owner']))
    await expect(
      can(t, { actor, action: 'blog.posts.publish', resource: space(s1) }),
    ).rejects.toThrowError(ModuleError)
    await expect(
      can(t, { actor, action: 'blog.posts.read', resource: { type: 'post', organizationId: org } }),
    ).rejects.toThrowError(/needs a resource with organizationId and spaceId/)
    await expect(
      can(t, { actor, action: 'roles.read', resource: { type: 'organization' } }),
    ).rejects.toThrowError(ModuleError)
  })

  it('denies resources outside the tenant bound to the request', async () => {
    const { t, member } = await setup()
    const actor = asUser(await member([org, null, 'owner']))
    const bound = { tenant: { organizationId: org, spaceId: s1 } }
    expect(await can(t, { actor, action: 'blog.posts.read', resource: space(s1) }, bound)).toBe(
      true,
    )
    await expect(
      require_(t, { actor, action: 'blog.posts.read', resource: space(s2) }, bound),
    ).rejects.toThrowError(NotFoundError)
  })

  it('loads memberships once per request and logs decisions at debug level', async () => {
    const { t, member } = await setup()
    const actor = asUser(await member([org, null, 'viewer']))
    let loads = 0
    await t.app.runInScope({}, async ({ services }) => {
      const memberships = services.get(MEMBERSHIP_SERVICE)
      const original = memberships.listMembershipsForUser.bind(memberships)
      memberships.listMembershipsForUser = (userId) => {
        loads += 1
        return original(userId)
      }
      const authz = services.get(AUTHORIZATION_SERVICE)
      await authz.can({ actor, action: 'blog.posts.read', resource: space(s1) })
      await authz.can({ actor, action: 'blog.posts.write', resource: space(s2) })
    })
    expect(loads).toBe(1)
    expect(
      t.logs.entries
        .filter((e) => e.message === 'authorization')
        .map((e) => [e.level, e.fields['action'], e.fields['decision']]),
    ).toEqual([
      ['debug', 'blog.posts.read', 'allow'],
      ['debug', 'blog.posts.write', 'forbidden'],
    ])
  })
})
