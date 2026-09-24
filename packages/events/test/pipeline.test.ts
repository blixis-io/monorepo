import type { EventEnvelope } from '@blixis/contracts'
import { createDatabase, DATABASE, type Database, databaseModule } from '@blixis/database'
import { idempotencyModule } from '@blixis/database/idempotency'
import { runMigrations } from '@blixis/database/migrations'
import { createBlixis, noopLogger, type QueueMessageLike, serviceOverride } from '@blixis/kernel'
import { sql } from 'drizzle-orm'
import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eventsModule } from '../src/module.ts'
import { outboxModule, outboxTransport, sweepOutbox } from '../src/outbox/index.ts'
import { QUEUE_SENDER, type QueueSender, queueTransport } from '../src/queue.ts'
import { fixtureControls, notesFixture } from './fixtures/notes.ts'

const QUEUE = 'blixis-events-local'

/** In-memory queue with Cloudflare semantics: at-least-once, per-message ack/retry, attempts. */
class SimulatedQueue {
  readonly messages: { id: string; body: unknown; attempts: number }[] = []
  down = false
  sent = 0
  readonly sender: QueueSender = {
    send: async (envelopes) => {
      if (this.down) throw new Error('queue unavailable')
      for (const envelope of envelopes) {
        this.sent++
        this.messages.push({
          id: `msg-${this.sent}`,
          body: JSON.parse(JSON.stringify(envelope)),
          attempts: 1,
        })
      }
    },
  }

  /** Delivers everything (including retries, as later batches) until the queue is empty. */
  async drain(app: ReturnType<typeof createBlixis>, maxRounds = 10): Promise<void> {
    for (let round = 0; round < maxRounds && this.messages.length > 0; round++) {
      const batch = this.messages.splice(0)
      const retried: typeof batch = []
      const messages: QueueMessageLike[] = batch.map((m) => ({
        id: m.id,
        body: m.body,
        attempts: m.attempts,
        ack: () => undefined,
        retry: () => void retried.push({ ...m, attempts: m.attempts + 1 }),
      }))
      await app.queue({ queue: QUEUE, messages, ackAll() {}, retryAll() {} }, {})
      this.messages.push(...retried)
    }
  }

  /** Re-delivers a message that was already acked (at-least-once duplicate). */
  redeliver(body: unknown): void {
    this.messages.push({ id: `dup-${this.sent}`, body, attempts: 1 })
  }
}

const baseUrl = process.env['BLIXIS_TEST_DATABASE_URL']
if (baseUrl === undefined && process.env['CI'] === 'true')
  throw new Error('BLIXIS_TEST_DATABASE_URL must be set in CI')

/** A migrated database of its own (kept local: @blixis/testing depends on this package). */
async function testDatabase(migrationsOf: ReturnType<typeof createBlixis>) {
  const name = `blixis_pipeline_test_${Date.now()}`
  const admin = async (statement: string) => {
    const client = new Client({ connectionString: baseUrl })
    await client.connect()
    await client.query(statement).finally(() => client.end())
  }
  await admin(`create database ${name}`)
  const url = new URL(baseUrl ?? '')
  url.pathname = `/${name}`
  await runMigrations({
    connectionString: url.toString(),
    migrations: migrationsOf.contributions.migrations,
  })
  const db = createDatabase({ connectionString: url.toString() })
  return {
    db,
    reset: () =>
      db.execute(
        sql`truncate fixture_notes.notes, fixture_notes.stats, events.outbox, events.processed`,
      ),
    drop: async () => {
      await db.close()
      await admin(`drop database if exists ${name} with (force)`)
    },
  }
}

describe.skipIf(baseUrl === undefined)('event pipeline end to end', () => {
  let t: { db: Database; reset(): Promise<unknown>; drop(): Promise<void> }
  let queue: SimulatedQueue
  let app: ReturnType<typeof createBlixis>
  const modules = () => [
    databaseModule(),
    eventsModule({
      transport: queueTransport({ transactional: outboxTransport() }),
      queues: [QUEUE],
    }),
    outboxModule(),
    idempotencyModule(),
    notesFixture(),
  ]

  beforeAll(async () => {
    t = await testDatabase(createBlixis({ modules: modules(), logger: noopLogger }))
  })
  beforeEach(async () => {
    await t.reset()
    queue = new SimulatedQueue()
    fixtureControls.failuresLeft = 0
    fixtureControls.handledAt.clear()
    app = createBlixis({
      modules: modules(),
      overrides: [serviceOverride(DATABASE, t.db), serviceOverride(QUEUE_SENDER, queue.sender)],
      logger: noopLogger,
    })
  })
  afterAll(() => t.drop())

  const createNote = async (body: string, fail = false) =>
    app.fetch(
      new Request('http://x/api/v1/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body, fail }),
      }),
    )
  const stats = async () => (await t.db.execute(sql`select note_id from fixture_notes.stats`)).rows
  const outbox = async () =>
    (
      await t.db.execute<{ dispatched: boolean }>(
        sql`select dispatched_at is not null as dispatched from events.outbox`,
      )
    ).rows

  it('happy path: command → outbox → post-commit dispatch → queue → handler, once', async () => {
    const res = await createNote('hello')
    expect(res.status).toBe(201)
    const { id } = (await res.json()) as { id: string }
    expect(await outbox()).toEqual([{ dispatched: true }])
    expect(queue.messages).toHaveLength(1)
    await queue.drain(app)
    expect(await stats()).toEqual([{ note_id: id }])
  })

  it('handler failure → retried → succeeds, side effect exactly once', async () => {
    fixtureControls.failuresLeft = 2
    await createNote('flaky')
    await queue.drain(app)
    expect(await stats()).toHaveLength(1)
    expect(queue.messages).toEqual([])
  })

  it('duplicate delivery of an acked message runs no side effect again', async () => {
    await createNote('dup')
    const [message] = queue.messages
    await queue.drain(app)
    queue.redeliver(message?.body)
    queue.redeliver(message?.body)
    await queue.drain(app)
    expect(await stats()).toHaveLength(1)
  })

  it('rolled-back command: no note, no outbox row, nothing queued, no side effect', async () => {
    expect((await createNote('nope', true)).status).toBe(500)
    expect((await t.db.execute(sql`select 1 from fixture_notes.notes`)).rows).toEqual([])
    expect(await outbox()).toEqual([])
    expect(queue.messages).toEqual([])
    await queue.drain(app)
    expect(await stats()).toEqual([])
  })

  it('queue outage: post-commit fails, the sweep dispatches later, delivered once', async () => {
    queue.down = true
    await createNote('later')
    expect(await outbox()).toEqual([{ dispatched: false }])
    queue.down = false
    const sent = await sweepOutbox(t.db, queue.sender, {
      batchSize: 100,
      maxBatches: 10,
      minAgeSeconds: 0,
      retentionDays: 7,
      logger: noopLogger,
    })
    expect(sent).toBe(1)
    await queue.drain(app)
    expect(await stats()).toHaveLength(1)
  })

  it('records commit-to-handler latency on the post-commit path', async () => {
    const samples: number[] = []
    for (let i = 0; i < 20; i++) {
      await createNote(`n${i}`)
      await queue.drain(app)
    }
    const rows = await t.db.execute<{ note_id: string; emitted: string }>(sql`
      select s.note_id, (o.envelope->'payload'->>'emittedAt') as emitted
      from fixture_notes.stats s join events.outbox o on o.envelope->'payload'->>'noteId' = s.note_id::text`)
    for (const row of rows.rows) {
      const handled = fixtureControls.handledAt.get(row.note_id)
      if (handled !== undefined) samples.push(handled - Number(row.emitted))
    }
    samples.sort((a, b) => a - b)
    expect(samples).toHaveLength(20)
    // biome-ignore lint/suspicious/noConsole: records the latency sample in the test output (006.007)
    console.info(
      `[006.007] local emit→handler latency (post-commit path, simulated queue): p50=${samples[10]} ms, max=${samples[19]} ms`,
    )
  })

  it('processed markers and envelopes carry the correlation id end to end', async () => {
    await app.fetch(
      new Request('http://x/api/v1/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-correlation-id': 'corr-e2e' },
        body: JSON.stringify({ body: 'traced' }),
      }),
    )
    const first = queue.messages[0]?.body as EventEnvelope | undefined
    expect(first?.metadata?.correlationId).toBe('corr-e2e')
    await queue.drain(app)
    const markers = await t.db.execute(sql`select subscription from events.processed`)
    expect(markers.rows).toEqual([{ subscription: '@fixture/notes#count-note' }])
  })
})
