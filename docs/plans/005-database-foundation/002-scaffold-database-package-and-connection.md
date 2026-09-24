# 005.002 — Scaffold @blixis/database with per-request connections

## Status

```text
completed
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
apps/docs/src/content/docs/concepts/database.mdx
packages/database/package.json
packages/database/src/create-database.ts
packages/database/src/errors.test.ts
packages/database/src/errors.ts
packages/database/src/index.ts
packages/database/src/module.test.ts
packages/database/src/module.ts
packages/database/tsconfig.json
packages/database/tsconfig.test.json
```

### Modify

```text
apps/docs/astro.config.mjs
docs/ROADMAP.md
docs/plans/005-database-foundation/002-scaffold-database-package-and-connection.md
docs/plans/005-database-foundation/_index.md
pnpm-lock.yaml
pnpm-workspace.yaml
tsconfig.json
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

- [x] `DATABASE` resolves to a new client per request scope and is closed afterwards (unit test with fake driver).
- [x] Error translation tests pass for unique/FK/connection errors.
- [x] No connection string appears in any error message.

## Validation

```bash
pnpm --filter @blixis/database test
pnpm lint
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
- [x] Package exposes no content/user-specific code.

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

- **Connection: a per-scope `pg.Pool`, not a `pg.Client`.**
  - `Client.connect()` is async, but service factories must be synchronous (ADR 0005). A `Pool` is created synchronously and connects on the first query.
  - `close()` calls `pool.end()` and is idempotent. The `DATABASE` factory disposes the database when the scope ends (`waitUntil` on Workers).
- **Default `maxConnections: 4`.**
  - Workers allow six simultaneous open connections per invocation.
  - With `max: 1`, a query issued through `db` while a transaction holds the only connection would hang forever.
  - Hyperdrive does the real pooling to Neon.
- **`DATABASE` is Drizzle's own type** (`NodePgDatabase` plus `close()`), not a wrapper. Repositories need the full typed builder, and a wrapper would leak Drizzle types anyway. Modules add `drizzle-orm` (catalog) for `pgSchema`, operators, and `sql`.
- **Binding access:** the binding is read from `ServiceResolutionContext.bindings` as a structural `{ connectionString }`, so there is no Workers type dependency. A missing binding throws an `InfrastructureError` that names the binding, never a value.
- **Error translation:**
  - Unique → `ConflictError` (`details.constraint`).
  - FK → `ConflictError`, documented as a state conflict.
  - 40001/40P01/55P03/57014/57P0x, classes 08/53, ECONN*/ETIMEDOUT/EPIPE, and "Connection terminated" → retryable `InfrastructureError`.
  - Everything else → non-retryable `InfrastructureError`.
  - `DrizzleQueryError` is unwrapped. Its message contains the query **params** (possible PII), so the `cause` is a sanitized copy: code/constraint/table/schema/column, a redacted message, and no `detail` (it holds row values).
- **Follow-up risk:** an untranslated `DrizzleQueryError` reaching the kernel's 5xx logging or Sentry would include params. 005.004's transaction/query helpers should translate automatically. Consider an extra Sentry `beforeSend` filter in 020.002.
- **`types: ["node"]`:** `@types/pg` references Node built-ins, so the package's tsconfig adds `types: ["node"]` (`@types/node` is a dev dependency). At runtime, Workers provide them via `nodejs_compat`.
- **Verification:**
  - Unit tests: 11 error-translation cases and 4 module/scope cases.
  - Manual check against `postgres:18-alpine`: transaction, unique violation → `ConflictError { constraint: t_pkey }`, wrong password → non-retryable `InfrastructureError` with no credentials in the message, double `close()`.
  - Integration tests against Postgres come in 005.006.
- **Docs:** manual concept page `concepts/database.mdx` plus the TypeDoc reference for `@blixis/database`.
