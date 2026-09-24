# 011.006 — Implement entry references and link resolution

## Status

```text
not-started
```

## Parent plan

[011 — Entries, Versions & Publishing](./_index.md)

## Objective

Implement reference integrity checks, reverse-reference lookup ("which entries link here"), and a link resolution helper used by delivery (plan 012) to include linked entries up to a depth.

## Background

ADR 0010 defines reference representation. Delivery APIs need efficient link resolution; publishing needs integrity; unpublish/delete need referrer checks.

## Requirements

- Maintain a `entry_references(space_id, from_entry_id, from_version_id, to_type, to_id)` table populated on version creation (decide if only for current draft/published versions to limit size).
- Service: `findReferrers(ctx, entryId, { state })`, `resolveLinks(ctx, entries, { depth, state, locale })` batching lookups (one query per depth level).
- Asset references stored now; existence validation delegated via optional capability `blixis.assets` (plan 014.005 completes).
- Tests for depth limits, cycles, and batching (query count assertions).

## Architectural constraints

- Resolution must not leak drafts when `state = 'published'`.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/content/src/infrastructure/migrations/0003_create_entry_references.sql
modules/content/src/application/links.ts
modules/content/test/links.test.ts
```

### Modify

```text
modules/content/src/infrastructure/entry-version.repository.ts
modules/content/src/application/publishing.ts
modules/content/src/application/content.service.ts
modules/content/src/index.ts
```

### Delete

```text
None.
```

## Implementation steps

1. Reference table and population.
2. Referrer lookup and link resolution with batching.
3. Integrate with publish/unpublish rules.
4. Tests.

## Dependencies

Requires:

- [011.005 — Implement version history and restore](./005-version-history-and-restore.md)

## Acceptance criteria

- [ ] `resolveLinks` with depth 2 uses at most 2 additional queries.
- [ ] Published resolution never returns draft-only entries.

## Validation

```bash
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
- [ ] Cycle handling documented.

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
