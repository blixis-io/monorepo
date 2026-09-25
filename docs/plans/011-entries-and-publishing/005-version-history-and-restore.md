# 011.005 — Implement version history and restore

## Status

```text
completed
```

## Parent plan

[011 — Entries, Versions & Publishing](./_index.md)

## Objective

Allow listing an entry's versions, reading a specific version, and restoring an old version as a new draft version.

## Background

§22 version history. Restore must not rewrite history; it copies fields into a new version.

## Requirements

- Service: `listVersions(ctx, entryId, page)`, `getVersion(ctx, entryId, versionId)`, `restoreVersion(ctx, entryId, versionId, expectedVersion)`.
- Routes: `GET /api/v1/entries/:id/versions`, `GET /api/v1/entries/:id/versions/:versionId`, `POST /api/v1/entries/:id/versions/:versionId/restore`.
- Restoring a version created under an older content-type version revalidates against the current content type in draft mode; incompatible fields reported.
- Event `entry.updated` on restore with `restoredFrom`.

## Architectural constraints

- History is append-only.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/content/test/versions.api.test.ts
```

### Modify

```text
modules/content/src/application/content.service.ts
modules/content/src/rest/entry.routes.ts
modules/content/src/index.ts
tooling/tenant-isolation/test/routes.ts
tooling/tenant-isolation/test/isolation.test.ts
tooling/tenant-isolation/test/authz-routes.ts
tooling/tenant-isolation/test/authz-matrix.test.ts
tooling/postman/blixis.postman_collection.json
tooling/postman/{local,staging,production}.postman_environment.json
docs/development/postman.md
```

### Delete

```text
None.
```

## Implementation steps

1. Service methods.
2. Routes.
3. Tests incl. content-type drift.

## Dependencies

Requires:

- [011.004 — Implement publish and unpublish commands](./004-publish-and-unpublish-commands.md)

## Acceptance criteria

- [x] Restore produces a new version whose fields equal the restored version (modulo incompatible fields, reported).

## Validation

```bash
pnpm --filter @blixis/content test
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
- [x] No path mutates old versions.

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

- **Service:**
  - `listVersions(actor, tenant, id, { limit, before })`: newest first, paged by version number (`nextBefore`), limit 1–100.
  - `getVersion`.
  - `restoreVersion(actor, tenant, id, versionId, expectedVersion)`.
  - Reading needs `content.entries.read`; restoring needs `content.entries.write`.
- **`EntryVersionView`:** `sys { id, entryId, number, contentTypeVersion, restoredFrom, isCurrent, isPublished, createdAt, createdBy }` and `fields` keyed by `apiId`. Old versions are read through the **current** type's mapping, so renamed fields appear under their new `apiId`, and removed fields are dropped.
- **Restore:**
  - Appends a new version with `restored_from`, so history is never rewritten; a stale `expectedVersion` gives `409`, a missing one `400`.
  - The old fields are validated as a draft against the current content type. Values that no longer fit (e.g. after a `maxLength` was tightened) are reported with paths (`400`).
  - Emits `entry.updated` with `restoredFrom`.
  - A restore after publishing makes the entry `changed`. The live version stays until it's published again.
- **Routes:** `GET /entries/:entryId/versions`, `GET /entries/:entryId/versions/:versionId`, `POST /entries/:entryId/versions/:versionId/restore` (with `If-Match` or `expectedVersion`).
- **Coverage:**
  - the isolation suite and authorization matrix cover the 3 routes (matrix restore body `expectedVersion: 2`, after the `PATCH` row);
  - Postman has list, get and "restore first version";
  - the drift test caught a missing request for the version-by-id route before shipping.
