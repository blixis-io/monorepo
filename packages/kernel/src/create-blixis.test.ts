import { createServiceToken, type LogFields, ModuleError } from '@blixis/contracts'
import { describe, expect, it } from 'vitest'
import { createBlixis } from './create-blixis.ts'
import { defineModule } from './define-module.ts'
import { ModuleValidationError } from './errors.ts'
import { createJsonLogger, noopLogger } from './logger.ts'

const GREETING = createServiceToken<string>('@test/greeting')

describe('createBlixis', () => {
  it('validates the graph synchronously', () => {
    expect(() =>
      createBlixis({
        modules: [defineModule({ meta: { name: 'a', version: '1.0.0', requires: { b: '*' } } })()],
        logger: noopLogger,
      }),
    ).toThrowError(ModuleValidationError)
  })

  it('exposes module metadata in bootstrap order', () => {
    const app = createBlixis({
      modules: [
        defineModule({
          meta: { name: 'consumer', version: '1.0.0', requiresCapabilities: ['test.x'] },
        })(),
        defineModule({ meta: { name: 'provider', version: '1.0.0', capabilities: ['test.x'] } })(),
      ],
      logger: noopLogger,
    })
    expect(app.modules.map((m) => m.name)).toEqual(['provider', 'consumer'])
  })

  it('runs setup in dependency order, then boot, lazily and once', async () => {
    const calls: string[] = []
    const make = (name: string, extra: object = {}) =>
      defineModule({
        meta: { name, version: '1.0.0', ...extra },
        setup: async () => void calls.push(`setup:${name}`),
        boot: () => void calls.push(`boot:${name}`),
      })()
    const app = createBlixis({
      modules: [make('b', { requires: { a: '*' } }), make('a')],
      logger: noopLogger,
    })
    expect(calls).toEqual([])
    await app.ready()
    await app.ready()
    expect(calls).toEqual(['setup:a', 'setup:b', 'boot:a', 'boot:b'])
  })

  it('shares services between modules and passes config and a module logger', async () => {
    const lines: string[] = []
    const logger = createJsonLogger({ level: 'debug', write: (_l, line) => void lines.push(line) })
    const provider = defineModule({
      meta: { name: 'provider', version: '1.0.0' },
      config: { greeting: 'hi' },
      setup(ctx) {
        ctx.services.provide(GREETING, (ctx.config as { greeting: string }).greeting)
        ctx.logger.info('provided')
      },
    })
    let seen: string | undefined
    const consumer = defineModule({
      meta: { name: 'consumer', version: '1.0.0', requires: { provider: '*' } },
      boot(ctx) {
        seen = ctx.services.get(GREETING)
      },
    })
    const app = createBlixis({ modules: [consumer(), provider()], logger })
    await app.ready()
    expect(seen).toBe('hi')
    expect(app.services.get(GREETING)).toBe('hi')
    expect(JSON.parse(lines[0] ?? '{}') as LogFields).toMatchObject({
      module: 'provider',
      message: 'provided',
    })
  })

  it('does not run boot before the first fetch', async () => {
    let booted = false
    const app = createBlixis({
      modules: [
        defineModule({
          meta: { name: 'a', version: '1.0.0' },
          boot: () => {
            booted = true
          },
        })(),
      ],
      logger: noopLogger,
    })
    expect(booted).toBe(false)
    const response = await app.fetch(new Request('http://x/unknown'))
    expect(booted).toBe(true)
    expect(response.status).toBe(404)
  })

  it('wraps setup errors with module and phase, and caches them', async () => {
    let attempts = 0
    const app = createBlixis({
      modules: [
        defineModule({
          meta: { name: '@acme/broken', version: '1.0.0' },
          setup: () => {
            attempts++
            throw new Error('bad config')
          },
        })(),
      ],
      logger: noopLogger,
    })
    const error = await app.ready().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ModuleError)
    expect((error as ModuleError).message).toBe('[@acme/broken] setup failed: bad config')
    await expect(app.ready()).rejects.toBe(error)
    expect(attempts).toBe(1)
  })

  it('retries a failed boot on the next ready() without repeating successful boots', async () => {
    const calls: string[] = []
    let fail = true
    const app = createBlixis({
      modules: [
        defineModule({ meta: { name: 'a', version: '1.0.0' }, boot: () => void calls.push('a') })(),
        defineModule({
          meta: { name: 'b', version: '1.0.0' },
          boot: () => {
            calls.push('b')
            if (fail) throw new Error('db not ready')
          },
        })(),
      ],
      logger: noopLogger,
    })
    await expect(app.ready()).rejects.toThrowError('[b] boot failed: db not ready')
    fail = false
    await app.ready()
    expect(calls).toEqual(['a', 'b', 'b'])
  })

  it('seals the registry after setup', async () => {
    let late: (() => void) | undefined
    const app = createBlixis({
      modules: [
        defineModule({
          meta: { name: 'a', version: '1.0.0' },
          setup(ctx) {
            late = () => ctx.services.provide(GREETING, 'late')
          },
        })(),
      ],
      logger: noopLogger,
    })
    await app.ready()
    expect(() => late?.()).toThrowError(/after setup/)
  })
})

describe('createJsonLogger', () => {
  it('writes JSON lines with bound fields and respects the level', () => {
    const lines: [string, string][] = []
    const logger = createJsonLogger({
      level: 'info',
      fields: { app: 'x' },
      write: (l, line) => void lines.push([l, line]),
    })
    logger.debug('hidden')
    logger.child({ requestId: 'r1' }).warn('careful', { spaceId: 's' })
    expect(lines).toHaveLength(1)
    expect(lines[0]?.[0]).toBe('warn')
    expect(JSON.parse(lines[0]?.[1] ?? '{}')).toMatchObject({
      level: 'warn',
      message: 'careful',
      app: 'x',
      requestId: 'r1',
      spaceId: 's',
    })
  })
})
