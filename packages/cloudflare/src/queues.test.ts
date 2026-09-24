import { defineEvent, EVENT_BUS, type EventEnvelope, InfrastructureError } from '@blixis/contracts'
import { eventsModule, queueTransport } from '@blixis/events'
import { createBlixis, noopLogger } from '@blixis/kernel'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { cloudflareQueueSender, eventsQueueModule, QUEUE_LIMITS } from './queues.ts'

z.config({ jitless: true })

function fakeQueue(fail = false) {
  const batches: { body: unknown; contentType?: string }[][] = []
  return {
    batches,
    async sendBatch(messages: Iterable<{ body: unknown; contentType?: 'json' }>) {
      if (fail) throw new Error('queue unavailable')
      batches.push([...messages])
    },
  }
}

const envelope = (n: number, payload: unknown = { n }): EventEnvelope => ({
  id: `0199a3f2-7c1e-7b3a-9f10-${String(n).padStart(12, '0')}`,
  type: 'probe.pinged',
  version: 1,
  timestamp: '2026-09-24T12:00:00.000Z',
  payload,
})

describe('cloudflareQueueSender', () => {
  it('sends JSON messages in batches of at most 100', async () => {
    const queue = fakeQueue()
    await cloudflareQueueSender(queue).send(Array.from({ length: 250 }, (_, n) => envelope(n)))
    expect(queue.batches.map((b) => b.length)).toEqual([100, 100, 50])
    expect(queue.batches[0]?.[0]).toEqual({ body: envelope(0), contentType: 'json' })
  })

  it('splits batches by total size', async () => {
    const queue = fakeQueue()
    const big = 'x'.repeat(100 * 1024)
    await cloudflareQueueSender(queue).send([
      envelope(1, { big }),
      envelope(2, { big }),
      envelope(3, { big }),
    ])
    expect(queue.batches.map((b) => b.length)).toEqual([2, 1])
  })

  it('rejects oversized messages naming the event, before sending anything', async () => {
    const queue = fakeQueue()
    const error = await cloudflareQueueSender(queue)
      .send([envelope(1), envelope(2, { doc: 'x'.repeat(QUEUE_LIMITS.messageBytes) })])
      .catch((e) => e)
    expect(error).toBeInstanceOf(InfrastructureError)
    expect(error.message).toMatch(
      /Event probe\.pinged \(.+\) is \d+ bytes.*Send IDs, not documents/,
    )
    expect(queue.batches).toEqual([])
  })

  it('wraps send failures as retryable infrastructure errors', async () => {
    const error = await cloudflareQueueSender(fakeQueue(true))
      .send([envelope(1)])
      .catch((e) => e)
    expect(error).toBeInstanceOf(InfrastructureError)
    expect(error.retryable).toBe(true)
  })
})

describe('queueTransport with eventsQueueModule', () => {
  const pinged = defineEvent({
    type: 'probe.pinged',
    version: 1,
    delivery: 'best-effort',
    schema: z.object({ n: z.number() }),
  })
  const saved = defineEvent({
    type: 'probe.saved',
    version: 1,
    delivery: 'transactional',
    schema: z.object({ n: z.number() }),
  })
  const app = () =>
    createBlixis({
      modules: [eventsModule({ transport: queueTransport() }), eventsQueueModule()],
      logger: noopLogger,
    })

  it('sends best-effort events to the EVENTS binding', async () => {
    const queue = fakeQueue()
    await app().runInScope(
      { bindings: { EVENTS: queue }, correlationId: 'c1' },
      async ({ services }) => services.get(EVENT_BUS).emit(pinged, { n: 5 }),
    )
    const sent = queue.batches[0]?.[0]?.body as EventEnvelope
    expect(sent).toMatchObject({
      type: 'probe.pinged',
      payload: { n: 5 },
      metadata: { correlationId: 'c1' },
    })
  })

  it('refuses transactional events without an outbox transport', async () => {
    await expect(
      app().runInScope({ bindings: { EVENTS: fakeQueue() } }, async ({ services }) =>
        services.get(EVENT_BUS).emit(saved, { n: 1 }, { transaction: {} as never }),
      ),
    ).rejects.toThrow(/transactional, but no outbox transport is configured/)
  })

  it('fails clearly when the binding is missing', async () => {
    await expect(
      app().runInScope({}, async ({ services }) => services.get(EVENT_BUS).emit(pinged, { n: 1 })),
    ).rejects.toThrow(/Queue binding "EVENTS" is missing/)
  })
})
