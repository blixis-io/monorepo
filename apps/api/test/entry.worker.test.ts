import {
  createExecutionContext,
  createMessageBatch,
  createScheduledController,
  env,
  getQueueResult,
} from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import worker from '../src/index.ts'

describe('API Worker background entry points (workerd)', () => {
  it('retries batches for queues without a consumer', async () => {
    const batch = createMessageBatch('blixis-events-local', [
      { id: 'm1', timestamp: new Date(), attempts: 1, body: { hello: 'world' } },
    ])
    const ctx = createExecutionContext()
    await worker.queue(batch, env, ctx)
    const result = await getQueueResult(batch, ctx)
    expect(result.retryBatch.retry).toBe(true)
    expect(result.explicitAcks).toEqual([])
  })

  it('runs scheduled triggers without registered jobs', async () => {
    const controller = createScheduledController({ cron: '* * * * *', scheduledTime: Date.now() })
    await expect(
      worker.scheduled(controller, env, createExecutionContext()),
    ).resolves.toBeUndefined()
  })
})
