import { contentModule } from '@blixis-io/content'
import { databaseModule } from '@blixis-io/database'
import { idempotencyModule } from '@blixis-io/database/idempotency'
import { eventsModule } from '@blixis-io/events'
import { permissionsModule } from '@blixis-io/permissions'
import { spacesModule, TENANCY_SERVICE } from '@blixis-io/spaces'
import { asUser, captureEvents, createTestBlixis, serviceOverride } from '@blixis-io/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis-io/testing/database'
import { USER_SERVICE, usersModule } from '@blixis-io/users'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  type DeliveryView,
  generateWebhookKey,
  verifyWebhookSignature,
  WEBHOOK_FETCH,
  WEBHOOKS_CONFIG,
  type WebhooksConfig,
  webhooksModule,
} from '../src/index.ts'

const modules = () => [
  databaseModule(),
  idempotencyModule(),
  usersModule(),
  spacesModule(),
  permissionsModule(),
  contentModule(),
  webhooksModule(),
]

/**
 * Plan 015.005: webhooks end to end through the REST API only — configure, publish, receive,
 * verify, fail and retry, and the SSRF guard at save and at send time. No network: a local
 * receiver stands in for the endpoint.
 */
describe.skipIf(!databaseTestsEnabled())('webhooks end to end (REST, local receiver)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function setup() {
    const config: { value: WebhooksConfig } = {
      value: { secretKeys: generateWebhookKey('e2e'), allowPrivateUrls: false },
    }
    const inbox: { request: Request; body: string }[] = []
    const script: number[] = []
    const events = captureEvents({ mode: 'deferred' })
    const t = await createTestBlixis({
      modules: [...modules(), events.module()],
      database: db,
      overrides: [
        // A getter, so a test can switch the deployment config mid-way.
        serviceOverride(WEBHOOKS_CONFIG, {
          get secretKeys() {
            return config.value.secretKeys
          },
          get allowPrivateUrls() {
            return config.value.allowPrivateUrls
          },
        }),
        serviceOverride(WEBHOOK_FETCH, async (request: Request) => {
          inbox.push({ request, body: await request.clone().text() })
          return new Response(null, { status: script.shift() ?? 204 })
        }),
      ],
    })
    const { owner, space } = await t.app.runInScope({}, async ({ services }) => {
      const owner = asUser(
        (await services.get(USER_SERVICE).create({ email: 'o@example.com', displayName: 'O' })).id,
      )
      const tenancy = services.get(TENANCY_SERVICE)
      const org = await tenancy.createOrganization(owner, { name: 'Org', slug: 'org' })
      return {
        owner,
        space: await tenancy.createSpace(owner, org.id, { name: 'Site', slug: 'site' }),
      }
    })
    /** A REST call, then delivery of what it emitted (as after commit). */
    const api = async (method: string, path: string, json?: unknown) => {
      const res = await t.request(`/api/v1${path}`, {
        method,
        actor: owner,
        ...(json === undefined ? {} : { json }),
      })
      await events.flush()
      return res
    }
    const retryDue = async () => {
      await db.db.execute(
        sql`update webhooks.deliveries set next_attempt_at = now() where status = 'pending'`,
      )
      await t.app.scheduled({ cron: '* * * * *', scheduledTime: Date.now() })
      await events.flush()
    }
    const publishPage = async (title: string) => {
      const entry = (await (
        await api('POST', `/spaces/${space.id}/entries`, { contentType: 'page', fields: { title } })
      ).json()) as { sys: { id: string } }
      expect((await api('POST', `/entries/${entry.sys.id}/publish`)).status).toBe(200)
      return entry.sys.id
    }
    expect(
      (
        await api('POST', `/spaces/${space.id}/content-types`, {
          apiId: 'page',
          name: 'Page',
          fields: [{ apiId: 'title', name: 'Title', type: 'text' }],
        })
      ).status,
    ).toBe(201)
    return { config, inbox, script, api, retryDue, publishPage, space }
  }

  it('configure → publish → signed delivery → verified → succeeded', async () => {
    const { inbox, api, publishPage, space } = await setup()
    const created = await api('POST', `/spaces/${space.id}/webhooks`, {
      name: 'Rebuild',
      url: 'https://build.example.com/hooks/blixis',
      eventTypes: ['entry.published'],
    })
    expect(created.status).toBe(201)
    const { webhook, secret } = (await created.json()) as {
      webhook: { id: string }
      secret: string
    }

    const entryId = await publishPage('Home')
    expect(inbox).toHaveLength(1)
    const [{ request, body }] = inbox as [{ request: Request; body: string }]
    expect(
      await verifyWebhookSignature({
        secret,
        header: request.headers.get('blixis-signature'),
        body,
      }),
    ).toBe(true)
    expect(JSON.parse(body)).toMatchObject({
      type: 'entry.published',
      spaceId: space.id,
      data: { entryId },
    })
    const log = (await (await api('GET', `/webhooks/${webhook.id}/deliveries`)).json()) as {
      deliveries: DeliveryView[]
    }
    expect(log.deliveries).toMatchObject([
      { eventType: 'entry.published', status: 'succeeded', attempts: 1, lastStatusCode: 204 },
    ])
    expect(request.headers.get('blixis-delivery-id')).toBe(log.deliveries[0]?.id)
  })

  it('a receiver failing twice gets three attempts, all logged', async () => {
    const { script, api, retryDue, publishPage, space } = await setup()
    const { webhook } = (await (
      await api('POST', `/spaces/${space.id}/webhooks`, {
        name: 'Flaky',
        url: 'https://flaky.example.com/hook',
        eventTypes: ['entry.published'],
      })
    ).json()) as { webhook: { id: string } }
    script.push(500, 500)
    await publishPage('Flaky')
    await retryDue()
    await retryDue()
    const [delivery] = (
      (await (await api('GET', `/webhooks/${webhook.id}/deliveries`)).json()) as {
        deliveries: DeliveryView[]
      }
    ).deliveries
    expect(delivery).toMatchObject({ status: 'succeeded', attempts: 3, lastStatusCode: 204 })
    const detail = (await (
      await api('GET', `/webhooks/${webhook.id}/deliveries/${delivery?.id}`)
    ).json()) as {
      attemptLog: { number: number; statusCode: number }[]
    }
    expect(detail.attemptLog.map((a) => [a.number, a.statusCode])).toEqual([
      [1, 500],
      [2, 500],
      [3, 204],
    ])
  })

  it('refuses internal targets in deployed environments, when saving and when sending', async () => {
    const { config, inbox, api, publishPage, space } = await setup()
    for (const url of [
      'http://localhost:8787/hook',
      'https://127.0.0.1/hook',
      'https://169.254.169.254/latest/meta-data',
      'https://[fd00::1]/hook',
      'https://metadata.google.internal/',
    ]) {
      const res = await api('POST', `/spaces/${space.id}/webhooks`, {
        name: 'x',
        url,
        eventTypes: ['*'],
      })
      expect(res.status, url).toBe(400)
    }
    // Saved while local targets were allowed (local development), then deployed: never sent.
    config.value = { ...config.value, allowPrivateUrls: true }
    const { webhook } = (await (
      await api('POST', `/spaces/${space.id}/webhooks`, {
        name: 'Local',
        url: 'http://localhost:4000/hook',
        eventTypes: ['entry.published'],
      })
    ).json()) as { webhook: { id: string } }
    config.value = { ...config.value, allowPrivateUrls: false }
    await publishPage('Guarded')
    expect(inbox).toHaveLength(0)
    const [delivery] = (
      (await (await api('GET', `/webhooks/${webhook.id}/deliveries`)).json()) as {
        deliveries: DeliveryView[]
      }
    ).deliveries
    expect(delivery).toMatchObject({
      status: 'abandoned',
      lastError: 'URL refused: Use an https:// URL',
    })
  })
})
