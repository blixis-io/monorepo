import { defineEvent, type EventEnvelope, subscribe } from '@blixis/contracts'
import { createBlixis, createJsonLogger, defineModule, type QueueMessageLike } from '@blixis/kernel'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { retryDelaySeconds } from './consumer.ts'
import { createEnvelope } from './envelope.ts'
import { eventsModule } from './module.ts'

z.config({ jitless: true })
const created = defineEvent({
  type: 'note.created',
  version: 1,
  delivery: 'best-effort',
  schema: z.object({ noteId: z.string() }),
})
const ctx = {
  tenant: { spaceId: 's' },
  correlationId: 'corr-q',
  actor: { type: 'user', userId: 'u' } as const,
  now: () => new Date('2026-09-24T12:00:00Z'),
}

function message(body: unknown, attempts = 1) {
  const outcome: { acked: boolean; retried?: { delaySeconds?: number } } = { acked: false }
  const msg: QueueMessageLike = {
    id: `m-${Math.random()}`,
    body,
    attempts,
    ack: () => {
      outcome.acked = true
    },
    retry: (options) => {
      outcome.retried = options ?? {}
    },
  }
  return { msg, outcome }
}

function setup(failFor: string[] = []) {
  const handled: string[] = []
  const lines: Record<string, unknown>[] = []
  const notes = defineModule({
    meta: { name: '@acme/notes', version: '1.0.0' },
    events: [
      subscribe(created, 'index', async (e, c) => {
        handled.push(`index:${e.payload.noteId}:${c.attempt}`)
        if (failFor.includes(e.payload.noteId)) throw new Error('index down')
      }),
      subscribe(created, 'audit', async (e) => void handled.push(`audit:${e.payload.noteId}`)),
    ],
  })
  const app = createBlixis({
    modules: [eventsModule({ queues: ['blixis-events-test'] }), notes()],
    logger: createJsonLogger({
      level: 'debug',
      write: (_l, line) => void lines.push(JSON.parse(line)),
    }),
  })
  const run = (messages: QueueMessageLike[]) =>
    app.queue({ queue: 'blixis-events-test', messages, ackAll() {}, retryAll() {} }, {})
  return { handled, lines, run }
}

const envelope = async (noteId: string): Promise<unknown> =>
  JSON.parse(JSON.stringify(await createEnvelope(created, { noteId }, ctx)))

describe('queue consumer', () => {
  it('dispatches each message to all subscriptions and acks on success', async () => {
    const { handled, lines, run } = setup()
    const a = message(await envelope('a'))
    const b = message(await envelope('b'), 3)
    await run([a.msg, b.msg])
    expect(a.outcome).toEqual({ acked: true })
    expect(b.outcome).toEqual({ acked: true })
    expect(handled.sort()).toEqual(['audit:a', 'audit:b', 'index:a:1', 'index:b:3'])
    const consumed = lines.filter((l) => l['message'] === 'event.consumed')
    expect(consumed[0]).toMatchObject({
      eventType: 'note.created',
      correlationId: 'corr-q',
      status: 'delivered',
      subscriptions: 2,
    })
    expect(typeof consumed[0]?.['durationMs']).toBe('number')
  })

  it('retries with backoff when any subscription fails, naming it', async () => {
    const { lines, run } = setup(['x'])
    const x = message(await envelope('x'), 2)
    await run([x.msg])
    expect(x.outcome).toEqual({ acked: false, retried: { delaySeconds: 10 } })
    expect(lines.find((l) => l['message'] === 'event.consumed')).toMatchObject({
      status: 'retrying',
      failed: ['@acme/notes#index'],
    })
  })

  it('retries invalid and unknown envelopes (DLQ after max retries) and logs event.invalid', async () => {
    const { handled, lines, run } = setup()
    const garbage = message('not an envelope')
    const unknown = message({ ...((await envelope('u')) as EventEnvelope), version: 7 })
    const badPayload = message({
      ...((await envelope('p')) as EventEnvelope),
      payload: { noteId: 42 },
    })
    await run([garbage.msg, unknown.msg, badPayload.msg])
    for (const m of [garbage, unknown, badPayload])
      expect(m.outcome).toEqual({ acked: false, retried: { delaySeconds: 5 } })
    expect(handled).toEqual([])
    const invalid = lines.filter((l) => l['message'] === 'event.invalid')
    expect(invalid).toHaveLength(3)
    expect(invalid.some((l) => /Unknown event/.test(String(l['error'])))).toBe(true)
  })

  it('backs off exponentially up to 10 minutes', () => {
    expect([1, 2, 3, 4, 5, 8, 20].map(retryDelaySeconds)).toEqual([5, 10, 20, 40, 80, 600, 600])
  })

  it('acks events no subscription handles, without dispatching', async () => {
    const { handled, lines, run } = setup()
    const other = message({ ...((await envelope('o')) as EventEnvelope), type: 'space.created' })
    await run([other.msg])
    expect(other.outcome).toEqual({ acked: true })
    expect(handled).toEqual([])
    expect(lines.some((l) => l['message'] === 'event.unrouted')).toBe(true)
  })
})
