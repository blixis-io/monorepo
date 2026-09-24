import { databaseModule } from '@blixis/database'
import { READY_PATH } from '@blixis/kernel'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestBlixis } from './create-test-blixis.ts'
import { createTestDatabase, databaseTestsEnabled, type TestDatabase } from './database.ts'

// Vertical slice (roadmap 005.008): readiness → kernel → request scope → DATABASE → Postgres.
describe.skipIf(!databaseTestsEnabled())('readiness with a real database', () => {
  let t: TestDatabase
  beforeAll(async () => {
    t = await createTestDatabase({ modules: [databaseModule()] })
  })
  afterAll(() => t.drop())

  it('returns 200 with the database check and its latency', async () => {
    const app = await createTestBlixis({ modules: [databaseModule()], database: t })
    const res = await app.request(READY_PATH)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      status: string
      checks: { database: { status: string; latencyMs: number } }
    }
    expect(body.status).toBe('ok')
    expect(body.checks.database.status).toBe('ok')
    expect(body.checks.database.latencyMs).toBeGreaterThanOrEqual(0)
  })
})
