# 009.001 — Create the permissions module and registry

## Status

```text
completed
```

## Parent plan

[009 — Authorization & Permissions](./_index.md)

## Objective

Create `@blixis/permissions` exposing the registered permission catalogue (from kernel contributions) and `GET /api/v1/permissions`.

## Background

Modules declare `permissions` in their definitions (§5); the kernel collects and de-duplicates them (003.007). The permissions module turns the catalogue into a queryable service for roles and UIs.

## Requirements

- Scaffold `modules/permissions` (capability `blixis.permissions`; requires users, spaces, database).
- `PERMISSION_CATALOG` service: `list()`, `get(id)`, `assertKnown(id)`.
- Declare permissions for existing modules (users, auth, spaces, permissions itself) in their module definitions, e.g. `spaces.settings.read`, `spaces.settings.write`, `users.read`, `users.invite`, `organizations.members.manage`, `roles.manage`, `auth.tokens.manage`.
- Route `GET /api/v1/permissions` (authenticated) returning the catalogue grouped by module.

## Architectural constraints

- Permission naming rules from 002.007.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/permissions/package.json
modules/permissions/tsconfig.json
modules/permissions/tsconfig.test.json
modules/permissions/src/index.ts
modules/permissions/src/module.ts
modules/permissions/src/permissions.ts
modules/permissions/src/application/catalog.ts
modules/permissions/src/rest/routes.ts
modules/permissions/test/catalog.test.ts
modules/spaces/src/permissions.ts
```

### Modify

```text
modules/spaces/src/module.ts
modules/spaces/src/index.ts
apps/api/src/blixis.config.ts
apps/api/package.json
apps/api/tsconfig.json
tooling/postman/blixis.postman_collection.json
tsconfig.json
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Scaffold module.
2. Add permission declarations to existing modules.
3. Implement catalogue service and route.
4. Tests.

## Dependencies

Requires:

- [008.006 — Add the cross-tenant isolation test suite](../008-tenancy-organizations-and-spaces/006-tenancy-isolation-tests.md)

## Acceptance criteria

- [x] `GET /api/v1/permissions` lists all declared permissions with owning module.
- [x] Unknown permission lookups throw `ModuleError`.

## Validation

```bash
pnpm --filter @blixis/permissions test
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
- [x] Permission names reviewed for consistency across modules.

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

- `PERMISSION_CATALOG` is app-scoped and immutable, built once at setup from `KERNEL_CONTRIBUTIONS.permissions`. `list()` keeps module bootstrap order, and `scope` defaults to `space`. `assertKnown` throws `ModuleError`, because an unknown id in code is a programming error, not a deny.
- `GET /api/v1/permissions` answers user and API-token actors with `{ modules: [{ module, permissions: [{ id, description, scope }] }] }`. Anonymous callers get 401.
- **Permission set** (reviewed for consistency: `<namespace>.<resource?>.<verb>`, where the verbs are `read`, `write`, `create`, `delete` and `manage`):
  - `@blixis/spaces`, organization scope: `organizations.read`, `organizations.settings.write`, `organizations.members.manage`, `spaces.create`.
  - `@blixis/spaces`, space scope: `spaces.read`, `spaces.settings.write` (includes locales), `spaces.delete`, `spaces.members.manage`.
  - `@blixis/permissions`, organization scope: `roles.read`, `roles.manage`.
- **Deviations from the suggested list:**
  - No `users.*` permissions: `/users/me` is self-service and needs no tenant permission. `users.invite` waits for invitations.
  - No `auth.tokens.manage`: API tokens are personal (an owner check, not a tenant permission), and API-token actors already can't manage tokens.
- Modules export their permission definitions as constants (`SPACES_PERMISSIONS`, `ROLE_PERMISSIONS`), so services reference typed ids instead of string literals.
- In this task the module has no database dependency. Roles (009.002) add the migration and the `requires`.
