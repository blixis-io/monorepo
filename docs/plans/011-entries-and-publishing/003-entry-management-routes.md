# 011.003 — Implement entry management REST routes

## Status

```text
completed
```

## Parent plan

[011 — Entries, Versions & Publishing](./_index.md)

## Objective

Expose the draft lifecycle via REST routes from §9 with input validation, pagination, filtering, and consistent response shapes.

## Background

§9 route list; §28 error mapping; §31 tenant verification for entry-ID routes.

## Requirements

- `GET /api/v1/spaces/:spaceId/entries?contentType=&updatedSince=&limit=&cursor=&fields.<apiId>=` (MVP filters per ADR 0010).
- `POST /api/v1/spaces/:spaceId/entries`.
- `GET/PATCH/DELETE /api/v1/entries/:id` — tenant resolved from the entry (via service), membership verified.
- Response shape documented (`{ data, meta: { cursor } }` or similar) and consistent with spaces routes — define `docs/api/management-conventions.md` if not yet present (pagination, errors, IDs, timestamps).
- `ETag`/`If-Match` support mapping to `expectedVersion` (optional but recommended).
- Extend isolation allow-list and authz matrix.

## Architectural constraints

- Routes contain parsing/validation/serialization only.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/content/src/rest/entry.routes.ts
modules/content/test/entries.api.test.ts
packages/testing/src/isolation.test.ts
docs/api/management-conventions.md
```

### Modify

```text
modules/content/src/module.ts
modules/content/src/index.ts
packages/testing/src/isolation.ts (TENANT_SEGMENTS: entries/:entryId)
tooling/tenant-isolation/test/routes.ts (isolation registry; the plan's apps/api/test/tenant-routes.allowlist.ts)
tooling/tenant-isolation/test/isolation.test.ts
tooling/tenant-isolation/test/authz-routes.ts (authz matrix; the plan's apps/api/test/authz-matrix.worker.test.ts)
tooling/tenant-isolation/test/authz-matrix.test.ts
tooling/postman/src/collection.test.ts (query strings ignored when matching routes)
tooling/postman/blixis.postman_collection.json
tooling/postman/{local,staging,production}.postman_environment.json
docs/development/postman.md
```

### Delete

```text
None.
```

## Implementation steps

1. Define request/response schemas.
2. Implement routes.
3. Tests incl. pagination and filters.
4. Conventions doc.

## Dependencies

Requires:

- [011.002 — Implement ContentService draft lifecycle](./002-content-service-draft-lifecycle.md)

## Acceptance criteria

- [x] Entry CRUD works in Workers-pool tests.
- [x] `GET /api/v1/entries/:id` for another tenant's entry returns 404.
- [x] Pagination stable across inserts.

## Validation

```bash
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
- [x] Management API conventions documented and applied to earlier modules' routes (or deviations listed).

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

- **Routes:**
  - `GET/POST /spaces/:spaceId/entries` use `spaceScoped()`, with `?environment=`.
  - `GET/PATCH/DELETE /entries/:entryId` use the new **`entryScoped()`** middleware. It calls `CONTENT_SERVICE.resolveTenant` (content read permission, `404` for non-members) and then binds the entry's organization, space and environment through `TENANT_BINDER`, so events, logs and idempotency keys see the tenant, as with `spaceScoped()`. It's exported for later entry routes (publish, versions).
- **List query:** `contentType`, `state`, `updatedSince`, `limit`, `cursor`, and `fields.<apiId>=…`. The response is `{ entries, nextCursor }`.
- **Concurrency:**
  - `ETag: "<version>"` on create, get and update responses;
  - `If-Match: "3"` (weak `W/` tolerated) maps to `expectedVersion` on `PATCH` and on the optional `DELETE` check, and a body `expectedVersion` wins;
  - a `PATCH` without either gives `400`.
- **Conventions:** `docs/api/management-conventions.md` defines paths, tenancy (401/404/403), representations, list and cursor pagination, concurrency (version/ETag/If-Match), idempotent commands, and errors.
- **Isolation:**
  - `isTenantScoped` recognises resource-id routes through `TENANT_SEGMENTS` (`entries/:entryId`), so the isolation suite and the authorization matrix must now cover entry-id routes.
  - Both cover the 5 entry routes. The fingerprint includes entries and versions.
  - Matrix fixtures use an `article` type for entries, so the content type rows can still delete `page`.
- **Postman:**
  - the Content model folder gains create/list (with a field filter)/get/update (`If-Match`)/delete entry;
  - the drift test now ignores query strings.
- **Local end-to-end:** Newman against `wrangler dev` after `db:migrate` (content `0002`) ran 53 requests / 118 assertions with 0 failures.
