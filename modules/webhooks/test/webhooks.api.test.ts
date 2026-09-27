import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { permissionsModule } from '@blixis/permissions'
import { MEMBER_SERVICE, spacesModule, TENANCY_SERVICE } from '@blixis/spaces'
import {
  asUser,
  captureEvents,
  createTestBlixis,
  serviceOverride,
  type TestBlixis,
} from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { USER_SERVICE, usersModule } from '@blixis/users'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  generateWebhookKey,
  WEBHOOKS_CONFIG,
  type WebhookView,
  webhooksModule,
} from '../src/index.ts'

const modules = () => [
  databaseModule(),
  usersModule(),
  spacesModule(),
  permissionsModule(),
  webhooksModule(),
]
const KEYS = generateWebhookKey('test')

describe.skipIf(!databaseTestsEnabled())('webhooks API (Postgres)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function setup(options: { allowPrivateUrls?: boolean } = {}) {
    const t = await createTestBlixis({
      modules: [...modules(), captureEvents().module()],
      database: db,
      overrides: [
        serviceOverride(WEBHOOKS_CONFIG, {
          secretKeys: KEYS,
          allowPrivateUrls: options.allowPrivateUrls ?? false,
        }),
      ],
    })
    const seeded = await t.app.runInScope({}, async ({ services }) => {
      const users = services.get(USER_SERVICE)
      const mk = async (email: string) =>
        asUser((await users.create({ email, displayName: email })).id)
      const [owner, editor, outsider] = [
        await mk('o@example.com'),
        await mk('e@example.com'),
        await mk('x@example.com'),
      ]
      const tenancy = services.get(TENANCY_SERVICE)
      const org = await tenancy.createOrganization(owner, { name: 'Org', slug: 'org' })
      const space = await tenancy.createSpace(owner, org.id, { name: 'Site', slug: 'site' })
      const other = await tenancy.createSpace(owner, org.id, { name: 'Other', slug: 'other' })
      await services
        .get(MEMBER_SERVICE)
        .addOrganizationMember(owner, org.id, { email: 'e@example.com', role: 'editor' })
      return { owner, editor, outsider, space, other }
    })
    return { t, ...seeded }
  }
  const call = (
    t: TestBlixis,
    actor: ReturnType<typeof asUser>,
    method: string,
    path: string,
    json?: unknown,
    headers = {},
  ) =>
    t.request(`/api/v1${path}`, { method, actor, headers, ...(json === undefined ? {} : { json }) })

  const valid = {
    name: 'Site rebuild',
    url: 'https://ci.example.com/hooks/blixis',
    eventTypes: ['entry.*'],
  }

  it('creates a webhook with a secret shown once and stored encrypted', async () => {
    const { t, owner, space } = await setup()
    const res = await call(t, owner, 'POST', `/spaces/${space.id}/webhooks`, valid)
    expect(res.status).toBe(201)
    const { webhook, secret } = (await res.json()) as { webhook: WebhookView; secret: string }
    expect(secret).toMatch(/^whsec_/)
    expect(webhook).toMatchObject({
      name: 'Site rebuild',
      url: 'https://ci.example.com/hooks/blixis',
      eventTypes: ['entry.*'],
      environmentId: null,
      active: true,
      failureCount: 0,
      secretHint: `whsec_…${secret.slice(-4)}`,
      version: 1,
    })
    const read = await (await call(t, owner, 'GET', `/webhooks/${webhook.id}`)).text()
    const list = await (await call(t, owner, 'GET', `/spaces/${space.id}/webhooks`)).text()
    for (const body of [read, list]) expect(body).not.toContain(secret)
    const rows = await db.db.execute<{ secret_encrypted: string }>(
      sql`select secret_encrypted from webhooks.webhooks`,
    )
    expect(rows.rows[0]?.secret_encrypted).toMatch(/^v1\.test\./)
    expect(JSON.stringify(rows.rows)).not.toContain(secret.slice(6))
  })

  it('rejects local and private targets in deployed environments, and unknown events', async () => {
    const { t, owner, space } = await setup()
    const create = (body: object) =>
      call(t, owner, 'POST', `/spaces/${space.id}/webhooks`, { ...valid, ...body })
    for (const url of [
      'http://localhost:4000/hook',
      'https://localhost/hook',
      'https://10.1.2.3/hook',
      'https://169.254.169.254/',
      'https://[::1]/',
      'http://ci.example.com/hook',
    ]) {
      const res = await create({ url })
      expect(res.status, url).toBe(400)
      expect(await res.json()).toMatchObject({ errors: [{ path: ['url'] }] })
    }
    const events = await create({ eventTypes: ['entry.published', 'user.created'] })
    expect(await events.json()).toMatchObject({ errors: [{ path: ['eventTypes', 1] }] })
    const env = await create({ environmentId: '01a0d8f9-0000-7000-8000-000000000000' })
    expect(await env.json()).toMatchObject({ errors: [{ path: ['environmentId'] }] })
    const missing = await call(t, owner, 'POST', `/spaces/${space.id}/webhooks`, {})
    expect((await missing.json()) as { errors: unknown[] }).toMatchObject({
      errors: [{ path: ['name'] }, { path: ['url'] }, { path: ['eventTypes'] }],
    })
  })

  it('allows http://localhost receivers only in local development', async () => {
    const { t, owner, space } = await setup({ allowPrivateUrls: true })
    const res = await call(t, owner, 'POST', `/spaces/${space.id}/webhooks`, {
      ...valid,
      url: 'http://localhost:4000/hook',
    })
    expect(res.status).toBe(201)
  })

  it('updates with If-Match, rotates secrets, reactivates, and deletes', async () => {
    const { t, owner, space } = await setup()
    const { webhook, secret } = (await (
      await call(t, owner, 'POST', `/spaces/${space.id}/webhooks`, valid)
    ).json()) as { webhook: WebhookView; secret: string }
    const path = `/webhooks/${webhook.id}`
    expect((await call(t, owner, 'PATCH', path, { name: 'x' })).status).toBe(400)
    const patched = await call(
      t,
      owner,
      'PATCH',
      path,
      { active: false, eventTypes: ['*'] },
      { 'if-match': '"1"' },
    )
    expect(await patched.json()).toMatchObject({ active: false, eventTypes: ['*'], version: 2 })
    expect((await call(t, owner, 'PATCH', path, { name: 'y' }, { 'if-match': '"1"' })).status).toBe(
      409,
    )
    // A webhook Blixis disabled: reactivating clears the failures.
    await db.db.execute(
      sql`update webhooks.webhooks set failure_count = 20, disabled_reason = 'Too many failures'`,
    )
    const reactivated = await call(t, owner, 'PATCH', path, { active: true, expectedVersion: 2 })
    expect(await reactivated.json()).toMatchObject({
      active: true,
      failureCount: 0,
      disabledReason: null,
    })
    const rotated = (await (await call(t, owner, 'POST', `${path}/rotate-secret`)).json()) as {
      webhook: WebhookView
      secret: string
    }
    expect(rotated.secret).not.toBe(secret)
    expect(rotated.webhook.secretHint).toBe(`whsec_…${rotated.secret.slice(-4)}`)
    expect((await call(t, owner, 'DELETE', path)).status).toBe(204)
    expect((await call(t, owner, 'GET', path)).status).toBe(404)
  })

  it('is for admins: editors are forbidden, outsiders and other spaces see nothing', async () => {
    const { t, owner, editor, outsider, space, other } = await setup()
    const { webhook } = (await (
      await call(t, owner, 'POST', `/spaces/${space.id}/webhooks`, valid)
    ).json()) as { webhook: WebhookView }
    expect((await call(t, editor, 'GET', `/spaces/${space.id}/webhooks`)).status).toBe(403)
    expect((await call(t, editor, 'POST', `/spaces/${space.id}/webhooks`, valid)).status).toBe(403)
    expect((await call(t, outsider, 'GET', `/webhooks/${webhook.id}`)).status).toBe(404)
    const listOther = (await (
      await call(t, owner, 'GET', `/spaces/${other.id}/webhooks`)
    ).json()) as {
      webhooks: unknown[]
    }
    expect(listOther.webhooks).toEqual([])
  })
})
