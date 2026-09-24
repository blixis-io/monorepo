# 002.007 — Define actor, permission, and authorization contracts

## Status

```text
not-started
```

## Parent plan

[002 — Public Contracts](./_index.md)

## Objective

Define the `Actor` model, `PermissionDefinition`, permission naming rules, the `AuthorizationService` interface and its service token, and resource descriptors used for tenant-aware checks.

## Background

§30 separates authentication (who) from authorization (may they), requires service-level checks like `permissions.require({ actor, action, resource })`, and prefers permission strings over role checks. §31 requires every check to confirm tenant ownership. Modules declare permissions in their definition (§5).

## Requirements

- Define `Actor` as a discriminated union: `user` (userId), `apiToken` (tokenId, ownerId, scopes), `deliveryKey` (keyId, spaceId, kind `delivery|preview`), `system` (component name), `anonymous`.
- Define `PermissionDefinition` (`id` like `content.publish`, `description`, optional `scope: 'organization' | 'space'`).
- Define `PermissionId` string type with naming rule `<module>.<action>` or `<module>.<resource>.<action>` (§30 examples).
- Define `ResourceRef` (`type`, `id?`, `organizationId?`, `spaceId?`) so checks always carry tenant ownership (§31).
- Define `AuthorizationService` with `can(check): Promise<boolean>` and `require(check): Promise<void>` (throws `ForbiddenError`/`UnauthorizedError`), and `AUTHORIZATION_SERVICE` token.
- Tests: type tests for the union narrowing; token identity.

## Architectural constraints

- No role concepts in contracts (roles are an implementation detail of `@blixis/permissions`, plan 009).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/contracts/src/permissions.test-d.ts
```

### Modify

```text
packages/contracts/src/permissions.ts
packages/contracts/src/index.ts
docs/contracts/README.md
```

### Delete

```text
None.
```

## Implementation steps

1. Write actor union and helpers such as `isUserActor`.
2. Write permission definition/ID types.
3. Write `ResourceRef`, `AuthorizationCheck`, `AuthorizationService`, token.
4. Tests and docs.

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```ts
export interface AuthorizationCheck {
  readonly actor: Actor
  readonly action: PermissionId
  readonly resource: ResourceRef
}
export interface AuthorizationService {
  can(check: AuthorizationCheck): Promise<boolean>
  require(check: AuthorizationCheck): Promise<void>
}
export const AUTHORIZATION_SERVICE = createServiceToken<AuthorizationService>('@blixis/permissions.authorization')
```

## Dependencies

Requires:

- [002.003 — Define typed service tokens and capability identifiers](./003-define-service-tokens-and-capabilities.md)
- [002.004 — Define the public error model](./004-define-public-errors.md)

## Acceptance criteria

- [ ] `Actor` narrowing works in type tests for all variants.
- [ ] `AUTHORIZATION_SERVICE` exported and documented.
- [ ] `ResourceRef` requires at least one of `organizationId`/`spaceId` for tenant-scoped types (documented rule; enforced at runtime in plan 009).

## Validation

```bash
pnpm test --filter @blixis/contracts
pnpm typecheck
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
- [ ] Contracts contain no role names or role checks.

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
