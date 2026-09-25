# 008.002 — Implement organization and space memberships

## Status

```text
completed
```

## Parent plan

[008 — Tenancy: Organizations, Spaces & Memberships](./_index.md)

## Objective

Add membership storage and `MEMBERSHIP_SERVICE` to `@blixis/users`: organization and space memberships with a role reference, list/add/remove operations, and member management routes.

## Background

§21 identity: `User → Membership → Organization/Space → Roles/Permissions`. §20 places the membership repository in `@blixis/users`. Roles and permission evaluation arrive in plan 009; here a membership stores a role key string (e.g. `owner`, `admin`, `editor`, `viewer`) that 009 turns into a reference.

## Requirements

- Migration in `@blixis/users`: `memberships(id, user_id fk, organization_id, space_id null, role_key text, created_at, updated_at)` unique `(user_id, organization_id, space_id)`; no FK to `@blixis/spaces` tables (users does not require spaces) — tenant IDs validated by spaces services.
- `MEMBERSHIP_SERVICE`: `addOrganizationMember`, `addSpaceMember`, `listMembers(tenant)`, `getMembership(userId, tenant)`, `listMembershipsForUser(userId)`, `changeRole`, `remove`; invariants: an organization always keeps ≥1 owner.
- Member management routes live in `@blixis/spaces` (it owns the tenant resources) and call `MEMBERSHIP_SERVICE`: `GET/POST /api/v1/organizations/:orgId/members`, `PATCH/DELETE .../members/:membershipId`, same for spaces.
- Add-by-email for existing users only; unknown email → 404 with guidance (invitations deferred).
- Events: `user.invited` reserved; emit `membership.created/removed` (best-effort) — record in events table.

## Architectural constraints

- `@blixis/users` must not import `@blixis/spaces` (no cycle, §48 Packages.7).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/users/src/application/membership.service.ts
modules/users/src/domain/membership.ts
modules/users/src/infrastructure/migrations/0002_create_memberships.ts
modules/users/test/memberships.test.ts
```

### Modify

```text
docs/ROADMAP.md
docs/contracts/events.md
docs/plans/008-tenancy-organizations-and-spaces/002-memberships.md
docs/plans/008-tenancy-organizations-and-spaces/_index.md
modules/users/package.json
modules/users/src/events.ts
modules/users/src/index.ts
modules/users/src/infrastructure/schema.ts
modules/users/src/module.ts
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Migration and repository in users.
2. Membership service with owner invariant.
3. Member routes in spaces.
4. Tests.

## Dependencies

Requires:

- [008.001 — Create the spaces module with organization and space schema](./001-organizations-and-spaces-schema.md)

## Acceptance criteria

- [x] Removing the last organization owner fails with `CONFLICT`.
- [x] `@blixis/users` has no dependency on `@blixis/spaces` (lint/boundary check passes).

## Validation

```bash
pnpm --filter @blixis/users --filter @blixis/spaces test
pnpm lint
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
- [x] Membership invariants enforced in the service, not in routes.

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

- **Table `users.memberships`** (migration `@blixis/users 0002_create_memberships`): `space_id` null = organization level.
  - `unique nulls not distinct (user_id, organization_id, space_id)`. A plain unique constraint treats NULLs as distinct and would allow duplicate organization memberships (Postgres 15+; Neon runs 18).
  - FK only to `users.users`. **No FK to `spaces.*`**: users must not depend on spaces (no cycle); tenant ids are validated by the spaces services that create memberships (008.003).
- **Roles (placeholder until plan 009, stored as `role_key`):** organization `owner | admin | member`, space `admin | editor | viewer`. They are validated per level (a space membership can't be `owner`).
- **`MEMBERSHIP_SERVICE`:**
  - `addOrganizationMember` (optionally in the caller's transaction, so space/org creation can add the owner atomically in 008.003), `addSpaceMember`;
  - `listMembers(scope)` (exact level), `getMembership`, `listMembershipsForUser`, `getSpaceAccess(userId, org, space)` → `{ organizationRole, spaceRole }` (for tenant resolution, 008.005);
  - `changeRole` and `remove`: scoped (a wrong organization/space → 404).
- **"At least one owner" invariant:** `changeRole` away from owner and `remove` of an owner run in a transaction that locks the target row and the organization's owner rows (`SELECT … FOR UPDATE`) and require another owner. Two concurrent removals of the last two owners serialize: exactly one succeeds (tested).
- **Events:** `membership.created` / `membership.removed` (best-effort); `user.invited` reserved; all registered in `docs/contracts/events.md`.
- **Deviation:** the member-management **routes** (`/organizations/:orgId/members`, space members, add-by-email) are built in 008.003 with the organization/space routes, because they need the same tenant verification (the caller's membership and the space belonging to the organization).
- **Tests:** 4 Postgres tests (org and space membership + NULLS NOT DISTINCT duplicate, per-level role validation, the owner invariant + scoped NotFound, concurrent last-owner removal). Local `db:migrate` applied `0002_create_memberships`.
