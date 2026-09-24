import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

const testDatabaseUrl = process.env['BLIXIS_TEST_DATABASE_URL'] || undefined

// Workers-runtime tests (ADR 0002): run the real Worker entry inside workerd with the bindings
// from wrangler.jsonc. Keep compatibility_date ≤ the pool's bundled runtime.

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // Point HYPERDRIVE at the test Postgres server when database tests are enabled
      // (docs/conventions/testing.md#test-database); otherwise wrangler.jsonc's local database.
      ...(testDatabaseUrl === undefined
        ? {}
        : {
            miniflare: {
              hyperdrives: { HYPERDRIVE: testDatabaseUrl },
              // Lets *.worker.test.ts files know database tests are enabled.
              bindings: { BLIXIS_TEST_DATABASE: 'on' },
            },
          }),
    }),
  ],
  test: {
    name: 'api',
    include: ['test/**/*.worker.test.ts'],
  },
})
