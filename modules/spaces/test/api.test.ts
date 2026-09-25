import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { newId } from '@blixis/shared'
import {
  asAnonymous,
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
import { USER_SERVICE, usersModule } from '@blixis/users'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type SpacesModuleOptions, spacesModule } from '../src/index.ts'

interface Org {
  id: string
  slug: string
}
interface SpaceBody {
  id: string
  organizationId: string
  environments: { key: string; isDefault: boolean }[]
  locales: { code: string; isDefault: boolean }[]
}

describe.skipIf(!databaseTestsEnabled())('spaces API (Postgres)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({
      modules: [databaseModule(), eventsModule(), usersModule(), spacesModule()],
    })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function setup(options: SpacesModuleOptions = {}) {
    const events = captureEvents()
    const t = await createTestBlixis({
      modules: [databaseModule(), events.module(), usersModule(), spacesModule(options)],
      database: db,
    })
    const user = async (email: string) =>
      (
        await t.app.runInScope({}, async ({ services }) =>
          services.get(USER_SERVICE).create({ email, displayName: email }),
        )
      ).id
    return { t, events, user }
  }
  const call = (t: TestBlixis, method: string, path: string, userId: string, json?: unknown) =>
    t.request(`/api/v1${path}`, {
      method,
      actor: asUser(userId),
      ...(json === undefined ? {} : { json }),
    })
  const createOrg = async (t: TestBlixis, userId: string, slug = 'acme') =>
    (await (await call(t, 'POST', '/organizations', userId, { name: 'Acme', slug })).json()) as Org
  const createSpace = async (
    t: TestBlixis,
    userId: string,
    orgId: string,
    body: object = { name: 'Blog', slug: 'blog' },
  ) => call(t, 'POST', `/organizations/${orgId}/spaces`, userId, body)

  it('organizations: creator becomes owner; non-members get 404', async () => {
    const { t, user } = await setup()
    const owner = await user('owner@example.com')
    const stranger = await user('stranger@example.com')
    const org = await createOrg(t, owner)
    expect(
      (
        (await (await call(t, 'GET', '/organizations', owner)).json()) as { organizations: Org[] }
      ).organizations.map((o) => o.id),
    ).toEqual([org.id])
    expect((await call(t, 'GET', `/organizations/${org.id}`, owner)).status).toBe(200)
    expect((await call(t, 'GET', `/organizations/${org.id}`, stranger)).status).toBe(404)
    expect(
      (await call(t, 'PATCH', `/organizations/${org.id}`, stranger, { name: 'Mine' })).status,
    ).toBe(404)
    expect(
      (
        (await (
          await call(t, 'PATCH', `/organizations/${org.id}`, owner, { name: 'Acme Inc' })
        ).json()) as { name: string }
      ).name,
    ).toBe('Acme Inc')
    expect(
      (await call(t, 'POST', '/organizations', owner, { name: 'Dup', slug: 'acme' })).status,
    ).toBe(409)
    expect((await t.request('/api/v1/organizations', { actor: asAnonymous() })).status).toBe(401)
    const members = (await (
      await call(t, 'GET', `/organizations/${org.id}/members`, owner)
    ).json()) as { members: { email: string; role: string }[] }
    expect(members.members).toEqual([
      expect.objectContaining({ email: 'owner@example.com', role: 'owner' }),
    ])
  })

  it('creating a space provisions main environment, default locale, admin membership, and space.created', async () => {
    const { t, user, events } = await setup()
    const owner = await user('o@example.com')
    const org = await createOrg(t, owner)
    const res = await createSpace(t, owner, org.id, {
      name: 'Blog',
      slug: 'blog',
      defaultLocale: 'nl-nl',
    })
    expect(res.status).toBe(201)
    const space = (await res.json()) as SpaceBody
    expect(space.environments).toEqual([expect.objectContaining({ key: 'main', isDefault: true })])
    expect(space.locales).toEqual([expect.objectContaining({ code: 'nl-NL', isDefault: true })])
    expect(events.expectEvent('space.created').payload).toMatchObject({
      spaceId: space.id,
      organizationId: org.id,
      defaultLocale: 'nl-NL',
    })
    const members = (await (await call(t, 'GET', `/spaces/${space.id}/members`, owner)).json()) as {
      members: { role: string }[]
    }
    expect(members.members.map((m) => m.role)).toEqual(['admin'])
    expect((await createSpace(t, owner, org.id)).status).toBe(409)
    expect(
      (await createSpace(t, owner, org.id, { name: 'X', slug: 'x', defaultLocale: 'not a locale' }))
        .status,
    ).toBe(400)
    expect(
      (
        (await (
          await createSpace(t, owner, org.id, { name: 'Docs', slug: 'docs' })
        ).json()) as SpaceBody
      ).locales[0]?.code,
    ).toBe('en-US')
  })

  it('spaces are invisible across organizations and to plain members for management', async () => {
    const { t, user } = await setup()
    const a = await user('a@example.com')
    const b = await user('b@example.com')
    const orgA = await createOrg(t, a, 'org-a')
    await createOrg(t, b, 'org-b')
    const space = (await (await createSpace(t, a, orgA.id)).json()) as SpaceBody
    for (const [method, path] of [
      ['GET', `/spaces/${space.id}`],
      ['PATCH', `/spaces/${space.id}`],
      ['DELETE', `/spaces/${space.id}`],
      ['GET', `/organizations/${orgA.id}/spaces`],
      ['POST', `/organizations/${orgA.id}/spaces`],
      ['GET', `/spaces/${space.id}/members`],
    ] as const) {
      expect(
        (
          await call(
            t,
            method,
            path,
            b,
            method === 'GET' || method === 'DELETE' ? undefined : { name: 'x', slug: 'x' },
          )
        ).status,
        `${method} ${path}`,
      ).toBe(404)
    }
    expect((await call(t, 'GET', `/spaces/${newId()}`, a)).status).toBe(404)
  })

  it('space members: editors read but cannot manage; managers delete (space.deleted)', async () => {
    const { t, user, events } = await setup()
    const owner = await user('owner@example.com')
    const editor = await user('editor@example.com')
    const org = await createOrg(t, owner)
    const space = (await (await createSpace(t, owner, org.id)).json()) as SpaceBody
    expect(
      (
        await call(t, 'POST', `/spaces/${space.id}/members`, owner, {
          email: 'EDITOR@example.com',
          role: 'editor',
        })
      ).status,
    ).toBe(201)
    expect((await call(t, 'GET', `/spaces/${space.id}`, editor)).status).toBe(200)
    expect((await call(t, 'PATCH', `/spaces/${space.id}`, editor, { name: 'Mine' })).status).toBe(
      404,
    )
    expect((await call(t, 'DELETE', `/spaces/${space.id}`, editor)).status).toBe(404)
    // The editor sees the organization in their list (through the space membership).
    expect(
      ((await (await call(t, 'GET', '/organizations', editor)).json()) as { organizations: Org[] })
        .organizations,
    ).toHaveLength(1)
    expect((await call(t, 'DELETE', `/spaces/${space.id}`, owner)).status).toBe(204)
    expect(events.expectEvent('space.deleted').payload).toEqual({
      spaceId: space.id,
      organizationId: org.id,
    })
    expect((await call(t, 'GET', `/spaces/${space.id}`, owner)).status).toBe(404)
    expect((await call(t, 'GET', `/spaces/${space.id}`, editor)).status).toBe(404)
  })

  it('organization members: add by email, owner-only owner changes, last owner kept', async () => {
    const { t, user } = await setup()
    const owner = await user('owner@example.com')
    const admin = await user('admin@example.com')
    await user('member@example.com')
    const org = await createOrg(t, owner)
    const unknown = await call(t, 'POST', `/organizations/${org.id}/members`, owner, {
      email: 'nobody@example.com',
      role: 'member',
    })
    expect(unknown.status).toBe(404)
    expect(((await unknown.json()) as { detail: string }).detail).toMatch(
      /Invitations are not available yet/,
    )
    const added = (await (
      await call(t, 'POST', `/organizations/${org.id}/members`, owner, {
        email: 'admin@example.com',
        role: 'admin',
      })
    ).json()) as { id: string }
    // Admins manage members but cannot mint owners.
    expect(
      (
        await call(t, 'POST', `/organizations/${org.id}/members`, admin, {
          email: 'member@example.com',
          role: 'owner',
        })
      ).status,
    ).toBe(403)
    const member = (await (
      await call(t, 'POST', `/organizations/${org.id}/members`, admin, {
        email: 'member@example.com',
        role: 'member',
      })
    ).json()) as { id: string }
    expect(
      (
        await call(t, 'PATCH', `/organizations/${org.id}/members/${member.id}`, admin, {
          role: 'owner',
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await call(t, 'PATCH', `/organizations/${org.id}/members/${member.id}`, owner, {
          role: 'admin',
        })
      ).status,
    ).toBe(200)
    const members = (await (
      await call(t, 'GET', `/organizations/${org.id}/members`, owner)
    ).json()) as { members: { id: string; role: string }[] }
    const ownerMembership = members.members.find((m) => m.role === 'owner')
    expect(
      (await call(t, 'DELETE', `/organizations/${org.id}/members/${ownerMembership?.id}`, owner))
        .status,
    ).toBe(409)
    expect(
      (await call(t, 'DELETE', `/organizations/${org.id}/members/${added.id}`, owner)).status,
    ).toBe(204)
  })

  it('organization creation can be disabled', async () => {
    const { t, user } = await setup({ allowOrganizationCreation: false })
    const u = await user('u@example.com')
    expect((await call(t, 'POST', '/organizations', u, { name: 'X', slug: 'x' })).status).toBe(403)
  })
})
