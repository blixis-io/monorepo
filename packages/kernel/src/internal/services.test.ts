import { createServiceToken, ModuleError } from '@blixis/contracts'
import { describe, expect, it } from 'vitest'
import { ServiceContainer } from './services.ts'

const GREETING = createServiceToken<string>('@test/greeting')
const COUNTER = createServiceToken<{ n: number }>('@test/counter')
const DB = createServiceToken<{ id: number; closed: boolean }>('@test/db')
const REPO = createServiceToken<{ db: { id: number } }>('@test/repo')

describe('ServiceContainer — registration', () => {
  it('provides and resolves app values', () => {
    const c = new ServiceContainer()
    c.forModule('a').provide(GREETING, 'hello')
    expect(c.get(GREETING)).toBe('hello')
    expect(c.has(GREETING)).toBe(true)
    expect(c.getOptional(COUNTER)).toBeUndefined()
  })

  it('rejects duplicate providers, naming both modules', () => {
    const c = new ServiceContainer()
    c.forModule('@acme/a').provide(GREETING, 'a')
    expect(() => c.forModule('@acme/b').provide(GREETING, 'b')).toThrowError(
      '[@acme/b] service @test/greeting is already provided by @acme/a (duplicate service provider)',
    )
  })

  it('rejects registrations after sealing', () => {
    const c = new ServiceContainer()
    const view = c.forModule('late')
    c.seal()
    expect(() => view.provide(GREETING, 'x')).toThrowError(/after setup/)
  })

  it('reports missing services with the requesting module', () => {
    const c = new ServiceContainer()
    expect(() => c.forModule('@acme/seo').get(GREETING)).toThrowError(
      '[@acme/seo] service @test/greeting is not registered',
    )
    expect(() => c.get(GREETING)).toThrowError(ModuleError)
  })
})

describe('ServiceContainer — app scope', () => {
  it('creates app factories lazily, once', () => {
    const c = new ServiceContainer()
    let calls = 0
    c.forModule('a').provideFactory(COUNTER, () => ({ n: ++calls }), { scope: 'app' })
    expect(calls).toBe(0)
    expect(c.get(COUNTER)).toBe(c.get(COUNTER))
    expect(calls).toBe(1)
  })

  it('app services are shared by request scopes', () => {
    const c = new ServiceContainer()
    c.forModule('a').provideFactory(COUNTER, () => ({ n: 1 }), { scope: 'app' })
    expect(c.createRequestScope().services.get(COUNTER)).toBe(
      c.createRequestScope().services.get(COUNTER),
    )
  })

  it('forbids app factories from resolving request-scoped services (scope violation)', () => {
    const c = new ServiceContainer()
    const m = c.forModule('a')
    m.provideFactory(DB, () => ({ id: 1, closed: false }), { scope: 'request' })
    m.provideFactory(REPO, ({ services }) => ({ db: services.get(DB) }), { scope: 'app' })
    expect(() => c.createRequestScope().services.get(REPO)).toThrowError(
      /request-scoped and cannot be resolved/,
    )
  })

  it('detects circular resolution', () => {
    const A = createServiceToken<unknown>('@test/a')
    const B = createServiceToken<unknown>('@test/b')
    const c = new ServiceContainer()
    const m = c.forModule('m')
    m.provideFactory(A, ({ services }) => services.get(B), { scope: 'app' })
    m.provideFactory(B, ({ services }) => services.get(A), { scope: 'app' })
    expect(() => c.get(A)).toThrowError(/circular service resolution/)
  })
})

describe('ServiceContainer — request scope', () => {
  function container() {
    const c = new ServiceContainer()
    let next = 0
    const disposed: string[] = []
    const m = c.forModule('db-module')
    m.provideFactory(DB, () => ({ id: ++next, closed: false }), {
      scope: 'request',
      dispose: (db) => {
        db.closed = true
        disposed.push(`db${db.id}`)
      },
    })
    m.provideFactory(REPO, ({ services }) => ({ db: services.get(DB) }), {
      scope: 'request',
      dispose: () => void disposed.push('repo'),
    })
    return { c, disposed }
  }

  it('creates one instance per scope and never shares across scopes', () => {
    const { c } = container()
    const s1 = c.createRequestScope()
    const s2 = c.createRequestScope()
    expect(s1.services.get(DB)).toBe(s1.services.get(DB))
    expect(s1.services.get(DB)).not.toBe(s2.services.get(DB))
    expect(s1.services.get(REPO).db).toBe(s1.services.get(DB))
  })

  it('cannot resolve request services outside a scope', () => {
    const { c } = container()
    expect(() => c.get(DB)).toThrowError(/request-scoped/)
  })

  it('disposes in reverse creation order, once', async () => {
    const { c, disposed } = container()
    const scope = c.createRequestScope()
    scope.services.get(REPO) // creates DB first, then REPO
    await scope.dispose()
    await scope.dispose()
    expect(disposed).toEqual(['repo', 'db1'])
    expect(() => scope.services.get(DB)).toThrowError(/already disposed/)
  })

  it('runs every disposer and aggregates failures', async () => {
    const c = new ServiceContainer()
    const X = createServiceToken<number>('@test/x')
    const Y = createServiceToken<number>('@test/y')
    const ran: string[] = []
    const m = c.forModule('m')
    m.provideFactory(X, () => 1, { scope: 'request', dispose: () => void ran.push('x') })
    m.provideFactory(Y, () => 2, {
      scope: 'request',
      dispose: () => {
        ran.push('y')
        throw new Error('close failed')
      },
    })
    const scope = c.createRequestScope()
    scope.services.get(X)
    scope.services.get(Y)
    await expect(scope.dispose()).rejects.toBeInstanceOf(AggregateError)
    expect(ran).toEqual(['y', 'x'])
  })

  it('does not dispose services that were never created', async () => {
    const { c, disposed } = container()
    await c.createRequestScope().dispose()
    expect(disposed).toEqual([])
  })
})
