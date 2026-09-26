# 012.008 — Enforce query limits and verify batching

## Status

```text
completed
```

## Parent plan

[012 — GraphQL Platform & Content Delivery API](./_index.md)

## Objective

Protect the delivery API with depth, complexity/cost, alias, and page-size limits, request body size limits, and verify DataLoader-style batching keeps database queries bounded.

## Background

Public GraphQL endpoints are a denial-of-service vector; §47 excludes a custom engine, so use Yoga/Envelop plugins where Workers-compatible.

## Requirements

- Limits: max depth, max aliases, max tokens/cost, max `limit` per collection, max request body size, introspection disabled in production for delivery keys (configurable).
- Use Workers-compatible Envelop/Yoga plugins or small custom validation rules.
- Query-count test harness: execute representative queries and assert maximum SQL statements per request.
- Document limits in `docs/api/delivery.md` (initial delivery API docs).

## Architectural constraints

- Limits configurable via module options with safe defaults.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/graphql/src/limits.ts
packages/graphql/src/limits.test.ts
modules/content/test/delivery.queries.test.ts
apps/docs/src/content/docs/content/delivery-api.mdx
docs/api/delivery.md
```

### Modify

```text
packages/graphql/src/module.ts (limits option, body size check)
packages/graphql/src/index.ts
packages/database/src/create-database.ts (onQuery)
packages/testing/src/database.ts (countQueries)
```

### Delete

```text
None.
```

## Implementation steps

1. Implement/configure limits.
2. Query-count harness.
3. Documentation.

## Dependencies

Requires:

- [012.007 — Implement preview (draft) delivery](./007-preview-delivery.md)

## Acceptance criteria

- [x] Over-deep and over-complex queries rejected with clear errors.
- [x] Representative queries stay within documented SQL statement budgets.

## Validation

```bash
pnpm --filter @blixis/graphql test
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
- [x] Limits documented for SDK users.

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

- **`useLimits(options)`** (Yoga plugin), configurable through `graphqlModule({ limits })`, defaults in `DEFAULT_LIMITS`:
  - **Tokens:** `maxTokens` 3000, enforced while parsing (graphql-js `parse(…, { maxTokens })` via `setParseFn`).
  - **Depth and aliases:** `maxDepth` 12, `maxAliases` 30.
  - **Cost:** `maxCost` 20 000. It's a validation rule measuring each operation across fragments (each followed once per path), with code `QUERY_TOO_COMPLEX`. Each field costs 1 × the multiplier of every enclosing list field: its `limit` literal, 100 for a variable, 25 for `…Collection`/`entries` fields without a `limit`. A collection's `items` doesn't multiply again: an early version double-counted it, and a realistic page query was rejected (31 926 > 20 000), which the delivery tests caught.
  - **Body:** `maxBodyBytes` 64 KiB, checked before Yoga; `413` with `PAYLOAD_TOO_LARGE`.
  - **Collection `limit`:** at most 100 (012.006).
  - **Introspection:** `true`, `false` or `'members'` (users and API tokens only). The default is `'members'` when `BLIXIS_ENV` is `production`, otherwise `true`, via graphql-js `NoSchemaIntrospectionCustomRule`.
- **Query-count harness:**
  - `createDatabase({ onQuery })` (Drizzle logger), plus `countQueries(testDb)` in `@blixis/testing/database`, used as `serviceOverride(DATABASE, counter.db)`.
  - **Pitfall found:** passing `database: testDb` to `createTestBlixis` adds a second `DATABASE` override that wins, and the counter saw 0 statements. The harness is used without it; the note is in the test.
- **Budget:** a representative page list (reference, link.entry, richText.entries, blocks) costs **6 SQL statements for 3 and for 12 pages**: space, environments, content model, locales, the page collection, one batch of linked entries. Asserted as `≤ 6` and equal across sizes.
- **Docs:** manual *Content reference → Delivery API (GraphQL)* (authentication, typed schema, naming, field mapping, example, locales, filters, pagination, preview, errors, limits), plus `docs/api/delivery.md`.
