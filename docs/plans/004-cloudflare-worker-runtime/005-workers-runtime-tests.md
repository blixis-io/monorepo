# 004.005 — Add Workers-runtime integration tests for apps/api

## Status

```text
completed
```

## Parent plan

[004 — Cloudflare Worker Runtime](./_index.md)

## Objective

Configure `@cloudflare/vitest-pool-workers` for `apps/api` and write integration tests executing the real Worker entry inside `workerd`: health route, error format, request/correlation IDs, env validation failure, scheduled/queue dispatch smoke tests.

## Background

§36 requires API tests against Hono and infrastructure tests; running inside `workerd` catches runtime incompatibilities that Node-based tests miss (global-scope I/O, Node APIs, streams). This suite becomes the home for later end-to-end API tests.

## Requirements

- Add Workers-pool Vitest config for `apps/api` using `wrangler.jsonc`.
- Tests via `SELF.fetch` or `exports.default.fetch` (per current pool API): health, 404 error format, `x-request-id` and `x-correlation-id` propagation.
- Test env validation failure with overridden bindings.
- Smoke tests invoking `scheduled` and `queue` handlers with fake inputs.
- Record cold-start/boot timing observations in Technical notes.

## Architectural constraints

- No network access to Cloudflare required.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
apps/api/vitest.config.ts
apps/api/test/env.d.ts
apps/api/test/health.worker.test.ts
apps/api/test/entry.worker.test.ts
```

### Modify

```text
apps/api/package.json (vitest, pool, test script)
apps/api/tsconfig.json (include test)
vitest.config.ts (api project)
packages/cloudflare/src/worker-handler.ts (WorkerHandler return type)
packages/cloudflare/src/index.ts
pnpm-workspace.yaml
pnpm-lock.yaml
docs/conventions/testing.md
docs/ROADMAP.md
docs/plans/004-cloudflare-worker-runtime/_index.md
```

### Delete

```text
None.
```

## Implementation steps

1. Configure the pool (consult current Cloudflare docs).
2. Write tests.
3. Ensure `pnpm test` at root includes the suite and CI passes.

## Dependencies

Requires:

- [004.004 — Validate environment configuration at boot](./004-environment-configuration-validation.md)

## Acceptance criteria

- [x] The suite runs inside `workerd` and passes locally and in CI.
- [x] Tests assert header propagation and error format.

## Validation

```bash
pnpm --filter @blixis/api test
pnpm test
```

## Review checklist

- [x] Implementation matches this task specification (requirements and constraints).
- [x] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [x] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [x] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [x] Tests added for new behavior; validation commands pass.
- [x] Documentation matches the implementation.
- [x] `Files and folders` reflects the actual change set.
- [x] `Technical notes` updated with relevant findings.
- [x] Tests exercise the real Worker entry, not the Hono app directly.

## Completion conditions

Change the status to `completed` only when all of the following hold:

1. Implementation is finished and every requirement above is met.
2. Every acceptance criterion is checked.
3. All validation steps pass.
4. The task has passed through `review` and every review checklist item is checked.
5. `Technical notes` are updated with findings from implementation, testing, and review.
6. `Files and folders` reflects the actual change set.
7. The task checkbox and status are updated in [`docs/ROADMAP.md`](../../ROADMAP.md).
8. The parent [`_index.md`](./_index.md) task list, progress count, and plan status are updated (plan becomes `completed` only when all tasks are completed and the plan completion criteria hold).

## Technical notes

- `apps/api/vitest.config.ts`: `cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })`, project name `api`, `test/**/*.worker.test.ts`; listed in the root `test.projects`. `@cloudflare/vitest-pool-workers` 0.22.0 + Vitest 4.1.11 as `apps/api` devDependencies. `pnpm --filter @blixis/api test` runs only this project.
- Tests import the **real Worker entry** (`src/index.ts`, i.e. `createWorkerHandler(app, { envSchema })`) and call it with `cloudflare:test` helpers: liveness 200; unknown route → 404 problem with propagated `x-correlation-id` and matching `x-request-id`; invalid env (new env object with `BLIXIS_ENV: 'nonsense'`) → redacted 500 `INFRASTRUCTURE_ERROR`; queue batch without consumer → `getQueueResult` shows `retryBatch.retry = true`; cron without jobs resolves. The task mentioned `SELF.fetch`; importing the entry directly was chosen because it also exercises `queue`/`scheduled` with the pool's typed helpers.
- **Type fix:** `createWorkerHandler` now returns `WorkerHandler<TEnv>` (all three handlers non-optional) instead of `ExportedHandler<TEnv>`, whose members are optional. Test requests are cast to `Request<unknown, IncomingRequestCfProperties>` (Workers' incoming request type).
- Test typing: `apps/api/test/env.d.ts` references `@cloudflare/vitest-pool-workers/types`; the app tsconfig includes `test/` (a separate test project cannot reference a `noEmit` project, TS6310).
- Runtime: full `pnpm test` (Node + Workers projects, 180 tests) finishes in ~3 s and exits cleanly (the hanging-exit seen in the 001.002 spike does not occur). No cold-start measurement possible in the pool beyond that; production numbers come with the staging deploy (004.006).
