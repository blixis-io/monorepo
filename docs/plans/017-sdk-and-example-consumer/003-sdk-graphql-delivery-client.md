# 017.003 — Add the GraphQL delivery client

## Status

```text
completed
```

## Parent plan

[017 — SDK & Example Astro Consumer](./_index.md)

## Objective

Implement `createBlixisGraphQLClient` for delivery/preview queries with typed variables/results via generics, APQ/GET support for cacheability, and preview toggling.

## Background

§4 `createBlixisGraphQLClient`; 013 caching favours GET/APQ.

## Requirements

- `query<TData, TVars>(document, variables, { preview?, locale? })`.
- Automatic Persisted Queries (hash first, fallback to full query) and GET for queries when enabled.
- Error mapping from `extensions.code`.
- Docs example using GraphQL codegen typed documents (optional for users).
- Contract tests against Workers-pool API.

## Architectural constraints

- No heavy GraphQL client dependency; plain fetch.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/sdk/src/graphql.ts
packages/sdk/test/graphql.contract.test.ts
```

### Modify

```text
packages/sdk/src/{index,http}.ts, packages/sdk/test/harness.ts
packages/graphql/src/response-cache.ts, packages/graphql/src/response-cache.test.ts
vitest.config.ts (testTimeout)
apps/docs/src/content/docs/getting-started/sdk.mdx, apps/docs/src/content/docs/content/delivery-api.mdx
docs/sdk/README.md, docs/operations/caching.md
docs/plans/017-sdk-and-example-consumer/*, docs/ROADMAP.md
```

### Delete

```text
None.
```

## Implementation steps

1. Client with APQ.
2. Error mapping.
3. Tests.

## Dependencies

Requires:

- [017.002 — Create @blixis/sdk core and Management REST client](./002-sdk-core-and-management-client.md)

## Acceptance criteria

- [x] Delivery queries succeed with delivery key; preview requires preview key.
- [x] APQ path produces cache HITs in the Workers-pool test (with 013 caching).

## Validation

```bash
pnpm --filter @blixis/sdk test
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
- [x] Works in Workers and browser environments (test matrix).

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

- **API:** `createBlixisGraphQLClient({ baseUrl, token, persistedQueries?, get?, environment?, space? })` and `query(document, variables, { preview, locale, headers })`. `preview`/`locale` are passed as the `$preview`/`$locale` variables (GraphQL arguments can't be injected into arbitrary documents), documented as such.
- **Typed documents without a GraphQL dependency:** any string-like document with an optional `__apiType` (GraphQL Codegen client preset, `documentMode: 'string'`); plain strings give `Record<string, unknown>`. A type test in the contract suite checks inference.
- **Persisted queries:** GET with only the hash first; Yoga answers an unknown hash with **status 404** and a `PersistedQueryNotFound` error, then one POST registers the query. GraphQL answers can carry errors with 4xx statuses, so the HTTP core got a `raw` mode: the GraphQL client reads JSON bodies whatever the status and maps the first error's `extensions.code`; non-GraphQL answers (401/413 problem details) map as REST errors.
- **Found by the contract test, fixed in `@blixis/graphql`:** the response cache keyed a registering APQ request by its document and hash-only requests by `apq:<hash>`, so the first hash-only GET always missed; and `variables: {}` vs. none produced two entries. Now the hash keys the entry whenever present (the APQ plugin rejects a query that doesn't match its hash; errors are never cached), and empty variables are normalized. The second persisted GET is a cache `HIT` (tested).
- **Tests:** delivery key reads published content in two locales; delivery key + `preview: true` → `FORBIDDEN`; preview key reads drafts; APQ request sequence (GET → POST, then GET only) with `HIT`; error codes and details.
- **Test infrastructure:** the Node project's `testTimeout` is 15 s: a spaces API test timed out at 5 s under the full parallel run (module import time dominated).
