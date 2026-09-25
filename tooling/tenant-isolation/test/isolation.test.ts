import { CONTENT_SERVICE, CONTENT_TYPE_SERVICE } from '@blixis/content'
import type { Actor } from '@blixis/contracts'
import { QUEUE_SENDER } from '@blixis/events'
import { serviceOverride } from '@blixis/kernel'
import { PERMISSION_CATALOG, ROLE_SERVICE } from '@blixis/permissions'
import { LOCALE_SERVICE, TENANCY_SERVICE } from '@blixis/spaces'
import {
  asApiToken,
  asUser,
  createTestBlixis,
  expectIsolated,
  type IsolationParams,
  type TestBlixis,
  uncoveredTenantRoutes,
} from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { MEMBERSHIP_SERVICE, USER_SERVICE } from '@blixis/users'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiModules } from './api.ts'
import { ISOLATION_ALLOW_LIST, ISOLATION_ROUTES } from './routes.ts'

describe.skipIf(!databaseTestsEnabled())(
  'cross-tenant isolation (every tenant-scoped route)',
  () => {
    let db: TestDatabase
    let t: TestBlixis
    let params: IsolationParams
    let intruders: { name: string; actor: Actor }[]
    let victimOwner: Actor
    let victimOrg: string

    beforeAll(async () => {
      const modules = await apiModules()
      db = await createTestDatabase({ modules })
      t = await createTestBlixis({
        modules,
        database: db,
        // No queue in tests: best-effort events are dropped, transactional ones stay in the outbox.
        overrides: [serviceOverride(QUEUE_SENDER, { send: async () => undefined })],
      })
      const seeded = await t.app.runInScope({}, async ({ services }) => {
        const users = services.get(USER_SERVICE)
        const tenancy = services.get(TENANCY_SERVICE)
        const memberships = services.get(MEMBERSHIP_SERVICE)
        const mk = (email: string) => users.create({ email, displayName: email })
        const [owner, member, attacker, spaceOnly] = [
          await mk('victim-owner@example.com'),
          await mk('victim-member@example.com'),
          await mk('intruder@example.com'),
          await mk('space-only@example.com'),
        ]
        // Victim tenant: organization B with spaces B1 (probed) and B2.
        const orgB = await tenancy.createOrganization(asUser(owner.id), {
          name: 'Victim',
          slug: 'victim',
        })
        const spaceB1 = await tenancy.createSpace(asUser(owner.id), orgB.id, {
          name: 'B1',
          slug: 'b1',
        })
        const spaceB2 = await tenancy.createSpace(asUser(owner.id), orgB.id, {
          name: 'B2',
          slug: 'b2',
        })
        const orgMembership = await memberships.addOrganizationMember({
          userId: member.id,
          organizationId: orgB.id,
          role: 'viewer',
        })
        const spaceMembership = await memberships.addSpaceMember({
          userId: member.id,
          organizationId: orgB.id,
          spaceId: spaceB1.id,
          role: 'editor',
        })
        const german = await services
          .get(LOCALE_SERVICE)
          .create(
            asUser(owner.id),
            { organizationId: orgB.id, spaceId: spaceB1.id },
            { code: 'de', name: 'German' },
          )
        // Intruders: owner of another organization; a member of only the sibling space B2.
        const orgA = await tenancy.createOrganization(asUser(attacker.id), {
          name: 'Attacker',
          slug: 'attacker',
        })
        await tenancy.createSpace(asUser(attacker.id), orgA.id, { name: 'A1', slug: 'a1' })
        await memberships.addSpaceMember({
          userId: spaceOnly.id,
          organizationId: orgB.id,
          spaceId: spaceB2.id,
          role: 'admin',
        })
        const role = await services
          .get(ROLE_SERVICE)
          .create(asUser(owner.id), orgB.id, { name: 'Reviewer', permissions: ['spaces.read'] })
        const contentType = await services.get(CONTENT_TYPE_SERVICE).create(
          asUser(owner.id),
          {
            organizationId: orgB.id,
            spaceId: spaceB1.id,
            environmentId: spaceB1.environments[0]?.id ?? '',
          },
          {
            apiId: 'page',
            name: 'Page',
            fields: [{ apiId: 'title', name: 'Title', type: 'text' }],
          },
        )
        const entry = await services.get(CONTENT_SERVICE).create(
          asUser(owner.id),
          {
            organizationId: orgB.id,
            spaceId: spaceB1.id,
            environmentId: spaceB1.environments[0]?.id ?? '',
          },
          { contentType: 'page', fields: { title: 'Victim page' } },
        )
        const [firstVersion] = (
          await services.get(CONTENT_SERVICE).listVersions(
            asUser(owner.id),
            {
              organizationId: orgB.id,
              spaceId: spaceB1.id,
              environmentId: spaceB1.environments[0]?.id ?? '',
            },
            entry.sys.id,
          )
        ).versions
        return {
          entry,
          entryVersionId: firstVersion?.sys.id ?? '',
          contentType,
          owner,
          attacker,
          spaceOnly,
          orgB,
          spaceB1,
          orgMembership,
          spaceMembership,
          german,
          role,
        }
      })
      victimOwner = asUser(seeded.owner.id)
      victimOrg = seeded.orgB.id
      params = {
        orgId: seeded.orgB.id,
        spaceId: seeded.spaceB1.id,
        orgMembershipId: seeded.orgMembership.id,
        spaceMembershipId: seeded.spaceMembership.id,
        localeId: seeded.german.id,
        roleId: seeded.role.id,
        contentTypeId: seeded.contentType.id,
        entryId: seeded.entry.sys.id,
        versionId: seeded.entryVersionId,
      }
      intruders = [
        { name: 'owner of another organization', actor: asUser(seeded.attacker.id) },
        {
          name: "that owner's API token (every scope)",
          actor: asApiToken(
            seeded.attacker.id,
            t.services
              .get(PERMISSION_CATALOG)
              .list()
              .map((p) => p.id),
          ),
        },
        { name: 'admin of a sibling space only', actor: asUser(seeded.spaceOnly.id) },
      ]
    })
    afterAll(() => db?.drop())

    /** Everything the victim owns, to prove probes changed nothing. */
    const fingerprint = async () => {
      const q = async (query: ReturnType<typeof sql>) => (await db.db.execute(query)).rows
      return {
        organizations: await q(
          sql`select id, name, slug from spaces.organizations where id = ${victimOrg}::uuid`,
        ),
        spaces: await q(
          sql`select id, name, slug from spaces.spaces where organization_id = ${victimOrg}::uuid order by id`,
        ),
        locales: await q(
          sql`select id, code, name, is_default from spaces.locales where organization_id = ${victimOrg}::uuid order by id`,
        ),
        roles: await q(
          sql`select id, name, permissions from permissions.roles where organization_id = ${victimOrg}::uuid order by id`,
        ),
        contentTypes: await q(
          sql`select id, api_id, name, version, fields from content.content_types where organization_id = ${victimOrg}::uuid order by id`,
        ),
        entries: await q(
          sql`select id, version, current_version_id, published_version_id from content.entries where organization_id = ${victimOrg}::uuid order by id`,
        ),
        entryVersions: await q(
          sql`select id, fields from content.entry_versions where organization_id = ${victimOrg}::uuid order by id`,
        ),
        memberships: await q(
          sql`select id, user_id, space_id, role_key from users.memberships where organization_id = ${victimOrg}::uuid order by id`,
        ),
      }
    }

    it('covers every tenant-scoped route (add new routes to src/routes.ts)', async () => {
      expect(uncoveredTenantRoutes(t.app, ISOLATION_ROUTES, ISOLATION_ALLOW_LIST)).toEqual([])
      const registered = new Set(t.app.hono.routes.map((r) => `${r.method} ${r.path}`))
      expect(ISOLATION_ROUTES.filter((r) => !registered.has(`${r.method} ${r.path}`))).toEqual([])
    })

    it('the victim can read every probed resource (the params are real)', async () => {
      const failures: string[] = []
      for (const route of ISOLATION_ROUTES.filter((r) => r.method === 'GET')) {
        const url = route.path.replace(
          /:(\w+)/g,
          (_m, name: string) => params[name] ?? `missing-${name}`,
        )
        const res = await t.request(url, { actor: victimOwner })
        if (res.status !== 200) failures.push(`${route.path} → ${res.status}`)
      }
      expect(failures).toEqual([])
    })

    it.each([0, 1, 2])(
      'rejects intruder #%i on every route without changing data',
      async (index) => {
        const intruder = intruders[index]
        if (intruder === undefined) throw new Error('no intruder')
        const failures = await expectIsolated({
          t,
          routes: ISOLATION_ROUTES,
          params,
          intruder: intruder.actor,
          fingerprint,
        })
        expect(failures, intruder.name).toEqual([])
      },
    )
  },
)
