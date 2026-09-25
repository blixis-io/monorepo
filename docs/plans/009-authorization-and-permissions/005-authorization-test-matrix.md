# 009.005 — Build the authorization test matrix

## Status

```text
completed
```

## Parent plan

[009 — Authorization & Permissions](./_index.md)

## Objective

Add a data-driven matrix test (role × permission-guarded operation × same/other tenant × actor type) that later plans extend for their routes.

## Background

Checkpoint CP4 requires evidence that authorization and tenancy compose correctly. A matrix is cheaper to extend than bespoke tests.

## Requirements

- Matrix harness in `@blixis/testing` (`defineAuthzMatrix`) that seeds users with each system role and API tokens with scopes.
- Cover all existing permission-guarded routes.
- Document how later modules add rows (`docs/conventions/authorization.md`).

## Architectural constraints

- Runs in the Workers pool against the test database.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/testing/src/authz-matrix.ts
packages/testing/src/authz-matrix.test.ts
tooling/tenant-isolation/test/api.ts
tooling/tenant-isolation/test/authz-routes.ts
tooling/tenant-isolation/test/authz-matrix.test.ts
docs/conventions/authorization.md
```

### Modify

```text
packages/testing/src/index.ts
tooling/tenant-isolation/test/isolation.test.ts
tooling/tenant-isolation/package.json
docs/conventions/tenancy.md
docs/ROADMAP.md (CP4)
docs/plans/009-authorization-and-permissions/_index.md
```

### Delete

```text
None.
```

## Implementation steps

1. Build harness.
2. Add rows for existing routes.
3. Documentation.

## Dependencies

Requires:

- [009.004 — Enforce permissions in existing modules](./004-enforce-permissions-in-existing-modules.md)

## Acceptance criteria

- [x] Matrix covers every permission-guarded route and passes.

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
- [x] CP4 recorded in plan Technical notes and ROADMAP.

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

- **Harness** (`@blixis/testing`):
  - `defineAuthzMatrix(routes)` validates permission ids and duplicate rows.
  - `checkAuthzMatrix({ t, routes, cases })` returns all failures at once, e.g. `space viewer: POST … → 201 (expected 403)`.
  - `expectedAuthzStatus` returns `401` for anonymous, `404` for no membership at the route's level, `2xx` when the permission is held, `403` otherwise.
  - `AuthzRoute` extends `IsolationRoute`, so `paramsFrom`, `isolationUrl` and `uncoveredTenantRoutes` are reused.
- **Deviation, location:** the matrix lives in `tooling/tenant-isolation/test/authz-matrix.test.ts` (Node pool, the API's real module list) rather than `apps/api/test/*.worker.test.ts`. `pg` still can't reach Postgres from the Workers pool (`pg-cloudflare` resolves without the `workerd` condition), the same reason as the isolation suite. Documented in `docs/conventions/authorization.md` and `testing.md`.
- **Cases** (12), each on a fresh tenant so allowed changes and deletions really run:
  - organization `owner`, `admin`, `editor` and `viewer`;
  - space-only `admin`, `editor` and `viewer`;
  - an owner of another organization;
  - an anonymous caller;
  - the owner's read-only API token (`organizations.read`, `spaces.read`) and a token with every scope.
- **Rows:** 24, covering every tenant-scoped route, with a coverage check against the registered routes. That is 288 requests per run, about 3 s locally.
- **Expected permissions** are derived from `systemRoles(catalog)`, so a change to a module's `defaultRoles` moves the expectations with it.
- **Mutation check:** after removing the `spaces.settings.write` check from `LOCALE_SERVICE.create`, the matrix reported exactly the 5 cases that lack the permission (org editor/viewer, space editor/viewer, read-only token). The check was restored.
- `apiModules()` is shared by the isolation suite and the matrix (`test/api.ts`).
- **Local end-to-end:** migrations applied to local Postgres (users `0003`, permissions `0001`); Newman against `wrangler dev` ran 40 requests / 90 assertions with 0 failures.
