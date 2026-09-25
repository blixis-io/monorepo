# 009.003 — Implement the authorization service

## Status

```text
completed
```

## Parent plan

[009 — Authorization & Permissions](./_index.md)

## Objective

Implement `AUTHORIZATION_SERVICE` (`can`, `require`) evaluating actor type, memberships, roles, token scopes, and resource tenant ownership, with per-request memoisation.

## Background

§30 example `permissions.require({ actor, action, resource })`; §31 tenant checks; 002.007 contract.

## Requirements

- Evaluation rules:
  - `anonymous` → deny (`UnauthorizedError` from `require`);
  - `user` → union of permissions from org membership role and space membership role for `resource`'s tenant;
  - `apiToken` → owner's permissions ∩ token scopes (empty scopes = all owner permissions? decide; recommendation: explicit scopes required);
  - `deliveryKey` → only delivery read permissions for its space (plan 012 defines them);
  - `system` → allowed only if the call passes `allowSystem: true`.
- Resource ownership: resource must carry `organizationId`/`spaceId`; mismatch with actor tenant → deny; missing tenant on tenant-scoped type → `ModuleError`.
- Memoise membership/role loading per request scope.
- `require` throws `ForbiddenError` with safe message (no permission lists leaked for non-members; 404 semantics handled by callers where needed).
- Structured audit-friendly log at debug level: actor, action, decision.

## Architectural constraints

- No KV caching (plan decision).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/permissions/src/application/authorization.service.ts
modules/permissions/src/application/role.service.ts
modules/permissions/test/authorization.test.ts
modules/permissions/test/roles.api.test.ts
```

### Modify

```text
packages/contracts/src/permissions.ts
modules/permissions/src/application/role.store.ts (renamed from role.service.ts)
modules/permissions/src/module.ts
modules/permissions/src/index.ts
modules/permissions/src/rest/routes.ts
modules/permissions/test/role.store.test.ts (renamed from role.service.test.ts)
tooling/tenant-isolation/test/routes.ts
tooling/tenant-isolation/test/isolation.test.ts
tooling/tenant-isolation/package.json
tooling/tenant-isolation/tsconfig.json
tooling/postman/blixis.postman_collection.json
tooling/postman/{local,staging,production}.postman_environment.json
docs/development/postman.md
apps/docs/src/content/docs/concepts/permissions.mdx
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Implement evaluation.
2. Memoisation.
3. Unit + integration tests.

## Dependencies

Requires:

- [009.002 — Implement roles and role assignments](./002-roles-and-role-assignments.md)

## Acceptance criteria

- [x] Unit tests cover every actor type and tenant mismatch.
- [x] Token with scope `spaces.settings.read` cannot perform `spaces.settings.write` even if the owner can.

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
- [x] Deny-by-default verified.

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

- **Evaluation** (`createAuthorizer`, provided as `AUTHORIZATION_SERVICE`, plus the internal `AUTHORIZER` with `permissionsIn`):
  - `anonymous`: `UnauthorizedError`.
  - `user`: for a space permission, organization role ∪ space role; for an organization permission, the organization role only. A space membership never grants organization-scoped permissions.
  - `apiToken`: the owner's permissions ∩ scopes. **Decision:** explicit scopes are required, so a token without scopes can do nothing.
  - `deliveryKey`: denied until plan 012.
  - `system`: allowed only with `allowSystem: true`.
- **404 vs 403 lives in the service:** `require` throws `NotFoundError` (`<Type> not found` from `resource.type`) when the actor has no membership in the resource's tenant, and `ForbiddenError` for members without the permission. Callers don't reimplement the policy. The contract JSDoc now says so.
- **Programming errors:** an unknown permission id, or a resource without the tenant ids the permission's scope needs, throws `ModuleError`.
- **Tenant binding:** if the request is bound to a tenant (`spaceScoped()`), a resource from another organization or space is denied as `no-access`, as defence in depth against ids from untrusted input.
- **Memoisation:** a user's memberships are loaded once per request (`listMembershipsForUser`, one query), and custom roles once per organization and request (`ROLE_STORE`). There is no KV caching (plan decision).
- **Logging:** each decision is logged at `debug` (`authorization`: actor id, action, resource type/id, decision).
- **Roles endpoints** (moved here from 009.002): `GET/POST /organizations/:orgId/roles`, `PATCH/DELETE /organizations/:orgId/roles/:roleId`. The permissions module is now mounted at `/`.
- **Role layers:**
  - `ROLE_SERVICE` takes the actor and checks `roles.read` or `roles.manage`.
  - The 009.002 data layer became the internal `ROLE_STORE`. This avoids a circular dependency: the authorizer needs role data, and role management needs the authorizer.
- **Escalation guard:** creating, updating (old and new permissions), deleting, or granting a role (`assertCanGrant`) requires the actor to hold every permission in it at that level. At space level only space-scoped permissions count. This makes `owner` grantable by owners only, without role-name checks.
- **Isolation suite:**
  - Covers the 4 roles routes, 24 routes in total.
  - The intruder's API token now carries **every** scope, so isolation doesn't rely on missing scopes.
  - The fingerprint includes `permissions.roles`.
