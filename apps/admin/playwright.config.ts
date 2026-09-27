import { defineConfig, devices } from '@playwright/test'

/**
 * Smoke tests of the admin against a real local API (plan 019.002): Docker Postgres, migrated
 * (`pnpm db:migrate`), and `apps/api/.dev.vars` with `AUTH_SIGNING_KEYS`. Both servers start on
 * their own unless they already run. See apps/admin/README.md.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: process.env['CI'] !== undefined,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Started without the pnpm wrapper, which doesn't pass on the stop signal.
      command: 'node node_modules/wrangler/bin/wrangler.js dev',
      cwd: '../api',
      url: 'http://localhost:8787/api/v1/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'node node_modules/vite/bin/vite.js',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
})
