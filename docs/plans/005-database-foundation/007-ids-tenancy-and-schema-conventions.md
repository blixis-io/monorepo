# 005.007 — Define ID, timestamp, tenancy, and cross-module schema conventions

## Status

```text
not-started
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
docs/decisions/0007-ids-and-tenancy-conventions.md
docs/conventions/database.md
packages/database/src/ids.ts
packages/database/src/ids.test.ts
packages/database/src/tenancy.ts
packages/database/src/tenancy.test.ts
```

### Modify

```text
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

- [ ] ADR 0007 accepted and answers every bullet.
- [ ] `newId()` produces valid UUIDv7 values in Workers runtime (Workers-pool test or documented check).
- [ ] Conventions doc includes a canonical tenant-scoped table example.

## Validation

```bash
pnpm --filter @blixis/database test
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
- [ ] Rules are enforceable in code review and tests (plan 008 adds isolation tests).

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
