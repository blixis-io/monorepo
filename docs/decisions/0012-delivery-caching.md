# 0012 — Delivery caching and invalidation

- Status: accepted
- Date: 2026-09-26
- Roadmap task: [013.001](../plans/013-delivery-caching/001-caching-strategy-and-baseline.md)

## Context

**Baseline** on staging, 2026-09-26, uncached, measured from the Netherlands against `workers.dev` → Hyperdrive → Neon eu-central-1. The dataset had 20 published pages, 5 authors, blocks and rich text, and each query ran 20 times.

| Request | p50 | p95 | min |
|---|---|---|---|
| `GET /api/v1/health` (network only, no database) | 87 ms | 426 ms | 57 ms |
| GraphQL, one page by slug (delivery key) | 238 ms | 707 ms | 193 ms |
| GraphQL, 20 pages with references, blocks, rich text | 279 ms | 424 ms | 224 ms |

- **Where the time goes:** about 150–190 ms of a delivery request is database round trips. There are 6 statements for a page list (012.008), plus the delivery-key lookup. Each is a sequential round trip to Neon, and Hyperdrive query caching is off (ADR 0019).
- **Target:** a cache hit should come close to the network floor. The hit path must therefore make **no database queries**, including for authentication and for checking freshness.

### Constraints

- **Cache API:** Workers' Cache API (`caches.default`) is per data center. According to Cloudflare's documentation, it doesn't operate on `*.workers.dev` hostnames, only on custom domains. Staging has no custom domain yet, and this ADR's measurements check it (013.003).
- **Purge:** purging by tag or prefix needs a zone, a custom domain and an API token, and runs per zone rather than per colo. That's too much operational coupling for the MVP.
- **KV:** eventually consistent (changes reach other locations in up to ~60 s), with per-key write limits. §14/§34 say to use it only with evidence.
- **Stale publishes are the failure users notice.** "I published and the site still shows the old page" must be bounded, documented and measured.

## Decision

### 1. Versioned keys with a per-space content stamp in Postgres

- **The stamp:** each space has a **content stamp**, a number in `content.delivery_stamps` owned by `@blixis/content`. Every cache key includes it.
- **Bumping it:** the stamp is bumped by an **event subscription** (`@blixis/content`) on:
  - `entry.published`, `entry.unpublished`, `entry.deleted`;
  - `content-type.created`, `content-type.updated`, `content-type.deleted`;
  - `locale.created`, `locale.updated`, `locale.deleted` (fallback changes affect delivered values).
- **Old entries are never invalidated:** they simply stop being addressed, and age out.
- **Why not KV:** no KV namespace is needed. The stamp is **strongly consistent**, and bumping it is idempotent (it only moves forward). The price is one small query when an isolate's copy expires.
- **Remembering the stamp:** each isolate remembers a stamp for **2 seconds**. Under traffic, the stamp costs at most one query per 2 seconds per isolate.

### 2. Layers

| Layer | Where | Keyed by | Lifetime |
|---|---|---|---|
| L1 | isolate memory (LRU, 500 entries / 8 MiB) | full cache key, including the stamp | 5 min |
| L2 | Cache API (`caches.default`, synthetic GET request per key) | full cache key, including the stamp | 1 h. Works only on custom domains; on `workers.dev` it's measured and documented as ineffective |

Postgres stays canonical: every layer can be rebuilt, and a cold cache only costs latency.

### 3. What is cached

- **Only** requests from **delivery keys** (not preview keys, users or API tokens) that are unrestricted by environment (`environmentIds: null`).
- **Only** `query` operations with `preview` absent or false, and only successful responses without `errors`.
- **Everything else** bypasses the cache (`x-blixis-cache: BYPASS`).
- Preview responses stay `private, no-store` (012.007).

### 4. The key

The key is the SHA-256 of `[spaceId, environment parameter or "", stamp, key kind, operationName, the document with insignificant characters stripped, the variables sorted canonically]`.
- Credentials never appear in the key. The key kind and the space stand in for them.
- The key includes the locale, because it's part of the query or variables.

### 5. Authentication on the hit path

- **Authentication always runs before the cache lookup.**
- **Delivery-key lookups** (hash → actor) are remembered per isolate for **30 seconds**. A revoked key therefore stops working everywhere within 30 seconds, and immediately in the isolate that revoked it.
- `last_used_at` keeps its hourly write (012.004).

### 6. HTTP semantics

- **Cacheable responses** carry:
  - `ETag` (a hash of the body);
  - `Cache-Control: public, max-age=0, must-revalidate`, so browsers and CDNs revalidate every time, cheaply;
  - `Vary: Authorization, X-Blixis-Environment`;
  - `x-blixis-cache: HIT | MISS | BYPASS` for debugging.
- **`If-None-Match`** answers `304`.
- Apps may opt into CDN caching with a documented staleness bound (`graphqlModule({ cache: { maxAge } })`). The default is 0.

### 7. GET and persisted queries

- **GET queries** (`/graphql?query=…&variables=…`) are supported and cached like POST.
- **Automatic persisted queries (APQ)** use `@graphql-yoga/plugin-apq` with the isolate-memory store: a miss asks the client to resend the query once.

### 8. Staleness bound

The time from a publish until a cache hit is fresh is:
- post-commit dispatch → queue batch (≤ 5 s, `max_batch_timeout`) → stamp bump;
- plus up to **2 s** of remembered stamp;
- **typically under 10 s**.

If the post-commit dispatch fails, the 1-minute outbox sweep delivers the event, so the worst case is about **70 s**. It's measured on staging in 013.004.

## Alternatives considered

- **KV stamps:** fast reads at the edge, but eventually consistent (up to 60 s), write-limited, and a new resource per environment. Postgres with a 2-second memo gives a tighter bound without new infrastructure.
- **TTL-only caching:** simple, but the bound equals the TTL. Short TTLs barely help, and long ones make stale publishes visible.
- **Zone purge by tag:** precise, but needs a custom domain, a zone API token, and purge-rate budgets. It's reconsidered with a custom domain (plan 021).
- **Stamp bumped inside the publish transaction:** exact, but `@blixis/content` would have to know about every layer that affects delivery (locales live in `@blixis/spaces`). Events keep the modules decoupled, and the bound is small.
- **Caching per entry instead of per response:** finer invalidation, but a GraphQL response spans many entries. It's deferred until measurements show whole-space invalidation hurting.

## Consequences

- A cache hit costs no database queries, except a stamp read every 2 s per isolate and a key lookup every 30 s.
- **Every publish in a space invalidates that space's whole delivery cache** (coarse by design for the MVP). Busy editorial spaces see more misses; finer keys can follow with evidence.
- `docs/operations/caching.md` documents the layers, keys, bounds and troubleshooting.
