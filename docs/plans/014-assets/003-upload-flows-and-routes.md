# 014.003 — Implement upload flows and asset management routes

## Status

```text
not-started
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
modules/assets/src/rest/routes.ts
modules/assets/src/application/uploads.ts
apps/api/test/assets.worker.test.ts
```

### Modify

```text
modules/assets/src/module.ts
apps/api/test/tenant-routes.allowlist.ts
apps/api/test/authz-matrix.worker.test.ts
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

- [ ] Upload of an allowed file produces a ready asset and object in R2 (local simulation).
- [ ] Oversize upload rejected with `VALIDATION_FAILED` without storing an object.

## Validation

```bash
pnpm --filter @blixis/api test
```

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] Memory usage checked for large uploads (no full buffering).

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

No technical notes yet.
