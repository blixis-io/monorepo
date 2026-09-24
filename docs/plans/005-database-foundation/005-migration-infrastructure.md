# 005.005 — Build the migration runner for module-owned migrations

## Status

```text
completed
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
docs/conventions/migrations.md
packages/database/src/migrations/index.ts
packages/database/src/migrations/plan.test.ts
packages/database/src/migrations/plan.ts
packages/database/src/migrations/run.test.ts
packages/database/src/migrations/run.ts
tooling/db/package.json
tooling/db/src/cli.ts
tooling/db/src/load.ts
tooling/db/src/scaffold.test.ts
tooling/db/src/scaffold.ts
tooling/db/tsconfig.json
```

### Modify

```text
README.md
apps/docs/src/content/docs/concepts/database.mdx
docs/ROADMAP.md
docs/operations/database.md
docs/plans/005-database-foundation/005-migration-infrastructure.md
docs/plans/005-database-foundation/_index.md
package.json
packages/database/package.json
pnpm-lock.yaml
tsconfig.json
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

- [x] `pnpm db:migrate` applies fixture migrations in module order; second run applies nothing.
- [x] Editing an applied migration causes `db:status`/`db:migrate` to fail with the module and migration ID.
- [x] Two concurrent `db:migrate` runs do not both apply migrations.

## Validation

```bash
docker compose up -d postgres
DATABASE_URL=postgres://... pnpm db:migrate
DATABASE_URL=postgres://... pnpm db:status
pnpm --filter @blixis/database test
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
- [x] Expand/contract policy documented for zero-downtime deploys.

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

- **No kernel change needed:** `createBlixis({ modules }).contributions.migrations` already returns module-attributed migrations in bootstrap order, synchronously, after graph validation and contribution checks (id format, duplicates). No `setup`/`boot` runs, and no bindings are needed. So there is no "contributions-only" mode.
- **Runner on raw `pg.Client` (not Drizzle):**
  - one dedicated direct connection, holding a session `pg_try_advisory_lock(0x626c786d)` (fails fast rather than waits);
  - `begin`/`commit` per migration with the tracking insert in the same transaction;
  - `transactional: false` writes the tracking row after success;
  - SQL scripts run through the simple query protocol (multi-statement allowed).
- **Tracking table is `blixis.migrations`**, in its own schema, rather than `public.blixis_migrations`. The migrator role has `CREATE` on the database but not on `public` (005.003 revokes it), and a dedicated schema keeps it out of module schemas.
  - Known gap: `blixis_app` receives default DML privileges on it too (from the migrator's default privileges). This is harmless for now; revisit in 008 (authz hardening) if needed.
- **Checksums:** SHA-256 of SQL `up` via Web Crypto. Function migrations are recorded as `function` and not verified, because their compiled source isn't stable across builds.
- **Blocking problems:** a changed applied SQL migration; a pending id lower than the module's latest applied id (append-only). Applied-but-undeclared migrations are reported as `unknown` (warning only).
- **Error handling:** errors are translated (`translateDatabaseError`), and the CLI prints `message` plus the sanitized cause (driver message and SQLSTATE). Verified that a wrong password prints `28P01` without the URL.
- **CLI (`tooling/db`):**
  - runs with Node type stripping, like `tooling/boundaries`;
  - loads the config through dynamic `import()` of a path (`--config`, default `apps/api/src/blixis.config.ts`), so there is no cross-package static import;
  - resolves paths against `INIT_CWD`, because pnpm runs scripts from the root;
  - `pnpm db:*` scripts are at the root (use `pnpm db:status`, not `pnpm -s`: pnpm 12 has no `-s`).
- **Tests:**
  - 6 `planMigrations` unit tests;
  - 2 scaffold tests;
  - 6 Postgres integration tests (module order, idempotent re-run, rollback of a failing migration including its tracking row, checksum block, non-transactional plus function migrations, lock contention), gated on `BLIXIS_TEST_DATABASE_URL`. They pass locally against Docker Postgres 18, and CI enables them in 005.006.
  - Manual end-to-end: a fixture module with 2 migrations, then `db:migrate`, `db:status`, and a re-run → "up to date".
- **Docs:** `docs/conventions/migrations.md` (rules, workflow with drizzle-kit, commands, runner internals), the manual's Migrations section, `database.md`, and the README.
