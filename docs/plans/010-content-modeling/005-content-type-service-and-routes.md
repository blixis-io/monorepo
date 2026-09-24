# 010.005 — Implement the content type service and REST routes

## Status

```text
not-started
```

## Parent plan

[010 — Content Modeling](./_index.md)

## Objective

Implement `ContentTypeService` and REST routes for content type CRUD with authorization, events, versioning of content types, and the safe-change rules from ADR 0010.

## Background

§9 REST for administration and CRUD; §15 content-type events; §30 permission checks in services.

## Requirements

- Service methods: `list`, `get`, `create`, `update` (increments `version`), `delete`; field add/update/remove/reorder within `update` or dedicated methods (decide for API ergonomics).
- Safe-change rules (ADR 0010): additive always allowed; changing a field type or `localized` flag when entries exist → `ConflictError` with guidance; field removal marks field `disabled` first (omitted from delivery, retained in versions) unless no entries reference it; deleting a content type with entries → `ConflictError`. Entry-existence checks use an internal query that plan 011 fills (initially "no entries" stub with TODO referencing 011.001).
- Authorization: `content.types.read` / `content.types.write` via `AUTHORIZATION_SERVICE`.
- Events: `content-type.created`, `content-type.updated` (with new version), `content-type.deleted`.
- Routes under `/api/v1/spaces/:spaceId/content-types` using `spaceScoped()`; optional `?environment=` defaulting to `main`.
- Extend isolation allow-list and authz matrix.
- Export `CONTENT_TYPE_SERVICE` token and types publicly.

## Architectural constraints

- Business rules in the service; routes only validate/parse and call the service.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/content/src/application/content-type.service.ts
modules/content/src/rest/content-type.routes.ts
modules/content/src/events.ts
modules/content/test/content-type.service.test.ts
apps/api/test/content-types.worker.test.ts
```

### Modify

```text
modules/content/src/module.ts
modules/content/src/index.ts
apps/api/test/tenant-routes.allowlist.ts
apps/api/test/authz-matrix.worker.test.ts
docs/contracts/events.md
```

### Delete

```text
None.
```

## Implementation steps

1. Implement service with rules and events.
2. Implement routes.
3. Extend isolation and authz tests.
4. API tests.

## Dependencies

Requires:

- [010.004 — Compile entry validators from content types](./004-entry-schema-compiler.md)

## Acceptance criteria

- [ ] Content types CRUD works end to end in the Workers pool.
- [ ] Viewer cannot create content types (403); other tenant gets 404.
- [ ] `content-type.updated` carries the new version.

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
- [ ] TODO stub for entry-existence check is tracked to 011.001.

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
