# 016.002 — Create the releases module

## Status

```text
not-started
```

## Parent plan

[016 — Releases & Cloudflare Workflows](./_index.md)

## Objective

Create `modules/releases` with schema, service, permissions, events, and routes to create releases and manage their items.

## Background

§21 Release under Space; §15 `release.created`, `release.published`.

## Requirements

- Scaffold module; capability `blixis.releases`; requires content (via capability `blixis.content` + public `CONTENT_SERVICE`), permissions, events, database.
- Migrations: `releases(id, space_id, environment_id, name, status (draft|scheduled|publishing|published|failed), scheduled_at, workflow_instance_id, created_by, created_at, updated_at)`, `release_items(release_id, item_type entry|asset, item_id, version_id null, status, error)`.
- Service: create/update/delete (draft only), add/remove items (validate items belong to same space), get/list.
- Permissions: `releases.read`, `releases.manage`, `releases.publish`.
- Routes per plan deliverables (except publish/schedule).
- Isolation/authz coverage.

## Architectural constraints

- Uses `CONTENT_SERVICE`/`ASSET_SERVICE` public APIs only.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/releases/package.json
modules/releases/tsconfig.json
modules/releases/src/index.ts
modules/releases/src/module.ts
modules/releases/src/permissions.ts
modules/releases/src/events.ts
modules/releases/src/domain/release.ts
modules/releases/src/application/release.service.ts
modules/releases/src/infrastructure/release.repository.ts
modules/releases/src/infrastructure/migrations/0001_create_releases.sql
modules/releases/src/rest/routes.ts
modules/releases/test/
```

### Modify

```text
apps/api/src/blixis.config.ts
apps/api/package.json
apps/api/test/tenant-routes.allowlist.ts
apps/api/test/authz-matrix.worker.test.ts
tsconfig.json
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Scaffold and migrations.
2. Service and routes.
3. Tests.

## Dependencies

Requires:

- [016.001 — Define the Workflows integration pattern and adapter](./001-workflows-integration-pattern.md)

## Acceptance criteria

- [ ] Items from another space cannot be added.
- [ ] Release CRUD covered by isolation/authz tests.

## Validation

```bash
pnpm test --filter @blixis/releases
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
- [ ] No internal imports from content/assets.

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
