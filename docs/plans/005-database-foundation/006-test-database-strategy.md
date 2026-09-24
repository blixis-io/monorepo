# 005.006 — Implement the test database strategy

## Status

```text
not-started
```

## Parent plan

[005 — Database Foundation](./_index.md)

## Objective

Decide and implement how tests get an isolated real Postgres database — locally and in CI — and add helpers to `@blixis/testing` so module integration tests and Workers-runtime tests can run migrations and reset state.

## Background

§36 separates unit tests (no DB) from module integration and infrastructure tests (real Postgres). Mocking the database for repository tests hides SQL bugs. Options: local Docker Postgres + CI service container; Neon branch per CI run; PGlite (Node only, not `workerd`). The decision is recorded in ADR 0006 addendum or a short section in `docs/conventions/testing.md`.

## Requirements

- Decide the strategy (recommendation: Docker Postgres locally and as a CI service container for speed and determinism; Neon branch per run only for staging smoke tests).
- `@blixis/testing` additions:
  - `createTestDatabase({ modules })`: creates an isolated schema or database per test file/worker, applies module migrations via the runner, returns a `Database` and cleanup;
  - `truncateModuleTables(db, moduleNames)` or transactional rollback per test — choose the faster reliable option;
  - `createTestBlixis` option `database: true` wiring `DATABASE` overrides to the test database.
- Workers-pool tests: configure Hyperdrive local connection string for the test database in `apps/api` Vitest config.
- CI: add Postgres service container and `DATABASE_URL` for tests.
- Enable integration tests written in 005.004/005.005.

## Architectural constraints

- Tests must be parallel-safe (isolation per worker).
- No Neon credentials required for `pnpm test`.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/testing/src/database.ts
packages/testing/src/database.test.ts
```

### Modify

```text
packages/testing/src/index.ts
packages/testing/src/create-test-blixis.ts
packages/testing/package.json
apps/api/vitest.config.ts
.github/workflows/ci.yml
docs/conventions/testing.md
docs/decisions/0006-database-stack.md
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Decide and document the strategy.
2. Implement helpers.
3. Wire CI service container.
4. Enable integration tests for transactions and migrations.

## Dependencies

Requires:

- [005.005 — Build the migration runner for module-owned migrations](./005-migration-infrastructure.md)

## Acceptance criteria

- [ ] `pnpm test` runs database integration tests locally with Docker Postgres and in CI.
- [ ] Parallel test files do not interfere (verified by running with max workers).
- [ ] Transaction rollback test (from 005.004) passes against real Postgres.

## Validation

```bash
docker compose up -d postgres
pnpm test
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
- [ ] Test runtime impact recorded in Technical notes.

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
