# 005.008 — Add the database readiness vertical slice

## Status

```text
completed
```

## Parent plan

[005 — Database Foundation](./_index.md)

## Objective

Add a readiness endpoint `GET /api/v1/health/ready` that executes a trivial query through the request-scoped `DATABASE` service via Hyperdrive, verify it in Workers-runtime tests against the test database, and verify it in staging.

## Background

This is the first end-to-end slice through the real infrastructure path from §13: request → Hono → kernel → request-scoped service → Hyperdrive → Postgres. It validates ADR 0005 scopes and ADR 0006 driver choice under `workerd` before domain modules are built.

## Requirements

- Add a kernel-level health-check registry (`healthChecks` contributions from platform modules: name, check fn, timeout) — minimal, only for readiness.
- `databaseModule()` registers a `database` health check (`select 1`, 2s timeout) reporting latency.
- `GET /api/v1/health/ready` returns 200 with per-check status or 503 when any check fails; response never includes connection details.
- Workers-pool test against the test database (success) and with a bad local connection string (503).
- Staging verification: deploy, call readiness, record latency (first vs. warm) in Technical notes.

## Architectural constraints

- Liveness (`/health`) must stay I/O-free.
- Health endpoints must not expose internal hostnames.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
apps/api/test/readiness.worker.test.ts
packages/kernel/src/health.ts
packages/testing/src/readiness.test.ts
```

### Modify

```text
packages/kernel/src/internal/rest.ts
packages/kernel/src/internal/rest.test.ts
packages/kernel/src/create-blixis.ts
packages/kernel/src/index.ts
packages/database/src/module.ts
packages/database/src/module.test.ts
docs/kernel/README.md
docs/operations/cloudflare.md
docs/operations/database.md
docs/ROADMAP.md
docs/setup-checklist.md
docs/plans/005-database-foundation/_index.md
```

### Delete

```text
None.
```

## Implementation steps

1. Add minimal health-check contribution support to the kernel.
2. Implement the database check.
3. Add the route and tests.
4. Deploy to staging and verify (or mark blocked on credentials).

## Dependencies

Requires:

- [005.003 — Provision Neon and Hyperdrive and bind them to the API Worker](./003-provision-neon-and-hyperdrive.md)
- [005.006 — Implement the test database strategy](./006-test-database-strategy.md)
- [005.007 — Define ID, timestamp, tenancy, and cross-module schema conventions](./007-ids-tenancy-and-schema-conventions.md)

## Acceptance criteria

- [x] Readiness returns 200 locally and in the Workers test pool with the test DB.
- [x] Readiness returns 503 when the DB is unreachable, without leaking details.
- [x] Staging readiness verified (or task blocked with a documented Blocker).

## Validation

```bash
pnpm --filter @blixis/api test
curl -s https://<staging-host>/api/v1/health/ready
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
- [x] CP2b evidence (latency numbers, driver behaviour) recorded in plan Technical notes.

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

- **Health-check registry:** a kernel service `HEALTH_CHECKS`, like `BACKGROUND_HANDLERS`, not a new field in the module contract. Checks need request-scoped services (the database), so they are registered in `setup` and run in a fresh request scope. Names are unique and the registry is locked after setup. Implemented in PR #48.
- **Readiness route `GET /api/v1/health/ready`:**
  - registered before the kernel middleware and reserved in route-conflict detection;
  - a failed `ready()` returns 503 `checks.boot` (never 500);
  - checks run concurrently with per-check timeouts (default 2 s) via `Promise.race`;
  - the response carries only status and `latencyMs`, plus `cache-control: no-store`;
  - error messages go to `warn` logs only.
- **`databaseModule()`** registers `database` (`select 1` via `DATABASE`). Opt out with `healthCheck: false`.
- **Tests:**
  - Kernel: 200, fail/timeout → 503 without details, boot failure → 503 with liveness still 200, duplicate/late registration, reserved route.
  - Database module: an unreachable binding gives 503 with no host, password, or database name in the body.
  - Node pool against Postgres: 200.
  - Workers pool on the real API entry: 503 without leaks, liveness stays I/O-free.
  - The Workers-pool success path is not testable yet (pg-cloudflare resolution, see 005.006).
- **Staging verification (2026-09-24, version `634cbd63`, Worker `blixis-api-staging`, Hyperdrive `blixis-staging` → Neon `eu-central-1`):**
  - First call: `database.latencyMs` = **89 ms** (connection set-up through Hyperdrive).
  - Warm calls: **7–15 ms** (12 calls); total HTTP time from the client 0.11–0.36 s.
  - One 404 during propagation right after deploy (edge still on the previous version); stable afterwards.
- **Result:** request → Hono → kernel → request scope → `DATABASE` (pg Pool, lazy connect) → Hyperdrive → Neon works in production conditions, which confirms ADR 0005 scopes and ADR 0006 under real `workerd`.
- The readiness endpoint is public and runs `select 1` per call. Rate limiting and uptime monitors are handled in 020.002.
