# 013.005 — Review cache correctness and document operations

## Status

```text
not-started
```

## Parent plan

[013 — Delivery Caching & Invalidation](./_index.md)

## Objective

Complete `docs/operations/caching.md`, add a regression suite covering tenant isolation of cached responses, and record the final measurements.

## Background

Cache bugs leak data across tenants or serve stale content; they deserve an explicit review step before delivery is considered done (checkpoint CP6).

## Requirements

- Tests: two spaces with identical queries never share cache entries; different locales separate; revoked delivery key cannot read cached responses (auth runs before cache lookup).
- Document troubleshooting (headers, forcing bypass for debugging with authorised header, stamp inspection).
- Record staging latency before/after caching in plan Technical notes.

## Architectural constraints

- Authentication and authorization must execute before cache lookup.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
apps/api/test/cache-isolation.worker.test.ts
```

### Modify

```text
docs/operations/caching.md
docs/ROADMAP.md
```

### Delete

```text
None.
```

## Implementation steps

1. Isolation tests.
2. Docs completion.
3. Measurements and CP6 note.

## Dependencies

Requires:

- [013.004 — Invalidate delivery caches from content events](./004-event-driven-invalidation.md)

## Acceptance criteria

- [ ] Isolation tests pass.
- [ ] CP6 recorded in ROADMAP.

## Validation

```bash
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
- [ ] Auth-before-cache verified by test.

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
