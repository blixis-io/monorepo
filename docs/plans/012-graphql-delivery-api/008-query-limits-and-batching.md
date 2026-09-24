# 012.008 — Enforce query limits and verify batching

## Status

```text
not-started
```

## Parent plan

[012 — GraphQL Platform & Content Delivery API](./_index.md)

## Objective

Protect the delivery API with depth, complexity/cost, alias, and page-size limits, request body size limits, and verify DataLoader-style batching keeps database queries bounded.

## Background

Public GraphQL endpoints are a denial-of-service vector; §47 excludes a custom engine, so use Yoga/Envelop plugins where Workers-compatible.

## Requirements

- Limits: max depth, max aliases, max tokens/cost, max `limit` per collection, max request body size, introspection disabled in production for delivery keys (configurable).
- Use Workers-compatible Envelop/Yoga plugins or small custom validation rules.
- Query-count test harness: execute representative queries and assert maximum SQL statements per request.
- Document limits in `docs/api/delivery.md` (initial delivery API docs).

## Architectural constraints

- Limits configurable via module options with safe defaults.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/graphql/src/limits.ts
packages/graphql/src/limits.test.ts
docs/api/delivery.md
apps/api/test/delivery-limits.worker.test.ts
```

### Modify

```text
packages/graphql/src/server.ts
packages/graphql/src/module.ts
```

### Delete

```text
None.
```

## Implementation steps

1. Implement/configure limits.
2. Query-count harness.
3. Documentation.

## Dependencies

Requires:

- [012.007 — Implement preview (draft) delivery](./007-preview-delivery.md)

## Acceptance criteria

- [ ] Over-deep and over-complex queries rejected with clear errors.
- [ ] Representative queries stay within documented SQL statement budgets.

## Validation

```bash
pnpm --filter @blixis/graphql test
pnpm --filter @blixis/api test
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
- [ ] Limits documented for SDK users.

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
