# 009.002 — Implement roles and role assignments

## Status

```text
completed
```

## Parent plan

[009 — Authorization & Permissions](./_index.md)

## Objective

Implement system roles with module-contributed default grants, custom organization roles stored in Postgres, and link memberships to roles.

## Background

§21 identity includes Roles/Permissions under Membership; §30 prefers permissions over role checks — roles are only a grouping mechanism evaluated by the permissions module.

## Requirements

- Contract extension (minimal): `PermissionDefinition.defaultRoles?: readonly ('owner'|'admin'|'editor'|'viewer')[]` so modules declare default grants declaratively — update contracts and docs.
- Migration: `roles(id, organization_id null for system, key, name, description, is_system, created_at)`, `role_permissions(role_id, permission_id)`.
- System roles seeded/derived from code at boot (not stored duplicates, or synced idempotently — decide; recommendation: derived in code, custom roles in DB).
- Migrate `memberships.role_key` semantics: system role keys or custom role IDs (decide representation; migration in `@blixis/users` if schema change needed).
- `ROLE_SERVICE`: list, create custom role, update permissions, delete (reject if assigned).
- Routes for role management.

## Architectural constraints

- `owner` always has all permissions and cannot be edited.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/permissions/src/domain/role.ts
modules/permissions/src/application/role.service.ts
modules/permissions/src/infrastructure/schema.ts
modules/permissions/src/infrastructure/role.repository.ts
modules/permissions/src/infrastructure/migrations/0001_create_roles.ts
modules/permissions/test/role.service.test.ts
modules/users/src/infrastructure/migrations/0003_system_role_keys.ts
```

### Modify

```text
packages/contracts/src/permissions.ts
packages/contracts/src/permissions.test.ts
modules/permissions/src/application/catalog.ts
modules/permissions/src/rest/routes.ts
modules/permissions/src/module.ts
modules/permissions/src/index.ts
modules/permissions/src/permissions.ts
modules/permissions/test/catalog.test.ts
modules/spaces/src/permissions.ts
modules/spaces/test/api.test.ts
modules/users/src/domain/membership.ts
modules/users/src/application/membership.service.ts
modules/users/src/module.ts
modules/users/test/memberships.test.ts
tooling/tenant-isolation/test/routes.ts
tooling/tenant-isolation/test/isolation.test.ts
tooling/postman/blixis.postman_collection.json
apps/docs/src/content/docs/concepts/permissions.mdx
```

### Delete

```text
None.
```

## Implementation steps

1. Extend contracts with default roles.
2. Implement role storage and service.
3. Update memberships representation.
4. Routes and tests.

## Dependencies

Requires:

- [009.001 — Create the permissions module and registry](./001-permissions-module-and-registry.md)

## Acceptance criteria

- [x] Custom role with `spaces.settings.read` only can be created and assigned.
- [x] Deleting an assigned role fails with `CONFLICT`.
- [x] Owner role grants every registered permission, including those added later by new modules.

## Validation

```bash
pnpm --filter @blixis/permissions --filter @blixis/users test
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
- [x] Contract change is additive and documented.

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

- **Contract changes:**
  - `SYSTEM_ROLES` (`owner`, `admin`, `editor`, `viewer`), `SystemRoleKey`, `isSystemRoleKey`.
  - `PermissionDefinition.defaultRoles?: readonly SystemRoleKey[]`, validated and frozen by `definePermission`.
  - `owner` implicitly holds every permission.
- **Decisions:**
  - System roles are **derived in code** from the catalog at setup and never stored. Custom roles live in `permissions.roles`, per organization, with names unique case-insensitively and system names reserved.
  - Permissions are stored as a `text[]` column instead of a `role_permissions` table: roles are always read and written whole. Ids no installed module declares are ignored when evaluating (`permissionsOf`) and rejected on write (`ValidationError`).
  - `memberships.role_key` holds a system role key or a custom role UUID. Users migration `0003_system_role_keys` renames the plan-008 organization role `member` to `viewer` (same access: it reads the organization and all its spaces) and adds an `(organization_id, role_key)` index for `countWithRole`.
  - The membership service accepts custom role ids; `@blixis/permissions` verifies they exist before assignment (009.004).
  - `owner` is assignable only to organization memberships (`assignableTo`).
- **Permission grants:**
  - `admin`: every permission except `organizations.owners.manage`.
  - `editor` and `viewer`: `organizations.read`, `spaces.read`, `roles.read`.
- **Owner-only permission:** `organizations.owners.manage` was added. Because the escalation guard (009.004) requires holding every permission of a role before granting it, only owners can grant `owner`, without any role-name comparison.
- **Deferred:** the role management routes move to 009.003, because they need the authorization service to check `roles.read` and `roles.manage`. `ROLE_SERVICE` itself is authorization-free data access, memoised per organization and request.
- `GET /api/v1/permissions` now also returns `defaultRoles`.
- **Staging:** run `pnpm db:migrate` (users `0003`, permissions `0001`) before deploying.
