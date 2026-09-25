# 008.004 — Implement environment and locale management

## Status

```text
completed
```

## Parent plan

[008 — Tenancy: Organizations, Spaces & Memberships](./_index.md)

## Objective

Expose read access to the default environment and full CRUD for space locales, including default-locale switching and fallback chains, with validation that prevents invalid states.

## Background

§21 includes Environment and Locale under Space. MVP supports only the default environment (see plan decisions); locales are needed by content storage (plan 010).

## Requirements

- `EnvironmentService.getDefault(spaceId)`, `list(spaceId)`; no create/clone in MVP (return 501 or omit routes — omit; document deferred).
- `LocaleService`: list/create/update/delete; exactly one default; fallback must reference an existing locale and not form a cycle; deleting default or a fallback target is rejected with `ConflictError`.
- Routes: `GET /api/v1/spaces/:spaceId/environments`, `GET/POST /api/v1/spaces/:spaceId/locales`, `PATCH/DELETE /api/v1/spaces/:spaceId/locales/:localeId`.
- Events: `locale.created/updated/deleted` (best-effort) — content may subscribe later.
- Export `LOCALE_SERVICE`/`ENVIRONMENT_SERVICE` tokens for content module use.

## Architectural constraints

- Locale codes validated as BCP 47.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/spaces/src/application/locales.service.ts
```

### Modify

```text
docs/ROADMAP.md
docs/contracts/events.md
docs/development/postman.md
docs/plans/008-tenancy-organizations-and-spaces/004-environments-and-locales.md
docs/plans/008-tenancy-organizations-and-spaces/_index.md
modules/spaces/src/events.ts
modules/spaces/src/index.ts
modules/spaces/src/infrastructure/repositories.ts
modules/spaces/src/module.ts
modules/spaces/src/rest/routes.ts
modules/spaces/test/api.test.ts
tooling/postman/blixis.postman_collection.json
tooling/postman/local.postman_environment.json
tooling/postman/production.postman_environment.json
tooling/postman/staging.postman_environment.json
```

### Delete

```text
None.
```

## Implementation steps

1. Implement services with invariants.
2. Routes and events.
3. Tests for cycle detection and default switching.

## Dependencies

Requires:

- [008.003 — Implement organization/space services and management routes](./003-space-service-and-management-routes.md)

## Acceptance criteria

- [x] Switching default locale is atomic (old default unset, new set).
- [x] Fallback cycles are rejected with `VALIDATION_FAILED`.

## Validation

```bash
pnpm --filter @blixis/spaces test
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
- [x] Deferred environment features documented in the plan Technical notes and ROADMAP deferred list.

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

- **`ENVIRONMENT_SERVICE`** (`list`, `getDefault`) and **`LOCALE_SERVICE`** (`list`, `create`, `update`, `delete`) take a **verified `SpaceTenant`** (`{ organizationId, spaceId }`) from the caller. Routes get it from the access check today, and from the tenant resolver in 008.005. Queries use `tenantScope`.
- **Environments:** read-only (`GET /spaces/:spaceId/environments`). Create/clone routes are **omitted** (deferred per plan 008; no 501 stubs).
- **Locale rules (in a transaction):**
  - codes are canonical BCP 47 and unique per space (409);
  - `isDefault: true` clears the old default first (the partial unique index allows only one);
  - `isDefault: false` on the default → 400 ("make another locale the default instead");
  - a fallback must exist in the space and differ from the locale itself, and the fallback chain is walked to reject cycles (409);
  - deleting the default or a locale another locale falls back to → 409, naming the dependents.
- **Access:** readers (space access) list environments and locales; managers (organization owner/admin, space admin) create, update, and delete. Non-members get 404.
- **Events:** `locale.created/updated/deleted` (best-effort), registered.
- **Tests:** 4 API tests (environments list + viewer read-only + manager create; the default swap + 400 on unset; fallback existence / self / cycle / duplicate + deletion guards + event sequence; canonical `pt-br` → `pt-BR` + invalid 400).
- **Postman:** new "Environments & locales" folder (+ `localeId`). **Newman on the real Worker: 35 requests, 78 assertions, 0 failures.**
