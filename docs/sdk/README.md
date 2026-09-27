# @blixis/sdk

Typed clients for Blixis (plan 017): the **Management API** (REST, `createBlixisClient`) and the **GraphQL delivery API** (`createBlixisGraphQLClient`). Zero dependencies; runs wherever `fetch` does — Cloudflare Workers, browsers, Node 20+, Deno, Bun, Astro.

The manual has the full guide: [SDK](../../apps/docs/src/content/docs/getting-started/sdk.mdx). This page is the maintainer's view.

## How it is built

- **Types are generated** from the OpenAPI document (`apps/api/openapi.json`, ADR 0015) into `src/generated/api.ts` by `pnpm openapi:generate`: every named schema (`Entry`, `Asset`, `Webhook`, …), an `Operations` map (path params, query, body, success response per `operationId`), and `ROUTES` (method, path, body kind, auth, idempotency). Never edit the generated file; CI fails when it is stale.
- **`call(operationId, input, options)`** reaches every operation, fully typed. The resources (`entries`, `assets`, …) are thin, hand-written conveniences on top.
- **HTTP core** (`src/http.ts`): base URL, bearer token, timeout (`AbortSignal.timeout`, 30 s), retries of 429/502/503/504 and network errors for repeatable requests (GET/PUT/DELETE and commands with an `Idempotency-Key`), exponential backoff with jitter, `Retry-After`, and `BlixisApiError` from RFC 9457 problem details. Commands that support idempotency get a random key automatically, reused across retries.
- **Dynamic tokens and renewal:** `token` may be a function, asked before each request; `onUnauthorized` runs on a `401` and, when it resolves `true`, the request is repeated once with the new token (never a stream, which was consumed). `credentials` passes through to `fetch`.
- **Browser session** (`src/session.ts`, `createBrowserSession`, ADR 0009 and ADR 0017): signs in with `tokenDelivery: 'cookie'` and `credentials: 'include'`, keeps the access token in memory, renews it 60 s before expiry or after a `401`, and resumes after a reload with `restore()` (refresh cookie). Refreshes are deduplicated in the tab and serialized across tabs with the Web Locks API, because refresh tokens rotate (reuse after the 10 s grace window revokes the family). A failed refresh (`401`/`403`) ends the session and notifies subscribers.
- **Uploads** set `Content-Length` from the body when it is known (Blob, ArrayBuffer, typed array); streams need `size` and are sent once (no retries).

## GraphQL client

- `query(document, variables, { preview, locale })`: the options become the `$preview` / `$locale` variables.
- Automatic persisted queries by default: GET with only `extensions.persistedQuery.sha256Hash` first; on `PersistedQueryNotFound` (Yoga answers it with status 404) one POST with the query registers it. Hashes are cached per client.
- GraphQL responses may carry errors with 4xx statuses, so the client reads JSON bodies whatever the status (`raw` in the HTTP core) and throws `BlixisApiError` with the first error's `extensions.code`; non-GraphQL answers (401, 413 problem details) map as REST errors.
- Typed documents: anything with an optional `__apiType` (GraphQL Codegen client preset, `documentMode: 'string'`) — no GraphQL runtime dependency.

## Tests

- `test/session.test.ts` — the browser session against a fake API with a cookie jar: sign-in, restore, one refresh for concurrent requests, renewal after a `401`, expiry, the lock, sign-out.
- `test/http.test.ts` — retries, `Retry-After`, idempotency keys, network errors, path encoding, `If-Match`, upload headers (no API needed).
- `test/graphql.contract.test.ts` — delivery and preview keys, locales, typed documents, persisted queries producing delivery-cache `HIT`s, GraphQL error codes.
- `test/contract.test.ts` — the SDK against the real API modules in-process (real sign-up and tokens, memory storage, no network). `test/harness.ts` validates **every** JSON response against its documented operation schema; the suite fails on any mismatch, and asserts that at least 15 operations were checked.

## Versioning

The SDK's types follow the API's OpenAPI document; incompatible API changes need a new major SDK version. Publishing to npm is plan 021.003.
