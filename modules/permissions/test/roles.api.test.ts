import { definePermission, ForbiddenError, ValidationError } from '@blixis/contracts'
import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { defineModule } from '@blixis/kernel'
import { newId } from '@blixis/shared'
import {
  asApiToken,
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
import { permissionsModule, ROLE_SERVICE, type Tenant } from '../src/index.ts'

const blogModule = defineModule({
  meta: { name: '@acme/blog', version: '1.0.0' },
  permissions: [
    definePermission({
      id: 'blog.posts.write',
      description: 'Write posts',
      defaultRoles: ['admin', 'editor'],
    }),
    definePermission({ id: 'blog.danger', description: 'Owner only', scope: 'organization' }),
  ],
})

interface RoleBody {
  id: string
  name: string
  permissions: string[]
  system: boolean
}

describe.skipIf(!databaseTestsEnabled())('roles API (Postgres)', () => {
  const modules = () => [databaseModule(), usersModule(), permissionsModule(), blogModule()]
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  const org = newId()
  const s1 = newId()

  async function setup() {
    const t = await createTestBlixis({
      modules: [...modules(), captureEvents().module()],
      database: db,
    })
    let n = 0
    const member = (...memberships: [string | null, string][]) =>
      t.app.runInScope({}, async ({ services }) => {
        n += 1
        const user = await services
          .get(USER_SERVICE)
          .create({ email: `u${n}@example.com`, displayName: `U${n}` })
        for (const [spaceId, role] of memberships) {
          const m = services.get(MEMBERSHIP_SERVICE)
          if (spaceId === null)
            await m.addOrganizationMember({ userId: user.id, organizationId: org, role })
          else await m.addSpaceMember({ userId: user.id, organizationId: org, spaceId, role })
        }
        return user.id
      })
    return { t, member }
  }
  const call = (t: TestBlixis, method: string, path: string, userId: string, json?: unknown) =>
    t.request(`/api/v1/organizations/${org}${path}`, {
      method,
      actor: asUser(userId),
      ...(json === undefined ? {} : { json }),
    })

  it('owners and admins manage custom roles; viewers read; strangers get 404', async () => {
    const { t, member } = await setup()
    const owner = await member([null, 'owner'])
    const admin = await member([null, 'admin'])
    const viewer = await member([null, 'viewer'])
    const spaceAdmin = await member([s1, 'admin'])

    const created = await call(t, 'POST', '/roles', admin, {
      name: 'Writer',
      description: 'Writes posts',
      permissions: ['blog.posts.write'],
    })
    expect(created.status).toBe(201)
    const role = (await created.json()) as RoleBody
    expect(role).toMatchObject({ name: 'Writer', permissions: ['blog.posts.write'], system: false })

    const listed = (await (await call(t, 'GET', '/roles', viewer)).json()) as { roles: RoleBody[] }
    expect(listed.roles.map((r) => r.id)).toEqual(['owner', 'admin', 'editor', 'viewer', role.id])

    expect((await call(t, 'POST', '/roles', viewer, { name: 'X', permissions: [] })).status).toBe(
      403,
    )
    // Space-only members and strangers do not learn the organization exists.
    for (const outsider of [spaceAdmin, await member()]) {
      expect((await call(t, 'GET', '/roles', outsider)).status).toBe(404)
      expect((await call(t, 'DELETE', `/roles/${role.id}`, outsider)).status).toBe(404)
    }

    const patched = await call(t, 'PATCH', `/roles/${role.id}`, owner, { name: 'Author' })
    expect(((await patched.json()) as RoleBody).name).toBe('Author')
    expect((await call(t, 'PATCH', '/roles/admin', owner, { name: 'Boss' })).status).toBe(409)
    expect((await call(t, 'DELETE', `/roles/${role.id}`, admin)).status).toBe(204)
    expect((await call(t, 'DELETE', `/roles/${role.id}`, admin)).status).toBe(404)
  })

  it('never lets anyone manage a role with permissions they do not hold', async () => {
    const { t, member } = await setup()
    const owner = await member([null, 'owner'])
    const admin = await member([null, 'admin'])
    const dangerous = { name: 'Danger', permissions: ['blog.danger'] }
    expect((await call(t, 'POST', '/roles', admin, dangerous)).status).toBe(403)
    const role = (await (await call(t, 'POST', '/roles', owner, dangerous)).json()) as RoleBody
    expect((await call(t, 'PATCH', `/roles/${role.id}`, admin, { name: 'Mine' })).status).toBe(403)
    expect((await call(t, 'DELETE', `/roles/${role.id}`, admin)).status).toBe(403)
    const safe = (await (
      await call(t, 'POST', '/roles', admin, { name: 'Safe', permissions: [] })
    ).json()) as RoleBody
    expect(
      (await call(t, 'PATCH', `/roles/${safe.id}`, admin, { permissions: ['blog.danger'] })).status,
    ).toBe(403)
    // An API token of the owner is limited to its scopes.
    const token = await t.request(`/api/v1/organizations/${org}/roles`, {
      method: 'POST',
      actor: asApiToken(owner, ['roles.manage']),
      json: dangerous,
    })
    expect(token.status).toBe(403)
  })

  it('assertCanGrant: existing roles, valid levels, and no escalation', async () => {
    const { t, member } = await setup()
    const owner = asUser(await member([null, 'owner']))
    const admin = asUser(await member([null, 'admin']))
    const spaceAdmin = asUser(await member([s1, 'admin']))
    const grant = (actor: typeof owner, tenant: Tenant, role: string) =>
      t.app.runInScope({}, ({ services }) =>
        services.get(ROLE_SERVICE).assertCanGrant(actor, tenant, role),
      )
    const organization = { organizationId: org }
    const space = { organizationId: org, spaceId: s1 }

    await grant(owner, organization, 'owner')
    await grant(admin, organization, 'admin')
    await grant(spaceAdmin, space, 'editor')
    await expect(grant(admin, organization, 'owner')).rejects.toThrowError(ForbiddenError)
    await expect(grant(spaceAdmin, organization, 'viewer')).rejects.toThrowError(ForbiddenError)
    await expect(grant(owner, space, 'owner')).rejects.toThrowError(ValidationError)
    await expect(grant(owner, organization, 'member')).rejects.toMatchObject({
      issues: [{ path: ['role'], message: expect.stringMatching(/^Use one of: owner, admin/) }],
    })
    await expect(grant(owner, organization, newId())).rejects.toThrowError(ValidationError)
  })
})
