# 009.003 — Implement the authorization service

## Status

```text
not-started
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
modules/permissions/test/authorization.service.test.ts
```

### Modify

```text
modules/permissions/src/module.ts
modules/permissions/src/index.ts
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

- [ ] Unit tests cover every actor type and tenant mismatch.
- [ ] Token with scope `spaces.settings.read` cannot perform `spaces.settings.write` even if the owner can.

## Validation

```bash
pnpm test --filter @blixis/permissions
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
- [ ] Deny-by-default verified.

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
