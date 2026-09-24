# 012.004 — Implement delivery and preview API keys

## Status

```text
not-started
```

## Parent plan

[012 — GraphQL Platform & Content Delivery API](./_index.md)

## Objective

Implement space-scoped delivery and preview API keys (create/list/revoke via Management REST) and their actor resolver producing `deliveryKey` actors limited to their space/environment.

## Background

§22 published content publicly, drafts when authorised; §45 delivery consumers. Contentful-style CDA/CPA tokens are the expected developer experience. Keys are credentials, so they live in `@blixis/auth`, referencing space IDs (auth requires spaces capability for validation).

## Requirements

- Migration in `@blixis/auth`: `delivery_keys(id, space_id, environment_ids text[] or null=all, kind delivery|preview, name, prefix, key_hash, created_by, created_at, last_used_at, revoked_at)`.
- Routes: `GET/POST /api/v1/spaces/:spaceId/api-keys`, `DELETE /api/v1/spaces/:spaceId/api-keys/:keyId` (permission `spaces.apiKeys.manage`).
- Actor resolver: `Authorization: Bearer blx_dk_…` / `blx_pk_…` → `Actor { type: 'deliveryKey', keyId, spaceId, kind }`.
- Declare delivery permissions `content.delivery.read`, `content.preview.read`; authorization rule: delivery keys have only these for their space (update 009.003 evaluation).
- Isolation tests.

## Architectural constraints

- Hashed storage; plaintext shown once.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/auth/src/application/delivery-key.service.ts
modules/auth/src/infrastructure/delivery-key.repository.ts
modules/auth/src/infrastructure/migrations/0003_create_delivery_keys.sql
modules/auth/test/delivery-keys.test.ts
```

### Modify

```text
modules/auth/src/rest/routes.ts
modules/auth/src/application/actor-resolver.ts
modules/auth/src/module.ts
modules/permissions/src/application/authorization.service.ts
modules/content/src/permissions.ts
apps/api/test/tenant-routes.allowlist.ts
apps/api/test/authz-matrix.worker.test.ts
```

### Delete

```text
None.
```

## Implementation steps

1. Migration, repository, service.
2. Routes.
3. Resolver and authorization rule.
4. Tests.

## Dependencies

Requires:

- [012.003 — Map Blixis errors to GraphQL errors](./003-graphql-error-mapping.md)

## Acceptance criteria

- [ ] A delivery key for space A cannot read space B (404/403 per convention).
- [ ] A delivery key cannot call management routes (403).

## Validation

```bash
pnpm --filter @blixis/auth --filter @blixis/permissions test
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
- [ ] Key prefixes documented for secret scanning.

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
