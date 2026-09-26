# 014.001 — Decide upload strategy and implement the R2 object storage adapter

## Status

```text
completed
```

## Parent plan

[014 — Assets on R2](./_index.md)

## Objective

Record ADR 0013 (upload flows, size limits, key scheme, serving domain) and implement the `ObjectStorage` port with an R2 adapter and test fake.

## Background

§17 R2 for binaries; §4 R2 adapters in `@blixis/cloudflare`; domain modules depend on abstractions.

## Requirements

- ADR 0013: upload modes (streaming single-part via binding up to N MB; R2 multipart upload via binding for larger), request size limits by Workers plan, allowed MIME types policy, key scheme, checksum verification (MD5/SHA-256), serving domain and headers (`Content-Disposition`, `X-Content-Type-Options: nosniff`, CSP for SVG).
- `ObjectStorage` port (in `@blixis/assets` public types or contracts — decide; recommendation: contracts, since third-party modules may need storage via capability): `put(key, stream, meta)`, `get(key, range?)`, `head`, `delete`, multipart methods.
- R2 adapter in `@blixis/cloudflare` using the binding; fake in `@blixis/testing`.
- Provision R2 buckets per environment; binding `ASSETS`; docs updated.

## Architectural constraints

- Streams only; never `await request.arrayBuffer()` for uploads above small thresholds.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/decisions/0013-asset-uploads.md
packages/contracts/src/storage.ts
packages/cloudflare/src/r2-object-storage.ts
packages/testing/src/object-storage.ts
packages/testing/src/object-storage.test.ts
apps/api/test/object-storage.worker.test.ts
apps/docs/src/content/docs/concepts/object-storage.mdx
```

### Modify

```text
packages/contracts/src/index.ts
packages/contracts/tsconfig.json
packages/contracts/tsconfig.test.json
packages/cloudflare/src/index.ts
packages/testing/src/index.ts
apps/api/wrangler.jsonc
apps/api/worker-configuration.d.ts
apps/api/src/env.ts
apps/api/src/blixis.config.ts
apps/docs/src/content/docs/concepts/testing.mdx
docs/decisions/README.md
docs/operations/configuration.md
docs/operations/cloudflare.md
docs/setup-checklist.md
docs/ROADMAP.md
docs/plans/014-assets/001-upload-strategy-and-object-storage.md
```

### Delete

```text
None.
```

## Implementation steps

1. ADR 0013.
2. Port and adapter.
3. Provision buckets.
4. Tests in Workers pool (local R2 simulation).

## Dependencies

Requires:

- [012.008 — Enforce query limits and verify batching](../012-graphql-delivery-api/008-query-limits-and-batching.md)

## Acceptance criteria

- [x] ADR accepted with explicit size limits.
- [x] Adapter streams a multi-MB file in tests without buffering.

## Validation

```bash
npx vitest run --project api test/object-storage
npx vitest run packages/testing/src/object-storage.test.ts
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
- [x] Security headers policy documented.

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

- **Port in contracts:** `ObjectStorage`, `OBJECT_STORAGE`, `OBJECT_STORAGE_LIMITS`. Contracts gained the `webworker` lib for `ReadableStream` (standard in Workers and Node; no runtime code).
- **TS 7.0.2 bug again:** `{@link ObjectStorage.get}` inside the declaring file made `ReadableStream` unresolvable (TS2304 on unrelated lines). Member references are written as code spans instead.
- **Known-length streams:** R2 needs the length of a stream. The adapter pipes streams through `FixedLengthStream(size)` when a `size` is given, which also rejects bodies of the wrong length (`ValidationError`).
- **Error mapping:** R2 checksum mismatch → `ValidationError` (nothing stored); unknown multipart upload → `NotFoundError`; aborting twice is a no-op; everything else → retryable `InfrastructureError`.
- **Local R2 quirk:** a stream shorter than `size` is rejected correctly, but miniflare's R2 simulator then logs an uncaught "Network connection lost". The Workers test leaves that case to the memory fake to keep test output clean.
- **Workers test** streams a 12 MiB generated body (64 KiB chunks) and assembles a 10 MiB + 3 B multipart upload from streamed parts.
- **Buckets:** `blixis-assets-staging` / `-production` (location hint `weur`), created by the owner on 2026-09-26 (location `WEUR`, verified with `wrangler r2 bucket info`).
