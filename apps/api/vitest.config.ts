import { mkdirSync } from 'node:fs'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { buildSync } from 'esbuild'
import { defineConfig } from 'vitest/config'

const testDatabaseUrl = process.env['BLIXIS_TEST_DATABASE_URL'] || undefined

// Workers-runtime tests (ADR 0002): run the real Worker entry inside workerd with the bindings
// from wrangler.jsonc. Keep compatibility_date ≤ the pool's bundled runtime.

// Auxiliary Workers must be plain JavaScript: bundle the service-binding fixture (plan 020.005).
const fixtureDir = new URL('./node_modules/.cache/blixis-fixtures/', import.meta.url).pathname
mkdirSync(fixtureDir, { recursive: true })
buildSync({
  entryPoints: [new URL('./test/fixtures/notes-service.worker.ts', import.meta.url).pathname],
  outfile: `${fixtureDir}notes-service.js`,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2024',
  conditions: ['workerd', 'worker', 'import'],
  mainFields: ['module', 'main'],
  external: ['cloudflare:*', 'node:*'],
  logLevel: 'error',
})
const auxiliaryWorkers = [
  {
    name: 'notes-service',
    modules: true,
    scriptPath: `${fixtureDir}notes-service.js`,
    compatibilityDate: '2026-08-15',
    compatibilityFlags: ['nodejs_compat'],
  },
]
const serviceBindings = { NOTES: { name: 'notes-service', entrypoint: 'NotesEntrypoint' } }

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // Point HYPERDRIVE at the test Postgres server when database tests are enabled
      // (docs/conventions/testing.md#test-database); otherwise wrangler.jsonc's local database.
      miniflare: {
        workers: auxiliaryWorkers,
        serviceBindings,
        ...(testDatabaseUrl === undefined
          ? {}
          : {
              hyperdrives: { HYPERDRIVE: testDatabaseUrl },
              // Lets *.worker.test.ts files know database tests are enabled.
              bindings: { BLIXIS_TEST_DATABASE: 'on' },
            }),
      },
    }),
  ],
  test: {
    name: 'api',
    include: ['test/**/*.worker.test.ts'],
  },
})
