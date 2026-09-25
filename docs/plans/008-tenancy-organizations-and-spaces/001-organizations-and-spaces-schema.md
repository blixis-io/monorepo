# 008.001 — Create the spaces module with organization and space schema

## Status

```text
completed
```

## Parent plan

[008 — Tenancy: Organizations, Spaces & Memberships](./_index.md)

## Objective

Create `@blixis/spaces` with migrations for organizations, spaces, environments, and locales, domain types, repositories, and the public `SPACE_SERVICE`/`ORGANIZATION_SERVICE` tokens (service implementations in 008.003).

## Background

§21 domain model; §20 module-owned schema; ADR 0007 conventions (IDs, tenancy columns, namespacing, cross-module FK rule).

## Requirements

- Scaffold `modules/spaces` (capability `blixis.spaces`; requires users, database, events).
- Migrations:
  - `organizations(id, name, slug unique, created_at, updated_at)`;
  - `spaces(id, organization_id fk, name, slug unique per org, created_at, updated_at)`;
  - `environments(id, space_id fk, key (e.g. 'main'), is_default, created_at)` unique `(space_id, key)`;
  - `locales(id, space_id fk, code (BCP 47), name, is_default, fallback_code null, created_at)` unique `(space_id, code)`, partial unique on default.
- Domain types and validation (slug format, BCP 47 validation strategy — pragmatic regex or `Intl.getCanonicalLocales`).
- Repositories with tenant-scoped queries (ADR 0007 helpers).
- Public exports: tokens, types, event definitions; no repositories.

## Architectural constraints

- Every query on spaces/environments/locales filters by the owning organization/space (§31).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/spaces/package.json
modules/spaces/src/domain/tenancy.test.ts
modules/spaces/src/domain/tenancy.ts
modules/spaces/src/events.ts
modules/spaces/src/index.ts
modules/spaces/src/infrastructure/migrations/0001_create_spaces.ts
modules/spaces/src/infrastructure/repositories.ts
modules/spaces/src/infrastructure/schema.ts
modules/spaces/src/module.ts
modules/spaces/test/repositories.test.ts
modules/spaces/tsconfig.json
modules/spaces/tsconfig.test.json
```

### Modify

```text
docs/ROADMAP.md
docs/contracts/events.md
docs/plans/008-tenancy-organizations-and-spaces/001-organizations-and-spaces-schema.md
docs/plans/008-tenancy-organizations-and-spaces/_index.md
pnpm-lock.yaml
tsconfig.json
```

### Delete

```text
None.
```

## Implementation steps

1. Scaffold module.
2. Write migrations and run locally.
3. Implement domain types and repositories.
4. Repository integration tests against the test DB.

## Dependencies

Requires:

- [007.006 — Add login throttling, CSRF protection, and auth security tests](../007-identity-and-authentication/006-auth-hardening-and-tests.md)

## Acceptance criteria

- [x] Migrations apply in module order after users.
- [x] Repository tests confirm slug uniqueness scopes and default-locale uniqueness.

## Validation

```bash
pnpm db:migrate
pnpm --filter @blixis/spaces test
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
- [x] Cross-module FK usage (to users) matches ADR 0007.

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

- **Open questions answered with the plan's defaults** (recorded here; the owner can revisit):
  - organizations are explicit (a user can belong to several);
  - no email invitations in the MVP (existing users are added by email);
  - any authenticated user may create an organization, behind a module option (008.003).
- **Schema:** `spaces.organizations` (global unique slug), `spaces.spaces` (unique `(organization_id, slug)`), `spaces.environments` and `spaces.locales`.
  - Environments and locales carry **both** `organization_id` and `space_id` (ADR 0007: tenant columns on child tables), with unique `(space_id, key|code)` and **partial unique indexes** `where is_default` (exactly one default per space).
  - FKs within the module use `on delete restrict`. Nothing references `users.users` here: memberships live in `@blixis/users` (008.002).
- **Validation:**
  - Slugs are DNS-label-like (`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`, lower-cased).
  - Locales are canonicalized with `Intl.getCanonicalLocales` (Workers and Node): `en-us` → `en-US`, `zh-hant-tw` → `zh-Hant-TW`; invalid → validation issue.
  - Names are 1–100 characters.
- **Repositories** (internal, not exported):
  - Spaces are always looked up with their organization (`findInOrganization`; updates scoped the same way).
  - Environment/locale queries use `tenantScope` (fails closed).
  - One exception, `findForResolution(spaceId)`, exists only for 008.005 tenant resolution, which verifies membership before anything reaches a client (documented on the function).
  - Unique violations → `ConflictError` with the constraint name (via `translateDatabaseError`).
- **Events defined:** `organization.created` (best-effort), `space.created` (**transactional**: provisioning relies on it), `space.updated` (best-effort); registered in `docs/contracts/events.md`. They are emitted by the services in 008.003.
- **The module is not yet registered in `apps/api`:** it has no services or routes until 008.003. It will be registered then, with its migration.
- **Tests:** 2 domain unit tests (slugs, locales); 3 Postgres tests (hierarchy and slug uniqueness incl. constraint name, no cross-organization access or update, one default environment/locale and tenant-scoped lists). A clean build (all `dist`/tsbuildinfo removed) passes.
