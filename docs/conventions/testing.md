# Testing

How Blixis is tested, where tests live, and what CI runs. Implements architecture §36. The runner is **Vitest 4.1** with **`@cloudflare/vitest-pool-workers`** for tests that must run inside `workerd` ([ADR 0002](../decisions/0002-test-runner.md)). Configuration: root [`vitest.config.ts`](../../vitest.config.ts) with one `node` project; each Worker package adds its own Workers project.

Related: [Code standards](./code-standards.md) · [GitHub Actions](../operations/github-actions.md) · [Monorepo](../development/monorepo.md)

---

## Test levels

| Level | What it tests | Runtime | Real infrastructure | Location / naming |
|---|---|---|---|---|
| **Unit** | Domain logic, services with fakes, validators, permission rules, event handlers, pure helpers | Node pool | None | next to source: `src/**/*.test.ts` |
| **Type tests** | Public contract types (inference, assignability) | `tsc` / `expectTypeOf` | None | `src/**/*.test-d.ts` |
| **Module integration** | A module booted with `createTestBlixis`, real repositories against Postgres | Node pool | Test Postgres | `modules/<m>/test/**/*.test.ts`, `packages/<p>/test/**/*.test.ts` |
| **API (Workers runtime)** | The real Worker entry: routing, auth, validation, error mapping, REST/GraphQL formats, queue/scheduled handlers | Workers pool (`workerd`) | Test Postgres via Hyperdrive local connection; local Queues/KV/R2 simulation | `apps/api/test/**/*.worker.test.ts` |
| **Infrastructure** | Adapters: Hyperdrive/Postgres, Queues, KV, R2, Cache API, Workflows | Workers pool | Local simulations; staging smoke for what cannot be simulated | `packages/cloudflare/src/**/*.test.ts`, `packages/database/**` |
| **Cross-cutting suites** | Tenant isolation (`tooling/tenant-isolation`, Node pool against the API's real modules), authorization matrix, event pipeline, cache isolation | Node pool (until `pg` works in the Workers pool) | Test Postgres | `tooling/tenant-isolation`, `packages/events/test` |
| **Contract (SDK)** | SDK against a running Workers-pool API | Workers pool / Node | Test Postgres | `packages/sdk/test/*.contract.test.ts` |
| **End-to-end (UI)** | Admin editorial flow in a browser | Playwright | Local API + test Postgres | `apps/admin/e2e/*.spec.ts` |
| **Smoke** | Deployed staging/production health and core workflow | Node script | Real environment | `tooling/smoke/` |
| **Load** | Performance targets | k6 | Staging only | `tooling/load/` |

Keep infrastructure-specific tests separate from domain tests (§36).

## How it is wired

- `pnpm test` runs `tsc -b` first: workspace packages are consumed through their built `dist/` ([ADR 0001](../decisions/0001-typescript-7-build-strategy.md)).
- Vitest only transpiles; **type checking** of tests happens in `pnpm typecheck` via each package's `tsconfig.test.json` (extends `@blixis-io/tsconfig/test.json`). `expectTypeOf` assertions in `*.test.ts` / `*.test-d.ts` are therefore enforced by `tsc`.
- Each package has `"test": "vitest run --root ../.. <dir>/<name>"` so `pnpm --filter <pkg> test` works.
- **Opting a package into the Workers runtime:** add `<pkg>/vitest.config.ts` with `plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })]` and `include: ['src/**/*.worker.test.ts']`, then list that config in the root `test.projects`. Keep `compatibility_date` ≤ the pool's bundled `workerd` (ADR 0002). First user: `apps/api` — see [`apps/api/vitest.config.ts`](../../apps/api/vitest.config.ts) and `apps/api/test/*.worker.test.ts`, which import the Worker entry (`src/index.ts`) and call `fetch`/`queue`/`scheduled` with `cloudflare:test` helpers (`env`, `createExecutionContext`, `createMessageBatch`, `createScheduledController`, `getQueueResult`).

## Rules

1. **Every behaviour change ships with tests** at the lowest level that can prove it (§48 Code.11).
2. **Don't mock the database for repository tests.** Repositories are tested against real Postgres. Services may use fakes for their ports.
3. **Tests are deterministic:** inject time via `RequestContext.now()`, IDs via factories; no sleeps — use fake timers or polling helpers with timeouts.
4. **Tests are isolated and parallel-safe:** each test file gets its own schema/database (helpers in `@blixis-io/testing`), no shared mutable state.
5. **No network** in `pnpm test`: no calls to Cloudflare, Neon, or third-party services.
6. **Test behaviour, not implementation:** assert on public results, HTTP responses, emitted events, and persisted state.
7. **Tenant and authorization coverage is mandatory:** every new tenant-scoped route is registered in the isolation suite and the authz matrix (roadmap 008.006, 009.005); CI fails otherwise.
8. **Security-sensitive code** (auth, tokens, webhooks signing, redaction) gets explicit negative tests.
9. **Fix flaky tests immediately** or quarantine them with an issue link; never retry-until-green in CI.

## Test database

Strategy (roadmap 005.006): **Docker Postgres 18**, the same major version as Neon. Locally it comes from `docker-compose.yml`, and in CI from a service container. Neon is never used by `pnpm test`, so no credentials are needed; Neon branches are only for staging smoke tests.

- **Opt-in by `BLIXIS_TEST_DATABASE_URL`**, the URL of a server where tests may create databases. `pnpm test:db` sets it to the local compose database; `pnpm test` without it skips database tests (about a third of the suite) and prints a warning; a green `pnpm test` is a partial run, `pnpm test:db` is the full one. **In CI the variable is required**: `databaseTestsEnabled()` throws when `CI=true` and it's missing, so database tests can't be skipped silently.
- **Isolation: one database per test file.** `createTestDatabase({ modules })` from `@blixis-io/testing/database` creates `blixis_test_<random>`, applies the modules' migrations with the real runner (same order and checks as production), and returns `{ db, url, reset, drop }`. Parallel Vitest workers never share a database.
- **Between tests:** `reset()` truncates every module table (`restart identity cascade`) and keeps applied migrations. It's faster and more reliable than per-test transaction rollback, because services use their own pooled connections.
- **App tests:** `createTestBlixis({ modules, database: t })` serves `DATABASE` from the test database. It's shared by all requests and never closed per request.

```ts
import { createTestBlixis } from '@blixis-io/testing'
import { createTestDatabase, databaseTestsEnabled, type TestDatabase } from '@blixis-io/testing/database'

describe.skipIf(!databaseTestsEnabled())('entries', () => {
  let t: TestDatabase
  beforeAll(async () => { t = await createTestDatabase({ modules: [contentModule()] }) })
  beforeEach(() => t.reset())
  afterAll(() => t.drop())

  it('creates an entry', async () => {
    const app = await createTestBlixis({ modules: [contentModule()], database: t })
    expect((await app.request('/api/v1/entries', { method: 'POST', json: { title: 'x' } })).status).toBe(201)
  })
})
```

- **Workers-pool tests:** when `BLIXIS_TEST_DATABASE_URL` is set, `apps/api/vitest.config.ts` points the `HYPERDRIVE` binding at it and exposes `env.BLIXIS_TEST_DATABASE = 'on'`.

### Known issues

- **`pg` in the Vitest Workers pool:** the pool resolves `pg`'s `require('pg-cloudflare')` without the `workerd` export condition. It loads the empty Node stub, and queries fail with `CloudflareSocket is not a constructor`. Aliases and Vite resolve conditions don't reach this code path. Deployed Workers are unaffected, because Wrangler's bundler applies `workerd`.
  - Until the pool is fixed, database behaviour is tested in the Node pool, and `apps/api/test/database.worker.test.ts` is quarantined (`describe.skip`).
  - **The bundled Worker does run `pg` + Drizzle in `workerd` in CI:** the `e2e (admin)` job starts the API with `wrangler dev` (Wrangler's bundle, `workerd`, local Hyperdrive → the CI Postgres) and every sign-in, content-type, and entry flow of the Playwright suite queries through it. A regression in that path fails the job.
  - Real Worker plus Hyperdrive queries against Neon are verified by the staging readiness check (005.008) and, once 021.001 exists, by the post-deploy smoke.
  - Re-check the pool when upgrading `@cloudflare/vitest-pool-workers` (and at least every quarter); lift the quarantine when `require()` honours `workerd`.

## Commands

```bash
pnpm test                          # tsc -b, then all Vitest projects (database tests skipped)
pnpm test:db                       # the FULL suite: database tests against local Docker Postgres
pnpm test packages/kernel          # only tests under a path (args go to `vitest run`)
pnpm --filter @blixis-io/kernel test  # same, via the package's own script
pnpm test:watch                    # watch mode (run `tsc -b --watch` alongside for cross-package changes)
pnpm test:coverage                 # coverage report (text + html in coverage/)
pnpm --filter @blixis-io/api test     # Worker/API suites only
pnpm --filter @blixis-io/admin e2e    # Playwright (needs local API)
pnpm typecheck                     # type tests and all packages (authoritative type check)
```

## Coverage

Coverage is a signal, not a goal. `pnpm test:coverage` runs the Node and admin projects with a database and V8 coverage; the CI `coverage` job runs it on every pull request and uploads the HTML/LCOV report as the `coverage` artifact.

**Thresholds are floors** (`vitest.config.ts`), set just below the level measured on 2026-09-29 (overall about 86 % statements, 77 % branches). They catch a large untested change, not a missing test here and there. Stricter floors apply where regressions hurt most: kernel, events (outbox, dispatch, consumer), database (tenant scoping, transactions, idempotency), auth (tokens, refresh rotation and reuse), permissions, content (publishing, versions), and webhooks. Raise a floor when coverage rises; never lower one to make a change pass without saying why in the PR.

**Not measured:** `apps/api` (its tests run in the Workers pool, which V8 coverage can't instrument, and in the admin e2e job), generated code, and the vendored shadcn primitives. `tooling/smoke` and `tooling/db` are exercised against real environments, not by unit tests.

## What CI runs

| Trigger | Tests |
|---|---|
| Pull request, push to `main` | format check, lint, typecheck, `pnpm test` (with Postgres service), Workers dry-run build |
| Pull request, push to `main` | `coverage` job: `pnpm test:coverage` with thresholds, report as artifact |
| Pull request touching `packages/**` or `modules/**` | extension-contract gate (roadmap 018.004) |
| Pull request touching `apps/admin/**` | admin Playwright smoke (roadmap 019.004) |
| Deploy to staging / production | post-deploy smoke (`tooling/smoke`) |

Details: [GitHub Actions](../operations/github-actions.md).
