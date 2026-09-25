# 009.004 — Enforce permissions in existing modules

## Status

```text
completed
```

## Parent plan

[009 — Authorization & Permissions](./_index.md)

## Objective

Replace temporary membership checks in users, auth, and spaces with `AUTHORIZATION_SERVICE.require` calls in services, and add a lint check forbidding role-name comparisons outside `@blixis/permissions`.

## Background

008.002 introduced temporary membership checks. §30 wants authorization in services, not handlers.

## Requirements

- Update services in spaces (organizations, spaces, locales, members), users (membership operations), auth (tokens: own tokens only).
- Keep 404-vs-403 policy consistent: non-members get 404; members lacking permission get 403.
- Add lint/grep check: patterns like `role === '` / `.role ==` / `roleKey ===` outside `modules/permissions` fail `pnpm lint`.
- Update API tests for new 403 cases.

## Architectural constraints

- Checks live in services (so REST, GraphQL, queues share them).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/spaces/src/application/members.service.ts
```

### Modify

```text
packages/contracts/src/permissions.ts
modules/spaces/src/application/access.ts
modules/spaces/src/application/tenancy.service.ts
modules/spaces/src/application/locales.service.ts
modules/spaces/src/application/tenant-resolver.ts
modules/spaces/src/rest/routes.ts
modules/spaces/src/module.ts
modules/spaces/src/index.ts
modules/spaces/package.json
modules/spaces/tsconfig.json
modules/spaces/test/api.test.ts
modules/spaces/test/tenant.test.ts
modules/spaces/test/repositories.test.ts
modules/users/src/application/membership.service.ts
modules/users/src/domain/membership.ts
modules/users/src/index.ts
modules/users/test/memberships.test.ts
tooling/boundaries/src/rules.ts
tooling/boundaries/src/rules.test.ts
tooling/boundaries/src/cli.ts
tooling/tenant-isolation/test/isolation.test.ts
tooling/postman/blixis.postman_collection.json
docs/conventions/tenancy.md
apps/docs/src/content/docs/concepts/tenancy.mdx
apps/docs/src/content/docs/concepts/authentication.mdx
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Inject `AUTHORIZATION_SERVICE` into services.
2. Replace temporary checks.
3. Add lint rule.
4. Update tests.

## Dependencies

Requires:

- [009.003 — Implement the authorization service](./003-authorization-service.md)

## Acceptance criteria

- [x] Viewer cannot rename a space (403); non-member gets 404.
- [x] Lint rule catches a deliberate role comparison.

## Validation

```bash
pnpm lint
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
- [x] No TODO markers from 008.002 remain.

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

- **Services take the actor.** `TENANCY_SERVICE`, `LOCALE_SERVICE`, `ENVIRONMENT_SERVICE.list` and the new `MEMBER_SERVICE` take an `Actor` (not a user id) and call `AUTHORIZATION_SERVICE.require` first. Routes are thin translators. `ENVIRONMENT_SERVICE.getDefault` stays authorization-free for internal platform use (documented).
- **Operation → permission:**

  | Operation | Permission |
  |---|---|
  | get organization, list spaces, list organization members | `organizations.read` |
  | rename organization | `organizations.settings.write` |
  | create space | `spaces.create` |
  | get space, list environments/locales/space members, `spaceScoped()` | `spaces.read` |
  | update space, change locales | `spaces.settings.write` |
  | delete space | `spaces.delete` |
  | change organization members | `organizations.members.manage` |
  | change space members | `spaces.members.manage` |

- **404 vs 403:** non-members still get 404, and members lacking a permission now get 403 (previously 404). The existing API tests were updated for the new 403 cases.
- **Member management moved from routes into `MEMBER_SERVICE`** (in `@blixis/spaces`, which now depends on `@blixis/permissions`). It adds `ROLE_SERVICE.assertCanGrant` for the granted role **and** the role being replaced or removed. As a result, only owners can create or remove owners, and custom role ids are accepted when they exist in the organization.
- **`role-name-check` boundary rule:** `pnpm lint` fails on role-name comparisons (`role === '…'`, `'…' === role`, `eq(x.roleKey, '…')`, `['owner', …].includes(`) outside `modules/permissions/`, test files, and the checker itself. Comment lines are ignored. It found exactly the four real checks.
- **`OWNER_ROLE`** (contracts) is used by `@blixis/users` for the last-owner data invariant. That's a data rule, not an access decision.
- **API tokens:**
  - They cannot create organizations (no scope covers it).
  - The tenant resolver needs `spaces.read` in the token's scopes.
  - The Postman token request now sends scopes.
- **Removed from `@blixis/users`:** `getSpaceAccess`, `SpaceAccess`, `organizationRoleSchema`, `spaceRoleSchema`. Role validation lives in `@blixis/permissions`.
- **Auth:** no change was needed. Token management already requires a user session, and tokens are owner-only.
- **Space creators** still become space `admin` (`SPACE_CREATOR_ROLE`), so a custom role that only grants `spaces.create` can manage its own spaces.
