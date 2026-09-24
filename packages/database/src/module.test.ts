import { createBlixis, noopLogger, READY_PATH } from '@blixis/kernel'
import { describe, expect, it } from 'vitest'
import { DATABASE, databaseModule } from './module.ts'

// Connection-free checks; queries against Postgres are covered by the 005.006 integration tests.
describe('databaseModule', () => {
  const app = (binding?: string) =>
    createBlixis({
      modules: [databaseModule(binding === undefined ? {} : { binding })],
      logger: noopLogger,
    })
  const bindings = { HYPERDRIVE: { connectionString: 'postgres://user:pw@127.0.0.1:1/db' } }

  it('provides one lazily connecting database per scope and closes it when the scope ends', async () => {
    let closed = 0
    const result = await app().runInScope({ bindings }, async ({ services }) => {
      const db = services.get(DATABASE)
      expect(services.get(DATABASE)).toBe(db)
      const close = db.close
      Object.assign(db, {
        close: () => {
          closed++
          return close()
        },
      })
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(closed).toBe(1)
  })

  it('creates a new database for every scope', async () => {
    const blixis = app()
    const first = await blixis.runInScope({ bindings }, async ({ services }) =>
      services.get(DATABASE),
    )
    const second = await blixis.runInScope({ bindings }, async ({ services }) =>
      services.get(DATABASE),
    )
    expect(second).not.toBe(first)
  })

  it('reads a configurable binding and fails clearly without leaking values', async () => {
    const error = await app('DB')
      .runInScope({ bindings }, async ({ services }) => services.get(DATABASE))
      .catch((e: unknown) => e)
    expect(String(error)).toMatch(/Database binding "DB" is missing/)
    expect(String(error)).not.toContain('pw@')
  })

  it('declares the blixis.database capability', () => {
    expect(databaseModule().meta.capabilities).toEqual(['blixis.database'])
  })

  it('reports readiness 503 without connection details when the database is unreachable', async () => {
    const secret = 'postgres://app:hunter2@127.0.0.1:1/neondb'
    const res = await app().fetch(new Request(`http://x${READY_PATH}`), {
      HYPERDRIVE: { connectionString: secret },
    })
    expect(res.status).toBe(503)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.text()
    expect(JSON.parse(body)).toMatchObject({
      status: 'unavailable',
      checks: { database: { status: 'fail' } },
    })
    expect(body).not.toMatch(/hunter2|127\.0\.0\.1|neondb|ECONN/)
  })

  it('can skip the readiness check', async () => {
    const res = await createBlixis({
      modules: [databaseModule({ healthCheck: false })],
      logger: noopLogger,
    }).fetch(new Request(`http://x${READY_PATH}`), {})
    expect(await res.json()).toEqual({ status: 'ok', checks: {} })
  })
})
