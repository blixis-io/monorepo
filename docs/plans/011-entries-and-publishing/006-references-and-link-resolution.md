# 011.006 — Implement entry references and link resolution

## Status

```text
completed
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
modules/content/test/links.api.test.ts
```

### Modify

```text
modules/content/src/application/content.service.ts
modules/content/src/infrastructure/entry.repository.ts (findManyWithVersions)
modules/content/src/rest/entry.routes.ts
modules/content/src/index.ts
tooling/tenant-isolation/test/routes.ts
tooling/tenant-isolation/test/authz-routes.ts
tooling/postman/blixis.postman_collection.json
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

- [x] `resolveLinks` with depth 2 uses at most 2 additional queries.
- [x] Published resolution never returns draft-only entries.

## Validation

```bash
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
- [x] Cycle handling documented.

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

- **`entry_references`** (011.001) is written for every version, so no separate maintenance is needed. The task allowed limiting it to current and published versions; queries join on the entry's current or published version id instead, which gives the same answers without deleting rows from immutable history.
- **`findReferrers(actor, tenant, id, { state })`:** entries whose current (`draft`) or published version links to this one, excluding self-links, returned as views in that state.
- **`resolveLinks(actor, tenant, entryIds, { depth 0–3, state })`:**
  - Breadth-first. Each level is **one** `findManyWithVersions` batch, a join of entries and versions with `inArray`, and levels with nothing new stop early.
  - A `seen` set follows cycles once.
  - Missing targets, and unpublished ones for `published`, are left out, matching ADR 0010 §7 ("delivery omits links that don't resolve").
  - Asset links are skipped until plan 014.
  - **Deviation:** no `locale` option. Fields keep all locales, and locale selection and fallback belong to delivery (plan 012).
- **Tests:** a query-count assertion via `vi.spyOn(entryRepository, 'findManyWithVersions')` (roots plus one call per level), the cycle a→b→c→a, depth limits (`include=4` gives `400`), and state-specific resolution.
- **REST:** `?include=0..3` on `GET /entries/:entryId` and the entries list adds `includes: { entries }`. `GET /entries/:entryId/referrers?state=` lists referrers. The isolation suite, authorization matrix and Postman cover it.
- **Asset existence:** the optional `blixis.assets` capability check is deferred to 014.005, as the task allows. Asset links are already stored.
