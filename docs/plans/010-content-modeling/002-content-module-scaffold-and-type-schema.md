# 010.002 — Scaffold the content module and content type schema

## Status

```text
completed
```

## Parent plan

[010 — Content Modeling](./_index.md)

## Objective

Create `modules/content` (`@blixis/content`) with the content type and field definition migrations, domain types, and repositories per ADR 0010.

## Background

§23 recommended first-party module layout is illustrated with the content module; §20 content owns its repositories and migrations.

## Requirements

- Scaffold `modules/content` following §23 (domain, application, infrastructure, rest; graphql and events directories later).
- Capability `blixis.content`; requires spaces, permissions, events, database.
- Migrations: `content_types(id, space_id, environment_id, api_id, name, description, display_field_id, version int, created_at, updated_at, unique(space_id, environment_id, api_id))` and field storage per ADR 0010.
- Domain types: `ContentType`, `FieldDefinition`, `FieldType`, validation settings per field (required, unique? (defer), min/max, regex, allowed values, allowed content types for references).
- Repositories scoped by space/environment.
- Declare permissions: `content.types.read`, `content.types.write` (plus entry permissions in 011) with default role grants.

## Architectural constraints

- No entry tables yet (plan 011).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/content/package.json
modules/content/tsconfig.json
modules/content/tsconfig.test.json
modules/content/src/index.ts
modules/content/src/module.ts
modules/content/src/permissions.ts
modules/content/src/domain/content-type.ts
modules/content/src/infrastructure/schema.ts
modules/content/src/infrastructure/migrations/0001_create_content_types.ts
modules/content/src/infrastructure/content-type.repository.ts
modules/content/test/repository.test.ts
```

### Modify

```text
apps/api/src/blixis.config.ts
apps/api/package.json
apps/api/tsconfig.json
tooling/tenant-isolation/package.json
tsconfig.json
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Scaffold module.
2. Migrations and repositories.
3. Domain types and permissions.
4. Repository tests.

## Dependencies

Requires:

- [010.001 — Decide the content storage model](./001-content-storage-design.md)

## Acceptance criteria

- [x] Migrations apply after spaces/permissions.
- [x] Repository tests confirm `api_id` uniqueness per space/environment.

## Validation

```bash
pnpm db:migrate
pnpm --filter @blixis/content test
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
- [x] Layout matches §23 with no empty directories.

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

- **Table:** `content.content_types`. Per ADR 0010 it holds `kind` (`entry`/`component`), `api_id` unique per environment, the `fields` and `groups` JSONB arrays, `display_field_id`, and `version`. The migration is a `.ts` `defineMigration` like the other modules, not a `.sql` file.
- **Domain:** `domain/content-type.ts` holds `ContentType`, `FieldDefinition`, `FieldGroup`, `ShowWhen`, input schemas (Zod), `apiId` rules with reserved field ids (`id`, `sys`, `type`), `CONTENT_LIMITS`, and `newShortId()` (8 characters, unbiased base62). Field and type are one file instead of the suggested `field.ts`/`errors.ts`, because there are no content-specific errors: the contract errors suffice.
- **Repository:** always `tenantScope`d on `(organization, space, environment)`. `update` matches `version = expected` (optimistic concurrency: `undefined` means stale). `deleteAllForSpace` exists for cleanup.
- **`space.deleted` subscription** (`delete-space-content`): deletes the space's content types. It's idempotent, so redelivery is safe, and it's verified end to end through `TENANCY_SERVICE.deleteSpace`.
- **Permissions:** `content.types.read` (admin/editor/viewer) and `content.types.write` (admin). Entry permissions come in plan 011.
- `@blixis/content` has runtime peers `contracts`, `database`, `kernel` and `spaces`. `users` and `permissions` are only needed in tests, because authorization goes through `AUTHORIZATION_SERVICE` from contracts.
