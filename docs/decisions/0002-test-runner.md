# 0002 — Test runner

- Status: accepted
- Date: 2026-09-24
- Roadmap task: [001.002](../plans/001-project-foundation/002-record-toolchain-decisions.md)

## Context

§36 requires unit tests without Cloudflare, module integration tests against a test kernel and Postgres, API tests against the real Worker, and infrastructure tests for Hyperdrive/Queues/KV/R2. Worker code must be tested inside `workerd`, because Node does not reproduce Workers restrictions (global-scope I/O, per-request I/O isolation, missing Node APIs).

Spike (2026-09-24):

| Check | Result |
|---|---|
| `vitest@5.0.1` is `latest` | but `@cloudflare/vitest-pool-workers@0.22.0` peers on `vitest ^4.1.0` |
| `vitest@4.1.11` + `@cloudflare/vitest-pool-workers@0.22.0` | Node project and Workers project run from one root config via `test.projects`; both pass (≈ 0.6 s) |
| Pool configuration API | `plugins: [cloudflareTest({ wrangler: { configPath } })]` from `@cloudflare/vitest-pool-workers` (the older `defineWorkersProject` / `poolOptions.workers` API is gone; a v3→v4 codemod ships with the pool) |
| Worker test via `import { exports } from 'cloudflare:workers'` | `exports.default.fetch(...)` exercises the real Worker entry |
| Pool runtime version | the pool bundles its own Miniflare/`workerd` (`miniflare@5.20260815.0-alpha`); it rejects `compatibility_date` newer than its runtime supports (2026-08-22 at the time) |
| TypeScript source with `.ts` import specifiers (ADR 0001) | handled natively by Vite |

## Decision

1. **Vitest 4.x** is the single test runner (catalog pin; currently `4.1.x`). Vitest 5 is adopted only when `@cloudflare/vitest-pool-workers` supports it (upgrade Cloudflare tooling as one group).
2. **Projects:** one root `vitest.config.ts` with `test.projects`:
   - a **Node project** for unit, type-free integration, and module integration tests: `packages/*/src/**/*.test.ts`, `modules/*/src/**/*.test.ts`, `modules/*/test/**/*.test.ts`, `tooling/*/src/**/*.test.ts`;
   - **Workers projects** per Worker package (`apps/api/vitest.config.ts`, later others) using `cloudflareTest(...)`, matching `**/*.worker.test.ts`.
3. **Naming:** `*.test.ts` → Node pool; `*.worker.test.ts` → Workers pool; `*.test-d.ts` → type tests (checked by `tsc` via `tsconfig.test.json`, ADR 0001; Vitest `expectTypeOf` allowed inside them).
4. **Type checking is not delegated to Vitest.** `pnpm typecheck` (`tsc -b` + test tsconfigs) is authoritative; Vitest only transpiles.
5. **Compatibility date rule:** `apps/api` `compatibility_date` must be ≤ the newest date supported by the pool's bundled `workerd`. Bump `compatibility_date`, `wrangler`, and `@cloudflare/vitest-pool-workers` together, in one PR, after the Workers tests pass.
6. **Coverage:** `@vitest/coverage-v8` for the Node project (Workers-pool coverage is best effort).
7. **Browser/UI e2e** (admin, plan 019) uses Playwright, not Vitest.

## Alternatives considered

- **Vitest 5** — blocked by the Workers pool peer range.
- **Node's built-in test runner / Jest** — no Workers-runtime integration.
- **Miniflare API directly in tests** — lower level; the pool gives per-test isolated storage and `SELF`/`exports` access with less code.

## Consequences

- One runner and one command (`pnpm test`) for all non-browser tests; Worker behaviour is tested in the real runtime.
- The pool lags Wrangler's runtime; production `compatibility_date` is capped by test tooling. Accept this: never deploy a date the tests cannot run.
- The `wrangler` version bundled inside the pool may differ from the workspace `wrangler`; both are grouped in dependency updates (021.003).
- 001.006 implements the root config and conventions; 004.005 adds the first Workers project.
