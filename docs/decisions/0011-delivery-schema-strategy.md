# 0011 — Delivery schema strategy: typed schema per content model

- Status: accepted
- Date: 2026-09-26
- Roadmap task: [012.005](../plans/012-graphql-delivery-api/005-decide-delivery-schema-strategy.md)

## Context

The delivery API (`/graphql`, plan 012) serves published and preview content of one space and environment. Content types are defined at runtime (plan 010), so a typed GraphQL schema can only be generated per content model. Front-end developers expect typed queries (`blogPostCollection { items { title author { name } } }`), fragments on components, and codegen, the way Contentful and Hygraph work. A generic, JSON-only schema is simpler to build but pushes all typing to the client.

**Measurement (2026-09-26, Node 24, Yoga `createSchema`):**
- a generated schema of 30 content types × 15 fields plus 10 components, 20 KiB of SDL;
- builds in **~10 ms median** and ~21 ms cold;
- workerd's V8 is comparable.

`@blixis/graphql` already supports per-request schema extensions cached by key (`GRAPHQL_SCHEMA_EXTENSION`, 012.002).

## Decision

### 1. Both: static base plus a typed schema per content model (option c)

- **The static base** (`@blixis/content`'s contribution):
  - the `Entry` interface (`sys: Sys!`), the `Block` interface (`_id`, `_type`), `Sys`, `Link`, `RichText`, `Asset` (placeholder until plan 014);
  - generic root fields `entry(id: ID!, locale: Locale, preview: Boolean): Entry` and `entries(contentType: String!, …): EntryCollection!`, which return typed objects through the interfaces.
- **The typed extension** is generated per `(space, environment, content model)`:
  - one object type per content type (`implements Entry`) and per component (`implements Block`);
  - two root fields per content type: `<apiId>` and `<apiId>Collection`;
  - `<Type>Filter` inputs.
- **Cache:** composed schemas are cached per isolate in an LRU (default 50) keyed by `space:environment:` plus a hash of every type's `id:version`. Any model change produces a new key, so nothing needs invalidating, and old entries age out. No KV is needed. The model itself is read once per request (a single query).

### 2. Choosing the space and environment

The schema depends on them, so they're known before execution:
- **Delivery and preview keys** fix the space. The environment comes from `?environment=` or the `X-Blixis-Environment` header, defaulting to the space's default environment, and must be one the key allows.
- **Users** (for example, admin previews) name the space with `?space=` or `X-Blixis-Space`.
- **Requests without a space** get the static schema only (`_platform`).

### 3. Naming

- **Types** use the PascalCase `apiId`: `blogPost` → `BlogPost`. `apiId`s start lowercase and are unique per environment, so this can't collide within a model. A clash with a platform type (`Entry`, `Block`, `Sys`, `Link`, `RichText`, `Asset`, `Query`, `Platform`, scalars, `EntryCollection`) gets the suffix `Content`, e.g. `EntryContent`.
- **Root fields** are the `apiId` and `apiId` + `Collection`. When one would clash with a static root field (`entry`, `entries`, `_platform`), the root fields get the prefix `content`, e.g. `contentEntry`.
- **Collections:** `<Type>Collection { items: [<Type>!]!, nextCursor: String }`.
- **Fields** keep their `apiId`s. Disabled fields are left out.

### 4. Field mapping

| Field type | GraphQL |
|---|---|
| `text`, `longText` | `String` |
| `number` | `Int` or `Float` (by `integer`) |
| `boolean` | `Boolean` |
| `date`, `dateTime` | `Date`, `DateTime` |
| `select` | `String` or `[String!]` |
| `json` | `JSON` |
| `richText` | `RichText { json: JSON!, entries: [Entry!]! }`, where `entries` are linked and embedded entries resolved in batches |
| `reference` | the single allowed type, or else `Entry`; a list for `multiple` |
| `asset` | `Asset` (placeholder, plan 014), or a list |
| `link` | `Link { kind, url, email, phone, entry: Entry, text, title, newTab }` |
| `blocks` | `[Block!]` (fragments `... on Hero`) |
| custom types | their `graphql(settings).type` if it's a built-in scalar or `JSON`, otherwise `JSON` |

- **Required fields** are still nullable in GraphQL: a published entry has them in the default locale, but other locales may be empty after fallback.
- **`locale`:** every root field takes `locale: Locale`. The locale is passed down the whole result (including linked entries), and values resolve through the space's fallback chain.

### 5. Pagination, filtering, ordering

- **Pagination:** cursor-based (opaque `cursor` / `nextCursor`), like the Management API. `limit` defaults to 25 and has a maximum of 100 (enforced in 012.008).
- **Filters:** `where: <Type>Filter` offers equality on non-localized `text`, `select`, `number`, `boolean` and `date` fields (ADR 0010 §9), mapped onto the content service's field filters.
- **Order:** newest updates first (`sys.updatedAt` descending, keyset). Other orders come after measuring, together with expression indexes.

### 6. Preview

- Root fields take `preview: Boolean = false`. With `true`, drafts (latest versions) are read, and links resolve drafts consistently.
- Preview requires `content.preview.read`: preview keys and signed-in members have it, delivery keys get `FORBIDDEN`.
- Preview responses are `Cache-Control: private, no-store` (plan 013 adds public caching).

### 7. How modules combine

- Static module contributions (such as `_platform`, or a SEO module's `seo(path)`) compose with the generated types. Composition validates them together, and clashes name the module.
- Generated types can only use the reserved names above, so module types must avoid PascalCase names equal to content types, or they'll get the `Content` suffix treatment.

## Alternatives considered

- **Generic schema only** (`entry { fields: JSON }`): no generation cost and no cache, but it gives up typing, fragments, codegen and field-level selection. Clients over-fetch every locale and field.
- **Typed schema only:** equally good for typed clients, but no way to ask for an entry by id without knowing its type. The generic `entry(id)` via the `Entry` interface costs nothing extra.
- **Schema stored in KV per model version:** a network read per request to save about 10 ms of CPU once per model version per isolate. Not worth it (§34: measure first).
- **Offset pagination (`skip`):** unstable while content changes, and slow on large collections.

## Consequences

- The first request after a model change in each isolate pays about 10–20 ms for composition.
- Model changes show up immediately (the key changes with every version), so no event-driven invalidation is needed.
- Tests must cover naming clashes, fallback resolution, and a bounded number of queries per request (012.008).
