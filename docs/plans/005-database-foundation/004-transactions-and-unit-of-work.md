# 005.004 — Implement transaction helpers

## Status

```text
completed
```

## Parent plan

[005 — Database Foundation](./_index.md)

## Objective

Implement `withTransaction(db, fn)` and a `TransactionScope` bridge so domain services can run multi-statement units of work and pass the transaction to other infrastructure (notably the outbox in plan 006).

## Background

§13 requires transaction support; §32 requires domain state updates and outbox inserts in the same transaction. The contracts define an opaque `TransactionScope` (002.008) so the event bus can accept a transaction without contracts knowing the query library.

## Requirements

- Implement `withTransaction(db, fn, options?)` with isolation level option (default `read committed`), returning `fn`'s result, rolling back on throw.
- Implement `toTransactionScope(tx)` / `fromTransactionScope(scope)` converting between the query-layer transaction and the opaque contracts type (runtime brand check; throws `InfrastructureError` if a foreign scope is passed).
- Retry helper for serialisation failures (`withRetryableTransaction`) with bounded attempts — optional, only if the ADR 0006 stack makes it simple.
- Document Hyperdrive transaction-mode constraints (no session state outside transactions; use `SET LOCAL`).
- Integration tests run in 005.006; unit tests with a fake driver here.

## Architectural constraints

- No nested-transaction magic; savepoints only if the stack supports them explicitly (document).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/database/src/transactions.test.ts
packages/database/src/transactions.ts
```

### Modify

```text
apps/api/wrangler.jsonc
apps/docs/src/content/docs/concepts/database.mdx
docker-compose.yml
docs/ROADMAP.md
docs/operations/cloudflare.md
docs/operations/database.md
docs/plans/005-database-foundation/004-transactions-and-unit-of-work.md
docs/plans/005-database-foundation/_index.md
packages/database/src/errors.ts
packages/database/src/index.ts
```

### Delete

```text
None.
```

## Implementation steps

1. Implement transaction helper.
2. Implement scope conversion with brand.
3. Unit tests and documentation.

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```ts
export function withTransaction<T>(
  db: Database,
  fn: (tx: Transaction) => Promise<T>,
  options?: { isolation?: 'read committed' | 'repeatable read' | 'serializable' },
): Promise<T>
export function toTransactionScope(tx: Transaction): TransactionScope
export function fromTransactionScope(scope: TransactionScope): Transaction
```

## Dependencies

Requires:

- [005.002 — Scaffold @blixis/database with per-request connections](./002-scaffold-database-package-and-connection.md)

## Acceptance criteria

- [x] Throwing inside `fn` rolls back (verified against real Postgres in 005.006).
- [x] Passing a non-database `TransactionScope` to `fromTransactionScope` throws `InfrastructureError`.

## Validation

```bash
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
- [x] Hyperdrive constraints documented.

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

- **`Transaction` type:** derived from `Database['transaction']`'s callback parameter. `NodePgTransaction<…>` is not assignable under `exactOptionalPropertyTypes`.
- **`withTransaction` translates only real driver errors** (new `isDatabaseError`: `DrizzleQueryError`, a SQLSTATE or network code, or connection-lost messages). Application errors such as `NotFoundError` or a `TypeError` from domain code are rethrown unchanged instead of being disguised as `InfrastructureError`. This also closes the 005.002 risk of raw `DrizzleQueryError` params leaking from transactional code.
- **No nesting by type:** `withTransaction` takes a `Database` (which has `close`), not a `Transaction`. Explicit savepoints stay available via Drizzle `tx.transaction()` (documented).
- **`withRetryableTransaction` was implemented** because it was simple with Drizzle:
  - defaults to `serializable` isolation and 3 attempts;
  - reruns only on `40001`/`40P01`, read from the translated error's sanitized cause (new `databaseErrorCode`);
  - never retries lost connections (the commit outcome is unknown);
  - reruns immediately with no backoff (Workers have no reason to sleep, and tests stay deterministic).
- **`TransactionScope` bridge:**
  - `WeakMap` tx↔scope with a frozen empty object as the brand;
  - `withTransaction` marks the tx as ended in `finally`;
  - `fromTransactionScope` throws `InfrastructureError` for foreign/forged scopes and for scopes whose transaction has ended.
- **Verification:**
  - 9 unit tests with a fake driver.
  - Manual run against local Postgres 18: commit (v=1) and rollback; a real serialisation conflict between two connections was retried once (runs=2, final v=12); a stale scope was rejected.
  - Integration tests come in 005.006.
- **Local Postgres fix (from 005.003):**
  - Port 5432 was taken by another project's container on the owner's machine. Compose now maps `${BLIXIS_POSTGRES_PORT:-55432}:5432` (`wrangler.jsonc` `localConnectionString` and docs updated).
  - The compose volume `blixis_postgres-data` already existed from the pre-rebuild codebase, initialised with other credentials (auth failed). It was left untouched, and the volume is renamed `postgres18-data`.
- **Docs:** "Transactions on Hyperdrive" (transaction pooling mode; `SET LOCAL`; no session state; keep transactions short) in `docs/operations/database.md`, plus a Transactions section on the manual page.
