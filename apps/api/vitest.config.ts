import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

// Workers-runtime tests (ADR 0002): run the real Worker entry inside workerd with the bindings
// from wrangler.jsonc. Keep compatibility_date ≤ the pool's bundled runtime.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: {
    name: 'api',
    include: ['test/**/*.worker.test.ts'],
  },
})
