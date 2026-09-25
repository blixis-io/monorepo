# 008.003 — Implement organization/space services and management routes

## Status

```text
completed
```

## Parent plan

[008 — Tenancy: Organizations, Spaces & Memberships](./_index.md)

## Objective

Implement `OrganizationService` and `SpaceService` with transactional creation (space + default environment + default locale + owner membership + `space.created` event) and REST routes for organizations and spaces.

## Background

§9 lists `GET/POST /api/v1/spaces`; §15 lists `space.created`; §2.4 business logic lives in services. This is the first multi-module transactional use case (spaces + users memberships + events outbox in one transaction).

## Requirements

- Services: `createOrganization`, `listOrganizationsForActor`, `getOrganization`, `renameOrganization`; `createSpace`, `listSpaces(orgId)`, `getSpace`, `updateSpace`, `deleteSpace` (guarded: only empty spaces in MVP or cascade policy — decide and document).
- Creating an organization creates an owner membership for the actor (org level).
- Creating a space in one transaction: space, `main` environment, default locale (input or `en-US`), space owner membership, `space.created` (transactional).
- Routes: `GET/POST /api/v1/organizations`, `GET/PATCH /api/v1/organizations/:orgId`, `GET/POST /api/v1/organizations/:orgId/spaces`, `GET/PATCH/DELETE /api/v1/spaces/:spaceId`.
- Temporary authorization: membership existence check only (replaced by permission checks in 009.004) — mark with TODO referencing 009.004.
- Tests: unit, integration, API.

## Architectural constraints

- Services receive the transaction scope and pass it to `MEMBERSHIP_SERVICE` and the event bus.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/spaces/src/application/access.ts
modules/spaces/src/application/tenancy.service.ts
modules/spaces/src/rest/routes.ts
modules/spaces/test/api.test.ts
```

### Modify

```text
apps/api/package.json
apps/api/src/blixis.config.ts
apps/api/tsconfig.json
docs/ROADMAP.md
docs/contracts/events.md
docs/development/postman.md
docs/plans/008-tenancy-organizations-and-spaces/003-space-service-and-management-routes.md
docs/plans/008-tenancy-organizations-and-spaces/_index.md
modules/spaces/src/events.ts
modules/spaces/src/index.ts
modules/spaces/src/infrastructure/repositories.ts
modules/spaces/src/module.ts
modules/users/src/application/membership.service.ts
pnpm-lock.yaml
tooling/postman/blixis.postman_collection.json
tooling/postman/local.postman_environment.json
tooling/postman/package.json
tooling/postman/production.postman_environment.json
tooling/postman/src/collection.test.ts
tooling/postman/staging.postman_environment.json
tooling/postman/tsconfig.json
```

### Delete

```text
None.
```

## Implementation steps

1. Implement services with transactions and events.
2. Implement routes with input validation.
3. Tests (including rollback: failure after space insert leaves nothing).

## Dependencies

Requires:

- [008.001 — Create the spaces module with organization and space schema](./001-organizations-and-spaces-schema.md)
- [008.002 — Implement organization and space memberships](./002-memberships.md)

## Acceptance criteria

- [x] `POST /api/v1/organizations/:orgId/spaces` creates space, environment, locale, membership, and one outbox event atomically.
- [x] Non-members receive 404 (not 403) for spaces they cannot see — document the choice to avoid ID enumeration.

## Validation

```bash
pnpm --filter @blixis/spaces test
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
- [x] Vertical slice complete: route → service → repository → Hyperdrive → Postgres (CP4a note).

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

- **`TENANCY_SERVICE`** (one service, not separate organization and space services): every method takes the acting `userId` (the user, or an API token's owner) and checks membership first.
  - **Non-members always get 404**, never 403: existence is not revealed (§31).
  - Organizations: `createOrganization`, `listOrganizations`, `getOrganization`, `renameOrganization`.
  - Spaces: `createSpace`, `listSpaces`, `getSpace` (with environments and locales), `updateSpace`, `deleteSpace`.
- **Temporary authorization** (TODO(009.004) in `application/access.ts`):
  - organization members read; owners and admins manage;
  - spaces are read by members of the organization or the space; organization owners/admins and space admins manage;
  - only owners grant or revoke `owner` (403 for admins).
- **Creating an organization:** organization + owner membership in one transaction (`addOrganizationMember` with the caller's transaction), then best-effort `organization.created`. Gated by `spacesModule({ allowOrganizationCreation })`, default `true` (the plan default).
- **Creating a space, in one transaction:** space, `main` environment (default), default locale (input or `en-US`, canonicalized), **space `admin` membership for the creator** (space roles have no `owner`), and the transactional `space.created`. `addSpaceMember` gained the caller-transaction option for this.
- **Delete policy, decided:** a hard delete of the space with its environments, locales, and all space memberships (`MEMBERSHIP_SERVICE.removeAllForSpace`, new), plus a **transactional `space.deleted`**. Modules storing space data subscribe and delete their own rows (there are no cross-module FKs). An "only empty spaces" rule can't be checked across modules. Registered in the events register.
- **Member routes (from 008.002)** in `@blixis/spaces`:
  - `GET/POST /organizations/:orgId/members`, `PATCH/DELETE …/:membershipId`, and the same for `/spaces/:spaceId/members`;
  - add by email, **existing users only**; an unknown email → 404 with guidance ("Invitations are not available yet…");
  - responses include the user's email and display name.
- **Routes** are mounted at `rest.path: '/'` (`/api/v1/organizations/*` and `/api/v1/spaces/*`).
- **Postman:**
  - **Found a flaw in the drift test:** it kept its own copy of the API module list, and my update to that copy silently failed (multi-line), so the new routes weren't checked. It now **imports `apps/api/src/blixis.config.ts`** at runtime; it immediately listed the 17 missing endpoints.
  - Added folders Organizations, Spaces, Members, and Cleanup, with variables `organizationId`, `spaceId`, `memberEmail`, `orgMembershipId`, `spaceMembershipId`; slugs use `{{$timestamp}}`.
- **Verification:**
  - 6 API tests (organization owner/404/409/401; space provisioning + event + 409/400 + default locale; cross-organization 404 on 6 routes; editor read-only + delete event + post-delete 404; members by email, owner-only owner changes, last-owner 409; creation disabled 403).
  - **Newman on the real Worker (`wrangler dev`): 30 requests, 68 assertions, 0 failures**, including member management with a second user.
  - Local `db:migrate` applied `@blixis/spaces 0001`.
- **Staging:** `db:migrate` (users 0002, spaces 0001) before the next deploy.
