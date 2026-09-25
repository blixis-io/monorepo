# 008 — Tenancy: Organizations, Spaces & Memberships

## Status

```text
completed
```

Milestone: Milestone 4 — Identity, tenancy & authorization  
Roadmap scope: MVP / initial platform  
Progress: 6/6 tasks completed

## Objective

Deliver the tenant hierarchy `Organization → Space → Environment/Locale` (§21) with memberships linking users to organizations and spaces, REST management endpoints, and a request-level tenant context that is always verified against membership and resource ownership (§31), so domain modules can rely on `ctx.tenant` being trustworthy.

## Why this plan exists

§31 says to assume multi-tenancy early and never trust a resource ID alone. §21 models Organization/Space/Environment/Locale and Membership. §9 lists `/api/v1/spaces` routes. Content (010–011), assets (014), webhooks (015), and delivery keys (012) all hang off spaces; doing tenancy before them avoids retrofitting scoping.

## Scope

In scope:

- `@blixis/spaces` module: organizations, spaces, environments (default only), locales
- memberships (organization and space level) in `@blixis/users` per §20
- tenant context resolution middleware/helpers and ownership verification
- member management routes (add existing user by email, list, remove, change roles placeholder until 009)
- space lifecycle events
- cross-tenant isolation tests

Out of scope:

- roles/permission evaluation (plan 009 — this plan stores a role reference only)
- email invitations for non-existing users (requires email decision; see questions)
- environment branching/cloning (deferred; see decisions)
- billing/plans

## Dependencies

Depends on:

- [007 — Identity & Authentication](../007-identity-and-authentication/_index.md)

## Architecture decisions

- **Ownership**: organizations/spaces/environments/locales owned by `@blixis/spaces`; memberships owned by `@blixis/users` (§20). `@blixis/spaces` requires `@blixis/users` and calls `MEMBERSHIP_SERVICE` to create the owner membership; `@blixis/users` stores IDs and does not depend on spaces (avoids a cycle).
- **Environments in MVP**: every space gets exactly one default environment (`main`); all content tables carry `environment_id` from the start so that multi-environment support later needs no data migration. Creating/cloning further environments is deferred.
- **Locales**: spaces have a locale list with one default; localisation workflows are deferred (`@blixis/localization`, §41 Later), but content storage is locale-aware (plan 010).
- **Tenant context** is resolved from route params (`/spaces/:spaceId/...`), loaded from Postgres, verified against actor membership, and placed in `RequestContext.tenant`; services re-check ownership for every resource ID (§31).
- **Events**: `space.created` transactional; organization/space update events best-effort unless consumers require otherwise.

## Deliverables

- `modules/spaces` registered in `apps/api` with migrations.
- Membership tables and `MEMBERSHIP_SERVICE` in `modules/users`.
- REST: organizations CRUD, spaces CRUD under organizations, locales CRUD, members management.
- Tenant resolution helper usable by every module (`requireSpace(c)` or middleware).
- Isolation test suite proving cross-tenant access is rejected for every tenant-scoped route.

## Tasks

- [x] [001 — Create the spaces module with organization and space schema](./001-organizations-and-spaces-schema.md)
- [x] [002 — Implement organization and space memberships](./002-memberships.md)
- [x] [003 — Implement organization/space services and management routes](./003-space-service-and-management-routes.md)
- [x] [004 — Implement environment and locale management](./004-environments-and-locales.md)
- [x] [005 — Resolve and verify tenant context per request](./005-tenant-context-resolution.md)
- [x] [006 — Add the cross-tenant isolation test suite](./006-tenancy-isolation-tests.md)

## Completion criteria

The plan may be marked `completed` when:

- [x] All tasks `completed`.
- [x] Isolation suite covers every tenant-scoped route registered so far and passes.
- [x] Creating a space creates default environment, default locale, and owner membership atomically.

## Risks

- **Tenant resolution cost**: loading space + membership per request adds queries; measure and consider request-scope memoisation (and later KV snapshot only if measured, §34).
- **Route prefix sharing**: many modules mount under `/spaces/:spaceId`; kernel route-conflict detection (003.006) must stay method+path precise.
- **Membership model churn**: roles land in 009; keep the membership role column flexible (FK to roles table added in 009).

## Open questions

- Are organizations user-visible in MVP (multi-org accounts), or implicit (one per signup)? Default: explicit organizations, since §21/§31 model them.
- Invitations for users without accounts: requires email sending (Cloudflare Email Service or provider). Default MVP: add existing users by email only; invitation links deferred.
- Should the first organization/space be creatable by any authenticated user, or only via CLI/admin in self-hosted setups? Default: any authenticated user, guarded by a module option.

## Technical notes

No technical notes yet.
