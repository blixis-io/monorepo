# Delivery API

The GraphQL delivery API (`/graphql`, plan 012) is documented in the developer manual: [Content reference → Delivery API](../../apps/docs/src/content/docs/content/delivery-api.mdx). It covers authentication, the typed schema per content model (ADR 0011), locales, filters, pagination, preview, errors, and **limits**.

Limits live in `@blixis/graphql` (`DEFAULT_LIMITS`, `graphqlModule({ limits })`):

| Limit | Default |
|---|---|
| depth | 12 |
| aliases | 30 |
| tokens | 3000 |
| estimated cost | 20 000 |
| body | 64 KiB |
| collection `limit` | 100 |
| introspection | members only in production |

The query budget is guarded by `modules/content/test/delivery.queries.test.ts`: 6 SQL statements for a representative page list, the same for 3 or 12 pages.

**Caching** (plan 013, [ADR 0012](../decisions/0012-delivery-caching.md)): published responses to unrestricted delivery keys are cached per space content stamp; everything else bypasses. Layers, headers, invalidation, tuning and troubleshooting: [operations/caching.md](../operations/caching.md). Correctness tests: `tooling/tenant-isolation/test/delivery-cache.test.ts`, `modules/content/test/delivery.cache.test.ts`, `packages/graphql/src/response-cache.test.ts`.
