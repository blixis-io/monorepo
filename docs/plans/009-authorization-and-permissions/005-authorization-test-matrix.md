# 009.005 — Build the authorization test matrix

## Status

```text
not-started
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
apps/api/test/authz-matrix.worker.test.ts
docs/conventions/authorization.md
```

### Modify

```text
packages/testing/src/index.ts
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

- [ ] Matrix covers every permission-guarded route and passes.

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
- [ ] CP4 recorded in plan Technical notes and ROADMAP.

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
