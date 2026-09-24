# 011.001 — Create entry, version, and publication schema

## Status

```text
not-started
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
modules/content/src/infrastructure/migrations/0002_create_entries.sql
modules/content/src/domain/entry.ts
modules/content/src/domain/entry-version.ts
modules/content/src/infrastructure/entry.repository.ts
modules/content/src/infrastructure/entry-version.repository.ts
modules/content/test/entry.repository.test.ts
```

### Modify

```text
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

- [ ] Repository tests prove versions are append-only and pagination is stable.
- [ ] Content type deletion is rejected when entries exist.

## Validation

```bash
pnpm db:migrate
pnpm --filter @blixis/content test
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
- [ ] Index choices justified with EXPLAIN output in Technical notes.

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
