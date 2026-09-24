# 008.005 — Resolve and verify tenant context per request

## Status

```text
not-started
```

## Parent plan

[008 — Tenancy: Organizations, Spaces & Memberships](./_index.md)

## Objective

Provide a reusable, transport-agnostic way for modules to resolve `organizationId`/`spaceId`/`environmentId` from a request, verify that the resource exists and that the actor has a membership (or valid key), and populate `RequestContext.tenant`.

## Background

§31: queries must always be scoped; never trust an ID alone. Every tenant-scoped module (content, assets, webhooks, releases) needs this, and GraphQL delivery (012) resolves tenant from delivery keys instead of routes.

## Requirements

- `TENANT_RESOLVER` service (exported by `@blixis/spaces`): `resolveSpace(actor, spaceId, environmentKey?)` → `TenantContext` or `NotFoundError`.
- Hono middleware factory exported for module route authors: `spaceScoped()` reading `:spaceId` (and optional `:environment` or `?environment=`), attaching tenant to request context; memoised per request scope.
- Service-level helper `assertSameTenant(resource, ctx.tenant)` in `@blixis/database` or contracts (decide) to double-check loaded resources.
- System and API-token actors: token owner's memberships apply; system actors must pass explicit tenant.
- Document the pattern in `docs/conventions/tenancy.md` with a canonical example route.

## Architectural constraints

- Middleware must not contain business logic beyond resolution/verification.
- 404 for non-member access (consistent with 008.003).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/spaces/src/application/tenant-resolver.ts
modules/spaces/src/rest/space-scoped.ts
modules/spaces/test/tenant-resolver.test.ts
docs/conventions/tenancy.md
```

### Modify

```text
modules/spaces/src/index.ts
modules/spaces/src/module.ts
modules/spaces/src/rest/routes.ts
packages/database/src/tenancy.ts
```

### Delete

```text
None.
```

## Implementation steps

1. Implement resolver with membership check.
2. Implement middleware and memoisation.
3. Refactor spaces routes to use it.
4. Document the pattern.

## Dependencies

Requires:

- [008.004 — Implement environment and locale management](./004-environments-and-locales.md)
- [008.002 — Implement organization and space memberships](./002-memberships.md)

## Acceptance criteria

- [ ] A route using `spaceScoped()` gets a verified tenant; a non-member gets 404.
- [ ] Resolution runs at most once per request (memoisation test).

## Validation

```bash
pnpm --filter @blixis/spaces test
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
- [ ] Pattern is usable by third-party modules via public exports only.

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
