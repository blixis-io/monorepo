# 005.005 — Build the migration runner for module-owned migrations

## Status

```text
not-started
```

## Parent plan

[005 — Database Foundation](./_index.md)

## Objective

Implement migration execution for migrations contributed by modules (via the kernel contribution registry), a per-module tracking table, and a Node-based CLI (`tooling/db`) to apply, inspect, and scaffold migrations against a direct (non-Hyperdrive) connection.

## Background

§20 makes each module own its schema and migrations; §5 adds `migrations` to the module contract; §13 requires migration support. Migrations must not run inside the request path of the Worker (DDL on first request is unsafe and slow); they run from tooling in CI/CD (plan 021) or manually.

## Requirements

- `@blixis/database/migrations`: implement `planMigrations(contributions, applied)` and `applyMigrations(db, plan)`; tracking table `blixis_migrations(module text, id text, checksum text, applied_at timestamptz, primary key (module, id))`.
- Order: modules in kernel dependency order; within a module by migration ID.
- Checksum verification: fail if an applied migration's content changed.
- Each migration in its own transaction unless `transactional: false`.
- Advisory lock (transaction-scoped or on a direct connection, not via Hyperdrive) to prevent concurrent runners.
- `tooling/db` CLI (Node): loads `apps/api/src/blixis.config.ts` module list (explicit import, §2.3), boots the kernel far enough to read contributions (no Worker env needed), and supports `migrate`, `status`, `new <module> <name>`.
- Root scripts `db:migrate`, `db:status`, `db:new`.
- Connection string from `DATABASE_URL` env var (direct Neon/local URL, migration role).
- Tests: fixture modules with migrations against the test database (005.006); checksum mismatch; ordering across modules; idempotent re-run.

## Architectural constraints

- Migrations never run automatically inside the API Worker.
- The CLI is dev/CI tooling; it may use Node APIs but must import modules only via package names.
- If the kernel needs a "contributions-only" boot mode for tooling, add it without executing setup side effects that require env (document).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/database/src/migrations/plan.ts
packages/database/src/migrations/apply.ts
packages/database/src/migrations/tracking.sql (or equivalent in code)
packages/database/src/migrations/migrations.test.ts
tooling/db/package.json
tooling/db/tsconfig.json
tooling/db/src/cli.ts
docs/conventions/migrations.md
```

### Modify

```text
packages/database/src/index.ts
packages/database/package.json
packages/kernel/src/create-blixis.ts (contributions-only mode, if needed)
package.json
tsconfig.json
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Implement planning, checksum, tracking, and apply.
2. Add advisory locking.
3. Build the CLI and root scripts.
4. Write `docs/conventions/migrations.md` (naming, backwards-compatible migration policy: expand/contract, no destructive change in the same release as code that stops using a column).
5. Tests against real Postgres (after 005.006 exists — if ordering requires, write tests now and enable them in 005.006).

## Dependencies

Requires:

- [005.004 — Implement transaction helpers](./004-transactions-and-unit-of-work.md)

## Acceptance criteria

- [ ] `pnpm db:migrate` applies fixture migrations in module order; second run applies nothing.
- [ ] Editing an applied migration causes `db:status`/`db:migrate` to fail with the module and migration ID.
- [ ] Two concurrent `db:migrate` runs do not both apply migrations.

## Validation

```bash
docker compose up -d postgres
DATABASE_URL=postgres://... pnpm db:migrate
DATABASE_URL=postgres://... pnpm db:status
pnpm test --filter @blixis/database
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
- [ ] Expand/contract policy documented for zero-downtime deploys.

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
