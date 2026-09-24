# 008.002 — Implement organization and space memberships

## Status

```text
not-started
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
modules/users/src/domain/membership.ts
modules/users/src/application/membership.service.ts
modules/users/src/infrastructure/membership.repository.ts
modules/users/src/infrastructure/migrations/0002_create_memberships.sql
modules/users/test/membership.service.test.ts
modules/spaces/src/rest/member-routes.ts
```

### Modify

```text
modules/users/src/index.ts
modules/users/src/module.ts
modules/users/src/events.ts
modules/spaces/src/module.ts
docs/contracts/events.md
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

- [ ] Removing the last organization owner fails with `CONFLICT`.
- [ ] `@blixis/users` has no dependency on `@blixis/spaces` (lint/boundary check passes).

## Validation

```bash
pnpm test --filter @blixis/users --filter @blixis/spaces
pnpm lint
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
- [ ] Membership invariants enforced in the service, not in routes.

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
