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
| **Cross-cutting suites** | Tenant isolation, authorization matrix, event pipeline, cache isolation | Workers pool | Test Postgres | `apps/api/test/*.worker.test.ts` |
| **Contract (SDK)** | SDK against a running Workers-pool API | Workers pool / Node | Test Postgres | `packages/sdk/test/*.contract.test.ts` |
| **End-to-end (UI)** | Admin editorial flow in a browser | Playwright | Local API + test Postgres | `apps/admin/e2e/*.spec.ts` |
| **Smoke** | Deployed staging/production health and core workflow | Node script | Real environment | `tooling/smoke/` |
| **Load** | Performance targets | k6 | Staging only | `tooling/load/` |

Keep infrastructure-specific tests separate from domain tests (§36).

## How it is wired

- `pnpm test` runs `tsc -b` first: workspace packages are consumed through their built `dist/` ([ADR 0001](../decisions/0001-typescript-7-build-strategy.md)).
- Vitest only transpiles; **type checking** of tests happens in `pnpm typecheck` via each package's `tsconfig.test.json` (extends `@blixis/tsconfig/test.json`). `expectTypeOf` assertions in `*.test.ts` / `*.test-d.ts` are therefore enforced by `tsc`.
- Each package has `"test": "vitest run --root ../.. <dir>/<name>"` so `pnpm --filter <pkg> test` works.
- **Opting a package into the Workers runtime:** add `<pkg>/vitest.config.ts` with `plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })]` and `include: ['src/**/*.worker.test.ts']`, then list that config in the root `test.projects`. Keep `compatibility_date` ≤ the pool's bundled `workerd` (ADR 0002). First user: `apps/api` — see [`apps/api/vitest.config.ts`](../../apps/api/vitest.config.ts) and `apps/api/test/*.worker.test.ts`, which import the Worker entry (`src/index.ts`) and call `fetch`/`queue`/`scheduled` with `cloudflare:test` helpers (`env`, `createExecutionContext`, `createMessageBatch`, `createScheduledController`, `getQueueResult`).

## Rules

1. **Every behaviour change ships with tests** at the lowest level that can prove it (§48 Code.11).
2. **Don't mock the database for repository tests.** Repositories are tested against real Postgres. Services may use fakes for their ports.
3. **Tests are deterministic:** inject time via `RequestContext.now()`, IDs via factories; no sleeps — use fake timers or polling helpers with timeouts.
4. **Tests are isolated and parallel-safe:** each test file gets its own schema/database (helpers in `@blixis/testing`), no shared mutable state.
5. **No network** in `pnpm test`: no calls to Cloudflare, Neon, or third-party services.
6. **Test behaviour, not implementation:** assert on public results, HTTP responses, emitted events, and persisted state.
7. **Tenant and authorization coverage is mandatory:** every new tenant-scoped route is registered in the isolation suite and the authz matrix (roadmap 008.006, 009.005); CI fails otherwise.
8. **Security-sensitive code** (auth, tokens, webhooks signing, redaction) gets explicit negative tests.
9. **Fix flaky tests immediately** or quarantine them with an issue link; never retry-until-green in CI.

## Test database

- Local: Docker Postgres from `docker-compose.yml` (`docker compose up -d postgres`), matching Neon's Postgres major version.
- CI: Postgres service container.
- Helpers (`@blixis/testing`): `createTestDatabase({ modules })` applies module migrations to an isolated schema; `createTestBlixis({ modules, database: true })` wires it into the kernel.
- Workers-pool tests reach the test database through the Hyperdrive local connection string.
- Final strategy recorded in roadmap task [005.006](../plans/005-database-foundation/006-test-database-strategy.md).

## Commands

```bash
pnpm test                          # tsc -b, then all Vitest projects
pnpm test packages/kernel          # only tests under a path (args go to `vitest run`)
pnpm --filter @blixis/kernel test  # same, via the package's own script
pnpm test:watch                    # watch mode (run `tsc -b --watch` alongside for cross-package changes)
pnpm test:coverage                 # coverage report (text + html in coverage/)
pnpm --filter @blixis/api test     # Worker/API suites only
pnpm --filter @blixis/admin e2e    # Playwright (needs local API)
pnpm typecheck                     # type tests and all packages (authoritative type check)
```

## Coverage

Coverage is a signal, not a goal. Targets once the relevant packages exist:

| Area | Line coverage target |
|---|---|
| `@blixis/contracts`, `@blixis/kernel`, `@blixis/events`, `@blixis/permissions` | ≥ 90% |
| Domain modules (services, domain) | ≥ 80% |
| Adapters / infrastructure | best effort, plus Workers-pool and staging smoke tests |

CI reports coverage; it does not fail on a percentage until thresholds are agreed in roadmap plan 022.

## What CI runs

| Trigger | Tests |
|---|---|
| Pull request, push to `main` | format check, lint, typecheck, `pnpm test` (with Postgres service), Workers dry-run build |
| Pull request touching `packages/**` or `modules/**` | extension-contract gate (roadmap 018.004) |
| Pull request touching `apps/admin/**` | admin Playwright smoke (roadmap 019.004) |
| Deploy to staging / production | post-deploy smoke (`tooling/smoke`) |

Details: [GitHub Actions](../operations/github-actions.md).
