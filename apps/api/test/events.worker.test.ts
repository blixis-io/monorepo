import { createExecutionContext, createMessageBatch, env, getQueueResult } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import worker from '../src/index.ts'

// The real queue handler path in workerd: Worker entry → kernel → eventsModule consumer.
describe('events queue consumer (workerd)', () => {
  const envelope = {
    id: '0199a3f2-7c1e-7b3a-9f10-6d2c5e8a41b0',
    type: 'space.created',
    version: 1,
    timestamp: '2026-09-24T12:00:00.000Z',
    payload: { spaceId: 's1' },
    metadata: { correlationId: 'corr-worker' },
  }

  it('acks events that no module subscribes to', async () => {
    const batch = createMessageBatch('blixis-events-local', [
      { id: 'm1', timestamp: new Date(), attempts: 1, body: envelope },
    ])
    const ctx = createExecutionContext()
    await worker.queue(batch, env, ctx)
    const result = await getQueueResult(batch, ctx)
    expect(result.explicitAcks).toEqual(['m1'])
    expect(result.retryMessages).toEqual([])
  })

  it('retries invalid envelopes on the events queue (dead-lettered after max retries)', async () => {
    const batch = createMessageBatch('blixis-events-local', [
      { id: 'm2', timestamp: new Date(), attempts: 1, body: { hello: 'world' } },
    ])
    const ctx = createExecutionContext()
    await worker.queue(batch, env, ctx)
    const result = await getQueueResult(batch, ctx)
    expect(result.explicitAcks).toEqual([])
    expect(result.retryMessages.map((m: { msgId: string }) => m.msgId)).toEqual(['m2'])
  })
})
