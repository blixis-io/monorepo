# 013.001 — Measure delivery baseline and decide the caching strategy

## Status

```text
not-started
```

## Parent plan

[013 — Delivery Caching & Invalidation](./_index.md)

## Objective

Measure uncached delivery performance on staging and record ADR 0012 defining cache layers, keys, TTLs, invalidation mechanism, and whether KV is justified.

## Background

§34 lists five layers and forbids premature KV caching. Measurements make the decision evidence-based.

## Requirements

- Load a representative dataset into staging (seed script) and measure p50/p95 latency and DB time for typical delivery queries (cold/warm isolate, Hyperdrive query caching behaviour noted).
- Evaluate invalidation options: versioned keys with KV stamp; Cache API purge limitations (per-colo); zone purge by tag/prefix (requires API token and custom domain — note trade-off); TTL-only.
- Decide TTLs, stale-while-revalidate usage, key composition, APQ/GET support, and maximum staleness bound.
- Write ADR 0012 and `docs/operations/caching.md` draft.

## Architectural constraints

- Evidence first (§34).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/decisions/0012-delivery-caching.md
docs/operations/caching.md
tooling/smoke/src/seed-delivery.ts
tooling/smoke/src/measure-delivery.ts
```

### Modify

```text
tooling/smoke/package.json
```

### Delete

```text
None.
```

## Implementation steps

1. Seed staging.
2. Measure and record.
3. Evaluate options against Cloudflare docs.
4. Write ADR and doc.

## Dependencies

Requires:

- [012.008 — Enforce query limits and verify batching](../012-graphql-delivery-api/008-query-limits-and-batching.md)

## Acceptance criteria

- [ ] ADR 0012 accepted with measured numbers and an explicit staleness bound.

## Validation

- Review ADR numbers reproducible via `tooling/smoke` scripts.

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] KV use (if any) justified against §14 checklist.

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
