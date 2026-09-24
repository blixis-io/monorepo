import { defineConfig } from 'vitest/config'

// Test runner configuration — see docs/decisions/0002-test-runner.md and docs/conventions/testing.md.
// Node project: *.test.ts. Workers projects (*.worker.test.ts) are added per Worker package
// (e.g. apps/api/vitest.config.ts) and listed in `projects` below.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'packages/*/src/**/*.test.ts',
            'packages/*/test/**/*.test.ts',
            'modules/*/src/**/*.test.ts',
            'modules/*/test/**/*.test.ts',
            'tooling/*/src/**/*.test.ts',
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
