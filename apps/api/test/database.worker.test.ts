import { env } from 'cloudflare:test'
import { createDatabase } from '@blixis/database'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

// biome-ignore lint/correctness/noUnusedVariables: used once the quarantine is lifted
const enabled = (env as { BLIXIS_TEST_DATABASE?: string }).BLIXIS_TEST_DATABASE === 'on'

// pg + Drizzle inside workerd, through the Hyperdrive binding (local mode → test Postgres).
//
// QUARANTINED (known issue, docs/conventions/testing.md#known-issues): the Vitest Workers pool
// resolves pg's `require('pg-cloudflare')` without the `workerd` export condition and loads its
// empty Node stub ("CloudflareSocket is not a constructor"). Wrangler's bundler applies
// `workerd`, so deployed Workers are unaffected; staging is verified by 005.008. Re-enable
// (`describe.skipIf(!enabled)`) when the pool honours `workerd` for require().
describe.skip('database in the Workers runtime', () => {
  it('queries Postgres through HYPERDRIVE and runs a transaction', async () => {
    const db = createDatabase({ connectionString: env.HYPERDRIVE.connectionString })
    try {
      const result = await db.execute<{ major: string }>(
        sql`select current_setting('server_version_num') as major`,
      )
      expect(Number(result.rows[0]?.major)).toBeGreaterThanOrEqual(180000)
      const sum = await db.transaction(async (tx) => {
        const r = await tx.execute<{ n: number }>(sql`select 1 + 1 as n`)
        return r.rows[0]?.n
      })
      expect(sum).toBe(2)
    } finally {
      await db.close()
    }
  })
})
