# 009.001 — Create the permissions module and registry

## Status

```text
not-started
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
modules/permissions/src/index.ts
modules/permissions/src/module.ts
modules/permissions/src/application/catalog.ts
modules/permissions/src/rest/routes.ts
modules/permissions/test/catalog.test.ts
```

### Modify

```text
modules/users/src/module.ts
modules/auth/src/module.ts
modules/spaces/src/module.ts
apps/api/src/blixis.config.ts
apps/api/package.json
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

- [ ] `GET /api/v1/permissions` lists all declared permissions with owning module.
- [ ] Unknown permission lookups throw `ModuleError`.

## Validation

```bash
pnpm --filter @blixis/permissions test
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
- [ ] Permission names reviewed for consistency across modules.

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
