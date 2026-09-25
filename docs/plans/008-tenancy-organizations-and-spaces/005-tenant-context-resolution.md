# 008.005 — Resolve and verify tenant context per request

## Status

```text
completed
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
apps/docs/src/content/docs/concepts/tenancy.mdx
docs/conventions/tenancy.md
modules/spaces/src/application/tenant-resolver.ts
modules/spaces/test/tenant.test.ts
packages/kernel/src/internal/tenant-binder.ts
```

### Modify

```text
README.md
apps/docs/src/content/docs/tutorials/01-database-module.mdx
docs/ROADMAP.md
docs/plans/008-tenancy-organizations-and-spaces/005-tenant-context-resolution.md
docs/plans/008-tenancy-organizations-and-spaces/_index.md
modules/spaces/package.json
modules/spaces/src/index.ts
modules/spaces/src/module.ts
modules/spaces/src/rest/routes.ts
packages/contracts/src/context.ts
packages/database/src/index.ts
packages/database/src/tenancy.test.ts
packages/database/src/tenancy.ts
packages/events/src/bus.ts
packages/events/src/module.ts
packages/kernel/src/create-blixis.ts
packages/kernel/src/internal/rest.ts
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

- [x] A route using `spaceScoped()` gets a verified tenant; a non-member gets 404.
- [x] Resolution runs at most once per request (memoisation test).

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
- [x] Pattern is usable by third-party modules via public exports only.

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

- **`TENANT_RESOLVER`** (exported by `@blixis/spaces`): `resolveSpace(actor, spaceId, environmentKey?)` → `{ organizationId, spaceId, environmentId, environmentKey }`.
  - A malformed id, unknown space, unknown environment, or no access → `NotFoundError`; anonymous → 401 (from `actingUserId`).
  - API tokens use their owner's memberships. `system` actors skip the membership check, but the space must exist.
  - **Memoised per request scope** (keyed by actor + space + environment; same promise).
- **Binding the tenant, decided: kernel-level `TENANT_BINDER`** (token in contracts, next to `REQUEST_CONTEXT`). A module can't reach the request scope's `provideValue`, so the kernel provides a per-scope binder (HTTP and `runInScope`) that replaces `REQUEST_CONTEXT` with `{ ...context, tenant }` and a logger child carrying the tenant ids. `spaceScoped()` calls it and also `c.set('requestContext', …)`.
- **`spaceScoped()`** middleware (exported): reads `:spaceId`, plus `:environment` or `?environment=`, then resolves and binds. The locale/environment routes of `@blixis/spaces` were refactored onto it as the reference pattern. Hono loses route-param typing with a middleware in the chain, so they use `c.req.param('localeId') ?? ''`.
- **Bug found by the test and fixed:** the event bus captured `REQUEST_CONTEXT` at creation. Resolving the tenant itself creates `MEMBERSHIP_SERVICE` → `EVENT_BUS` **before** binding, so envelopes had no tenant. `createEventBus` now accepts `context` as a getter and `eventsModule` passes `() => services.get(REQUEST_CONTEXT)`. The rule "read `REQUEST_CONTEXT` lazily" is documented on `TenantBinder` and in `docs/conventions/tenancy.md`.
- **`assertSameTenant(resource, tenant, what?)`, decided: in `@blixis/database`** (next to `tenantScope` / `requireTenant`). Any tenant id the resource carries must match; mismatch → `NotFoundError('<what> not found')`.
- **Docs:** `docs/conventions/tenancy.md` (the rule, canonical route, lazy context in services, background work, space deletion, interim authorization); the manual page "Organizations & spaces" (`concepts/tenancy.mdx`); the tutorial 1 note now points to `spaceScoped()`; README link.
- **Tests:**
  - 4 resolution tests with a probe module: the tenant in the context **and** in `REQUEST_CONTEXT` **and** in the event envelope; environment by path and query + unknown 404; stranger / unknown / malformed 404 + anonymous 401; API token owner vs stranger, system actor, memoisation.
  - 1 `assertSameTenant` unit test.
  - The existing locale route tests pass through `spaceScoped()`. 398 tests in total.
