# 012.006 — Implement content delivery schema and resolvers

## Status

```text
completed
```

## Parent plan

[012 — GraphQL Platform & Content Delivery API](./_index.md)

## Objective

Implement the delivery GraphQL schema per ADR 0011 in `@blixis/content` (`src/graphql/`) with resolvers calling `ContentService` in `published` state, locale selection with fallback, link resolution, and collections with pagination/filtering.

## Background

§10 module-contributed GraphQL; §22 published content publicly; 011.006 link resolution helper.

## Requirements

- `modules/content/src/graphql/schema.ts` and `resolvers.ts` (+ generator if ADR chooses typed schemas).
- Queries: single entry by ID, collections by content type with `limit`, `cursor`/`skip`, `where` (MVP filters per ADR 0010), `order`, `locale` argument with fallback chain.
- Link fields resolved through batched loaders (`resolveLinks`).
- Tenant from delivery key actor (space/environment); requests without delivery/preview key → `UNAUTHORIZED` unless public delivery is enabled for a space (decide: not in MVP).
- Permission checks via service (`content.delivery.read`).
- Workers-pool tests with a sample content model.

## Architectural constraints

- No business logic in resolvers (§48 Code.9).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/content/src/application/delivery.service.ts
modules/content/src/graphql/delivery.ts (base schema, generator, resolvers)
modules/content/src/graphql/names.ts
modules/content/src/graphql/locales.ts
modules/content/test/delivery.graphql.test.ts
packages/graphql/src/batch.ts
packages/graphql/src/batch.test.ts
```

### Modify

```text
modules/content/src/module.ts
modules/content/package.json
modules/content/tsconfig.json
modules/spaces/src/application/locales.service.ts (codes() returns fallbacks)
packages/graphql/src/module.ts (map errors of schema selection)
packages/graphql/src/index.ts
tooling/postman/blixis.postman_collection.json
docs/ROADMAP.md (register D14)
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Implement schema (static or generated).
2. Implement resolvers and loaders.
3. Locale fallback.
4. Tests.

## Dependencies

Requires:

- [012.005 — Decide the delivery schema strategy](./005-decide-delivery-schema-strategy.md)

## Acceptance criteria

- [x] Published entries queryable with delivery key; drafts never returned.
- [x] Locale fallback follows space fallback chain.
- [x] Nested links resolved with bounded query counts.

## Validation

```bash
pnpm --filter @blixis/content test
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
- [x] Resolvers only call services.

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

- **Structure:**
  - `modules/content/src/graphql/delivery.ts` holds the static base (typeDefs and resolvers, contributed via `graphql`), the generator `generateDeliverySchema(types, registry)`, and field resolvers;
  - `names.ts` holds the naming rules of ADR 0011 §3, `locales.ts` the fallback resolution.
- **`DELIVERY_SERVICE`:**
  - **`scope(actor, { spaceId, environment })`:**
    - A key fixes its space; users must pass `?space=` or `X-Blixis-Space` (otherwise `VALIDATION_FAILED`).
    - Existence is resolved as the platform (`TENANT_RESOLVER` with a system actor, `allowSystem`), then the actor's `content.delivery.read` is required. Missing and inaccessible spaces both give `NOT_FOUND`.
    - A key's `environmentIds` are enforced.
    - The scope loads the model (1 query) and the locales with fallbacks, and computes `modelKey = space:environment:fnv1a(id:version…)`.
    - It's memoised per request.
  - **`requireState`:** `draft` needs `content.preview.read`.
  - **Reads:** `entries(scope, ids, state)` (one `findManyWithVersions`) and `collection(...)` (keyset, filters, cursor).
- **Resolvers:**
  - They call `DELIVERY_SERVICE` only. Per request they hold a `createBatchLoader` per state, so linked entries in one tick load in **one query**.
  - Parent objects carry `{ delivered | component+values, locale, state }`, so linked entries resolve in the **same state and locale**.
  - Field mapping follows ADR 0011 §4:
    - reference → the single allowed type or `Entry`;
    - link → `Link` with a lazy `entry`;
    - richText → `{ json, entries }`, where entries are embeds and link marks;
    - blocks → `[Block!]`, resolved by component id;
    - custom types use their `graphql` hint, or `JSON`.
- **Fallback:** requested locale → its `fallbackCode` chain → default locale (loop-safe). `LocaleService.codes()` now returns `fallbacks`.
- **Root fields:**
  - `<apiId>(id, locale, preview)` returns null for entries of other types;
  - `<apiId>Collection(where, limit, cursor, locale, preview)` validates `limit` (1–100);
  - generic `entry(id)` and `entries(contentType)` sit on the static base.
- **`GRAPHQL_SCHEMA_EXTENSION` provider:**
  - It's active for key actors or when a space is named; the generated parts are built lazily (getter), only on a cache miss.
  - Errors while choosing the schema (e.g. an unknown space) are now mapped like resolver errors in `@blixis/graphql`: before, Yoga masked them as `INTERNAL_SERVER_ERROR`.
- **`createBatchLoader`** (in `@blixis/graphql`) is a minimal DataLoader: it batches loads of one tick, caches per request, and rejects all waiting loads on failure without caching the failure.
- **Bug caught by the tests:** building a linked entry's parent spread the *parent entry* over it, so links resolved to the page itself. It now copies only locale and state.
- **Tests (5, Postgres):**
  - a typed query covering reference, blocks with `__typename`, link.entry and richText.entries;
  - nl-NL fallback, including blocks, and an unknown locale;
  - published vs. drafts: delivery keys get `FORBIDDEN` on preview, preview keys see drafts, and viewers with `?space=` use the generic `entry`;
  - outsiders, wrong environment and wrong space get `NOT_FOUND`, and no space gives `VALIDATION_FAILED`;
  - model changes are visible immediately (a new cache key).
