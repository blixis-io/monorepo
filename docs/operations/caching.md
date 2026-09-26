# Delivery caching

How published GraphQL delivery responses are cached, invalidated, and debugged ([ADR 0012](../decisions/0012-delivery-caching.md)). *Draft: completed with plan 013.*

Related: [Events](./events.md) · [Cloudflare Workers](./cloudflare.md) · manual: Delivery API

---

## Layers

| Layer | Scope | Lifetime | Notes |
|---|---|---|---|
| L1 isolate memory | one Worker isolate | 5 min, 500 entries / 8 MiB | always on |
| L2 Cache API | one Cloudflare data center | 1 h | **custom domains only**; no effect on `*.workers.dev` |
| Postgres | canonical | — | a miss executes the query |

## What is cached

- Only requests from **delivery keys** that aren't limited to specific environments.
- Only `query` operations without `preview: true`, and only responses without errors.
- Everything else shows `x-blixis-cache: BYPASS`.

## Keys and invalidation

- **The stamp:** each space has a **content stamp** (`content.delivery_stamps`), part of every cache key.
- **What bumps it:** publishing, unpublishing or deleting entries, content type changes, and locale changes, through event subscriptions.
- **Old cached responses** are never deleted: nothing addresses them any more.
- **Staleness bound:** typically under 10 s after a publish (queue batch ≤ 5 s, plus a 2 s isolate memo of the stamp). The worst case is about 70 s, when the outbox sweep has to deliver the event.

## Headers

| Header | Meaning |
|---|---|
| `x-blixis-cache` | `HIT`, `MISS`, or `BYPASS` |
| `ETag` / `If-None-Match` | `304 Not Modified` when unchanged |
| `Cache-Control` | `public, max-age=0, must-revalidate`: clients and CDNs revalidate every time |

## Baseline (2026-09-26, uncached, staging, from the Netherlands)

| Request | p50 | p95 |
|---|---|---|
| `GET /api/v1/health` (network only) | 87 ms | 426 ms |
| GraphQL, page by slug | 238 ms | 707 ms |
| GraphQL, 20 pages | 279 ms | 424 ms |
