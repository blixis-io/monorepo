# 013.001 — Measure delivery baseline and decide the caching strategy

## Status

```text
completed
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
docs/operations/caching.md (draft)
```

### Modify

```text
docs/decisions/README.md
docs/ROADMAP.md (decision register)
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

- [x] ADR 0012 accepted with measured numbers and an explicit staleness bound.

## Validation

- Review ADR numbers reproducible via `tooling/smoke` scripts.

## Review checklist

- [x] Implementation matches this task specification (requirements and constraints).
- [x] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [x] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [x] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [x] Tests added for new behavior; validation commands pass.
- [x] Documentation matches the implementation.
- [x] `Files and folders` reflects the actual change set.
- [x] `Technical notes` updated with relevant findings.
- [x] KV use (if any) justified against §14 checklist.

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

- **Baseline** (staging, 2026-09-26, 20 runs each, from the Netherlands):

  | Request | p50 | p95 | min |
  |---|---|---|---|
  | `GET /api/v1/health` (network only) | 87 ms | 426 ms | 57 ms |
  | GraphQL, page by slug | 238 ms | 707 ms | 193 ms |
  | GraphQL, 20 pages with references, blocks and rich text | 279 ms | 424 ms | 224 ms |

  About 150–190 ms is database round trips.
- **Seeding:** the "seed script" requirement is met with a disposable dataset: 3 content types, 5 authors, 20 pages with blocks and rich text, created through the API, measured and cleaned up. It was run from the session's scratchpad, not committed.
- **Decision (ADR 0012):**
  - versioned cache keys with a per-space **content stamp in Postgres**, bumped by event subscriptions and remembered for 2 s per isolate. KV is rejected: eventual consistency and new infrastructure for no measured gain;
  - L1 isolate memory plus L2 Cache API (custom domains only);
  - only unrestricted delivery keys, query operations, published reads, and error-free responses are cached;
  - key lookups are remembered for 30 s;
  - ETag/304, and `Cache-Control: public, max-age=0, must-revalidate`;
  - GET queries plus APQ (`@graphql-yoga/plugin-apq`, isolate store);
  - staleness bound: typically under 10 s, worst case ~70 s.
- **Staging has no custom domain:** L2 is expected to have no effect on `workers.dev`. 013.003 measures that with `x-blixis-cache` headers.
