import { CONTENT_SERVICE, CONTENT_TYPE_SERVICE, contentModule } from '@blixis/content'
import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { permissionsModule } from '@blixis/permissions'
import { spacesModule, TENANCY_SERVICE } from '@blixis/spaces'
import { asUser, captureEvents, createTestBlixis, serviceOverride } from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { USER_SERVICE, usersModule } from '@blixis/users'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  type DeliveryView,
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

describe.skipIf(!databaseTestsEnabled())(
  'webhook delivery log, redelivery, and pings (Postgres)',
  () => {
    let db: TestDatabase
    beforeAll(async () => {
      db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
    })
    beforeEach(() => db.reset())
    afterAll(() => db.drop())

    async function setup() {
      const received: { request: Request; body: string }[] = []
      const statuses: number[] = []
      const events = captureEvents({ mode: 'deferred' })
      const t = await createTestBlixis({
        modules: [...modules(), events.module()],
        database: db,
        overrides: [
          serviceOverride(WEBHOOKS_CONFIG, {
            secretKeys: generateWebhookKey('t'),
            allowPrivateUrls: false,
          }),
          serviceOverride(WEBHOOK_FETCH, async (request: Request) => {
            received.push({ request, body: await request.clone().text() })
            return new Response('ok', { status: statuses.shift() ?? 200 })
          }),
        ],
      })
      const seeded = await t.app.runInScope({}, async ({ services }) => {
        const owner = asUser(
          (await services.get(USER_SERVICE).create({ email: 'o@example.com', displayName: 'O' }))
            .id,
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
        const hooks = services.get(WEBHOOK_SERVICE)
        const tenant = { organizationId: org.id, spaceId: space.id }
        const main = await hooks.create(owner, tenant, {
          name: 'Main',
          url: 'https://hooks.example.com/main',
          eventTypes: ['entry.published'],
        })
        const other = await hooks.create(owner, tenant, {
          name: 'Other',
          url: 'https://hooks.example.com/other',
          eventTypes: ['asset.*'],
        })
        return { owner, environment, main, other }
      })
      const call = async (method: string, path: string, json?: unknown) => {
        const res = await t.request(`/api/v1${path}`, {
          method,
          actor: seeded.owner,
          ...(json === undefined ? {} : { json }),
        })
        await events.flush()
        return res
      }
      const publish = async () => {
        await t.app.runInScope({}, async ({ services }) => {
          const content = services.get(CONTENT_SERVICE)
          const entry = await content.create(seeded.owner, seeded.environment, {
            contentType: 'page',
            fields: {},
          })
          await content.publish(seeded.owner, seeded.environment, entry.sys.id)
        })
        await events.flush()
      }
      const base = `/webhooks/${seeded.main.webhook.id}`
      return { t, received, statuses, call, publish, base, ...seeded }
    }

    it('lists deliveries newest first with filters and paging, and shows every attempt', async () => {
      const { call, publish, base, statuses } = await setup()
      statuses.push(200, 410, 200)
      await publish()
      await publish()
      await publish()
      const page = (await (await call('GET', `${base}/deliveries?limit=2`)).json()) as {
        deliveries: DeliveryView[]
        nextCursor: string
      }
      expect(page.deliveries).toHaveLength(2)
      expect((page.deliveries[0]?.createdAt ?? '') >= (page.deliveries[1]?.createdAt ?? '')).toBe(
        true,
      )
      const rest = (await (
        await call('GET', `${base}/deliveries?limit=2&cursor=${page.nextCursor}`)
      ).json()) as {
        deliveries: DeliveryView[]
        nextCursor: string | null
      }
      expect(rest).toMatchObject({ nextCursor: null })
      expect(rest.deliveries).toHaveLength(1)
      const abandoned = (await (
        await call('GET', `${base}/deliveries?status=abandoned`)
      ).json()) as {
        deliveries: DeliveryView[]
      }
      expect(abandoned.deliveries.map((d) => d.lastStatusCode)).toEqual([410])
      expect((await call('GET', `${base}/deliveries?status=lost`)).status).toBe(400)

      const id = abandoned.deliveries[0]?.id
      const detail = await (await call('GET', `${base}/deliveries/${id}`)).json()
      expect(detail).toMatchObject({
        id,
        eventType: 'entry.published',
        status: 'abandoned',
        attempts: 1,
        payload: { type: 'entry.published' },
        attemptLog: [{ number: 1, statusCode: 410, error: 'HTTP 410', responseExcerpt: 'ok' }],
      })
    })

    it('redelivers with the same delivery id and logs the new attempt', async () => {
      const { call, publish, base, statuses, received } = await setup()
      statuses.push(410)
      await publish()
      const [delivery] = (
        (await (await call('GET', `${base}/deliveries`)).json()) as { deliveries: DeliveryView[] }
      ).deliveries
      const res = await call('POST', `${base}/deliveries/${delivery?.id}/redeliver`)
      expect(res.status).toBe(202)
      const detail = (await (
        await call('GET', `${base}/deliveries/${delivery?.id}`)
      ).json()) as DeliveryView & {
        attemptLog: { statusCode: number }[]
      }
      expect(detail).toMatchObject({ status: 'succeeded', attempts: 2 })
      expect(detail.attemptLog.map((a) => a.statusCode)).toEqual([410, 200])
      expect(received.map((r) => r.request.headers.get('blixis-delivery-id'))).toEqual([
        delivery?.id,
        delivery?.id,
      ])
    })

    it('sends signed test pings, but not to inactive webhooks', async () => {
      const { call, base, received, main } = await setup()
      const res = await call('POST', `${base}/test`)
      expect(res.status).toBe(202)
      const ping = (await res.json()) as DeliveryView
      expect(ping).toMatchObject({
        eventType: 'webhook.ping',
        payload: { data: { webhookId: main.webhook.id } },
      })
      const [sent] = received
      expect(JSON.parse(sent?.body ?? '{}')).toMatchObject({ type: 'webhook.ping' })
      expect(
        await verifyWebhookSignature({
          secret: main.secret,
          header: sent?.request.headers.get('blixis-signature'),
          body: sent?.body ?? '',
        }),
      ).toBe(true)
      await call('PATCH', base, { active: false, expectedVersion: 1 })
      expect((await call('POST', `${base}/test`)).status).toBe(409)
    })

    it("keeps each webhook's log to itself and removes finished deliveries after 30 days", async () => {
      const { t, call, publish, base, other } = await setup()
      await publish()
      const [delivery] = (
        (await (await call('GET', `${base}/deliveries`)).json()) as { deliveries: DeliveryView[] }
      ).deliveries
      expect(
        (await call('GET', `/webhooks/${other.webhook.id}/deliveries/${delivery?.id}`)).status,
      ).toBe(404)
      expect(
        (await call('POST', `/webhooks/${other.webhook.id}/deliveries/${delivery?.id}/redeliver`))
          .status,
      ).toBe(404)

      await db.db.execute(
        sql`update webhooks.deliveries set created_at = now() - interval '31 days'`,
      )
      await db.db.execute(sql`insert into webhooks.deliveries
      (id, organization_id, space_id, webhook_id, event_id, event_type, payload, status, created_at)
      select gen_random_uuid(), organization_id, space_id, webhook_id, gen_random_uuid(), 'entry.published', payload, 'pending', now() - interval '40 days'
      from webhooks.deliveries limit 1`)
      const at = (minute: number) => Date.UTC(2026, 8, 27, 10, minute)
      await t.app.scheduled({ cron: '* * * * *', scheduledTime: at(3) }) // not the retention minute
      expect(
        (await db.db.execute(sql`select count(*)::int as n from webhooks.deliveries`)).rows[0],
      ).toEqual({ n: 2 })
      await db.db.execute(
        sql`update webhooks.deliveries set next_attempt_at = now() + interval '1 hour' where status = 'pending'`,
      )
      await t.app.scheduled({ cron: '* * * * *', scheduledTime: at(7) })
      // The old finished delivery is gone; the pending one stays whatever its age.
      expect(
        (await db.db.execute<{ status: string }>(sql`select status from webhooks.deliveries`)).rows,
      ).toEqual([{ status: 'pending' }])
    })
  },
)
