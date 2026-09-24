# 013.004 — Invalidate delivery caches from content events

## Status

```text
not-started
```

## Parent plan

[013 — Delivery Caching & Invalidation](./_index.md)

## Objective

Subscribe to `entry.published`, `entry.unpublished`, `entry.deleted`, `content-type.updated/deleted`, and `locale.*` events and bump the relevant version stamps (and/or purge) idempotently.

## Background

§34 event-driven invalidation via Queue; §33 idempotent consumers.

## Requirements

- Subscription in the caching owner module; bump `(space, environment)` stamp (coarse invalidation in MVP; finer granularity deferred).
- Idempotent handler (006.006) — bumping twice is harmless but still record processing.
- Measure publish-to-fresh latency on staging; compare to ADR bound.
- Update `docs/contracts/events.md` consumers column.

## Architectural constraints

- Invalidation failures retry via queue; never silently dropped.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/graphql/src/invalidation.ts
packages/graphql/src/invalidation.test.ts
apps/api/test/cache-invalidation.worker.test.ts
```

### Modify

```text
packages/graphql/src/module.ts
docs/contracts/events.md
docs/operations/caching.md
```

### Delete

```text
None.
```

## Implementation steps

1. Subscription and stamp bump.
2. Tests (publish → next query MISS with new content).
3. Staging measurement.

## Dependencies

Requires:

- [013.003 — Cache published delivery responses](./003-delivery-response-caching.md)

## Acceptance criteria

- [ ] After publish, the next delivery query returns updated content within the documented bound (Workers-pool test uses immediate stamps).

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
- [ ] Staleness bound verified and documented.

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
