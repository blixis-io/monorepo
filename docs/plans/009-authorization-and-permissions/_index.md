# 009 — Authorization & Permissions

## Status

```text
completed
```

Milestone: Milestone 4 — Identity, tenancy & authorization  
Roadmap scope: MVP / initial platform  
Progress: 5/5 tasks completed

## Objective

Answer "may this actor perform this action on this resource?" (§30) through one service. Modules declare permissions (§5), roles map to permissions per organization/space, memberships reference roles, and every service-level mutation or read calls `permissions.require({ actor, action, resource })` — no `role === 'admin'` checks anywhere.

## Why this plan exists

§30 mandates service/domain-driven authorization via permission strings; §8 and §5 make permissions part of module contributions; §31 requires tenant ownership checks. Content and every later module need this in place before their first route ships (checkpoint CP4).

## Scope

In scope:

- permissions registry from kernel contributions
- roles (system roles + custom roles per organization) and role→permission mapping
- `AUTHORIZATION_SERVICE` implementation with membership, role, scope, and tenant checks
- enforcement in `@blixis/users`, `@blixis/spaces`, `@blixis/auth` routes/services
- roles management REST endpoints
- authorization test matrix

Out of scope:

- attribute/field-level permissions (e.g. per content type) — deferred; see questions
- KV-cached permission snapshots (only after measurement, §14/§34)
- delivery key authorization (plan 012 uses the same service with `deliveryKey` actors)

## Dependencies

Depends on:

- [008 — Tenancy: Organizations, Spaces & Memberships](../008-tenancy-organizations-and-spaces/_index.md)

## Architecture decisions

- **Permission IDs** are declared by modules and collected by the kernel (003.007); roles reference only registered permissions.
- **System roles**: `owner`, `admin`, `editor`, `viewer` defined in code with default permission sets per module (modules contribute default grants per system role — minimal contract extension decided in 009.002).
- **Custom roles** per organization in Postgres (§13).
- **Evaluation**: actor → memberships (org + space) → roles → permissions; API tokens intersect owner permissions with token scopes; `system` actors bypass only when explicitly allowed per call site (documented).
- **No caching in KV in MVP**; per-request memoisation only (§34: measure first).
- **Deny by default**; unknown permission IDs are a programming error (`ModuleError`), not a silent deny.

## Deliverables

- `modules/permissions` registered in `apps/api`.
- `AUTHORIZATION_SERVICE` used by all existing modules.
- Roles endpoints: `GET/POST /api/v1/organizations/:orgId/roles`, `PATCH/DELETE .../roles/:roleId`, `GET /api/v1/permissions`.
- Authorization matrix tests (role × action × tenant).

## Tasks

- [x] [001 — Create the permissions module and registry](./001-permissions-module-and-registry.md)
- [x] [002 — Implement roles and role assignments](./002-roles-and-role-assignments.md)
- [x] [003 — Implement the authorization service](./003-authorization-service.md)
- [x] [004 — Enforce permissions in existing modules](./004-enforce-permissions-in-existing-modules.md)
- [x] [005 — Build the authorization test matrix](./005-authorization-test-matrix.md)

## Completion criteria

The plan may be marked `completed` when:

- [x] All tasks `completed`.
- [x] No role-name checks exist outside `@blixis/permissions` (grep-based lint check).
- [x] Matrix tests pass; isolation suite (008.006) still passes.
- [x] Architectural checkpoint CP4 recorded.

## Risks

- **Per-request query cost** for role/permission lookups; memoise per request, consider KV snapshot later only with measurement.
- **Default grants contract** could become a leaky extension point; keep it declarative.

## Open questions

- Are content-type-level permissions (e.g. editor may only edit `blogPost`) needed for MVP? Default: no; design `ResourceRef` so they can be added later.
- Should custom roles be space-scoped as well as organization-scoped? Default: organization-scoped roles assignable at org or space membership level.

## Technical notes

- **Checkpoint CP4 passed 2026-09-25:**
  - The isolation suite (24 tenant routes × 3 intruders, one of them an API token with every scope) and the authorization matrix (24 routes × 12 cases) run in CI and cover every tenant-scoped route, enforced by coverage checks.
  - The `role-name-check` boundary rule keeps role-name comparisons out of every package except `@blixis/permissions`.
- **Open questions resolved:**
  - Content-type-level permissions are deferred: `ResourceRef` carries `type`/`id`, so they can be added without a contract change.
  - Custom roles are organization-scoped and assignable at organization or space level.
- **Decisions recorded in the task notes:**
  - system roles are derived in code;
  - API tokens need explicit scopes;
  - `require` itself implements 404 vs 403;
  - the escalation guard makes `owner` grantable by owners only.
- **Staging:** run `pnpm db:migrate` (users `0003_system_role_keys`, permissions `0001_create_roles`) before deploying plan 009. Existing organization `member` memberships become `viewer`. Existing API tokens without scopes lose access to tenant routes, so re-create them with scopes.
