# 005.002 — Scaffold @blixis/database with per-request connections

## Status

```text
not-started
```

## Parent plan

[005 — Database Foundation](./_index.md)

## Objective

Create `@blixis/database` exposing `createDatabase({ connectionString })`, a request-scoped `DATABASE` service provider, connection disposal via `waitUntil`, and translation of driver errors into Blixis errors.

## Background

§13 shows `createDatabase({ connectionString: env.HYPERDRIVE.connectionString })` behind `@blixis/database`. ADR 0005 makes connection-holding services request-scoped. Modules obtain the database from services, never from env directly.

## Requirements

- Create `packages/database` with the stack from ADR 0006.
- Implement `createDatabase(options)` returning a `Database` (query-layer instance plus `close()`).
- Implement `databaseModule(options)` — a platform module (via `defineModule`) providing `DATABASE` as a request-scoped factory reading the connection string from a `HYPERDRIVE` binding (binding name configurable), disposing the client after the invocation; provides capability `blixis.database`.
- Export `DATABASE` service token with a stable type (the query-layer type or a thin wrapper — decide; document why).
- Implement `translateDatabaseError(err)`: unique violation → `ConflictError`, FK violation → `ConflictError`/`ValidationError` (document), serialisation failure → `InfrastructureError` retryable flag, connection errors → `InfrastructureError` (no connection string in message).
- Unit tests for error translation; integration tests come in 005.006.

## Architectural constraints

- Never log the connection string (§35).
- No domain repositories in this package (§13).
- `@blixis/database` may depend on Cloudflare `Hyperdrive` type only through a structural `{ connectionString: string }` type so that non-Worker tooling can reuse it.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/database/package.json
packages/database/tsconfig.json
packages/database/src/index.ts
packages/database/src/create-database.ts
packages/database/src/module.ts
packages/database/src/errors.ts
packages/database/src/errors.test.ts
```

### Modify

```text
tsconfig.json
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Proposed structure

```text
packages/database/
└── src/
    ├── index.ts
    ├── create-database.ts
    ├── module.ts          # databaseModule(): provides DATABASE (request scope)
    ├── errors.ts
    ├── transactions.ts    # 005.004
    ├── migrations/        # 005.005
    └── health.ts          # 005.008
```

## Implementation steps

1. Scaffold the package with dependencies from ADR 0006.
2. Implement connection factory and disposal.
3. Implement the platform module providing `DATABASE`.
4. Implement error translation with tests.

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```ts
export const DATABASE = createServiceToken<Database>('@blixis/database.db')
export function databaseModule(options?: { binding?: string }): BlixisModule
```

## Dependencies

Requires:

- [005.001 — Select the Postgres driver, query layer, and migration tooling](./001-select-database-stack.md)

## Acceptance criteria

- [ ] `DATABASE` resolves to a new client per request scope and is closed afterwards (unit test with fake driver).
- [ ] Error translation tests pass for unique/FK/connection errors.
- [ ] No connection string appears in any error message.

## Validation

```bash
pnpm --filter @blixis/database test
pnpm lint
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
- [ ] Package exposes no content/user-specific code.

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
