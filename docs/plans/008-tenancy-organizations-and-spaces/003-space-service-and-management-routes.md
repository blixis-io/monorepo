# 008.003 — Implement organization/space services and management routes

## Status

```text
not-started
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
modules/spaces/src/application/organization.service.ts
modules/spaces/src/application/space.service.ts
modules/spaces/src/rest/routes.ts
modules/spaces/test/space.service.test.ts
apps/api/test/spaces.worker.test.ts
```

### Modify

```text
modules/spaces/src/module.ts
modules/spaces/src/index.ts
docs/contracts/events.md
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

- [ ] `POST /api/v1/organizations/:orgId/spaces` creates space, environment, locale, membership, and one outbox event atomically.
- [ ] Non-members receive 404 (not 403) for spaces they cannot see — document the choice to avoid ID enumeration.

## Validation

```bash
pnpm test --filter @blixis/spaces
pnpm --filter @blixis/api test
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
- [ ] Vertical slice complete: route → service → repository → Hyperdrive → Postgres (CP4a note).

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
