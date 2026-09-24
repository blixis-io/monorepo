import { createServiceToken } from '@blixis/contracts'
import { describe, expect, it } from 'vitest'
import { BACKGROUND_HANDLERS, type QueueBatchLike } from './background.ts'
import { createBlixis } from './create-blixis.ts'
import { defineModule } from './define-module.ts'
import { noopLogger } from './logger.ts'

const CONN = createServiceToken<{ binding: unknown; closed: boolean }>('@test/conn')

function batch(queue: string) {
  const calls: string[] = []
  const value: QueueBatchLike = {
    queue,
    messages: [
      {
        id: 'm1',
        body: { n: 1 },
        attempts: 1,
        ack: () => void calls.push('ack:m1'),
        retry: () => void calls.push('retry:m1'),
      },
    ],
    ackAll: () => void calls.push('ackAll'),
    retryAll: () => void calls.push('retryAll'),
  }
  return { value, calls }
}

function app() {
  const seen: string[] = []
  const closed: boolean[] = []
  const infra = defineModule({
    meta: { name: '@test/infra', version: '1.0.0' },
    setup(ctx) {
      ctx.services.provideFactory(
        CONN,
        ({ bindings }) => ({ binding: bindings['DB_URL'], closed: false }),
        {
          scope: 'request',
          dispose: (c) => {
            c.closed = true
            closed.push(true)
          },
        },
      )
      const bg = ctx.services.get(BACKGROUND_HANDLERS)
      bg.onQueue('events', async (b, tools) => {
        for (const message of b.messages) {
          await tools.runInScope({ correlationId: 'corr-from-event' }, async (rc) => {
            seen.push(
              `${rc.actor.type}:${rc.correlationId}:${String(rc.services.get(CONN).binding)}`,
            )
          })
          message.ack()
        }
      })
      bg.onScheduled('* * * * *', async () => void seen.push('cron:a'))
      bg.onScheduled('* * * * *', async () => void seen.push('cron:b'))
      bg.onScheduled('0 * * * *', async () => {
        throw new Error('job broke')
      })
    },
  })
  return { app: createBlixis({ modules: [infra()], logger: noopLogger }), seen, closed }
}

describe('background dispatch', () => {
  it('dispatches queue batches with per-unit scopes, bindings, and system actor', async () => {
    const { app: a, seen, closed } = app()
    const b = batch('events')
    await a.queue(b.value, { DB_URL: 'postgres://local' })
    expect(seen).toEqual(['system:corr-from-event:postgres://local'])
    expect(b.calls).toEqual(['ack:m1'])
    expect(closed).toEqual([true])
  })

  it('retries batches for unknown queues', async () => {
    const { app: a } = app()
    const b = batch('unknown')
    await a.queue(b.value)
    expect(b.calls).toEqual(['retryAll'])
  })

  it('runs all jobs for a cron, and reports failures after running the rest', async () => {
    const { app: a, seen } = app()
    await a.scheduled({ cron: '* * * * *', scheduledTime: 0 })
    expect(seen).toEqual(['cron:a', 'cron:b'])
    await expect(a.scheduled({ cron: '0 * * * *', scheduledTime: 0 })).rejects.toBeInstanceOf(
      AggregateError,
    )
    await expect(a.scheduled({ cron: '5 4 * * *', scheduledTime: 0 })).resolves.toBeUndefined()
  })

  it('rejects registrations after setup', async () => {
    const { app: a } = app()
    await a.ready()
    expect(() => a.services.get(BACKGROUND_HANDLERS).onQueue('late', async () => {})).toThrowError(
      /after setup/,
    )
  })

  it('rejects two consumers for one queue', async () => {
    const twice = defineModule({
      meta: { name: '@test/twice', version: '1.0.0' },
      setup(ctx) {
        const bg = ctx.services.get(BACKGROUND_HANDLERS)
        bg.onQueue('q', async () => {})
        bg.onQueue('q', async () => {})
      },
    })
    await expect(
      createBlixis({ modules: [twice()], logger: noopLogger }).ready(),
    ).rejects.toThrowError(/already has a consumer/)
  })

  it('runInScope provides a disposable scope with the given actor and tenant', async () => {
    const { app: a, closed } = app()
    const result = await a.runInScope(
      {
        actor: { type: 'user', userId: 'u1' },
        tenant: { spaceId: 's1' },
        bindings: { DB_URL: 'x' },
      },
      async (rc) =>
        `${rc.actor.type}:${rc.tenant.spaceId}:${String(rc.services.get(CONN).binding)}`,
    )
    expect(result).toBe('user:s1:x')
    expect(closed).toEqual([true])
  })

  it('passes request bindings (Worker env) to request-scoped factories over HTTP', async () => {
    const { Hono } = await import('hono')
    const mod = defineModule({
      meta: { name: '@test/http', version: '1.0.0' },
      setup(ctx) {
        ctx.services.provideFactory(
          CONN,
          ({ bindings }) => ({ binding: bindings['DB_URL'], closed: false }),
          { scope: 'request' },
        )
      },
      rest: {
        path: '/conn',
        app: new Hono<import('@blixis/contracts').ModuleHonoEnv>().get('/', (c) =>
          c.json({ b: c.var.services.get(CONN).binding }),
        ),
      },
    })
    const a = createBlixis({ modules: [mod()], logger: noopLogger })
    const res = await a.fetch(new Request('http://x/api/v1/conn'), { DB_URL: 'from-env' })
    expect(await res.json()).toEqual({ b: 'from-env' })
  })
})
