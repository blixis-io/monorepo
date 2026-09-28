import { CONTENT_SERVICE, CONTENT_TYPE_SERVICE, contentModule } from '@blixis-io/content'
import { databaseModule } from '@blixis-io/database'
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
  generateWebhookKey,
  verifyWebhookSignature,
  WEBHOOK_FETCH,
  WEBHOOK_SERVICE,
  WEBHOOKS_CONFIG,
  webhooksModule,
} from '../src/index.ts'

const modules = () => [
  databaseModule(),
  usersModule(),
  spacesModule(),
  permissionsModule(),
  contentModule(),
  webhooksModule(),
]

type Reply = (request: Request) => Promise<Response> | Response

describe.skipIf(!databaseTestsEnabled())('webhook delivery (Postgres, fake receiver)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function setup() {
    const received: { request: Request; body: string }[] = []
    const replies: Reply[] = []
    const receiver = async (request: Request) => {
      received.push({ request, body: await request.clone().text() })
      const reply = replies.shift() ?? (() => new Response('ok'))
      return reply(request)
    }
    // Deferred: events are delivered on flush(), as after a commit — like the outbox in production.
    // (Immediate mode would run the consumer inside the fan-out transaction, before its rows exist.)
    const events = captureEvents({ mode: 'deferred' })
    const t = await createTestBlixis({
      modules: [...modules(), events.module()],
      database: db,
      overrides: [
        serviceOverride(WEBHOOKS_CONFIG, {
          secretKeys: generateWebhookKey('t'),
          allowPrivateUrls: false,
        }),
        serviceOverride(WEBHOOK_FETCH, receiver),
      ],
    })
    const seeded = await t.app.runInScope({}, async ({ services }) => {
      const owner = asUser(
        (await services.get(USER_SERVICE).create({ email: 'o@example.com', displayName: 'O' })).id,
      )
      const tenancy = services.get(TENANCY_SERVICE)
      const org = await tenancy.createOrganization(owner, { name: 'Org', slug: 'org' })
      const space = await tenancy.createSpace(owner, org.id, { name: 'Site', slug: 'site' })
      const environment = {
        organizationId: org.id,
        spaceId: space.id,
        environmentId: space.environments[0]?.id ?? '',
      }
      await services
        .get(CONTENT_TYPE_SERVICE)
        .create(owner, environment, { apiId: 'page', name: 'Page' })
      const { webhook, secret } = await services.get(WEBHOOK_SERVICE).create(
        owner,
        { organizationId: org.id, spaceId: space.id },
        {
          name: 'Receiver',
          url: 'https://hooks.example.com/blixis',
          eventTypes: ['entry.published'],
        },
      )
      return { owner, environment, webhook, secret }
    })
    /** Publishes a new entry: one delivery, attempted at once through the queue event. */
    const publish = async () => {
      const id = await t.app.runInScope({}, async ({ services }) => {
        const content = services.get(CONTENT_SERVICE)
        const entry = await content.create(seeded.owner, seeded.environment, {
          contentType: 'page',
          fields: {},
        })
        await content.publish(seeded.owner, seeded.environment, entry.sys.id)
        return entry.sys.id
      })
      await events.flush()
      return id
    }
    const delivery = async () =>
      (
        await db.db.execute<{
          id: string
          status: string
          attempts: number
          last_status_code: number | null
          last_error: string | null
          next_attempt_at: string | null
        }>(
          sql`select id, status, attempts, last_status_code, last_error, next_attempt_at from webhooks.deliveries order by created_at desc limit 1`,
        )
      ).rows[0]
    const attempts = async () =>
      (
        await db.db.execute<{
          number: number
          status_code: number | null
          error: string | null
          response_excerpt: string | null
        }>(
          sql`select number, status_code, error, response_excerpt from webhooks.attempts order by number`,
        )
      ).rows
    /** Makes pending deliveries due now and runs the retry sweep. */
    const sweep = async () => {
      await db.db.execute(
        sql`update webhooks.deliveries set next_attempt_at = now() - interval '1 second' where status = 'pending'`,
      )
      await t.app.scheduled({ cron: '* * * * *', scheduledTime: Date.now() })
      await events.flush()
    }
    const webhookRow = async () =>
      (
        await db.db.execute<{
          active: boolean
          failure_count: number
          disabled_reason: string | null
        }>(sql`select active, failure_count, disabled_reason from webhooks.webhooks`)
      ).rows[0]
    return {
      t,
      events,
      received,
      replies,
      publish,
      delivery,
      attempts,
      sweep,
      webhookRow,
      ...seeded,
    }
  }

  it('POSTs the signed public body; the documented verification accepts it', async () => {
    const { received, publish, delivery, attempts, secret } = await setup()
    const entryId = await publish()
    expect(received).toHaveLength(1)
    const [{ request, body }] = received as [{ request: Request; body: string }]
    expect(request.method).toBe('POST')
    expect(request.url).toBe('https://hooks.example.com/blixis')
    expect(request.redirect).toBe('manual')
    const row = await delivery()
    expect(Object.fromEntries(request.headers)).toMatchObject({
      'content-type': 'application/json',
      'user-agent': 'Blixis-Webhooks/1.0',
      'blixis-delivery-id': row?.id,
      'blixis-event-type': 'entry.published',
    })
    expect(JSON.parse(body)).toMatchObject({ type: 'entry.published', data: { entryId } })
    const header = request.headers.get('blixis-signature')
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/)
    expect(await verifyWebhookSignature({ secret, header, body })).toBe(true)
    expect(await verifyWebhookSignature({ secret, header, body: `${body} ` })).toBe(false)
    expect(await verifyWebhookSignature({ secret: 'whsec_other', header, body })).toBe(false)
    expect(
      await verifyWebhookSignature({
        secret,
        header,
        body,
        now: Math.floor(Date.now() / 1000) + 600,
      }),
    ).toBe(false)
    expect(row).toMatchObject({ status: 'succeeded', attempts: 1, last_status_code: 200 })
    expect(await attempts()).toEqual([
      { number: 1, status_code: 200, error: null, response_excerpt: 'ok' },
    ])
  })

  it('retries 5xx with growing delays until it succeeds, logging every attempt', async () => {
    const { replies, publish, delivery, attempts, sweep } = await setup()
    replies.push(
      () => new Response('down', { status: 500 }),
      () => new Response('down', { status: 503 }),
    )
    const before = Date.now()
    await publish()
    const first = await delivery()
    expect(first).toMatchObject({ status: 'pending', attempts: 1, last_status_code: 500 })
    const delay1 = new Date(first?.next_attempt_at ?? 0).getTime() - before
    expect(delay1).toBeGreaterThan(45_000) // 1 min ± 20%
    expect(delay1).toBeLessThan(75_000)
    await sweep()
    const second = await delivery()
    expect(second).toMatchObject({ status: 'pending', attempts: 2, last_status_code: 503 })
    expect(new Date(second?.next_attempt_at ?? 0).getTime() - Date.now()).toBeGreaterThan(230_000) // 5 min ± 20%
    await sweep()
    expect(await delivery()).toMatchObject({
      status: 'succeeded',
      attempts: 3,
      last_status_code: 200,
    })
    expect((await attempts()).map((a) => [a.number, a.status_code])).toEqual([
      [1, 500],
      [2, 503],
      [3, 200],
    ])
  })

  it('abandons rejected deliveries (410), retries timeouts, and truncates responses', async () => {
    const { replies, publish, delivery, attempts, sweep } = await setup()
    replies.push(() => new Response('x'.repeat(5000), { status: 410 }))
    await publish()
    expect(await delivery()).toMatchObject({
      status: 'abandoned',
      attempts: 1,
      last_status_code: 410,
    })
    expect((await attempts())[0]?.response_excerpt).toHaveLength(1024)
    await sweep() // nothing due: abandoned stays abandoned
    expect((await attempts()).length).toBe(1)

    replies.push(() => {
      throw new DOMException('The operation timed out', 'TimeoutError')
    })
    await publish()
    expect(await delivery()).toMatchObject({
      status: 'pending',
      last_status_code: null,
      last_error: 'Timed out after 10000 ms',
    })
  })

  it('gives up after the last attempt', async () => {
    const { replies, publish, delivery, sweep } = await setup()
    replies.push(() => new Response('down', { status: 500 }))
    await publish()
    await db.db.execute(sql`update webhooks.deliveries set attempts = 7`)
    replies.push(() => new Response('still down', { status: 500 }))
    await sweep()
    expect(await delivery()).toMatchObject({ status: 'failed', attempts: 8, next_attempt_at: null })
  })

  it('disables the webhook after 50 consecutive failures and stops sending', async () => {
    const { events, received, replies, publish, delivery, webhookRow } = await setup()
    await db.db.execute(sql`update webhooks.webhooks set failure_count = 49`)
    replies.push(() => new Response('down', { status: 502 }))
    await publish()
    expect(await webhookRow()).toMatchObject({
      active: false,
      failure_count: 50,
      disabled_reason: 'Disabled after 50 consecutive failed deliveries (last: HTTP 502)',
    })
    expect(events.expectEvent('webhook.disabled').payload).toMatchObject({
      reason: expect.stringContaining('50 consecutive'),
    })
    // Inactive webhooks match no new events; a success elsewhere would have reset the count.
    const before = received.length
    await publish()
    expect(received.length).toBe(before)
    expect((await delivery())?.status).not.toBe('succeeded')
  })
})
