# 005.004 — Implement transaction helpers

## Status

```text
not-started
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
packages/database/src/transactions.ts
packages/database/src/transactions.test.ts
```

### Modify

```text
packages/database/src/index.ts
docs/operations/database.md
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

- [ ] Throwing inside `fn` rolls back (verified against real Postgres in 005.006).
- [ ] Passing a non-database `TransactionScope` to `fromTransactionScope` throws `InfrastructureError`.

## Validation

```bash
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
- [ ] Hyperdrive constraints documented.

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
