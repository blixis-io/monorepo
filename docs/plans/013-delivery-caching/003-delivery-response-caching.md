# 013.003 — Cache published delivery responses

## Status

```text
completed
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
packages/graphql/src/response-cache.ts
packages/graphql/src/response-cache.test.ts
```

### Modify

```text
packages/graphql/src/module.ts
packages/graphql/src/index.ts
packages/graphql/package.json (@graphql-yoga/plugin-apq)
pnpm-workspace.yaml (catalog)
apps/api/src/blixis.config.ts (memory L1 + Cache API L2)
pnpm-lock.yaml
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

- [x] Second identical delivery query is a HIT; preview is always BYPASS.

## Validation

```bash
pnpm --filter @blixis/api test
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
- [x] Cache key excludes secrets.

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

- **`GRAPHQL_CACHE_POLICY`** (request-scoped, optional) is the owner module's decision: it returns a **scope string** that must change whenever the content it could return changes (content: `space:env:stamp`, 013.004), or `undefined` to bypass. Policy errors bypass, and execution then reports the real error (e.g. an unknown space).
- **Route flow:**
  1. policy → `readOperation` (GET query string or POST JSON; APQ hash);
  2. `cacheKey` = SHA-256 of canonical JSON `[scope, operationName, stripIgnoredCharacters(document) or 'apq:<hash>', variables with sorted keys]`;
  3. tiered lookup: **HIT** replays the body with `ETag`, and `If-None-Match` gives `304`;
  4. a **MISS** executes and stores only when `storable`: status 200, JSON, no `errors`, and no `private` `Cache-Control`. A preview response (012.007) is therefore never stored even if a policy allowed it.
- **Headers:** `x-blixis-cache: HIT|MISS|BYPASS`, `Vary: Authorization, X-Blixis-Environment`, `Cache-Control: public, max-age=0, must-revalidate` (or `max-age=N` via `graphqlModule({ cache: { maxAge } })`).
- **APQ:** `@graphql-yoga/plugin-apq` 3.24 with its default in-memory store. An unknown hash gives `PersistedQueryNotFound` (not cached); the client resends with the query. Hash-only and query requests use different keys, which costs one extra miss.
- **Mutations:** the delivery schema has no mutations or subscriptions, so no operation-type check is needed. If a module ever adds mutations, its policy must bypass them.
- **API Worker:** L1 memory (300 s) + L2 Cache API (3600 s). Until 013.004 provides the content policy, everything is `BYPASS`.
- **Tests:** MISS→HIT with one resolver call, `304`, whitespace and variable-order normalisation, scope separation (a new stamp means a miss), errors, private responses and no-scope requests `BYPASS`, GET caching, APQ (not-found, register, hash hit).
