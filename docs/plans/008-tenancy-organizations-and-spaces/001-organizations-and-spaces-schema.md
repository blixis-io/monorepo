# 008.001 — Create the spaces module with organization and space schema

## Status

```text
not-started
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
modules/spaces/tsconfig.json
modules/spaces/src/index.ts
modules/spaces/src/module.ts
modules/spaces/src/domain/organization.ts
modules/spaces/src/domain/space.ts
modules/spaces/src/domain/locale.ts
modules/spaces/src/infrastructure/migrations/0001_create_tenancy_tables.sql
modules/spaces/src/infrastructure/organization.repository.ts
modules/spaces/src/infrastructure/space.repository.ts
modules/spaces/src/infrastructure/locale.repository.ts
modules/spaces/src/events.ts
modules/spaces/test/
```

### Modify

```text
apps/api/src/blixis.config.ts
apps/api/package.json
tsconfig.json
pnpm-lock.yaml
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

- [ ] Migrations apply in module order after users.
- [ ] Repository tests confirm slug uniqueness scopes and default-locale uniqueness.

## Validation

```bash
pnpm db:migrate
pnpm test --filter @blixis/spaces
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
- [ ] Cross-module FK usage (to users) matches ADR 0007.

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
