import {
  ConflictError,
  createServiceToken,
  ForbiddenError,
  InfrastructureError,
  ModuleError,
  type ModuleHonoEnv,
  NotFoundError,
  RateLimitError,
  REQUEST_CONTEXT,
  UnauthorizedError,
  ValidationError,
} from '@blixis/contracts'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createBlixis } from '../create-blixis.ts'
import { defineModule } from '../define-module.ts'
import { ModuleValidationError } from '../errors.ts'
import { HEALTH_CHECKS, type HealthCheck } from '../health.ts'
import { noopLogger } from '../logger.ts'
import type { ProblemDetails } from './errors-http.ts'
import { READY_PATH } from './rest.ts'

const GREETING = createServiceToken<string>('@test/greeting')
const CONNECTION = createServiceToken<{ id: number }>('@test/connection')

function appWith(routes: Hono<ModuleHonoEnv>, extra: object = {}) {
  let disposed = 0
  let created = 0
  const module = defineModule({
    meta: { name: '@test/mod', version: '1.0.0' },
    setup(ctx) {
      ctx.services.provide(GREETING, 'hello')
      ctx.services.provideFactory(CONNECTION, () => ({ id: ++created }), {
        scope: 'request',
        dispose: () => void disposed++,
      })
    },
    rest: { path: '/things', app: routes },
  })
  const app = createBlixis({ modules: [module()], logger: noopLogger, ...extra })
  return { app, disposed: () => disposed }
}

const problem = async (res: Response) => (await res.json()) as ProblemDetails

describe('REST mounting', () => {
  it('mounts module routes under /api/v1 and provides services and request context', async () => {
    const routes = new Hono<ModuleHonoEnv>().get('/:id', (c) =>
      c.json({
        id: c.req.param('id'),
        greeting: c.var.services.get(GREETING),
        actor: c.var.requestContext.actor.type,
        requestId: c.var.requestContext.requestId,
      }),
    )
    const { app } = appWith(routes)
    const res = await app.fetch(new Request('http://x/api/v1/things/42'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      id: string
      greeting: string
      actor: string
      requestId: string
    }
    expect(body).toMatchObject({ id: '42', greeting: 'hello', actor: 'anonymous' })
    expect(res.headers.get('x-request-id')).toBe(body.requestId)
    expect(res.headers.get('x-correlation-id')).toBe(body.requestId)
  })

  it('creates one request scope per request and disposes it afterwards', async () => {
    const routes = new Hono<ModuleHonoEnv>().get('/', (c) => {
      const a = c.var.services.get(CONNECTION)
      return c.json({ same: a === c.var.services.get(CONNECTION), id: a.id })
    })
    const { app, disposed } = appWith(routes)
    const first = (await (await app.fetch(new Request('http://x/api/v1/things'))).json()) as {
      same: boolean
      id: number
    }
    const second = (await (await app.fetch(new Request('http://x/api/v1/things'))).json()) as {
      id: number
    }
    expect(first.same).toBe(true)
    expect(second.id).not.toBe(first.id)
    expect(disposed()).toBe(2)
  })

  it('uses the actor resolver', async () => {
    const routes = new Hono<ModuleHonoEnv>().get('/', (c) => c.json(c.var.requestContext.actor))
    const { app } = appWith(routes, { actorResolver: () => ({ type: 'user', userId: 'u1' }) })
    expect(await (await app.fetch(new Request('http://x/api/v1/things'))).json()).toEqual({
      type: 'user',
      userId: 'u1',
    })
  })

  it('propagates a valid correlation id and ignores untrusted request ids', async () => {
    const routes = new Hono<ModuleHonoEnv>().get('/', (c) => c.text('ok'))
    const { app } = appWith(routes)
    const res = await app.fetch(
      new Request('http://x/api/v1/things', {
        headers: { 'x-correlation-id': 'corr-1', 'x-request-id': 'spoofed' },
      }),
    )
    expect(res.headers.get('x-correlation-id')).toBe('corr-1')
    expect(res.headers.get('x-request-id')).not.toBe('spoofed')
    const bad = await app.fetch(
      new Request('http://x/api/v1/things', { headers: { 'x-correlation-id': 'a b<script>' } }),
    )
    expect(bad.headers.get('x-correlation-id')).toBe(bad.headers.get('x-request-id'))
  })

  it('accepts x-request-id only when trusted', async () => {
    const routes = new Hono<ModuleHonoEnv>().get('/', (c) => c.text('ok'))
    const { app } = appWith(routes, { trustRequestIdHeader: true })
    const res = await app.fetch(
      new Request('http://x/api/v1/things', { headers: { 'x-request-id': 'edge-123' } }),
    )
    expect(res.headers.get('x-request-id')).toBe('edge-123')
  })
})

describe('route conflicts', () => {
  it('fails on identical method + path in two modules, naming both', () => {
    const a = defineModule({
      meta: { name: '@acme/a', version: '1.0.0' },
      rest: { path: '/spaces', app: new Hono<ModuleHonoEnv>().get('/:id', (c) => c.text('a')) },
    })
    const b = defineModule({
      meta: { name: '@acme/b', version: '1.0.0' },
      rest: { path: '/spaces/', app: new Hono<ModuleHonoEnv>().get('/:id', (c) => c.text('b')) },
    })
    const error = (() => {
      try {
        createBlixis({ modules: [a(), b()], logger: noopLogger })
      } catch (e) {
        return e
      }
      return undefined
    })()
    expect(error).toBeInstanceOf(ModuleValidationError)
    expect((error as ModuleValidationError).problems).toEqual([
      { module: '@acme/b', message: 'route GET /api/v1/spaces/:id conflicts with @acme/a' },
    ])
  })

  it('allows modules to share a prefix with different routes and middleware', () => {
    const a = defineModule({
      meta: { name: '@acme/a', version: '1.0.0' },
      rest: {
        path: '/spaces',
        app: new Hono<ModuleHonoEnv>()
          .use('*', async (_c, n) => n())
          .get('/:id', (c) => c.text('a')),
      },
    })
    const b = defineModule({
      meta: { name: '@acme/b', version: '1.0.0' },
      rest: {
        path: '/spaces',
        app: new Hono<ModuleHonoEnv>()
          .use('*', async (_c, n) => n())
          .get('/:id/entries', (c) => c.text('b')),
      },
    })
    expect(() => createBlixis({ modules: [a(), b()], logger: noopLogger })).not.toThrow()
  })

  it('rejects conflicts with the kernel health route and invalid paths', () => {
    const m = defineModule({
      meta: { name: '@acme/h', version: '1.0.0' },
      rest: { path: '/health', app: new Hono<ModuleHonoEnv>().get('/', (c) => c.text('x')) },
    })
    const bad = defineModule({
      meta: { name: '@acme/bad', version: '1.0.0' },
      rest: { path: 'nope', app: new Hono<ModuleHonoEnv>() },
    })
    expect(() => createBlixis({ modules: [m()], logger: noopLogger })).toThrowError(
      /conflicts with @blixis\/kernel/,
    )
    expect(() => createBlixis({ modules: [bad()], logger: noopLogger })).toThrowError(
      /must start with "\/"/,
    )
  })
})

describe('error mapping (problem details)', () => {
  const cases: [Error, number, string][] = [
    [
      new ValidationError('Invalid', [{ path: ['title'], message: 'Required' }]),
      400,
      'VALIDATION_FAILED',
    ],
    [new UnauthorizedError('Sign in'), 401, 'UNAUTHORIZED'],
    [new ForbiddenError('No'), 403, 'FORBIDDEN'],
    [new NotFoundError('Missing'), 404, 'NOT_FOUND'],
    [new ConflictError('Taken'), 409, 'CONFLICT'],
    [new RateLimitError('Slow down', { retryAfterSeconds: 30 }), 429, 'RATE_LIMITED'],
    [new ModuleError('@acme/x', 'secret module detail'), 500, 'MODULE_ERROR'],
    [new InfrastructureError('db password wrong'), 500, 'INFRASTRUCTURE_ERROR'],
    [new InfrastructureError('timeout', { retryable: true }), 503, 'INFRASTRUCTURE_ERROR'],
    [new TypeError('Cannot read properties of undefined (secret)'), 500, 'INTERNAL'],
  ]

  it.each(cases)('%o → %i %s', async (thrown, status, code) => {
    const routes = new Hono<ModuleHonoEnv>().get('/', () => {
      throw thrown
    })
    const { app } = appWith(routes)
    const res = await app.fetch(new Request('http://x/api/v1/things'))
    expect(res.status).toBe(status)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    const body = await problem(res)
    expect(body).toMatchObject({ status, code, type: `urn:blixis:problem:${code}` })
    expect(body.requestId).toBe(res.headers.get('x-request-id'))
    if (status >= 500) {
      expect(JSON.stringify(body)).not.toMatch(/secret|password/)
    }
  })

  it('includes validation issues and Retry-After', async () => {
    const routes = new Hono<ModuleHonoEnv>()
      .get('/v', () => {
        throw new ValidationError('Invalid', [{ path: ['title'], message: 'Required' }])
      })
      .get('/r', () => {
        throw new RateLimitError('Slow', { retryAfterSeconds: 12.2 })
      })
    const { app } = appWith(routes)
    expect(
      (await problem(await app.fetch(new Request('http://x/api/v1/things/v')))).errors,
    ).toEqual([{ path: ['title'], message: 'Required' }])
    expect(
      (await app.fetch(new Request('http://x/api/v1/things/r'))).headers.get('retry-after'),
    ).toBe('13')
  })

  it('returns problem details for unknown routes', async () => {
    const { app } = appWith(new Hono<ModuleHonoEnv>())
    const res = await app.fetch(new Request('http://x/api/v1/nope', { method: 'POST' }))
    expect(res.status).toBe(404)
    expect(await problem(res)).toMatchObject({
      code: 'NOT_FOUND',
      detail: 'No route for POST /api/v1/nope',
    })
  })
})

describe('health', () => {
  it('answers liveness without waiting for boot, even if boot fails', async () => {
    const app = createBlixis({
      modules: [
        defineModule({
          meta: { name: 'a', version: '1.0.0' },
          boot: () => {
            throw new Error('database unreachable')
          },
        })(),
      ],
      logger: noopLogger,
    })
    const health = await app.fetch(new Request('http://x/api/v1/health'))
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ status: 'ok' })
    const other = await app.fetch(new Request('http://x/api/v1/anything'))
    expect(other.status).toBe(500)
    expect(await problem(other)).toMatchObject({
      code: 'MODULE_ERROR',
      detail: 'An internal error occurred.',
    })
  })
})

describe('error reporting', () => {
  it('reports unexpected 5xx errors with trace context, never 4xx', async () => {
    const reports: { error: unknown; context: Record<string, unknown> }[] = []
    const routes = new Hono<ModuleHonoEnv>()
      .get('/boom', () => {
        throw new Error('database exploded')
      })
      .get('/missing', () => {
        throw new NotFoundError('nope')
      })
      .get('/module', () => {
        throw new ModuleError('@acme/x', 'broken')
      })
    const { app } = appWith(routes, {
      errorReporter: {
        captureException: (error: unknown, context: Record<string, unknown>) =>
          void reports.push({ error, context }),
      },
    })
    await app.fetch(new Request('http://x/api/v1/things/missing'))
    const res = await app.fetch(
      new Request('http://x/api/v1/things/boom', { headers: { 'x-correlation-id': 'c-9' } }),
    )
    expect(res.status).toBe(500)
    expect(reports).toHaveLength(1)
    expect(reports[0]?.error).toEqual(new Error('database exploded'))
    expect(reports[0]?.context).toMatchObject({
      correlationId: 'c-9',
      method: 'GET',
      route: '/api/v1/things/boom',
      status: 500,
      actorType: 'anonymous',
    })
    await app.fetch(new Request('http://x/api/v1/things/module'))
    expect(reports[1]?.context).toMatchObject({ module: '@acme/x', status: 500 })
  })

  it('never lets a failing reporter break the response', async () => {
    const routes = new Hono<ModuleHonoEnv>().get('/boom', () => {
      throw new Error('x')
    })
    const { app } = appWith(routes, {
      errorReporter: {
        captureException: () => {
          throw new Error('reporter down')
        },
      },
    })
    expect((await app.fetch(new Request('http://x/api/v1/things/boom'))).status).toBe(500)
  })
})

describe('readiness', () => {
  const withChecks = (...checks: HealthCheck[]) =>
    createBlixis({
      modules: [
        defineModule({
          meta: { name: '@test/deps', version: '1.0.0' },
          setup(ctx) {
            for (const check of checks) ctx.services.get(HEALTH_CHECKS).register(check)
          },
        })(),
      ],
      logger: noopLogger,
    })
  const ready = (app: ReturnType<typeof createBlixis>) =>
    app.fetch(new Request(`http://x${READY_PATH}`))

  it('returns 200 when all checks pass, with per-check status and latency', async () => {
    const res = await ready(withChecks({ name: 'db', check: async () => undefined }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok', checks: { db: { status: 'ok' } } })
  })

  it('returns 503 on failure or timeout without error details', async () => {
    const res = await ready(
      withChecks(
        {
          name: 'db',
          check: () => Promise.reject(new Error('connect ECONNREFUSED db.internal:5432')),
        },
        { name: 'slow', timeoutMs: 10, check: () => new Promise(() => undefined) },
      ),
    )
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(JSON.parse(text)).toMatchObject({
      status: 'unavailable',
      checks: { db: { status: 'fail' }, slow: { status: 'timeout' } },
    })
    expect(text).not.toMatch(/ECONNREFUSED|db\.internal/)
  })

  it('returns 503 (not 500) when boot failed, while liveness stays 200', async () => {
    const app = createBlixis({
      modules: [
        defineModule({
          meta: { name: '@test/broken', version: '1.0.0' },
          boot: () => {
            throw new Error('boom')
          },
        })(),
      ],
      logger: noopLogger,
    })
    expect((await ready(app)).status).toBe(503)
    expect((await app.fetch(new Request('http://x/api/v1/health'))).status).toBe(200)
  })

  it('rejects duplicate names and registrations after setup', async () => {
    const dup = withChecks(
      { name: 'db', check: async () => undefined },
      { name: 'db', check: async () => undefined },
    )
    expect((await ready(dup)).status).toBe(503)
    const app = withChecks()
    await app.ready()
    expect(() =>
      app.services.get(HEALTH_CHECKS).register({ name: 'late', check: async () => undefined }),
    ).toThrow(/after setup/)
  })

  it('reserves the readiness route', () => {
    const clash = defineModule({
      meta: { name: '@acme/h', version: '1.0.0' },
      rest: { path: '/health', app: new Hono<ModuleHonoEnv>().get('/ready', (c) => c.text('x')) },
    })
    expect(() => createBlixis({ modules: [clash()], logger: noopLogger })).toThrowError(
      /conflicts with @blixis\/kernel/,
    )
  })
})

describe('REQUEST_CONTEXT', () => {
  it('is available to request-scoped services during HTTP requests and runInScope', async () => {
    const SEEN = createServiceToken<string>('@test/seen')
    const module = defineModule({
      meta: { name: '@test/ctx', version: '1.0.0' },
      setup(ctx) {
        ctx.services.provideFactory(
          SEEN,
          ({ services }) => services.get(REQUEST_CONTEXT).correlationId,
          { scope: 'request' },
        )
      },
      rest: {
        path: '/ctx',
        app: new Hono<ModuleHonoEnv>().get('/', (c) => c.text(c.var.services.get(SEEN))),
      },
    })
    const app = createBlixis({ modules: [module()], logger: noopLogger })
    const res = await app.fetch(
      new Request('http://x/api/v1/ctx', { headers: { 'x-correlation-id': 'corr-7' } }),
    )
    expect(await res.text()).toBe('corr-7')
    const fromScope = await app.runInScope({ correlationId: 'corr-8' }, async ({ services }) =>
      services.get(SEEN),
    )
    expect(fromScope).toBe('corr-8')
  })
})
