# 014.003 — Implement upload flows and asset management routes

## Status

```text
in-progress
```

## Parent plan

[014 — Assets on R2](./_index.md)

## Objective

Implement upload endpoints per ADR 0013 (streaming single-part; multipart for large files) and management routes for assets, with size/MIME validation and checksum verification.

## Background

§9 `POST /api/v1/assets`, `DELETE /api/v1/assets/:id`; REST preferred for asset operations.

## Requirements

- `POST /api/v1/spaces/:spaceId/assets` (multipart/form-data or raw body with headers — per ADR) creating pending asset, streaming to R2, verifying size/checksum, marking ready in a transaction with `asset.created`.
- Multipart: `POST .../assets/uploads` (initiate), `PUT .../uploads/:uploadId/parts/:n`, `POST .../uploads/:uploadId/complete`, `DELETE .../uploads/:uploadId` (abort) — if in ADR.
- `GET /api/v1/spaces/:spaceId/assets`, `GET/PATCH/DELETE /api/v1/assets/:id`, `POST /api/v1/assets/:id/publish|unpublish`.
- Image dimension extraction for common formats (lightweight header parse, no heavy libraries) — optional; document.
- Isolation and authz coverage.

## Architectural constraints

- Failed uploads leave no `ready` metadata; orphan pending objects cleaned by cron (document).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/assets/src/rest/asset.routes.ts
modules/assets/src/rest/http.ts
modules/assets/src/application/inspect.ts
modules/assets/src/domain/sniff.ts
modules/assets/src/infrastructure/migrations/0002_add_uploads.ts
modules/assets/test/assets.api.test.ts
modules/assets/test/sniff.test.ts
apps/api/test/asset-inspection.worker.test.ts
apps/docs/src/content/docs/content/assets-api.mdx
```

### Modify

```text
modules/assets/src/application/asset.service.ts
modules/assets/src/config.ts
modules/assets/src/domain/asset.ts
modules/assets/src/index.ts
modules/assets/src/infrastructure/asset.repository.ts
modules/assets/src/infrastructure/schema.ts
modules/assets/src/module.ts
packages/testing/src/isolation.ts
packages/testing/src/authz-matrix.ts
packages/testing/src/index.ts
tooling/tenant-isolation/package.json
tooling/tenant-isolation/tsconfig.json
tooling/tenant-isolation/test/routes.ts
tooling/tenant-isolation/test/authz-routes.ts
tooling/tenant-isolation/test/isolation.test.ts
tooling/tenant-isolation/test/authz-matrix.test.ts
tooling/postman/blixis.postman_collection.json
apps/docs/src/content/docs/content/delivery-api.mdx
docs/api/management-conventions.md
docs/plans/014-assets/003-upload-flows-and-routes.md
docs/plans/014-assets/_index.md
docs/ROADMAP.md
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Upload flow(s).
2. Management routes.
3. Tests incl. oversize and wrong MIME.

## Dependencies

Requires:

- [014.002 — Create the assets module schema and service](./002-asset-schema-and-service.md)

## Acceptance criteria

- [x] Upload of an allowed file produces a ready asset and object in R2 (local simulation).
- [x] Oversize upload rejected with `VALIDATION_FAILED` without storing an object.

## Validation

```bash
pnpm test:db modules/assets tooling/tenant-isolation
npx vitest run --project api test/asset-inspection test/object-storage
npx vitest run tooling/postman
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
- [x] Memory usage checked for large uploads (no full buffering).

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

- **Raw bodies, not form data** (ADR 0013): the request body is the file, with `Content-Type`, a required `Content-Length` (streams need a known length), the name in `Content-Disposition` (RFC 6266, or `?filename=`), and an optional `Content-Digest: sha-256=:…:` (RFC 9530) that the storage verifies.
- **Multipart paths are keyed by asset id** — `/assets/:assetId/upload/parts/:n`, `/upload/complete`, `DELETE /upload` — instead of `/uploads/:uploadId`: R2 upload ids are long opaque strings, and asset ids reuse `assetScoped()` for tenant resolution. The R2 upload id, declared size and part size live on the pending row (migration `0002_add_uploads`). Parts must be exactly `partSize` bytes (10 MiB by default; grown in whole MiB past 10 000 parts), the last the rest.
- **The service orchestrates storage** (`upload`, `uploadReplacement`, `startUpload`, `uploadPart`, `completeUpload`, `abortUpload`), so routes only translate HTTP and the flows are tested in Node with `createMemoryObjectStorage()`. A failed upload deletes its object and its pending row; nothing `ready` is left behind.
- **Inspection while streaming** (`inspectUpload`): the first 64 KiB are kept to check signatures (PNG, JPEG, GIF, WebP, AVIF, PDF; a mismatch aborts the stream early with `400`) and to read PNG/JPEG/GIF/WebP dimensions; SHA-256 uses `crypto.DigestStream` in Workers (verified by `asset-inspection.worker.test.ts`) and is `null` in Node. Multipart uploads check part 1's signature and read dimensions from it.
- **Isolation and authorization:** `assets/:assetId` joined `TENANT_SEGMENTS`; `IsolationRoute` gained `rawBody` and `headers` for upload routes. All 12 asset routes are in both suites; the matrix seeds a ready asset and two multipart uploads per case and uses memory storage.
- **Not done here:** the §9 short forms (`POST /api/v1/assets`) — uploads need a space, so they stay under `/spaces/:spaceId`; replacing a file through a multipart upload (large replacements: upload a new asset); orphan cleanup of abandoned pending uploads (014.006, with the cron).
- **End-to-end in workerd isn't possible yet:** database tests inside the Workers pool are quarantined (pg + `pg-cloudflare`, docs/conventions/testing.md). Coverage: Node API tests (memory storage), the R2 adapter in workerd (014.001), inspection in workerd, and a staging upload after deploy.
- **Postman:** new *Assets* folder (single upload, metadata, replace, publish, multipart start/part/complete, abort, delete).
- **Manual:** *Assets API* reference page; management conventions mention raw-body uploads and `assetScoped()`.
