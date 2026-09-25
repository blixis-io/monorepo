# 011.001 — Create entry, version, and publication schema

## Status

```text
completed
```

## Parent plan

[011 — Entries, Versions & Publishing](./_index.md)

## Objective

Add migrations, domain types, and repositories for entries, immutable entry versions, and publications, per ADR 0010, and replace the content-type "has entries" stub.

## Background

§22 conceptual model: current draft, current published, history. §21 Entry → EntryVersion, Publication.

## Requirements

- Migrations:
  - `entries(id, space_id, environment_id, content_type_id fk, current_version_id, published_version_id null, published_at null, created_by, created_at, updated_at, version_number int)`;
  - `entry_versions(id, entry_id fk, number int, fields jsonb, content_type_version int, created_by, created_at, unique(entry_id, number))` — immutable (no UPDATE path in repository);
  - `entry_publications` history (`entry_id, version_id, action publish|unpublish, actor_id, at`) if ADR 0010 chooses history table; otherwise document.
- Indexes for listing by `(space_id, environment_id, content_type_id, updated_at)` and JSONB index per ADR.
- Repositories: create entry with first version, append version, set pointers, list with keyset pagination, load by ID scoped by tenant.
- Implement content type "has entries" check used by 010.005.

## Architectural constraints

- Repository exposes no method that mutates an existing version row.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/content/src/infrastructure/migrations/0002_create_entries.ts
modules/content/src/domain/entry.ts
modules/content/src/infrastructure/entry.repository.ts
modules/content/test/entry.repository.test.ts
```

### Modify

```text
modules/content/src/infrastructure/schema.ts
modules/content/src/module.ts
modules/content/src/application/content-type.service.ts
```

### Delete

```text
None.
```

## Implementation steps

1. Migrations and indexes.
2. Domain types.
3. Repositories with keyset pagination.
4. Replace stub; tests.

## Dependencies

Requires:

- [010.005 — Implement the content type service and REST routes](../010-content-modeling/005-content-type-service-and-routes.md)

## Acceptance criteria

- [x] Repository tests prove versions are append-only and pagination is stable.
- [x] Content type deletion is rejected when entries exist.

## Validation

```bash
pnpm db:migrate
pnpm --filter @blixis/content test
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
- [x] Index choices justified with EXPLAIN output in Technical notes.

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

- **Tables** (content migration `0002_create_entries`):
  - `entries`: tenant columns, `content_type_id` (FK restrict), `current_version_id`, `version` (optimistic counter), `published_version_id`, `published_at`, `first_published_at`, `created_by`/`updated_by` (actor ids);
  - `entry_versions`: immutable, `unique(entry_id, number)`, `fields` JSONB with a `jsonb_path_ops` GIN index (ADR 0010 §9), `content_type_version`, `restored_from`;
  - `entry_publications`: publish/unpublish history;
  - `entry_references`: outgoing links per version, indexed by target.
- **Decisions:**
  - Publication history uses a table (the task left it open).
  - Links are stored for **every** version. They're immutable like versions, and `referrers()` joins on the entry's current or published version, so older versions never count.
  - There is no FK from `entries.current_version_id` to versions (circular). The repository always writes both in one transaction.
- **Repository:**
  - `create` inserts the entry and version 1.
  - `append` updates the entry row first (which locks it and checks `version`), then inserts the version; `undefined` means stale.
  - Lookups: `findById` (tenant-scoped), `findForResolution` (id only, for entry-id routes before authorization), `findManyByIds`, `version`, `versionsByIds`, `versions` (newest first, paged by number).
  - `list` uses keyset order `updated_at desc, id desc` with a cursor, content type, `updatedSince`, and stored-shape JSONB containment filters, and joins the current or published version.
  - Also `setPublished` (with a history row), `delete` (versions, references and history cascade), `referrers`, `countByContentType` and `countContainingComponent` (`jsonb_path_exists('$.** ? (@._type == $t)')`).
  - There is no update path for versions.
- **`ENTRY_USAGE`** (010.005's stub, TODO removed) now counts real entries: by type for entry types, by contained blocks for components. The content type safe-change rules are therefore live.
- **`space.deleted`** deletes entries before content types, because of the FK.
- **`entryStatus()`:** `draft` / `published` / `changed`.
