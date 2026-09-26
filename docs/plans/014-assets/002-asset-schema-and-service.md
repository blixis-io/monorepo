# 014.002 — Create the assets module schema and service

## Status

```text
completed
```

## Parent plan

[014 — Assets on R2](./_index.md)

## Objective

Create `modules/assets` with asset metadata migrations, repository, `ASSET_SERVICE`, permissions, and events.

## Background

§17 metadata fields (id, filename, MIME type, size, metadata, R2 key); §20 module-owned schema; §15 asset events.

## Requirements

- Scaffold module; capability `blixis.assets`; requires spaces, permissions, events, database.
- Migration: `assets(id, space_id, environment_id, filename, title, description, mime_type, size_bytes, checksum, width null, height null, object_key, status (pending|ready|deleted), created_by, created_at, updated_at, published_at null)`; locale-aware title/description if ADR 0010 extends to assets (decide; default: localized JSONB like fields).
- `AssetService`: `createPending`, `markReady`, `get`, `list`, `updateMetadata`, `delete`, `publish`/`unpublish` (assets follow draft/published like entries? decide: simple `published_at` flag in MVP).
- Permissions: `assets.read`, `assets.write`, `assets.delete`, `assets.publish` with default grants.
- Events `asset.created`, `asset.updated`, `asset.deleted` (transactional for deleted).

## Architectural constraints

- Repository queries tenant-scoped.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/assets/package.json
modules/assets/tsconfig.json
modules/assets/tsconfig.test.json
modules/assets/src/index.ts
modules/assets/src/module.ts
modules/assets/src/config.ts
modules/assets/src/permissions.ts
modules/assets/src/events.ts
modules/assets/src/domain/asset.ts
modules/assets/src/application/asset.service.ts
modules/assets/src/infrastructure/schema.ts
modules/assets/src/infrastructure/asset.repository.ts
modules/assets/src/infrastructure/migrations/0001_create_assets.ts
modules/assets/test/asset.service.test.ts
```

### Modify

```text
apps/api/src/blixis.config.ts
apps/api/package.json
apps/api/tsconfig.json
apps/docs/astro.config.mjs
tsconfig.json
docs/contracts/events.md
docs/ROADMAP.md
docs/plans/014-assets/_index.md
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Scaffold module and migration.
2. Service, permissions, events.
3. Tests.

## Dependencies

Requires:

- [014.001 — Decide upload strategy and implement the R2 object storage adapter](./001-upload-strategy-and-object-storage.md)

## Acceptance criteria

- [x] Asset lifecycle transitions validated (pending → ready → deleted).
- [x] Events recorded in outbox.

## Validation

```bash
pnpm test:db modules/assets
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
- [x] Public exports: token, types, events only.

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

- **Decisions (the task left them open):**
  - **Localized title and description:** JSONB maps of locale code → text, validated against the space's locales (like localized fields, ADR 0010). The file name is not localized.
  - **Publishing:** a simple `published_at` / `first_published_at` pair, no versions. Publishing needs a `ready` asset (a check constraint enforces it too).
  - **No `deleted` status:** deleting removes the row and emits `asset.deleted` in the same transaction (hard delete, like entries and ADR 0007). The file is deleted after the commit by 014.006's consumer. Published assets must be unpublished first.
  - **All asset events are transactional:** the file cleanup depends on `asset.updated` (`replacedObjectKey`) and `asset.deleted`; webhooks on the rest. Pending uploads emit nothing; `asset.created` fires on `markReady`.
  - **Replacing a file** is `prepareReplacement` (new key `<space>/<asset>/<newFileId>`) then `replaceFile` (checks the key belongs to the asset, bumps the version, names the old key). Objects are never overwritten (ADR 0013 §2).
  - **Types:** declared types are normalized (`Image/PNG; x=y` → `image/png`) and checked against `ASSETS_CONFIG.allowedTypes`; `BLOCKED_TYPES` (HTML, XHTML, JavaScript, XML) can't be allowed at all. Signature checks need the bytes and come with the upload routes (003).
- **Paging** is newest first by id (UUIDv7 is creation-ordered), with the last id as the cursor, so it's exact. Entry listing pages by `updated_at` rounded to milliseconds, while `now()` stores microseconds; two entries in the same millisecond at a page boundary could be skipped there (follow-up, not changed here).
- **Migration** is a TypeScript `defineMigration` (`0001_create_assets`), like the other modules, not a `.sql` file. Staging needs `pnpm db:migrate` before the next deploy.
- **Space deletion** deletes the asset rows now; stored files follow with 014.006.
- **Module options** (`assetsModule({ maxDirectUploadBytes, maxAssetBytes, allowedTypes })`) are exposed as the app-scoped `ASSETS_CONFIG`.
- **Manual:** the Assets API reference page comes with the routes (003); the API reference (TypeDoc) now includes `@blixis/assets`.
