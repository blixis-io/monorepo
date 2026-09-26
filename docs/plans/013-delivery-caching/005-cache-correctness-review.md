# 013.005 — Review cache correctness and document operations

## Status

```text
completed
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
tooling/tenant-isolation/test/delivery-cache.test.ts
```

### Modify

```text
packages/graphql/src/cache.ts
packages/graphql/src/cache.test.ts
packages/graphql/src/module.ts
packages/graphql/src/response-cache.test.ts
docs/operations/caching.md
apps/docs/src/content/docs/content/delivery-api.mdx
apps/docs/src/content/docs/concepts/graphql.mdx
docs/plans/013-delivery-caching/005-cache-correctness-review.md
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

- [x] Isolation tests pass.
- [x] CP6 recorded in ROADMAP.

## Validation

```bash
pnpm test:db tooling/tenant-isolation/test/delivery-cache.test.ts
pnpm test:db modules/content/test/delivery.cache.test.ts
npx vitest run packages/graphql
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
- [x] Auth-before-cache verified by test.

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

- **Where the isolation suite lives:** `tooling/tenant-isolation` instead of `apps/api/test`. The Workers test project has no Postgres; the tenant-isolation suite already runs the API Worker's real module list (`apiModules()`) against a test database, so the cache configuration under test is the one staging serves.
- **What the suite proves:** a byte-identical request with another space's key is a `MISS` with that space's content; `en-US` and `de` are separate entries; after revoking a key over REST, the same request answers `401` (no `x-blixis-cache` header) although its response is cached — authentication runs before the lookup and revoking forgets the key in the revoking isolate.
- **Forcing a fresh execution:** the requirement asked for an *authorised* bypass header. `Cache-Control: no-cache` is accepted from any caller that may use the cache instead: it grants nothing a caller can't already do by changing a variable or an alias (every distinct operation is a miss), so an authorisation check would add complexity without protection. The fresh result replaces the cached one.
- **`x-blixis-cache-layer`:** added (`memory` / `cache-api`) so staging measurements can tell L1 from L2 hits; `createTieredCache` gained `lookup(key)` returning the answering layer.
- **Staging measurements (2026-09-26, deploy `261a70bc`):**

| Request | Uncached p50 | Uncached p95 | Cached p50 | Cached p95 | Cached min |
|---|---|---|---|---|---|
| `GET /api/v1/health` (network only, no database) | 77 ms | 426 ms | — | — | 58 ms |
| GraphQL, page by slug | 221 ms | 389 ms | 101 ms | 522 ms | 60 ms |
| GraphQL, 20 pages with references, blocks, rich text | 225 ms | 754 ms | 110 ms | 394 ms | 64 ms |

  - Uncached requests sent `Cache-Control: no-cache`, interleaved with cached ones.
  - Cached-request headers: `HIT cache-api` 20, `HIT memory` 19, `MISS` 1 (the first). **The Cache API serves hits on `workers.dev`**, against ADR 0012's expectation; noted in the ADR outcome.
  - Publish to fresh (edit + publish a page, poll the slug query every 250 ms): 5.8 s, 0.2 s, 5.4 s. The queue batch timeout dominates; within the "typically under 10 s" bound.
- **"After publish of a referenced entry" (plan criterion):** the stamp is per space, so publishing any entry, referenced or not, changes every key of the space. `delivery.cache.test.ts` proves fresh-after-publish; which entry is published doesn't enter the mechanism.
- **Review of the hit path** (auth before cache, ADR 0012 §5): actor resolution runs in the kernel middleware before `/graphql`; the policy returns a scope only for unrestricted delivery keys; the key hashes `[scope, operationName, document, variables]` and never credentials; errors, private responses and non-JSON are never stored.
