# 008.006 — Add the cross-tenant isolation test suite

## Status

```text
completed
```

## Parent plan

[008 — Tenancy: Organizations, Spaces & Memberships](./_index.md)

## Objective

Create a reusable isolation test harness that, for every tenant-scoped route, seeds two tenants and asserts actors from tenant A cannot read or mutate tenant B's resources, and apply it to all routes so far.

## Background

§31 is a security property; it must be continuously verified as modules are added. The harness is extended by every later domain plan (content, assets, webhooks, releases).

## Requirements

- Harness in `@blixis/testing`: `seedTenants()` creating two orgs/spaces/users; `expectIsolated(routeSpec)` executing requests as the wrong tenant and asserting 404/403 and no data changes.
- Apply to all organizations/spaces/locales/members routes.
- CI fails if a new tenant-scoped route is not covered: add a check listing kernel routes under `/spaces/:spaceId` and `/organizations/:orgId` and comparing against the harness registry (simple allow-list file).
- Document in `docs/conventions/tenancy.md` how new modules register routes with the harness.

## Architectural constraints

- Tests run in the Workers pool against the test database.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/testing/src/isolation.ts
tooling/tenant-isolation/package.json
tooling/tenant-isolation/test/isolation.test.ts
tooling/tenant-isolation/test/routes.ts
tooling/tenant-isolation/tsconfig.json
```

### Modify

```text
docs/ROADMAP.md
docs/conventions/tenancy.md
docs/conventions/testing.md
docs/plans/008-tenancy-organizations-and-spaces/006-tenancy-isolation-tests.md
docs/plans/008-tenancy-organizations-and-spaces/_index.md
packages/testing/src/index.ts
pnpm-lock.yaml
tsconfig.json
```

### Delete

```text
None.
```

## Implementation steps

1. Build the harness.
2. Cover existing routes.
3. Add the coverage check.

## Dependencies

Requires:

- [008.005 — Resolve and verify tenant context per request](./005-tenant-context-resolution.md)

## Acceptance criteria

- [x] All tenant-scoped routes are covered and pass.
- [x] Adding an uncovered tenant-scoped route makes the suite fail (verified once).

## Validation

```bash
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
- [x] Harness is part of the definition of done for later domain plans (noted in their completion criteria).

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

- **Placement, decided:** the generic harness is in `@blixis/testing` (`expectIsolated`, `uncoveredTenantRoutes`, `isTenantScoped`, `isolationUrl`, `IsolationRoute` with `paramsFrom`); it knows no domain module (packages must not depend on modules). The **suite** is the private package `tooling/tenant-isolation`, which imports the API's real `blixis.config.ts` at runtime, like the Postman drift test. It runs in the Node pool because `pg` can't connect in the Workers pool (known issue).
- **`seedTenants()` from the spec** is the suite's `beforeAll` (it needs `@blixis/spaces`/`@blixis/users` services, which `@blixis/testing` can't import).
  - Victim organization B with spaces B1 (probed) and B2, a member with org and space memberships, and a deletable non-default locale.
  - Intruders: the owner of organization A (email `intruder@example.com`, so the "add member" probes would really succeed if isolation failed), that owner's API token, and an admin of **only** space B2 (no org membership).
- **Assertions:**
  - (1) Every tenant-scoped route is covered; `ISOLATION_ALLOW_LIST` is empty.
  - (2) Every probed route is really registered (typo guard: a misspelled path 404s and would "pass").
  - (3) The victim owner gets 200 on every GET (the params are valid).
  - (4) Every route as each intruder → 403/404, **and** the victim fingerprint (organizations, spaces, locales, memberships) is unchanged.
- **The coverage check already paid off:** the first registry used `:orgMembershipId`/`:spaceMembershipId`, but the routes are registered as `:membershipId`, and the check flagged them. Hence `paramsFrom`.
- **Mutation test (manual, not committed):** making `requireOrganizationMember` return `owner` for non-members made all three intruder tests fail, listing every leaking route (e.g. `PATCH /api/v1/organizations/:orgId → 200`, `DELETE …/members/:membershipId → 204`). Restored; `access.ts` unchanged.
- **Docs:** `docs/conventions/tenancy.md`, "The isolation suite (required for new routes)", explains how modules register routes, seed IDs, extend the fingerprint, and use `paramsFrom`; the testing-conventions table is updated.
- **Coverage:** 20 routes × 3 intruders. A clean build passes.
