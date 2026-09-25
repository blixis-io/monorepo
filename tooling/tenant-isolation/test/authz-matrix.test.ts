import { DELIVERY_KEY_SERVICE } from '@blixis/auth'
import { CONTENT_SERVICE, CONTENT_TYPE_SERVICE } from '@blixis/content'
import type { Actor, PermissionId, ServiceRegistry, UserActor } from '@blixis/contracts'
import { QUEUE_SENDER } from '@blixis/events'
import { serviceOverride } from '@blixis/kernel'
import { PERMISSION_CATALOG, ROLE_SERVICE, type Role, systemRoles } from '@blixis/permissions'
import { LOCALE_SERVICE, MEMBER_SERVICE, TENANCY_SERVICE } from '@blixis/spaces'
import {
  type AuthzCase,
  type AuthzLevel,
  asAnonymous,
  asApiToken,
  asDeliveryKey,
  asUser,
  checkAuthzMatrix,
  createTestBlixis,
  type TestBlixis,
  uncoveredTenantRoutes,
} from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { USER_SERVICE } from '@blixis/users'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiModules } from './api.ts'
import { AUTHZ_ROUTES } from './authz-routes.ts'

/**
 * Authorization matrix (roadmap 009.005): every system role at organization and space level, an
 * outsider, anonymous, and API tokens with narrow and full scopes × every permission-guarded
 * route. Each case gets a fresh tenant, so allowed changes and deletions really run.
 */
describe.skipIf(!databaseTestsEnabled())('authorization matrix (role × route × actor)', () => {
  let db: TestDatabase
  let t: TestBlixis
  let roles: readonly Role[]
  let allPermissions: PermissionId[]
  let n = 0

  beforeAll(async () => {
    const modules = await apiModules()
    db = await createTestDatabase({ modules })
    t = await createTestBlixis({
      modules,
      database: db,
      overrides: [serviceOverride(QUEUE_SENDER, { send: async () => undefined })],
    })
    const catalog = t.services.get(PERMISSION_CATALOG).list()
    roles = systemRoles(catalog)
    allPermissions = catalog.map((p) => p.id)
    await t.app.runInScope({}, ({ services }) =>
      services.get(USER_SERVICE).create({ email: 'newcomer@example.com', displayName: 'Newcomer' }),
    )
  })
  afterAll(() => db?.drop())

  const permissionsOf = (role: string) =>
    new Set<string>(roles.find((r) => r.id === role)?.permissions ?? [])

  /**
   * A fresh tenant: an organization with one space, a member to change at each level, a `de`
   * locale, and an unassigned custom role. `join` adds the case's actor to it.
   */
  interface Seeded {
    readonly orgId: string
    readonly spaceId: string
    readonly owner: UserActor
    readonly services: ServiceRegistry
  }
  function tenant(join: (seeded: Seeded) => Promise<Actor>) {
    return () =>
      t.app.runInScope({}, async ({ services }) => {
        n += 1
        const users = services.get(USER_SERVICE)
        const mk = (name: string) =>
          users.create({ email: `${name}-${n}@example.com`, displayName: name })
        const owner = asUser((await mk('owner')).id)
        const tenancy = services.get(TENANCY_SERVICE)
        const org = await tenancy.createOrganization(owner, { name: 'Org', slug: `org-${n}` })
        const space = await tenancy.createSpace(owner, org.id, { name: 'Space', slug: 'space' })
        const members = services.get(MEMBER_SERVICE)
        const target = await mk('target')
        const orgMember = await members.addOrganizationMember(owner, org.id, {
          email: target.email,
          role: 'viewer',
        })
        const spaceMember = await members.addSpaceMember(owner, space.id, {
          email: target.email,
          role: 'editor',
        })
        const ids = { orgId: org.id, spaceId: space.id }
        const locale = await services
          .get(LOCALE_SERVICE)
          .create(owner, { organizationId: org.id, spaceId: space.id }, { code: 'de' })
        const role = await services
          .get(ROLE_SERVICE)
          .create(owner, org.id, { name: 'Unused', permissions: ['spaces.read'] })
        const contentType = await services.get(CONTENT_TYPE_SERVICE).create(
          owner,
          {
            organizationId: org.id,
            spaceId: space.id,
            environmentId: space.environments[0]?.id ?? '',
          },
          { apiId: 'page', name: 'Page' },
        )
        await services.get(CONTENT_TYPE_SERVICE).create(
          owner,
          {
            organizationId: org.id,
            spaceId: space.id,
            environmentId: space.environments[0]?.id ?? '',
          },
          { apiId: 'article', name: 'Article' },
        )
        // Entries use `article`, so the content type rows can still delete `page`.
        const environment = {
          organizationId: org.id,
          spaceId: space.id,
          environmentId: space.environments[0]?.id ?? '',
        }
        const content = services.get(CONTENT_SERVICE)
        const entry = await content.create(owner, environment, {
          contentType: 'article',
          fields: {},
        })
        const [firstVersion] = (await content.listVersions(owner, environment, entry.sys.id))
          .versions
        const deliveryKey = await services
          .get(DELIVERY_KEY_SERVICE)
          .create(
            owner,
            { organizationId: org.id, spaceId: space.id },
            { name: 'Site', kind: 'delivery' },
            [],
          )
        const actor = await join({ ...ids, owner, services })
        return {
          actor,
          params: {
            ...ids,
            orgMembershipId: orgMember.id,
            spaceMembershipId: spaceMember.id,
            localeId: locale.id,
            roleId: role.id,
            contentTypeId: contentType.id,
            entryId: entry.sys.id,
            keyId: deliveryKey.record.id,
            versionId: firstVersion?.sys.id ?? '',
          },
        }
      })
  }

  /** A new user holding `role` at `level` in the tenant. */
  const memberWith = (role: string, level: AuthzLevel) =>
    tenant(async ({ orgId, spaceId, owner, services }) => {
      const user = await services
        .get(USER_SERVICE)
        .create({ email: `${role}-${level}-${n}@example.com`, displayName: role })
      const members = services.get(MEMBER_SERVICE)
      if (level === 'organization')
        await members.addOrganizationMember(owner, orgId, { email: user.email, role })
      else await members.addSpaceMember(owner, spaceId, { email: user.email, role })
      return asUser(user.id)
    })

  function cases(): AuthzCase[] {
    const organizationRole = (role: string): AuthzCase => ({
      name: `organization ${role}`,
      setup:
        role === 'owner' ? tenant(async ({ owner }) => owner) : memberWith(role, 'organization'),
      permissions: () => permissionsOf(role),
    })
    const spaceRole = (role: string): AuthzCase => ({
      name: `space ${role}`,
      setup: memberWith(role, 'space'),
      permissions: (level) => (level === 'space' ? permissionsOf(role) : undefined),
    })
    const token = (name: string, scopes: readonly PermissionId[]): AuthzCase => ({
      name,
      setup: tenant(async ({ owner }) => asApiToken(owner.userId, scopes)),
      permissions: () => new Set(scopes),
    })
    return [
      ...['owner', 'admin', 'editor', 'viewer'].map(organizationRole),
      ...['admin', 'editor', 'viewer'].map(spaceRole),
      {
        name: 'owner of another organization',
        setup: tenant(async ({ services }) => {
          const user = await services
            .get(USER_SERVICE)
            .create({ email: `outsider-${n}@example.com`, displayName: 'Outsider' })
          await services
            .get(TENANCY_SERVICE)
            .createOrganization(asUser(user.id), { name: 'Other', slug: `other-${n}` })
          return asUser(user.id)
        }),
        permissions: () => undefined,
      },
      { name: 'anonymous', setup: tenant(async () => asAnonymous()), permissions: () => new Set() },
      token("owner's read-only API token", ['organizations.read', 'spaces.read']),
      ...(['delivery', 'preview'] as const).map(
        (kind): AuthzCase => ({
          name: `${kind} key of the space`,
          setup: tenant(async ({ orgId, spaceId }) =>
            asDeliveryKey({ organizationId: orgId, spaceId }, kind),
          ),
          // Keys hold only delivery permissions, and only in their own space (none of these routes).
          permissions: (level) =>
            level === 'space'
              ? new Set(
                  kind === 'preview'
                    ? ['content.delivery.read', 'content.preview.read']
                    : ['content.delivery.read'],
                )
              : undefined,
        }),
      ),
      token("owner's API token with every scope", allPermissions),
    ]
  }

  it('covers every tenant-scoped route', () => {
    expect(uncoveredTenantRoutes(t.app, AUTHZ_ROUTES, [])).toEqual([])
    const registered = new Set(t.app.hono.routes.map((r) => `${r.method} ${r.path}`))
    expect(AUTHZ_ROUTES.filter((r) => !registered.has(`${r.method} ${r.path}`))).toEqual([])
  })

  it('every case gets exactly the statuses its permissions imply', async () => {
    const failures = await checkAuthzMatrix({ t, routes: AUTHZ_ROUTES, cases: cases() })
    expect(failures).toEqual([])
  }, 60_000)
})
