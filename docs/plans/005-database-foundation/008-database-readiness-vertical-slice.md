# 005.008 — Add the database readiness vertical slice

## Status

```text
not-started
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
packages/database/src/health.ts
```

### Modify

```text
packages/kernel/src/internal/rest.ts
packages/kernel/src/create-blixis.ts
packages/database/src/module.ts
packages/database/src/index.ts
docs/kernel/README.md
docs/operations/cloudflare.md
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

- [ ] Readiness returns 200 locally and in the Workers test pool with the test DB.
- [ ] Readiness returns 503 when the DB is unreachable, without leaking details.
- [ ] Staging readiness verified (or task blocked with a documented Blocker).

## Validation

```bash
pnpm --filter @blixis/api test
curl -s https://<staging-host>/api/v1/health/ready
```

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] CP2b evidence (latency numbers, driver behaviour) recorded in plan Technical notes.

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

No technical notes yet.
