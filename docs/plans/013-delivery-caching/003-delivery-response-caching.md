# 013.003 — Cache published delivery responses

## Status

```text
not-started
```

## Parent plan

[013 — Delivery Caching & Invalidation](./_index.md)

## Objective

Add caching to the GraphQL delivery path: compute cache keys, serve hits, store cacheable misses, respect preview/no-store rules, and support GET + APQ.

## Background

§34 published delivery responses are cache candidates. Cache keys include the version stamp so that invalidation is a stamp bump (per ADR 0012).

## Requirements

- Delivery caching plugin/middleware in `@blixis/graphql` using the ports.
- Key: hash of `(space, environment, locale, normalised document + variables, operationName, key kind, stamp)`; exclude credentials themselves from keys (use key kind + space).
- Only cache: delivery-key actors, successful responses without errors, `query` operations.
- Headers: `Cache-Control: public, max-age=…, stale-while-revalidate=…` for CDN when safe; `x-blixis-cache: HIT|MISS|BYPASS` for debugging.
- APQ support (hash lookup) and GET queries.
- Tests: hit/miss, preview bypass, error responses not cached.

## Architectural constraints

- Must not cache responses containing errors or partial data.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/graphql/src/cache.ts
packages/graphql/src/cache.test.ts
apps/api/test/delivery-cache.worker.test.ts
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

1. Key computation.
2. Plugin/middleware.
3. APQ/GET.
4. Tests.

## Dependencies

Requires:

- [013.002 — Implement Cache API and KV adapters](./002-cache-and-kv-adapters.md)

## Acceptance criteria

- [ ] Second identical delivery query is a HIT; preview is always BYPASS.

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
- [ ] Cache key excludes secrets.

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
