# Delivery caching

How published GraphQL delivery responses are cached, invalidated, and debugged ([ADR 0012](../decisions/0012-delivery-caching.md)).

Related: [Events](./events.md) · [Cloudflare Workers](./cloudflare.md) · manual: [Delivery API](../../apps/docs/src/content/docs/content/delivery-api.mdx), [GraphQL](../../apps/docs/src/content/docs/concepts/graphql.mdx)

---

## Request flow

```text
request
  → authenticate (delivery key; remembered 30 s per isolate)
  → GRAPHQL_CACHE_POLICY (@blixis/content)  ─ undefined → execute, x-blixis-cache: BYPASS
  → scope = space:environment:stamp (stamp remembered 2 s per isolate)
  → key = SHA-256(scope, operationName, normalised document or APQ hash, sorted variables)
  → L1 memory → L2 Cache API        ─ found → x-blixis-cache: HIT (304 on If-None-Match)
  → execute against Postgres        ─ storable → store in every layer, x-blixis-cache: MISS
```

- **Authentication always runs first.** An unknown or revoked key gets `401` before any lookup, so a cached response is never served to it.
- **Credentials are never part of the key.** Every delivery key of the same space shares entries; the space id in the scope keeps spaces apart.

## Layers

| Layer | Scope | Lifetime | Notes |
|---|---|---|---|
| L1 isolate memory | one Worker isolate | 5 min, 500 entries / 8 MiB | always on |
| L2 Cache API | one Cloudflare data center | 1 h | **custom domains only**; no effect on `*.workers.dev` |
| Postgres | canonical | — | a miss executes the query |

Configured in `apps/api/src/blixis.config.ts` (`graphqlModule({ cache: { stores, maxAge } })`). Store failures count as misses: a broken cache never fails a request.

## What is cached

- Only requests from **delivery keys** (`blx_dk_`) that aren't limited to specific environments.
- Only `query` operations without `preview: true`, and only `200` JSON responses without `errors`.
- Never a response a resolver marked `Cache-Control: private` or `no-store`.
- Everything else shows `x-blixis-cache: BYPASS`: preview keys, members, API tokens, environment-limited keys, mutations, errors.

## Keys and invalidation

- **The stamp:** each space has a **content stamp** (`content.delivery_stamps`), part of every cache key.
- **What bumps it:** these events, through `@blixis/content` subscriptions `delivery-stamp.<event>`:
  - `entry.published`, `entry.unpublished`, `entry.deleted`;
  - `content-type.created`, `content-type.updated`, `content-type.deleted`;
  - `locale.created`, `locale.updated`, `locale.deleted`.
- **Old cached responses** are never deleted: nothing addresses them any more, and they age out.
- **Deleting a space** deletes its stamp row.
- **Staleness bound:** typically under 10 s after a publish (queue batch ≤ 5 s, plus the 2 s stamp memo). The worst case is about 70 s, when the outbox sweep has to deliver the event. The isolate that handled the bump sees the new stamp at once.

## Headers

| Header | Meaning |
|---|---|
| `x-blixis-cache` | `HIT`, `MISS`, or `BYPASS` |
| `x-blixis-cache-layer` | on a `HIT`: the layer that answered, `memory` or `cache-api` |
| `ETag` / `If-None-Match` | `304 Not Modified` when unchanged |
| `Cache-Control` (response) | `public, max-age=0, must-revalidate`: clients and CDNs revalidate every time |
| `Vary` | `Authorization, X-Blixis-Environment` |
| `Cache-Control: no-cache` (request) | skip the lookup, execute, and store the fresh result (`MISS`) |

## Tuning

| Option | Where | Default | Effect |
|---|---|---|---|
| `cache.stores` | `graphqlModule` | memory, 300 s | layers and their lifetimes |
| `cache.maxAge` | `graphqlModule` | 0 | `max-age` for clients and CDNs; adds up to that many seconds of staleness |
| `stampTtlMs` | `contentModule` | 2000 | how long an isolate trusts its stamp; part of the staleness bound |
| `deliveryKeyMemoSeconds` | `authModule` | 30 | how long a revoked key keeps working in other isolates |

## Troubleshooting

**"I published, and the site still shows the old content."**

1. Send the query with `curl -si` and read `x-blixis-cache`. `BYPASS` means the cache isn't involved: look at the site's own caching (framework, CDN, `maxAge`).
2. Retry with `-H 'Cache-Control: no-cache'`. If that answer is fresh but a normal request is not, the stamp didn't move.
3. Inspect the stamp (read-only, Neon SQL editor):

   ```sql
   select space_id, stamp, updated_at from content.delivery_stamps where space_id = '<space id>';
   ```

   `updated_at` should be just after the publish. If it isn't, the event didn't arrive: check the queue consumer (`wrangler tail`, `Queue blixis-events-<env>`), the outbox (`select type, attempts, last_error from events.outbox where dispatched_at is null`), and Sentry for `delivery-stamp.*` subscription failures.
4. As a last resort, bump the stamp by hand. It only ever moves forward, so this is always safe; every isolate misses within 2 s:

   ```sql
   update content.delivery_stamps set stamp = stamp + 1, updated_at = now() where space_id = '<space id>';
   ```

**"Every request is a MISS."**

- Check the stamp isn't bumped constantly (an import or a script publishing in a loop).
- Variables that change per request (timestamps, random ids) make every request a new key.
- Each isolate has its own L1. Without a custom domain (no L2), a new isolate starts cold.

**"A revoked key still gets responses."**

Other isolates remember a key for up to 30 s (`deliveryKeyMemoSeconds`). After that, the key gets `401`, cached response or not.

## Tests

| Test | Proves |
|---|---|
| `tooling/tenant-isolation/test/delivery-cache.test.ts` | with the API's real modules: identical queries in two spaces never share entries; locales are separate; a revoked key gets `401` although its response is cached |
| `modules/content/test/delivery.cache.test.ts` | hit after miss; fresh after publish and locale changes; bypass for previews, members, environment-limited keys and errors; no SQL on a hit |
| `packages/graphql/src/response-cache.test.ts` | keys, ETag/304, `no-cache`, GET and APQ, never storing errors or private responses |
| `apps/api/test/cache.worker.test.ts` | the Cache API store in the Workers runtime |

## Measurements

Staging, from the Netherlands, `workers.dev` → Hyperdrive → Neon eu-central-1, 20 requests each.

| Request | Uncached p50 | Uncached p95 |
|---|---|---|
| `GET /api/v1/health` (network only) | 87 ms | 426 ms |
| GraphQL, page by slug | 238 ms | 707 ms |
| GraphQL, 20 pages | 279 ms | 424 ms |

Cached figures and the measured publish-to-fresh latency are recorded in [013.005](../plans/013-delivery-caching/005-cache-correctness-review.md) after the staging deploy.
