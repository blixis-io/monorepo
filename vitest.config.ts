import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'

const require = createRequire(import.meta.resolve('./packages/graphql/package.json'))

// Without a database most integration suites (auth, tenancy, content, delivery, assets,
// webhooks, SDK contract) are skipped. Say so loudly: a green run is then only a partial one.
if (process.env['BLIXIS_TEST_DATABASE_URL'] === undefined && process.env['CI'] !== 'true') {
  process.stderr.write(
    '\n\x1b[33m⚠ BLIXIS_TEST_DATABASE_URL is not set: database tests are SKIPPED. ' +
      'Run `pnpm test:db` (Docker Postgres) for the full suite.\x1b[0m\n\n',
  )
}

// Test runner configuration — see docs/decisions/0002-test-runner.md and docs/conventions/testing.md.
// Node project: *.test.ts. Workers projects (*.worker.test.ts) are added per Worker package
// (e.g. apps/api/vitest.config.ts) and listed in `projects` below.
export default defineConfig({
  test: {
    projects: [
      './apps/api/vitest.config.ts',
      './apps/admin/vitest.config.ts',
      {
        // graphql 16 has no `exports` map: Vite would load its ESM build for our sources while
        // Node gives GraphQL Yoga's dependencies the CommonJS build — two realms of one library
        // ("Cannot use GraphQLObjectType from another module or realm"). Workers bundles
        // (esbuild) pick one build for everything, so only the Node project needs this.
        resolve: { alias: [{ find: /^graphql$/, replacement: require.resolve('graphql') }] },
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'packages/*/src/**/*.test.ts',
            'packages/*/test/**/*.test.ts',
            'modules/*/src/**/*.test.ts',
            'modules/*/test/**/*.test.ts',
            'tooling/*/src/**/*.test.ts',
            'tooling/*/test/**/*.test.ts',
            'apps/example-site/test/**/*.test.ts',
          ],
          exclude: ['**/*.worker.test.ts', '**/node_modules/**', '**/dist/**'],
          // Database-backed tests run many at once; 5 s (the default) timed out under full load.
          testTimeout: 15_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: [
        'packages/*/src/**',
        'modules/*/src/**',
        'tooling/*/src/**',
        // apps/api is tested in the Workers pool (V8 coverage can't instrument workerd) and by the
        // admin e2e job, so it is not measured here.
        'apps/admin/src/**',
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.test-d.ts',
        '**/*.worker.test.ts',
        '**/index.ts',
        // Generated code and vendored UI primitives.
        '**/generated/**',
        'apps/admin/src/components/ui/**',
      ],
      reporter: ['text-summary', 'html', 'lcov', 'json-summary'],
      // A floor, not a target (docs/conventions/testing.md#coverage): set just below the measured
      // level so large untested changes fail, stricter where regressions hurt most. Raise them
      // when coverage rises; never lower them to make a change pass.
      thresholds: {
        statements: 83,
        branches: 74,
        functions: 79,
        lines: 85,
        'packages/kernel/src/**': { statements: 93, branches: 86 },
        'packages/events/src/**': { statements: 92, branches: 82 },
        'packages/database/src/**': { statements: 91, branches: 85 },
        'modules/auth/src/**': { statements: 92, branches: 84 },
        'modules/permissions/src/**': { statements: 95, branches: 92 },
        'modules/content/src/**': { statements: 87, branches: 77 },
        'modules/webhooks/src/**': { statements: 92, branches: 80 },
      },
    },
  },
})
