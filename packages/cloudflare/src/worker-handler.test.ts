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

describe('createWorkerHandler env validation', () => {
  it('rejects invalid env with a redacted 500, retries queue batches, and validates once per env', async () => {
    const { z } = await import('zod')
    z.config({ jitless: true })
    const lines: string[] = []
    const { createJsonLogger } = await import('@blixis/kernel')
    let parses = 0
    const schema = z
      .object({ BLIXIS_ENV: z.enum(['local', 'staging']), SECRET: z.string().min(20) })
      .transform((v) => {
        parses++
        return v
      })
    const app = createBlixis({
      modules: [],
      logger: createJsonLogger({ write: (_l, line) => void lines.push(line) }),
    })
    const handler = createWorkerHandler<Record<string, unknown>>(app, { envSchema: schema })

    const badEnv = { BLIXIS_ENV: 'prod', SECRET: 'too-short-secret' }
    const res = await handler.fetch?.(new Request('http://x/api/v1/health') as never, badEnv, ctx)
    expect(res?.status).toBe(500)
    const body = (await res?.json()) as { code: string; detail: string }
    expect(body.code).toBe('INFRASTRUCTURE_ERROR')
    expect(JSON.stringify(body)).not.toContain('BLIXIS_ENV')
    expect(lines.join('\n')).toContain('BLIXIS_ENV')
    expect(lines.join('\n')).not.toContain('too-short-secret')

    const calls: string[] = []
    const batch = {
      queue: 'q',
      messages: [],
      ackAll() {},
      retryAll: () => void calls.push('retryAll'),
    } as unknown as MessageBatch
    await expect(handler.queue?.(batch, badEnv, ctx)).rejects.toThrowError(
      /Invalid Worker environment/,
    )
    expect(calls).toEqual(['retryAll'])

    const goodEnv = { BLIXIS_ENV: 'local', SECRET: 'x'.repeat(20) }
    await handler.fetch?.(new Request('http://x/api/v1/health') as never, goodEnv, ctx)
    await handler.fetch?.(new Request('http://x/api/v1/health') as never, goodEnv, ctx)
    expect(parses).toBe(1)
  })

  it('reports invalid-env fetch failures to the error reporter without values', async () => {
    const { z } = await import('zod')
    z.config({ jitless: true })
    const reports: { error: unknown; context: object }[] = []
    const handler = createWorkerHandler<Record<string, unknown>>(
      createBlixis({ modules: [], logger: noopLogger }),
      {
        envSchema: z.object({ SECRET: z.string().min(20) }),
        errorReporter: {
          captureException: (error, context) => void reports.push({ error, context }),
        },
      },
    )
    const res = await handler.fetch(
      new Request('http://x/api/v1/health') as never,
      { SECRET: 'short-secret' },
      ctx,
    )
    expect(reports).toHaveLength(1)
    expect(reports[0]?.context).toEqual({
      requestId: ((await res.json()) as { requestId: string }).requestId,
      method: 'GET',
      status: 500,
    })
    expect(JSON.stringify(String(reports[0]?.error))).not.toContain('short-secret')
  })
})
