# 002.008 — Define request context and migration contracts

## Status

```text
completed
```

## Parent plan

[002 — Public Contracts](./_index.md)

## Objective

Define `RequestContext` (request/correlation IDs, actor, tenant, logger, clock), the `Logger` interface, opaque database/transaction handle types, and `MigrationDefinition` for module-owned migrations.

## Background

§35 requires correlation IDs and structured fields on every request/event; §20 makes modules own their schemas; §5 lists `migrations` on the module contract. Services need a transport-independent context object carrying actor and tenant so REST, GraphQL, queue consumers, and Workflows can call them identically (§2.4).

## Requirements

- Define `Logger` with `debug/info/warn/error(message, fields?)` and `child(fields)`; fields typed as `Readonly<Record<string, unknown>>`.
- Define `TenantContext` (`organizationId?`, `spaceId?`, `environmentId?`).
- Define `RequestContext` (`requestId`, `correlationId`, `actor`, `tenant`, `logger`, `now(): Date`, `signal?: AbortSignal`, `services: ServiceRegistry` for request-scoped resolution).
- Define `MigrationDefinition` (`id` sortable string e.g. `0001_create_entries`, `module` name filled by the kernel, `up` as SQL string or function receiving an opaque `MigrationExecutor`, optional `down`, `transactional` default true). Keep the executor opaque; `@blixis/database` implements it (plan 005).
- Define opaque `TransactionScope` brand type used by `EventBus.emit` options (plan 006) without exposing a database client.
- Tests: type tests only.

## Architectural constraints

- No database client types in contracts (§4 Avoid).
- Logger interface must not force a logging library.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/contracts/src/context.test.ts
packages/contracts/src/context.test-d.ts
```

### Modify

```text
packages/contracts/src/context.ts
packages/contracts/src/migrations.ts
packages/contracts/src/events.ts (logger in EventHandlerContext)
packages/contracts/src/events.test.ts
packages/contracts/package.json (hono peer + devDependency, used by 002.002)
pnpm-workspace.yaml (catalog: hono 4.13.9)
pnpm-lock.yaml
docs/contracts/README.md
docs/ROADMAP.md
docs/plans/002-public-contracts/_index.md
```

### Delete

```text
None.
```

## Implementation steps

1. Write logger, tenant, and request context types.
2. Write migration definition and opaque executor/transaction types.
3. Connect `EmitOptions.transaction?: TransactionScope` in events.
4. Type tests and documentation.
5. Final review of the entire contracts surface: every export documented with TSDoc; `docs/contracts/README.md` complete.

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```ts
export interface RequestContext {
  readonly requestId: string
  readonly correlationId: string
  readonly actor: Actor
  readonly tenant: TenantContext
  readonly logger: Logger
  readonly services: ServiceRegistry
  now(): Date
}
export interface MigrationDefinition {
  readonly id: string
  readonly up: string | ((db: MigrationExecutor) => Promise<void>)
  readonly down?: string | ((db: MigrationExecutor) => Promise<void>)
  readonly transactional?: boolean
}
```

## Dependencies

Requires:

- [002.002 — Define module, metadata, contribution, and lifecycle contracts](./002-define-module-contracts.md)
- [002.006 — Define event envelope, definition, and subscription contracts](./006-define-event-contracts.md)
- [002.007 — Define actor, permission, and authorization contracts](./007-define-permission-and-actor-contracts.md)

## Acceptance criteria

- [x] All §35 structured log fields can be expressed through `Logger.child` fields.
- [x] `MigrationDefinition` contains no database-client-specific types.
- [x] Every exported contracts symbol has TSDoc (checked by review or a lint rule).
- [x] `docs/contracts/README.md` lists the complete surface.

## Validation

```bash
pnpm typecheck
pnpm --filter @blixis/contracts test
pnpm build
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
- [x] Whole-package review: surface is minimal, nothing speculative, no runtime deps.

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

- **Order deviation:** implemented before 002.002 because the module contract (setup context logger, `ModuleHonoEnv` request context, `migrations`) depends on these types. The task's final step — reviewing the whole contracts surface — moves to 002.002, which is now the last task of the plan.
- `Logger` + `LogFields`, `TenantContext`, `RequestContext` (fields per task; `signal` typed as a new structural `CancellationSignal` because `AbortSignal` is not in the ES libs — contracts stay free of DOM/Workers type libraries; a platform `AbortSignal` satisfies it).
- `TransactionScope` (added in 002.006) now lives next to the other context types.
- `MigrationExecutor` is a one-method interface (`execute(sql, params?)`) — enough for SQL and function migrations without exposing a client. Added `defineMigration` with id format `NNNN_snake_case` (frozen, runtime-checked), matching the runner rules planned in 005.005.
- `EventHandlerContext` gained `logger` (planned in 002.006 notes).
- `hono` added as catalog entry, contracts devDependency, and `peerDependencies` (`^4.13.0`) in this PR because the 002.002 probe needed it; it is type-only (no runtime import).
- Type tests: opaque transaction scope, §35 log fields accepted, `RequestContext` key set, migrations free of client types.
