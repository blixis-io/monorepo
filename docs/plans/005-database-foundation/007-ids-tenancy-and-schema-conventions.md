# 005.007 — Define ID, timestamp, tenancy, and cross-module schema conventions

## Status

```text
completed
```

## Parent plan

[005 — Database Foundation](./_index.md)

## Objective

Record ADR 0007 defining primary key strategy, public ID format, timestamps, soft-delete policy, tenancy columns and scoping helpers, schema namespacing per module, and the cross-module foreign key rule; implement the generic helpers in `@blixis/database`.

## Background

§31 requires multi-tenancy from the start: most records belong to `organizationId`/`spaceId`, and IDs alone must never be trusted. §20 requires module-owned schemas. Consistent conventions prevent every domain plan re-deciding these.

## Requirements

- ADR 0007 decides:
  - primary keys (recommendation: UUIDv7 generated in application code via Web Crypto for sortable IDs; optional type-prefixed public IDs like `ent_…` — decide);
  - timestamps (`created_at`, `updated_at` as `timestamptz`, UTC);
  - soft delete policy (default: hard delete with events + audit later, unless a module needs recovery);
  - tenancy columns (`organization_id`, `space_id`, `environment_id` where applicable) and mandatory composite indexes;
  - module table namespacing (Postgres schema per module vs. prefix);
  - cross-module FKs (recommendation: allowed only toward modules in `meta.requires`);
  - optional row-level security (recommendation: not in MVP; app-level scoping + tests; revisit in plan 020).
- Implement helpers: `newId()` (UUIDv7), `scoped(query, tenant)` or equivalent predicate builder for the chosen query layer, `requireTenant(ctx)`.
- Document in `docs/conventions/database.md`.
- Unit tests for ID generation (monotonicity within ms, format).

## Architectural constraints

- ID generation uses Web Crypto only.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/conventions/database.md
docs/decisions/0007-ids-and-tenancy-conventions.md
packages/database/src/ids.test.ts
packages/database/src/ids.ts
packages/database/src/tenancy.test.ts
packages/database/src/tenancy.ts
```

### Modify

```text
README.md
apps/docs/src/content/docs/concepts/database.mdx
docs/ROADMAP.md
docs/decisions/README.md
docs/plans/005-database-foundation/007-ids-tenancy-and-schema-conventions.md
docs/plans/005-database-foundation/_index.md
packages/database/src/index.ts
```

### Delete

```text
None.
```

## Implementation steps

1. Write ADR 0007.
2. Implement ID and tenancy helpers.
3. Write conventions doc with examples for module authors.

## Dependencies

Requires:

- [005.004 — Implement transaction helpers](./004-transactions-and-unit-of-work.md)

## Acceptance criteria

- [x] ADR 0007 accepted and answers every bullet.
- [x] `newId()` produces valid UUIDv7 values in Workers runtime (Workers-pool test or documented check).
- [x] Conventions doc includes a canonical tenant-scoped table example.

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
- [x] Rules are enforceable in code review and tests (plan 008 adds isolation tests).

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

- **The owner chose plain UUIDv7** (no typed prefixes). Everything else follows the roadmap recommendations and is recorded in ADR 0007.
- **`newId()`:** RFC 9562 method 1.
  - 48-bit milliseconds, a 12-bit counter in `rand_a`, and 62 random bits from Web Crypto.
  - When the millisecond changes, the counter restarts at a random value from 0 to 511, leaving room for 3.5k IDs in the same millisecond. On overflow, the timestamp is bumped by one.
  - The clock never goes backwards (`lastMs` is kept).
  - Tests cover 10,000 IDs under a frozen clock (as in Workers) and a clock moved backwards.
  - No Web Crypto calls at module scope (Workers forbid them in global scope).
- **Column helpers:**
  - `idColumn()` is `uuid primary key` with `$defaultFn(newId)`: the app generates IDs, with no DB default.
  - `timestamps()` gives `timestamptz` with `defaultNow()`; `updated_at` adds `$onUpdate`, which only applies through the query builder.
  - `tenantColumns({ environment? })` gives `uuid not null` columns.
- **`tenantScope`:**
  - Its type (`TenantTable`, with all tenant keys optional) rejects tables without tenant columns at compile time (TS weak-type check), and it also throws at runtime.
  - It throws `ForbiddenError` for any tenant column the tenant has no value for (fails closed).
  - The SQL output is asserted with `PgDialect.sqlToQuery`.
- **`requireTenant`** returns a narrowed type (`Required<Pick<TenantContext, K>>`) or throws `ForbiddenError` naming the missing keys.
- **Docs:**
  - ADR 0007 (and decision D8 in the ROADMAP marked as decided);
  - `docs/conventions/database.md`: table declaration rules, always-scoped queries, deletes, cross-module rules, RLS;
  - the manual section "IDs and tenancy";
  - the README link.
