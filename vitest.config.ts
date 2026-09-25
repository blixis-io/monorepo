import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'

const require = createRequire(import.meta.resolve('./packages/graphql/package.json'))

// Test runner configuration — see docs/decisions/0002-test-runner.md and docs/conventions/testing.md.
// Node project: *.test.ts. Workers projects (*.worker.test.ts) are added per Worker package
// (e.g. apps/api/vitest.config.ts) and listed in `projects` below.
export default defineConfig({
  test: {
    projects: [
      './apps/api/vitest.config.ts',
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
          ],
          exclude: ['**/*.worker.test.ts', '**/node_modules/**', '**/dist/**'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'modules/*/src/**', 'tooling/*/src/**'],
      exclude: ['**/*.test.ts', '**/*.test-d.ts', '**/*.worker.test.ts', '**/index.ts'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
})
