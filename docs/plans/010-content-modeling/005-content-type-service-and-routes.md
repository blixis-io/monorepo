# 010.005 — Implement the content type service and REST routes

## Status

```text
review
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
modules/content/test/content-types.api.test.ts
```

### Modify

```text
modules/content/src/module.ts
modules/content/src/index.ts
modules/content/src/rest/field-types.routes.ts
tooling/tenant-isolation/test/routes.ts (isolation registry; the plan's apps/api/test/tenant-routes.allowlist.ts)
tooling/tenant-isolation/test/isolation.test.ts
tooling/tenant-isolation/test/authz-routes.ts (authz matrix; the plan's apps/api/test/authz-matrix.worker.test.ts)
tooling/tenant-isolation/test/authz-matrix.test.ts
tooling/tenant-isolation/tsconfig.json
tooling/postman/blixis.postman_collection.json
tooling/postman/{local,staging,production}.postman_environment.json
docs/development/postman.md
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

- [x] Content types CRUD works end to end in the Workers pool.
- [x] Viewer cannot create content types (403); other tenant gets 404.
- [x] `content-type.updated` carries the new version.

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
- [x] TODO stub for entry-existence check is tracked to 011.001.

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

- **API ergonomics decision:**
  - `PATCH` takes top-level properties, and `fields`, when present, is the **complete ordered list**. Fields are matched by `id`; new fields omit it and get a `newShortId()`.
  - `version` is required on every `PATCH` (optimistic concurrency), and a stale version gets `409`.
  - The API speaks `apiId`: `displayField` and `showWhen.field` name fields by `apiId` (`showWhen` also accepts ids), while storage keeps stable ids.
  - `GET ?kind=entry|component` filters the list.
- **Validation of definitions** (all issues at once, with paths such as `fields.1.settings.maxLength`):
  - unknown field types, settings validated per type (with defaults filled in), and unique `apiId`s and ids;
  - reserved `apiId`s and existing groups;
  - `showWhen` must name a non-localized sibling;
  - component fields can't be localized, and non-localizable types reject `localized`;
  - `blocks.componentIds` must be components of the same environment, `reference`/`link` `contentTypeIds` must be entry types (a component may allow itself);
  - `displayField` must be a `text` or `longText` field.
- **Safe-change rules (ADR 0010 §10):**
  - Type and `localized` changes, and removing a field that isn't disabled, are refused while entries exist (`409` with guidance).
  - The kind can't change while entries exist or other types use the type.
  - Delete is refused while other types reference the type, or while entries exist.
  - The limit is 500 types per environment.
  - Settings are validated before these conflict checks, so a type change must send settings valid for the new type.
- **Entry usage:** the `ENTRY_USAGE` service token is provided as "no entries" until plan 011 (`TODO(011.001)`). Tests override it to exercise the rules with entries.
- **Events** (best-effort, registered in `docs/contracts/events.md`): `content-type.created`, `content-type.updated` and `content-type.deleted`, with `{ contentTypeId, environmentId, apiId, kind, version }`.
- **Routes:** all five use `spaceScoped()`, so the environment comes from `?environment=` (default `main`) and an unknown environment gives `404`. The module's REST app is now mounted at `/`, serving `/field-types` and the content type routes.
- **Deviation, test location:** the isolation suite and authorization matrix live in `tooling/tenant-isolation` (Node pool), not in `apps/api/test/*.worker.test.ts`. Both now cover the 5 new routes, and the fingerprint includes `content.content_types`.
- **Local end-to-end:** after `db:migrate` (content `0001`), Newman against `wrangler dev` ran 48 requests / 107 assertions with 0 failures.
