# 017.002 — Create @blixis/sdk core and Management REST client

## Status

```text
completed
```

## Parent plan

[017 — SDK & Example Astro Consumer](./_index.md)

## Objective

Create `@blixis/sdk` with a fetch-based HTTP core (auth header, retries for idempotent requests, error mapping, pagination helpers) and `createBlixisClient` covering spaces, content types, entries (incl. publish), assets (upload), webhooks, and API keys.

## Background

§4 `createBlixisClient` export; ADR 0015 provides types.

## Requirements

- Scaffold `packages/sdk` with zero or minimal dependencies.
- Core: base URL, token, custom `fetch` injection, timeout, `Idempotency-Key` support for commands, automatic retry on 429/5xx for idempotent methods with backoff respecting `Retry-After`.
- `BlixisApiError` with `code`, `status`, `requestId`, `details`.
- Resources: `spaces`, `contentTypes`, `entries` (list with async iterator pagination, create, update with `expectedVersion`, publish/unpublish), `assets` (streamed upload where runtime supports), `webhooks`, `apiKeys`.
- Contract tests running against the Workers-pool API instance.

## Architectural constraints

- No Node built-ins; ESM only.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/sdk/ (package.json, tsconfig*.json)
packages/sdk/src/{index,client,http,errors}.ts
packages/sdk/src/generated/api.ts (generated)
packages/sdk/test/{harness,contract.test,http.test}.ts
tooling/openapi/src/typescript.ts
docs/sdk/README.md
apps/docs/src/content/docs/getting-started/sdk.mdx
```

### Modify

```text
tooling/openapi/src/cli.ts, tooling/openapi/test/openapi.test.ts
biome.json, tsconfig.json, pnpm-lock.yaml, apps/docs/astro.config.mjs
apps/docs/src/content/docs/getting-started/introduction.mdx
docs/plans/017-sdk-and-example-consumer/*, docs/ROADMAP.md
```

### Delete

```text
None.
```

## Implementation steps

1. Core HTTP and errors.
2. Resources using generated types.
3. Contract tests.

## Dependencies

Requires:

- [017.001 — Decide and implement the REST API type source](./001-rest-api-type-source.md)

## Acceptance criteria

- [x] Contract tests create space → content type → entry → publish via the SDK.
- [x] Errors surface `code` and `requestId`.

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
- [x] SDK has no dependency on server packages at runtime (types only, if any).

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

- **Generated types** (`src/generated/api.ts`, from `apps/api/openapi.json`): a JSON-Schema-to-TypeScript emitter in `tooling/openapi/src/typescript.ts` (TS 7 has no compiler API for off-the-shelf generators). Named schemas become types; `Operations` maps every `operationId` to params, query, body, and success response; `ROUTES` carries method, path, body kind, `auth: false`, `idempotent: true`. Optional properties are emitted as `?: T | undefined` so consumers with `exactOptionalPropertyTypes` can pass `undefined`. Generated with the spec by `pnpm openapi:generate`; the OpenAPI test checks both are current; Biome skips the generated file.
- **Zero runtime dependencies**, ESM, `lib: es2023 + webworker` (no Node types). `call(operationId, …)` covers all 83 operations; resources (`organizations`, `spaces`, `contentTypes`, `entries`, `assets`, `webhooks`, `deliveryKeys`, `apiTokens`) are thin conveniences; `entries.iterate` / `assets.iterate` are async iterators over cursors; `assets.uploadLarge` slices a Blob into parts and aborts the upload on failure.
- **Retries** only where repeating is safe: GET/PUT/DELETE, and POST/PATCH with `Idempotency-Key`. Operations that accept a key get one automatically (`crypto.randomUUID()`), reused on every retry (tested). `Retry-After` is honoured; streams are never retried.
- **Uploads** set `Content-Length` from Blob/ArrayBuffer/typed-array bodies: browsers ignore the header (they compute it), Workers and Node accept a correct one, and an in-process `Request` needs it — the contract test found that.
- **Contract tests** run in Node against the real modules in-process (DB-backed tests can't run in the Workers pool: quarantined, docs/conventions/testing.md). Real sign-up and bearer tokens; the harness validates every JSON response against its operation schema (18 operations covered; the suite requires ≥ 15 and no mismatches).
- **Errors:** `BlixisApiError` with `status`, `code` (API codes plus `NETWORK_ERROR`), `errors`, `requestId`, `details`.
