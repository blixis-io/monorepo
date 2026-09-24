# 008.006 — Add the cross-tenant isolation test suite

## Status

```text
not-started
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
packages/testing/src/tenancy.ts
apps/api/test/tenancy-isolation.worker.test.ts
apps/api/test/tenant-routes.allowlist.ts
```

### Modify

```text
packages/testing/src/index.ts
docs/conventions/tenancy.md
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

- [ ] All tenant-scoped routes are covered and pass.
- [ ] Adding an uncovered tenant-scoped route makes the suite fail (verified once).

## Validation

```bash
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
- [ ] Harness is part of the definition of done for later domain plans (noted in their completion criteria).

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
