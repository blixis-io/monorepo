import type { ModuleHonoEnv } from '@blixis/contracts'
import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { outboxModule } from '@blixis/events/outbox'
import { defineModule, serviceOverride } from '@blixis/kernel'
import { permissionsModule } from '@blixis/permissions'
import { MEMBER_SERVICE, spacesModule, TENANCY_SERVICE } from '@blixis/spaces'
import { asUser, captureEvents, createTestBlixis, type TestBlixis } from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { USER_SERVICE, usersModule } from '@blixis/users'
import { Hono } from 'hono'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AUTH_CONFIG, authModule, type DeliveryKeyRecord } from '../src/index.ts'

/** Echoes the resolved actor, to prove keys authenticate through the real resolver chain. */
const probe = defineModule({
  meta: { name: '@acme/probe', version: '1.0.0' },
  rest: {
    path: '/probe',
    app: new Hono<ModuleHonoEnv>().get('/actor', (c) => c.json(c.var.requestContext.actor)),
  },
})

const modules = () => [
  databaseModule(),
  outboxModule(),
  usersModule(),
  spacesModule(),
  permissionsModule(),
  authModule(),
  probe(),
]

describe.skipIf(!databaseTestsEnabled())('delivery keys (Postgres)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function setup() {
    const t = await createTestBlixis({
      modules: [...modules(), captureEvents().module()],
      database: db,
      overrides: [serviceOverride(AUTH_CONFIG, { signingKeys: [], allowedOrigins: [] } as never)],
    })
    const seeded = await t.app.runInScope({}, async ({ services }) => {
      const users = services.get(USER_SERVICE)
      const owner = (await users.create({ email: 'o@example.com', displayName: 'O' })).id
      await users.create({ email: 'e@example.com', displayName: 'E' })
      const editor = (await users.findByEmail('e@example.com'))?.id ?? ''
      const tenancy = services.get(TENANCY_SERVICE)
      const org = await tenancy.createOrganization(asUser(owner), { name: 'Org', slug: 'org' })
      const space = await tenancy.createSpace(asUser(owner), org.id, { name: 'Site', slug: 'site' })
      await services
        .get(MEMBER_SERVICE)
        .addOrganizationMember(asUser(owner), org.id, { email: 'e@example.com', role: 'editor' })
      return { owner, editor, org, space }
    })
    return { t, ...seeded }
  }
  const call = (t: TestBlixis, method: string, path: string, userId: string, json?: unknown) =>
    t.request(`/api/v1${path}`, {
      method,
      actor: asUser(userId),
      ...(json === undefined ? {} : { json }),
    })
  const withKey = (t: TestBlixis, key: string) =>
    t.request('/api/v1/probe/actor', { headers: { authorization: `Bearer ${key}` } })

  it('creates keys shown once, lists without secrets, authenticates, and revokes', async () => {
    const { t, owner, org, space } = await setup()
    const base = `/spaces/${space.id}/delivery-keys`
    const created = await call(t, 'POST', base, owner, { name: 'Website', kind: 'delivery' })
    expect(created.status).toBe(201)
    expect(created.headers.get('cache-control')).toBe('no-store')
    const delivery = (await created.json()) as DeliveryKeyRecord & { key: string }
    expect(delivery.key).toMatch(/^blx_dk_[A-Za-z0-9_-]{43}$/)
    expect(delivery).toMatchObject({
      kind: 'delivery',
      name: 'Website',
      prefix: delivery.key.slice(0, 11),
      environmentIds: null,
    })

    const main = space.environments[0]?.id ?? ''
    const preview = (await (
      await call(t, 'POST', base, owner, {
        name: 'Preview',
        kind: 'preview',
        environmentIds: [main],
      })
    ).json()) as DeliveryKeyRecord & { key: string }
    expect(preview.key).toMatch(/^blx_pk_/)

    const list = (await (await call(t, 'GET', base, owner)).json()) as {
      deliveryKeys: DeliveryKeyRecord[]
    }
    expect(list.deliveryKeys.map((k) => k.name)).toEqual(['Preview', 'Website'])
    expect(JSON.stringify(list)).not.toContain(delivery.key)

    expect(await (await withKey(t, delivery.key)).json()).toEqual({
      type: 'deliveryKey',
      keyId: delivery.id,
      organizationId: org.id,
      spaceId: space.id,
      kind: 'delivery',
      environmentIds: null,
    })
    expect(await (await withKey(t, preview.key)).json()).toMatchObject({
      kind: 'preview',
      environmentIds: [main],
    })

    expect((await call(t, 'DELETE', `${base}/${delivery.id}`, owner)).status).toBe(204)
    expect((await withKey(t, delivery.key)).status).toBe(401)
    expect((await withKey(t, 'blx_dk_unknown')).status).toBe(401)
    expect((await call(t, 'DELETE', `${base}/${delivery.id}`, owner)).status).toBe(404)
  })

  it('validates input and requires auth.deliveryKeys.manage', async () => {
    const { t, owner, editor, space } = await setup()
    const base = `/spaces/${space.id}/delivery-keys`
    expect((await call(t, 'POST', base, owner, { name: 'X', kind: 'admin' })).status).toBe(400)
    const foreign = await call(t, 'POST', base, owner, {
      name: 'X',
      kind: 'delivery',
      environmentIds: ['01a0d8f9-0000-7000-8000-000000000000'],
    })
    expect(foreign.status).toBe(400)
    expect((await call(t, 'POST', base, editor, { name: 'X', kind: 'delivery' })).status).toBe(403)
    expect((await call(t, 'GET', base, editor)).status).toBe(403)
  })

  it('deletes the keys of a deleted space', async () => {
    const { t, owner, space } = await setup()
    const key = (await (
      await call(t, 'POST', `/spaces/${space.id}/delivery-keys`, owner, {
        name: 'Web',
        kind: 'delivery',
      })
    ).json()) as { key: string }
    expect((await call(t, 'DELETE', `/spaces/${space.id}`, owner)).status).toBe(204)
    expect((await withKey(t, key.key)).status).toBe(401)
  })
})
