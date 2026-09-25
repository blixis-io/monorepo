# Tenancy

How module routes and services get a **trustworthy tenant** (architecture §21, §31; plan 008). The hierarchy is Organization → Space → Environment and Locale, owned by `@blixis/spaces`. Memberships are owned by `@blixis/users`.

Related: [Database conventions](./database.md) · [ADR 0007](../decisions/0007-ids-and-tenancy-conventions.md) · [Manual: Organizations & spaces](../../apps/docs/src/content/docs/concepts/tenancy.mdx)

---

## The rule

`c.var.requestContext.tenant` is **empty** until a route verifies the tenant. Space-scoped routes use `spaceScoped()`, which:
1. reads `:spaceId`, plus `:environment` or `?environment=` (default: the space's default environment, `main`);
2. loads the space and verifies that the actor may access it:
   - users through their organization or space membership;
   - API tokens through their owner's memberships;
   - `system` actors are trusted, but the space must exist;
3. binds `{ organizationId, spaceId, environmentId }` to the request context. Every service that reads `REQUEST_CONTEXT` afterwards sees it, for example event envelopes and logger fields.

Unknown spaces and environments, and spaces the actor can't access, get **404**, so existence is never revealed. Anonymous callers get **401**.

## Canonical route

```ts
import { spaceScoped } from '@blixis/spaces'
import { requireTenant, tenantScope } from '@blixis/database'

routes.get('/spaces/:spaceId/entries/:id', spaceScoped(), async (c) => {
  const tenant = requireTenant(c.var.requestContext, 'organizationId', 'spaceId', 'environmentId')
  const [entry] = await c.var.services
    .get(DATABASE)
    .select()
    .from(entries)
    .where(and(tenantScope(entries, tenant), eq(entries.id, c.req.param('id') ?? '')))
  if (entry === undefined) throw new NotFoundError('Entry not found')
  return c.json(entry)
})
```

- **Services receive the tenant** from the context (`requireTenant`), never from request bodies or query parameters.
- **Every query filters by the tenant** (`tenantScope`), including updates and deletes.
- **Resources loaded through another path**, such as another module's service by ID, are checked with `assertSameTenant(resource, ctx.tenant)` from `@blixis/database`. A mismatch is a 404.

## Writing services that use the tenant

Read `REQUEST_CONTEXT` **when you use it, not when your service is created**. Services are often created earlier in the request, for example while the tenant itself is being resolved, and a captured context would still have an empty tenant. The event bus does this since 008.005.

```ts
ctx.services.provideFactory(MY_SERVICE, ({ services }) => createMyService({
  context: () => services.get(REQUEST_CONTEXT),   // ✓ read lazily
  // context: services.get(REQUEST_CONTEXT),      // ✗ captures the pre-binding context
}), { scope: 'request' })
```

## Background work

Queue handlers and cron jobs run as `system` actors. Pass the tenant explicitly: `runInScope({ tenant, actor })` for the whole unit of work, or `TENANT_RESOLVER.resolveSpace(systemActor, spaceId)` to verify that the space exists. Event handlers already receive the envelope's tenant in their scope.

## The isolation suite (required for new routes)

`tooling/tenant-isolation` loads the API's real module list (`apps/api/src/blixis.config.ts`) and seeds a victim organization with two spaces, members, and a locale. It then sends **every tenant-scoped route** as three intruders, using the victim's IDs:
- the owner of another organization;
- that owner's API token;
- an admin of a sibling space only.

Every probe must answer 403 or 404, and the victim's data must be unchanged.

**CI fails when a route under `/organizations/:orgId/…` or `/spaces/:spaceId/…` isn't listed** in `tooling/tenant-isolation/test/routes.ts`. When you add one:
1. Add `{ method, path, body? }`. The `path` must be the pattern exactly as registered, and `body` should be a request that *would* change or reveal data if isolation failed.
2. If the route needs a resource ID the suite doesn't seed yet (e.g. `:entryId`), seed one for the victim in the suite's `beforeAll`, add it to `params`, and extend the `fingerprint` with the module's tables.
3. When one parameter name means different things on different routes, map it with `paramsFrom: { membershipId: 'orgMembershipId' }`.

A route may only be skipped through `ISOLATION_ALLOW_LIST`, with a reason. Keep that list empty.

## Deleting spaces

`space.deleted` is **transactional**. Every module storing space data subscribes and deletes its own rows; there are no foreign keys between modules.

## Authorization

Services check permissions through `AUTHORIZATION_SERVICE`, never roles (plan 009):
- **Non-members get 404:** the actor has no membership in the resource's tenant.
- **Members without the permission get 403.** `require` implements both, so callers never choose.
- **Pass the verified tenant in the `ResourceRef`:** use the tenant from `spaceScoped()`, or the organization/space you loaded by id, never ids from the request body.
- **No role-name comparisons:** `role === 'admin'` and the like fail `pnpm lint` (the `role-name-check` rule) everywhere outside `@blixis/permissions`.
