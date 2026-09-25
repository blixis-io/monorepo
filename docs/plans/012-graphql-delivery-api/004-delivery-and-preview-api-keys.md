# 012.004 — Implement delivery and preview API keys

## Status

```text
completed
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
modules/auth/src/application/delivery-keys.ts
modules/auth/src/rest/delivery-key.routes.ts
modules/auth/src/permissions.ts
modules/auth/src/infrastructure/migrations/0004_create_delivery_keys.ts
modules/auth/test/delivery-keys.test.ts
```

### Modify

```text
packages/contracts/src/permissions.ts (DeliveryKeyActor: organizationId, environmentIds; PermissionDefinition.deliveryKeys)
packages/contracts/src/permissions.test.ts
packages/testing/src/actors.ts (asDeliveryKey(tenant, kind, options))
modules/permissions/src/application/authorization.service.ts
modules/permissions/src/application/catalog.ts
modules/permissions/src/rest/routes.ts
modules/permissions/test/authorization.test.ts
modules/permissions/test/catalog.test.ts
modules/content/src/permissions.ts (content.delivery.read, content.preview.read)
modules/auth/src/application/resolvers.ts
modules/auth/src/infrastructure/schema.ts
modules/auth/src/module.ts
modules/auth/src/index.ts
modules/auth/package.json
modules/auth/tsconfig.json
modules/auth/tsconfig.test.json
modules/auth/test/auth.test.ts
modules/auth/test/security.test.ts
tooling/tenant-isolation/test/{routes,isolation.test,authz-routes,authz-matrix.test}.ts
tooling/tenant-isolation/{package.json,tsconfig.json}
tooling/postman/blixis.postman_collection.json
tooling/postman/{local,staging,production}.postman_environment.json
tooling/postman/src/collection.test.ts
docs/development/postman.md
apps/docs/src/content/docs/concepts/authentication.mdx
pnpm-lock.yaml
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

- [x] A delivery key for space A cannot read space B (404/403 per convention).
- [x] A delivery key cannot call management routes (403).

## Validation

```bash
pnpm --filter @blixis/auth --filter @blixis/permissions test
pnpm --filter @blixis/api test
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
- [x] Key prefixes documented for secret scanning.

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

- **Deviation, naming:**
  - Routes are `/api/v1/spaces/:spaceId/delivery-keys[/:keyId]`, not `api-keys`, so they're never confused with personal API tokens.
  - The permission is `auth.deliveryKeys.manage` (scope `space`, admin by default), not `spaces.apiKeys.manage`, because the `spaces.*` namespace belongs to `@blixis/spaces` (one namespace, one module).
- **Table** `auth.delivery_keys`:
  - carries organization and space ids, `kind`, name, display prefix and the SHA-256 `key_hash` (unique);
  - `environment_ids uuid[]`, where null means all environments; `created_by` actor id, `last_used_at`, `revoked_at`.
  - Keys are `blx_dk_` (delivery) or `blx_pk_` (preview) plus 32 random bytes in base64url, shown once (`Cache-Control: no-store` on create).
- **`DELIVERY_KEY_SERVICE`:** `list`, `create` (environment ids validated against the space), `revoke`, `authenticate`, `deleteAllForSpace`.
  - Authorization is resolved lazily, because `authenticate` runs during actor resolution.
  - `last_used_at` is written at most hourly, so there's no write per request.
- **`deliveryKeyActorResolver`:** a revoked or unknown key gives `401`. The actor is `{ type: 'deliveryKey', keyId, organizationId, spaceId, kind, environmentIds }`. The contract gained `organizationId` and `environmentIds` so authorization and delivery can scope reads without a lookup.
- **Declarative grants:** `PermissionDefinition.deliveryKeys` lists the key kinds a permission is granted to, validated by `definePermission` and exposed by the catalog and `GET /permissions`. The authorizer gives a key exactly those permissions, in its own organization and space. Any other space gives `404` (no-access), and any other permission gives `403`. No permission names are hard-coded in `@blixis/permissions`.
- **Delivery permissions** (declared by `@blixis/content`): `content.delivery.read` (keys: delivery and preview) and `content.preview.read` (keys: preview), both granted to admin, editor and viewer.
- **Dependency:** `@blixis/auth` now **requires `@blixis/spaces`**, for `spaceScoped()`, environments and `space.deleted` (keys are deleted with their space). The auth test setups include spaces and permissions.
- **Suites:**
  - the isolation suite has a 4th intruder, a **preview key of the attacker's space**, and covers the 3 key routes;
  - the matrix has **delivery and preview key cases**: `403` on space routes, `404` on organization routes;
  - Postman has a *Delivery keys* folder, and the `deliveryKey` environment variable is a secret.
- **Manual:** *Authentication → Delivery and preview keys*.
