# @blixis/sdk

Typed clients for Blixis (plan 017): the **Management API** (REST) today, the **GraphQL delivery API** next (017.003). Zero dependencies; runs wherever `fetch` does — Cloudflare Workers, browsers, Node 20+, Deno, Bun, Astro.

The manual has the full guide: [SDK](../../apps/docs/src/content/docs/getting-started/sdk.mdx). This page is the maintainer's view.

## How it is built

- **Types are generated** from the OpenAPI document (`apps/api/openapi.json`, ADR 0015) into `src/generated/api.ts` by `pnpm openapi:generate`: every named schema (`Entry`, `Asset`, `Webhook`, …), an `Operations` map (path params, query, body, success response per `operationId`), and `ROUTES` (method, path, body kind, auth, idempotency). Never edit the generated file; CI fails when it is stale.
- **`call(operationId, input, options)`** reaches every operation, fully typed. The resources (`entries`, `assets`, …) are thin, hand-written conveniences on top.
- **HTTP core** (`src/http.ts`): base URL, bearer token, timeout (`AbortSignal.timeout`, 30 s), retries of 429/502/503/504 and network errors for repeatable requests (GET/PUT/DELETE and commands with an `Idempotency-Key`), exponential backoff with jitter, `Retry-After`, and `BlixisApiError` from RFC 9457 problem details. Commands that support idempotency get a random key automatically, reused across retries.
- **Uploads** set `Content-Length` from the body when it is known (Blob, ArrayBuffer, typed array); streams need `size` and are sent once (no retries).

## Tests

- `test/http.test.ts` — retries, `Retry-After`, idempotency keys, network errors, path encoding, `If-Match`, upload headers (no API needed).
- `test/contract.test.ts` — the SDK against the real API modules in-process (real sign-up and tokens, memory storage, no network). `test/harness.ts` validates **every** JSON response against its documented operation schema; the suite fails on any mismatch, and asserts that at least 15 operations were checked.

## Versioning

The SDK's types follow the API's OpenAPI document; incompatible API changes need a new major SDK version. Publishing to npm is plan 021.003.
