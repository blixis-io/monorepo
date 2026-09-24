# 014.002 — Create the assets module schema and service

## Status

```text
not-started
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
modules/assets/src/index.ts
modules/assets/src/module.ts
modules/assets/src/permissions.ts
modules/assets/src/events.ts
modules/assets/src/domain/asset.ts
modules/assets/src/application/asset.service.ts
modules/assets/src/infrastructure/asset.repository.ts
modules/assets/src/infrastructure/migrations/0001_create_assets.sql
modules/assets/test/asset.service.test.ts
```

### Modify

```text
apps/api/src/blixis.config.ts
apps/api/package.json
tsconfig.json
docs/contracts/events.md
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

- [ ] Asset lifecycle transitions validated (pending → ready → deleted).
- [ ] Events recorded in outbox.

## Validation

```bash
pnpm db:migrate
pnpm --filter @blixis/assets test
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
- [ ] Public exports: token, types, events only.

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
