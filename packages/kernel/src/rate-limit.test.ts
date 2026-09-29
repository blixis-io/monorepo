import type { Actor } from '@blixis-io/contracts'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createBlixis } from './create-blixis.ts'
import { defineModule } from './define-module.ts'
import { createJsonLogger } from './logger.ts'
import { type RateLimiter, rateLimit } from './rate-limit.ts'

/** Fixed-window fake: `limit` requests per key, then refused. */
function fakeLimiter(limit: number, periodSeconds = 60) {
  const counts = new Map<string, number>()
  const limiter: RateLimiter & { counts: Map<string, number> } = {
    periodSeconds,
    counts,
    async limit(key) {
      const count = (counts.get(key) ?? 0) + 1
      counts.set(key, count)
      return count <= limit
    },
  }
  return limiter
}

const things = defineModule({
  meta: { name: '@acme/things', version: '1.0.0' },
  rest: {
    path: '/things',
    app: new Hono()
      .get('/', (c) => c.json({ ok: true }))
      .post('/export', rateLimit({ limiter: 'expensive' }), (c) => c.json({ ok: true })) as never,
  },
})

function setup(
  limiters: Record<string, RateLimiter | undefined>,
  actorFor: (request: Request) => Actor = () => ({ type: 'anonymous' }),
) {
  const lines: Record<string, unknown>[] = []
  const app = createBlixis({
    modules: [things()],
    actorResolver: actorFor,
    logger: createJsonLogger({
      level: 'debug',
      write: (_l, line) => void lines.push(JSON.parse(line)),
    }),
    rateLimits: {
      limiters: () => limiters,
      defaults: { anonymous: 'anonymous', actor: 'management', delivery: 'delivery' },
    },
  })
  const call = (path: string, init: RequestInit = {}) =>
    app.fetch(new Request(`http://x${path}`, init), {}, undefined as never)
  return { call, lines }
}

const fromIp = (ip: string) => ({ headers: { 'cf-connecting-ip': ip } })

describe('rate limiting', () => {
  it('limits anonymous requests per client IP with 429, RATE_LIMITED and Retry-After', async () => {
    const anonymous = fakeLimiter(2, 60)
    const { call, lines } = setup({ anonymous })
    expect((await call('/api/v1/things', fromIp('203.0.113.1'))).status).toBe(200)
    expect((await call('/api/v1/things', fromIp('203.0.113.1'))).status).toBe(200)
    const limited = await call('/api/v1/things', fromIp('203.0.113.1'))
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('60')
    expect(((await limited.json()) as { code: string }).code).toBe('RATE_LIMITED')
    expect((await call('/api/v1/things', fromIp('203.0.113.2'))).status).toBe(200)
    expect([...anonymous.counts.keys()]).toEqual(['ip:203.0.113.1', 'ip:203.0.113.2'])
    const exceeded = lines.find((line) => line['message'] === 'rate_limit.exceeded')
    expect(exceeded).toMatchObject({ limiter: 'anonymous', level: 'info' })
    expect(JSON.stringify(lines)).not.toContain('203.0.113.1')
  })

  it('never limits health checks', async () => {
    const { call } = setup({ anonymous: fakeLimiter(0) })
    expect((await call('/api/v1/health')).status).toBe(200)
    expect((await call('/api/v1/things')).status).toBe(429)
  })

  it('keys authenticated requests by actor and delivery requests by key', async () => {
    const management = fakeLimiter(10)
    const delivery = fakeLimiter(10)
    const { call } = setup({ management, delivery }, (request) => {
      const who = request.headers.get('x-who')
      if (who === 'key')
        return { type: 'deliveryKey', keyId: 'k1', spaceId: 's', kind: 'delivery' } as Actor
      return { type: 'user', userId: who ?? 'u1' }
    })
    await call('/api/v1/things', { headers: { 'x-who': 'u1' } })
    await call('/api/v1/things', { headers: { 'x-who': 'u2' } })
    await call('/api/v1/things', { headers: { 'x-who': 'key' } })
    expect([...management.counts.keys()]).toEqual(['user:u1', 'user:u2'])
    expect([...delivery.counts.keys()]).toEqual(['deliveryKey:k1'])
  })

  it('fails open when the limiter errors, and skips names without a limiter', async () => {
    const broken: RateLimiter = {
      periodSeconds: 60,
      limit: () => Promise.reject(new Error('counter down')),
    }
    const { call, lines } = setup({ anonymous: broken })
    expect((await call('/api/v1/things')).status).toBe(200)
    expect(lines.some((line) => line['message'] === 'rate_limit.unavailable')).toBe(true)
    const none = setup({})
    expect((await none.call('/api/v1/things')).status).toBe(200)
    expect((await none.call('/api/v1/things')).status).toBe(200)
    expect(none.lines.filter((line) => line['message'] === 'rate_limit.not_configured')).toEqual([
      expect.objectContaining({ level: 'warn', limiter: 'anonymous', class: 'anonymous' }),
    ])
  })

  it('applies a module route limiter on top of the defaults', async () => {
    const expensive = fakeLimiter(1, 10)
    const { call } = setup({ expensive }, () => ({ type: 'user', userId: 'u1' }))
    expect((await call('/api/v1/things/export', { method: 'POST' })).status).toBe(200)
    const limited = await call('/api/v1/things/export', { method: 'POST' })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('10')
    expect((await call('/api/v1/things')).status).toBe(200)
    expect([...expensive.counts.keys()]).toEqual(['user:u1'])
  })

  it('leaves apps without rate limiting untouched, including rateLimit() routes', async () => {
    const app = createBlixis({ modules: [things()], logger: createJsonLogger({ write: () => {} }) })
    for (let i = 0; i < 3; i++) {
      const res = await app.fetch(
        new Request('http://x/api/v1/things/export', { method: 'POST' }),
        {},
        undefined as never,
      )
      expect(res.status).toBe(200)
    }
  })
})
