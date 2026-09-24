import { ConflictError, type ModuleHonoEnv } from '@blixis/contracts'
import { createBlixis, defineModule, noopLogger, serviceOverride } from '@blixis/kernel'
import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../create-database.ts'
import { runMigrations } from '../migrations/run.ts'
import { DATABASE, databaseModule } from '../module.ts'
import { idempotent } from './middleware.ts'
import { idempotencyModule } from './module.ts'
import { postgresIdempotency } from './service.ts'

const baseUrl = process.env['BLIXIS_TEST_DATABASE_URL']
if (baseUrl === undefined && process.env['CI'] === 'true')
  throw new Error('BLIXIS_TEST_DATABASE_URL must be set in CI')

describe.skipIf(baseUrl === undefined)('idempotency keys (Postgres)', () => {
  const name = `blixis_idem_test_${Date.now()}`
  let db: Database
  const admin = async (statement: string) => {
    const client = new Client({ connectionString: baseUrl })
    await client.connect()
    await client.query(statement).finally(() => client.end())
  }
  beforeAll(async () => {
    await admin(`create database ${name}`)
    const parsed = new URL(baseUrl ?? '')
    parsed.pathname = `/${name}`
    const migrations = createBlixis({ modules: [idempotencyModule()], logger: noopLogger })
      .contributions.migrations
    await runMigrations({ connectionString: parsed.toString(), migrations })
    db = createDatabase({ connectionString: parsed.toString() })
  })
  beforeEach(async () => {
    await db.execute(sql`truncate blixis.idempotency_keys`)
  })
  afterAll(async () => {
    await db.close()
    await admin(`drop database if exists ${name} with (force)`)
  })

  describe('IdempotencyService', () => {
    it('runs once and replays the stored result', async () => {
      const service = postgresIdempotency(db)
      let runs = 0
      const fn = async () => ({ id: ++runs })
      expect(await service.run('s', 'k1', 'h', fn)).toEqual({ replayed: false, result: { id: 1 } })
      expect(await service.run('s', 'k1', 'h', fn)).toEqual({ replayed: true, result: { id: 1 } })
      expect(runs).toBe(1)
    })

    it('rejects a key reused for a different request', async () => {
      const service = postgresIdempotency(db)
      await service.run('s', 'k2', 'h1', async () => 1)
      await expect(service.run('s', 'k2', 'h2', async () => 2)).rejects.toThrowError(
        new ConflictError('This Idempotency-Key was already used for a different request'),
      )
    })

    it('keys are independent per scope', async () => {
      const service = postgresIdempotency(db)
      await service.run('tenant-a', 'k', 'h', async () => 'a')
      expect(await service.run('tenant-b', 'k', 'h', async () => 'b')).toEqual({
        replayed: false,
        result: 'b',
      })
    })

    it('concurrent requests with one key: one runs, the others get 409 while it runs', async () => {
      const service = postgresIdempotency(db)
      let release: () => void = () => undefined
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const first = service.run('s', 'k3', 'h', async () => {
        await gate
        return 'done'
      })
      await new Promise((r) => setTimeout(r, 50))
      await expect(service.run('s', 'k3', 'h', async () => 'again')).rejects.toThrow(
        /still being processed/,
      )
      release()
      expect(await first).toEqual({ replayed: false, result: 'done' })
    })

    it('releases the key when fn throws or the result is not stored', async () => {
      const service = postgresIdempotency(db)
      await expect(
        service.run('s', 'k4', 'h', () => Promise.reject(new Error('boom'))),
      ).rejects.toThrow('boom')
      expect(await service.run('s', 'k4', 'h', async () => 'ok')).toEqual({
        replayed: false,
        result: 'ok',
      })
      await service.run('s', 'k5', 'h', async () => 500, { shouldStore: (r) => r < 500 })
      expect(await service.run('s', 'k5', 'h', async () => 201)).toEqual({
        replayed: false,
        result: 201,
      })
    })

    it('takes over expired and abandoned keys', async () => {
      const service = postgresIdempotency(db, { staleSeconds: 1 })
      await db.execute(sql`
        insert into blixis.idempotency_keys (scope, key, request_hash, status, updated_at, expires_at)
        values ('s', 'old', 'h', 'in_progress', now() - interval '1 minute', now() + interval '1 hour')`)
      expect(await service.run('s', 'old', 'other', async () => 'taken')).toEqual({
        replayed: false,
        result: 'taken',
      })
    })
  })

  describe('idempotent() middleware', () => {
    let counter = 0
    const orders = defineModule({
      meta: { name: '@acme/orders', version: '1.0.0' },
      rest: {
        path: '/orders',
        app: new Hono<ModuleHonoEnv>()
          .post('/', idempotent(), async (c) =>
            c.json({ order: ++counter, body: await c.req.json() }, 201),
          )
          .post('/broken', idempotent(), () => {
            throw new Error('db down')
          })
          .post('/strict', idempotent({ required: true }), (c) => c.body(null, 204)),
      },
    })
    const app = () =>
      createBlixis({
        modules: [databaseModule(), idempotencyModule(), orders()],
        overrides: [serviceOverride(DATABASE, db)],
        logger: noopLogger,
        actorResolver: (request) => ({
          type: 'user',
          userId: request.headers.get('x-user') ?? 'u1',
        }),
      })
    const post = (
      a: ReturnType<typeof app>,
      path: string,
      headers: Record<string, string>,
      body = '{"sku":"A"}',
    ) =>
      a.fetch(
        new Request(`http://x/api/v1/orders${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body,
        }),
      )

    it('replays the stored response with Idempotent-Replayed', async () => {
      const a = app()
      const first = await post(a, '', { 'idempotency-key': 'order-1' })
      const second = await post(a, '', { 'idempotency-key': 'order-1' })
      expect(first.status).toBe(201)
      expect(second.status).toBe(201)
      expect(second.headers.get('idempotent-replayed')).toBe('true')
      expect(await second.json()).toEqual(await first.json())
    })

    it('answers 409 for a different body under the same key, and scopes keys per actor', async () => {
      const a = app()
      await post(a, '', { 'idempotency-key': 'order-2' })
      expect((await post(a, '', { 'idempotency-key': 'order-2' }, '{"sku":"B"}')).status).toBe(409)
      const otherUser = await post(a, '', { 'idempotency-key': 'order-2', 'x-user': 'u2' })
      expect(otherUser.status).toBe(201)
      expect(otherUser.headers.get('idempotent-replayed')).toBeNull()
    })

    it('does not store 5xx responses and passes requests without a key', async () => {
      const a = app()
      expect((await post(a, '/broken', { 'idempotency-key': 'b-1' })).status).toBe(500)
      const keys = await db.execute(sql`select 1 from blixis.idempotency_keys where key = 'b-1'`)
      expect(keys.rows).toEqual([])
      expect((await post(a, '', {})).status).toBe(201)
    })

    it('validates the header', async () => {
      const a = app()
      expect((await post(a, '/strict', {})).status).toBe(400)
      expect((await post(a, '', { 'idempotency-key': 'has space' })).status).toBe(400)
    })
  })
})
