# 011.003 — Implement entry management REST routes

## Status

```text
not-started
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
apps/api/test/entries.worker.test.ts
docs/api/management-conventions.md
```

### Modify

```text
modules/content/src/module.ts
apps/api/test/tenant-routes.allowlist.ts
apps/api/test/authz-matrix.worker.test.ts
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

- [ ] Entry CRUD works in Workers-pool tests.
- [ ] `GET /api/v1/entries/:id` for another tenant's entry returns 404.
- [ ] Pagination stable across inserts.

## Validation

```bash
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
- [ ] Management API conventions documented and applied to earlier modules' routes (or deviations listed).

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
