# 010.002 — Scaffold the content module and content type schema

## Status

```text
not-started
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
modules/content/src/index.ts
modules/content/src/module.ts
modules/content/src/permissions.ts
modules/content/src/domain/content-type.ts
modules/content/src/domain/field.ts
modules/content/src/domain/errors.ts
modules/content/src/infrastructure/migrations/0001_create_content_types.sql
modules/content/src/infrastructure/content-type.repository.ts
modules/content/test/
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
2. Migrations and repositories.
3. Domain types and permissions.
4. Repository tests.

## Dependencies

Requires:

- [010.001 — Decide the content storage model](./001-content-storage-design.md)

## Acceptance criteria

- [ ] Migrations apply after spaces/permissions.
- [ ] Repository tests confirm `api_id` uniqueness per space/environment.

## Validation

```bash
pnpm db:migrate
pnpm --filter @blixis/content test
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
- [ ] Layout matches §23 with no empty directories.

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
