# 009.002 — Implement roles and role assignments

## Status

```text
not-started
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
modules/permissions/src/infrastructure/role.repository.ts
modules/permissions/src/infrastructure/migrations/0001_create_roles.sql
modules/permissions/test/role.service.test.ts
```

### Modify

```text
packages/contracts/src/permissions.ts
modules/permissions/src/rest/routes.ts
modules/permissions/src/module.ts
modules/users/src/infrastructure/migrations/ (new migration if needed)
modules/users/src/module.ts
modules/spaces/src/module.ts
modules/auth/src/module.ts
docs/contracts/README.md
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

- [ ] Custom role with `spaces.settings.read` only can be created and assigned.
- [ ] Deleting an assigned role fails with `CONFLICT`.
- [ ] Owner role grants every registered permission, including those added later by new modules.

## Validation

```bash
pnpm --filter @blixis/permissions --filter @blixis/users test
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
- [ ] Contract change is additive and documented.

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
