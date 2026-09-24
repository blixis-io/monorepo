import { defineEvent, subscribe } from '@blixis/contracts'
import {
  createDatabase,
  DATABASE,
  type Database,
  databaseModule,
  fromTransactionScope,
} from '@blixis/database'
import { runMigrations } from '@blixis/database/migrations'
import {
  createBlixis,
  defineModule,
  noopLogger,
  type QueueMessageLike,
  serviceOverride,
} from '@blixis/kernel'
import { sql } from 'drizzle-orm'
import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createEnvelope } from '../envelope.ts'
import { eventsModule } from '../module.ts'
import { QUEUE_SENDER } from '../queue.ts'
import { outboxModule } from './module.ts'

z.config({ jitless: true })
const baseUrl = process.env['BLIXIS_TEST_DATABASE_URL']
if (baseUrl === undefined && process.env['CI'] === 'true')
  throw new Error('BLIXIS_TEST_DATABASE_URL must be set in CI')

const paid = defineEvent({
  type: 'order.paid',
  version: 1,
  delivery: 'best-effort',
  schema: z.object({ orderId: z.string() }),
})

describe.skipIf(baseUrl === undefined)('idempotent consumers (Postgres)', () => {
  const name = `blixis_processed_test_${Date.now()}`
  let db: Database
  const admin = async (statement: string) => {
    const client = new Client({ connectionString: baseUrl })
    await client.connect()
    await client.query(statement).finally(() => client.end())
  }
  beforeAll(async () => {
    await admin(`create database ${name}`)
    const parsed = new URL(baseUrl ?? '')
    parsed.pathname = `/${name}`
    const migrations = createBlixis({ modules: [outboxModule()], logger: noopLogger }).contributions
      .migrations
    await runMigrations({ connectionString: parsed.toString(), migrations })
    db = createDatabase({ connectionString: parsed.toString() })
    await db.execute(sql`create table public.ledger (order_id text, entry text)`)
  })
  beforeEach(async () => {
    await db.execute(sql`truncate events.processed, public.ledger`)
  })
  afterAll(async () => {
    await db.close()
    await admin(`drop database if exists ${name} with (force)`)
  })

  function setup(failFirst = { after: false, tx: false }) {
    const runs = { after: 0, tx: 0 }
    const billing = defineModule({
      meta: { name: '@acme/billing', version: '1.0.0' },
      events: [
        subscribe(paid, 'email-receipt', async () => {
          runs.after++
          if (failFirst.after && runs.after === 1) throw new Error('smtp down')
        }),
        subscribe(
          paid,
          'book-revenue',
          async (envelope, context) => {
            runs.tx++
            const tx = fromTransactionScope(context.transaction ?? ({} as never))
            await tx.execute(
              sql`insert into public.ledger values (${envelope.payload.orderId}, 'revenue')`,
            )
            if (failFirst.tx && runs.tx === 1) throw new Error('ledger locked')
          },
          { idempotency: 'transactional' },
        ),
      ],
    })
    const app = createBlixis({
      modules: [databaseModule(), eventsModule({ queues: ['q'] }), outboxModule(), billing()],
      overrides: [
        serviceOverride(DATABASE, db),
        serviceOverride(QUEUE_SENDER, { send: async () => undefined }),
      ],
      logger: noopLogger,
    })
    const deliver = async (body: unknown, attempts = 1) => {
      const outcome = { acked: false, retried: false }
      const message: QueueMessageLike = {
        id: 'm',
        body,
        attempts,
        ack: () => {
          outcome.acked = true
        },
        retry: () => {
          outcome.retried = true
        },
      }
      await app.queue({ queue: 'q', messages: [message], ackAll() {}, retryAll() {} }, {})
      return outcome
    }
    return { runs, deliver }
  }

  const envelope = async (orderId: string) =>
    JSON.parse(
      JSON.stringify(
        await createEnvelope(
          paid,
          { orderId },
          { tenant: {}, correlationId: 'c', actor: { type: 'anonymous' }, now: () => new Date() },
        ),
      ),
    )
  const ledger = async () => (await db.execute(sql`select order_id, entry from public.ledger`)).rows

  it('redelivery of a processed event runs no handler again', async () => {
    const { runs, deliver } = setup()
    const body = await envelope('o1')
    expect(await deliver(body)).toEqual({ acked: true, retried: false })
    expect(await deliver(body, 2)).toEqual({ acked: true, retried: false })
    expect(runs).toEqual({ after: 1, tx: 1 })
    expect(await ledger()).toEqual([{ order_id: 'o1', entry: 'revenue' }])
  })

  it('a failed subscription is retried; only it runs again', async () => {
    const { runs, deliver } = setup({ after: true, tx: false })
    const body = await envelope('o2')
    expect(await deliver(body)).toEqual({ acked: false, retried: true })
    expect(await deliver(body, 2)).toEqual({ acked: true, retried: false })
    expect(runs).toEqual({ after: 2, tx: 1 })
  })

  it('transactional mode rolls back the marker with the handler, then applies exactly once', async () => {
    const { runs, deliver } = setup({ after: false, tx: true })
    const body = await envelope('o3')
    expect(await deliver(body)).toEqual({ acked: false, retried: true })
    expect(await ledger()).toEqual([])
    expect(await deliver(body, 2)).toEqual({ acked: true, retried: false })
    expect(await deliver(body, 3)).toEqual({ acked: true, retried: false })
    expect(runs.tx).toBe(2)
    expect(await ledger()).toEqual([{ order_id: 'o3', entry: 'revenue' }])
  })

  it('concurrent duplicate deliveries apply a transactional handler once', async () => {
    const { deliver } = setup()
    const body = await envelope('o4')
    await Promise.all([deliver(body), deliver(body), deliver(body)])
    expect(await ledger()).toEqual([{ order_id: 'o4', entry: 'revenue' }])
  })
})
