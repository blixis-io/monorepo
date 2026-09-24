import { defineEvent, EVENT_BUS, type EventEnvelope } from '@blixis/contracts'
import {
  createDatabase,
  DATABASE,
  type Database,
  databaseModule,
  toTransactionScope,
  withTransaction,
} from '@blixis/database'
import { runMigrations } from '@blixis/database/migrations'
import { createBlixis, noopLogger, serviceOverride } from '@blixis/kernel'
import { sql } from 'drizzle-orm'
import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { eventsModule } from '../module.ts'
import { QUEUE_SENDER, type QueueSender, queueTransport } from '../queue.ts'
import { sweepOutbox } from './dispatch.ts'
import { outboxModule, outboxTransport } from './module.ts'

z.config({ jitless: true })
const baseUrl = process.env['BLIXIS_TEST_DATABASE_URL']
if (baseUrl === undefined && process.env['CI'] === 'true')
  throw new Error('BLIXIS_TEST_DATABASE_URL must be set in CI')

const saved = defineEvent({
  type: 'note.saved',
  version: 1,
  delivery: 'transactional',
  schema: z.object({ n: z.number() }),
})

describe.skipIf(baseUrl === undefined)('transactional outbox (Postgres)', () => {
  const name = `blixis_outbox_test_${Date.now()}`
  let url = ''
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
    url = parsed.toString()
    const migrations = createBlixis({ modules: [outboxModule()], logger: noopLogger }).contributions
      .migrations
    await runMigrations({ connectionString: url, migrations })
    db = createDatabase({ connectionString: url })
    await db.execute(sql`create table if not exists public.notes (n int primary key)`)
  })
  beforeEach(async () => {
    await db.execute(sql`truncate events.outbox, public.notes`)
  })
  afterAll(async () => {
    await db.close()
    await admin(`drop database if exists ${name} with (force)`)
  })

  function recordingSender(options: { fail?: boolean; delayMs?: number } = {}) {
    const sent: EventEnvelope[] = []
    const sender: QueueSender = {
      async send(envelopes) {
        if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs))
        if (options.fail) throw new Error('queue down')
        sent.push(...envelopes)
      },
    }
    return { sent, sender }
  }

  const app = (sender: QueueSender) =>
    createBlixis({
      modules: [
        databaseModule(),
        eventsModule({ transport: queueTransport({ transactional: outboxTransport() }) }),
        outboxModule(),
      ],
      overrides: [serviceOverride(DATABASE, db), serviceOverride(QUEUE_SENDER, sender)],
      logger: noopLogger,
    })

  const saveNote = (a: ReturnType<typeof app>, n: number, fail = false) =>
    a.runInScope({ correlationId: `c-${n}` }, async ({ services }) =>
      withTransaction(services.get(DATABASE), async (tx) => {
        await tx.execute(sql`insert into public.notes values (${n})`)
        await services.get(EVENT_BUS).emit(saved, { n }, { transaction: toTransactionScope(tx) })
        if (fail) throw new Error('rollback')
      }),
    )

  const outbox = async () =>
    (
      await db.execute<{
        type: string
        dispatched: boolean
        attempts: number
        last_error: string | null
      }>(
        sql`select type, dispatched_at is not null as dispatched, attempts, last_error from events.outbox`,
      )
    ).rows

  it('commit → row written in the transaction and dispatched after the scope ends', async () => {
    const { sent, sender } = recordingSender()
    await saveNote(app(sender), 1)
    expect(sent.map((e) => [e.type, e.payload])).toEqual([['note.saved', { n: 1 }]])
    expect(sent[0]?.metadata?.correlationId).toBe('c-1')
    expect(await outbox()).toEqual([
      { type: 'note.saved', dispatched: true, attempts: 1, last_error: null },
    ])
  })

  it('rollback → no row, nothing sent', async () => {
    const { sent, sender } = recordingSender()
    await expect(saveNote(app(sender), 2, true)).rejects.toThrow('rollback')
    expect(sent).toEqual([])
    expect(await outbox()).toEqual([])
  })

  it('failed post-commit dispatch → row stays pending with the error; the sweep delivers it', async () => {
    const down = recordingSender({ fail: true })
    await saveNote(app(down.sender), 3)
    expect(await outbox()).toEqual([
      { type: 'note.saved', dispatched: false, attempts: 1, last_error: 'Error: queue down' },
    ])
    const up = recordingSender()
    const sent = await sweepOutbox(db, up.sender, {
      batchSize: 100,
      maxBatches: 10,
      minAgeSeconds: 0,
      retentionDays: 7,
      logger: noopLogger,
    })
    expect(sent).toBe(1)
    expect(up.sent.map((e) => e.payload)).toEqual([{ n: 3 }])
    expect((await outbox())[0]?.dispatched).toBe(true)
  })

  it('concurrent sweeps never send the same row twice (SKIP LOCKED)', async () => {
    const down = recordingSender({ fail: true })
    const a = app(down.sender)
    for (let n = 10; n < 60; n++) await saveNote(a, n)
    const slowA = recordingSender({ delayMs: 50 })
    const slowB = recordingSender({ delayMs: 50 })
    const options = {
      batchSize: 10,
      maxBatches: 10,
      minAgeSeconds: 0,
      retentionDays: 7,
      logger: noopLogger,
    }
    await Promise.all([
      sweepOutbox(db, slowA.sender, options),
      sweepOutbox(db, slowB.sender, options),
    ])
    const ids = [...slowA.sent, ...slowB.sent].map((e) => e.id)
    expect(ids).toHaveLength(50)
    expect(new Set(ids).size).toBe(50)
    expect(slowA.sent.length).toBeGreaterThan(0)
    expect(slowB.sent.length).toBeGreaterThan(0)
  })

  it('sweep leaves young rows to post-commit dispatch and deletes old dispatched rows', async () => {
    const down = recordingSender({ fail: true })
    await saveNote(app(down.sender), 70)
    const up = recordingSender()
    const options = {
      batchSize: 100,
      maxBatches: 10,
      minAgeSeconds: 60,
      retentionDays: 7,
      logger: noopLogger,
    }
    expect(await sweepOutbox(db, up.sender, options)).toBe(0)
    await db.execute(sql`update events.outbox set dispatched_at = now() - interval '8 days'`)
    await sweepOutbox(db, up.sender, options)
    expect(await outbox()).toEqual([])
  })
})
