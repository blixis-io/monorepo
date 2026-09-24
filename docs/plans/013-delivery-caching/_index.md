# 013 — Delivery Caching & Invalidation

## Status

```text
not-started
```

Milestone: Milestone 6 — Content delivery  
Roadmap scope: MVP / initial platform  
Progress: 0/5 tasks completed

## Objective

Make published content delivery fast and cheap without ever serving stale content longer than a documented bound after publish, and without ever caching previews: delivery responses are cached at the edge using keys that include a per-space content version, and publishing events bump that version (and/or purge) through queue consumers.

## Why this plan exists

§34 names published delivery responses as good cache candidates, requires event-driven invalidation, and distinguishes cache layers; it also says not to introduce KV caching before measuring a real need. The Workers Cache API is per data center, so global invalidation needs either purge APIs or versioned keys — a decision that must be explicit (ADR 0012).

## Scope

In scope:

- ADR 0012 caching and invalidation strategy
- measurement of uncached delivery latency (baseline) to justify caching layers
- Cache API adapter in `@blixis/cloudflare` and delivery caching middleware
- KV adapter with explicit consistency documentation (only if ADR selects versioned keys)
- event consumers for invalidation
- HTTP caching headers (Cache-Control, ETag, Vary)
- tests for correctness (no preview caching, invalidation on publish)

Out of scope:

- asset delivery caching (plan 014)
- caching management REST responses (not cached)
- search indexes

## Dependencies

Depends on:

- [012 — GraphQL Platform & Content Delivery API](../012-graphql-delivery-api/_index.md)

## Architecture decisions

- **Only published delivery responses are cached**; preview and management responses are `private, no-store` (§34).
- **Cache keys** include space, environment, locale, normalised query/variables hash, key kind, and content version stamp.
- **Invalidation is event-driven** (§34 example: `entry.published` → Queue → invalidation).
- **KV only with evidence** (§14, §34): KV is used solely for version stamps or config caches after ADR 0012 records the consistency trade-off (eventual consistency ~ up to 60s propagation — verify current docs) and measurements.
- **Postgres stays canonical** — caches are always reconstructible.

## Deliverables

- ADR 0012 accepted with baseline measurements.
- `@blixis/cloudflare` Cache API adapter (+ KV adapter if chosen).
- Delivery caching in `@blixis/graphql` (or a delivery-cache platform module) supporting GET and POST via synthetic keys.
- Invalidation consumer subscribed to content events.
- `docs/operations/caching.md` explaining layers, keys, TTLs, invalidation, and troubleshooting.

## Tasks

- [ ] [001 — Measure delivery baseline and decide the caching strategy](./001-caching-strategy-and-baseline.md)
- [ ] [002 — Implement Cache API and KV adapters](./002-cache-and-kv-adapters.md)
- [ ] [003 — Cache published delivery responses](./003-delivery-response-caching.md)
- [ ] [004 — Invalidate delivery caches from content events](./004-event-driven-invalidation.md)
- [ ] [005 — Review cache correctness and document operations](./005-cache-correctness-review.md)

## Completion criteria

The plan may be marked `completed` when:

- [ ] All tasks `completed`.
- [ ] Test proves: published response cached; after publish of a referenced entry, next response reflects change within the documented bound; preview never cached.
- [ ] Measured latency improvement recorded (staging).

## Risks

- **Stale content** from eventual consistency (KV) or per-colo caches; must be bounded and documented.
- **Cache key explosion** from arbitrary GraphQL queries; consider persisted queries/APQ to stabilise keys.
- **Purge API** requires zone and API token outside bindings — conflicts with "bindings over REST APIs" unless justified; ADR must address.

## Open questions

- Versioned keys (KV stamp per space/environment) vs. purge-by-tag vs. short TTL + stale-while-revalidate? (ADR 0012; recommendation: versioned keys via KV stamp, with short TTLs as a safety net.)
- Should Automatic Persisted Queries be required for cacheable delivery requests? Default: support APQ + GET; POST cached via synthetic key.

## Technical notes

No technical notes yet.
