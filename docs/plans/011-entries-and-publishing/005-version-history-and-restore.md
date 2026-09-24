# 011.005 — Implement version history and restore

## Status

```text
not-started
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
modules/content/test/versions.test.ts
```

### Modify

```text
modules/content/src/application/content.service.ts
modules/content/src/rest/entry.routes.ts
apps/api/test/tenant-routes.allowlist.ts
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

- [ ] Restore produces a new version whose fields equal the restored version (modulo incompatible fields, reported).

## Validation

```bash
pnpm test --filter @blixis/content
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
- [ ] No path mutates old versions.

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
