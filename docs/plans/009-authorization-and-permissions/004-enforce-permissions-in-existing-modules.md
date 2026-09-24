# 009.004 — Enforce permissions in existing modules

## Status

```text
not-started
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
tooling/boundaries/role-checks (or lint rule config)
```

### Modify

```text
modules/spaces/src/application/organization.service.ts
modules/spaces/src/application/space.service.ts
modules/spaces/src/application/locale.service.ts
modules/users/src/application/membership.service.ts
modules/auth/src/application/api-token.service.ts
modules/spaces/package.json
modules/users/package.json
modules/auth/package.json
apps/api/test/spaces.worker.test.ts
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

- [ ] Viewer cannot rename a space (403); non-member gets 404.
- [ ] Lint rule catches a deliberate role comparison.

## Validation

```bash
pnpm lint
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
- [ ] No TODO markers from 008.002 remain.

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
