import { BACKGROUND_HANDLERS, createBlixis, defineModule, noopLogger } from '@blixis/kernel'
import { describe, expect, it } from 'vitest'
import { createWorkerHandler } from './worker-handler.ts'

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  props: {},
} as unknown as ExecutionContext

describe('createWorkerHandler', () => {
  it('routes fetch, queue, and scheduled invocations to the kernel', async () => {
    const seen: string[] = []
    const infra = defineModule({
      meta: { name: '@test/infra', version: '1.0.0' },
      setup(c) {
        const bg = c.services.get(BACKGROUND_HANDLERS)
        bg.onQueue(
          'blixis-events-local',
          async (batch) => void seen.push(`queue:${batch.messages.length}`),
        )
        bg.onScheduled('* * * * *', async (event) => void seen.push(`cron:${event.cron}`))
      },
    })
    const handler = createWorkerHandler<Record<string, unknown>>(
      createBlixis({ modules: [infra()], logger: noopLogger }),
    )

    const res = await handler.fetch?.(new Request('http://x/api/v1/health') as never, {}, ctx)
    expect(res?.status).toBe(200)

    const batch = {
      queue: 'blixis-events-local',
      messages: [{ id: '1', timestamp: new Date(), body: {}, attempts: 1, ack() {}, retry() {} }],
      ackAll() {},
      retryAll() {},
    } as unknown as MessageBatch
    await handler.queue?.(batch, {}, ctx)
    await handler.scheduled?.(
      { cron: '* * * * *', scheduledTime: 0, noRetry() {} } as ScheduledController,
      {},
      ctx,
    )
    expect(seen).toEqual(['queue:1', 'cron:* * * * *'])
  })
})
