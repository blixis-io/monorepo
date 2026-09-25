# 011.004 — Implement publish and unpublish commands

## Status

```text
completed
```

## Parent plan

[011 — Entries, Versions & Publishing](./_index.md)

## Objective

Implement `publish` and `unpublish` on `ContentService` and their REST routes with strict validation, reference integrity checks, idempotency keys, and transactional `entry.published`/`entry.unpublished` events.

## Background

§22 publishing is explicit and emits `entry.published`; §33 idempotency keys for publish; §32 outbox for critical events (cache invalidation, webhooks depend on it).

## Requirements

- `publish(ctx, id, { versionId?, idempotencyKey? })`: validates the chosen (default current) version in `publish` mode; checks referenced entries are published (or configurable rule per ADR); sets publication pointer and `published_at`; records history; emits `entry.published` `{ entryId, spaceId, environmentId, contentTypeId, versionId }` transactionally.
- `unpublish(ctx, id)`: clears pointer, emits `entry.unpublished`; rejects if published entries reference it? (decide: warn vs. block; default block with `ConflictError` listing referrers, overridable by `force` for admins).
- Permission `content.entries.publish`.
- Routes `POST /api/v1/entries/:id/publish`, `POST /api/v1/entries/:id/unpublish` with `idempotent()` middleware.
- Tests: publish invalid draft → 400 with paths; double publish with same key → same response; different body same key → 409; event emitted once.

## Architectural constraints

- Publishing never modifies version contents.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/content/test/publishing.api.test.ts
```

### Modify

```text
modules/content/src/application/content.service.ts
modules/content/src/domain/links.ts (collectLinkUsages with API paths and allowed types)
modules/content/src/rest/entry.routes.ts
tooling/tenant-isolation/test/routes.ts
tooling/tenant-isolation/test/authz-routes.ts
tooling/postman/blixis.postman_collection.json
```

### Delete

```text
None.
```

## Implementation steps

1. Implement publish/unpublish with integrity rules.
2. Wire idempotency.
3. Routes and tests.

## Dependencies

Requires:

- [011.003 — Implement entry management REST routes](./003-entry-management-routes.md)

## Acceptance criteria

- [x] Publishing emits exactly one `entry.published` through outbox → queue in the Workers pool test.
- [x] Invalid content cannot be published.
- [x] Idempotent replays return the original result.

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
- [x] Events payloads contain IDs only (no content bodies).

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

- **`publish(actor, tenant, id, { versionId?, expectedVersion? })`:**
  - Validates the chosen version (default: current) in `publish` mode against the **current** content type, via `fromStorage` → `validate`.
  - Adds **reference-integrity issues** (`collectLinkUsages`, with API paths): the target doesn't exist, isn't published, or has a type outside the field's `contentTypeIds`. Self-links are ignored.
  - All problems come back in one `400` with paths.
  - Republishing the live version is a no-op, with no event.
  - Otherwise it runs `setPublished` and a history row, and emits `entry.published` **in the same transaction** (outbox).
- **`unpublish(actor, tenant, id, { force? })`:**
  - **Decision:** block with `409` (listing the referrer ids) while other *published* entries link to it; `force: true` overrides. Holders of `content.entries.publish` may force; no extra permission was added.
  - Unpublishing a draft is a no-op.
  - Emits `entry.unpublished` transactionally with the version that was live.
- **Asset links** aren't checked yet; plan 014 validates them.
- **Routes:** `POST /entries/:entryId/publish` and `/unpublish` with `entryScoped()` **then** `idempotent()`, so keys are scoped to the entry's tenant and the actor. `If-Match` or `expectedVersion` guards publish.
- **Tests:**
  - an invalid draft gives `400` with `fields.title.en-US`;
  - the same key gives a replay (`Idempotent-Replayed: true`, identical body), and the same key with a different body gives `409`;
  - the event is emitted once;
  - the published version is still served while a draft is `changed`;
  - link integrity and the unpublish block with `force`;
  - delete is blocked while published;
  - viewers get `403`.
- The isolation suite and authorization matrix cover the two command routes. Postman has publish (with an `Idempotency-Key` `{{$guid}}`), a published read, and unpublish.
