# 013.002 — Implement Cache API and KV adapters

## Status

```text
not-started
```

## Parent plan

[013 — Delivery Caching & Invalidation](./_index.md)

## Objective

Implement a `EdgeCache` port with a Cache API adapter, and (if ADR 0012 selected it) a `VersionStampStore` port with a Workers KV adapter, both in `@blixis/cloudflare`, with in-memory fakes in `@blixis/testing`.

## Background

§4 KV adapters in `@blixis/cloudflare`; §19 `CACHE_KV` binding; §48 Architecture.7 adapters behind abstractions.

## Requirements

- `EdgeCache` port (`match(key)`, `put(key, response, ttl)`, `delete(key)`) with Cache API implementation (`caches.default` or named cache) — synthetic `Request` keys for POST bodies.
- `VersionStampStore` port (`get(scope)`, `bump(scope)`) with KV implementation using `CACHE_KV` binding; document eventual consistency and that bump writes are rate-limited per key (KV write limits — verify).
- Fakes in `@blixis/testing`.
- Provision KV namespaces per environment and bindings in `wrangler.jsonc`; update env and configuration docs.

## Architectural constraints

- Ports defined outside `@blixis/cloudflare` (e.g. in `@blixis/graphql` or a small caching contract in contracts) so domain code does not depend on Cloudflare.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/cloudflare/src/edge-cache.ts
packages/cloudflare/src/kv-version-stamps.ts
packages/cloudflare/src/edge-cache.test.ts
packages/cloudflare/src/kv-version-stamps.test.ts
packages/testing/src/cache.ts
```

### Modify

```text
packages/cloudflare/src/index.ts
packages/testing/src/index.ts
apps/api/wrangler.jsonc
apps/api/src/env.ts
docs/operations/configuration.md
docs/operations/cloudflare.md
```

### Delete

```text
None.
```

## Implementation steps

1. Define ports.
2. Implement adapters and fakes.
3. Provision bindings.
4. Tests (Workers pool for Cache API/KV behaviour).

## Dependencies

Requires:

- [013.001 — Measure delivery baseline and decide the caching strategy](./001-caching-strategy-and-baseline.md)

## Acceptance criteria

- [ ] Adapters pass tests in the Workers pool.
- [ ] KV consistency caveats documented next to the adapter.

## Validation

```bash
pnpm --filter @blixis/cloudflare test
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
- [ ] Ports are Cloudflare-free.

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
