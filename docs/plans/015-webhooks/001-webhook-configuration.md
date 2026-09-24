# 015.001 — Create the webhooks module and configuration API

## Status

```text
not-started
```

## Parent plan

[015 — Webhooks](./_index.md)

## Objective

Create `modules/webhooks` with configuration schema, service, permissions, and REST routes for managing webhooks per space, including secret generation and URL validation.

## Background

§21 Webhook under Space; §9 REST for webhooks.

## Requirements

- Scaffold module; capability `blixis.webhooks`; requires spaces, permissions, events, database.
- Migration: `webhooks(id, space_id, environment_id null, name, url, event_types text[], secret_encrypted or secret_hash? (secret must be retrievable for signing → encrypted at rest with a Worker secret key), active, failure_count, disabled_reason, created_at, updated_at)`.
- Encryption: AES-GCM via Web Crypto with key from Worker secret `WEBHOOK_SECRET_KEY` (document rotation).
- URL validation: `https:` only in staging/production; reject IP literals in private ranges, `localhost`, link-local, metadata hosts; max length.
- Event types restricted to a public allow-list (documented public events).
- Permissions: `webhooks.read`, `webhooks.manage`.
- Routes per plan deliverables (except deliveries); secret returned only on create and on explicit rotate.
- Isolation/authz coverage.

## Architectural constraints

- Secrets never logged or returned after creation.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/webhooks/package.json
modules/webhooks/tsconfig.json
modules/webhooks/src/index.ts
modules/webhooks/src/module.ts
modules/webhooks/src/permissions.ts
modules/webhooks/src/domain/webhook.ts
modules/webhooks/src/domain/url-policy.ts
modules/webhooks/src/application/webhook.service.ts
modules/webhooks/src/infrastructure/webhook.repository.ts
modules/webhooks/src/infrastructure/secret-box.ts
modules/webhooks/src/infrastructure/migrations/0001_create_webhooks.sql
modules/webhooks/src/rest/routes.ts
modules/webhooks/test/
```

### Modify

```text
apps/api/src/blixis.config.ts
apps/api/package.json
apps/api/.dev.vars.example
apps/api/src/env.ts
apps/api/test/tenant-routes.allowlist.ts
apps/api/test/authz-matrix.worker.test.ts
docs/operations/configuration.md
tsconfig.json
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Scaffold and migration.
2. URL policy and secret encryption.
3. Service and routes.
4. Tests.

## Dependencies

Requires:

- [011.007 — Verify the content management vertical slice end to end](../011-entries-and-publishing/007-content-vertical-slice-end-to-end.md)

## Acceptance criteria

- [ ] Webhook creation rejects `http://localhost` and private IPs in production config.
- [ ] Secret shown once; encrypted at rest.

## Validation

```bash
pnpm --filter @blixis/webhooks test
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
- [ ] Encryption key handling documented.

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
