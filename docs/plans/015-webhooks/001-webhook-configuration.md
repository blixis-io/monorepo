# 015.001 — Create the webhooks module and configuration API

## Status

```text
completed
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
modules/webhooks/ (package.json, tsconfig*.json)
modules/webhooks/src/{index,module,config,permissions}.ts
modules/webhooks/src/domain/{url,webhook}.ts
modules/webhooks/src/application/{crypto,webhook.service}.ts
modules/webhooks/src/infrastructure/{schema,webhook.repository}.ts
modules/webhooks/src/infrastructure/migrations/0001_create_webhooks.ts
modules/webhooks/src/rest/webhook.routes.ts
modules/webhooks/test/{url,crypto,webhooks.api}.test.ts
apps/api/src/webhooks-config.ts
apps/docs/src/content/docs/content/webhooks-api.mdx
```

### Modify

```text
apps/api/src/{blixis.config,env}.ts, apps/api/package.json, apps/api/tsconfig.json, apps/api/.dev.vars.example
tooling/db/src/cli.ts, tooling/db/package.json, tooling/db/tsconfig.json, package.json (webhooks:generate-key)
packages/testing/src/isolation.ts (TENANT_SEGMENTS)
tooling/tenant-isolation/ (routes, authz-routes, isolation + matrix seeds, package.json, tsconfig.json)
tooling/postman/blixis.postman_collection.json
apps/docs/astro.config.mjs
docs/operations/{cloudflare,configuration}.md
tsconfig.json, pnpm-lock.yaml, docs/ROADMAP.md, docs/plans/015-webhooks/*
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

- [x] Webhook creation rejects `http://localhost` and private IPs in production config.
- [x] Secret shown once; encrypted at rest.

## Validation

```bash
pnpm --filter @blixis/webhooks test
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
- [x] Encryption key handling documented.

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

- **Secrets:** `whsec_` + 32 random bytes (base64url), returned only on create and rotate. Stored as `v1.<kid>.<iv>.<ciphertext>` (AES-GCM, 96-bit IV) with the **webhook id as additional data**, so a ciphertext can't be moved to another webhook. Keys come from `WEBHOOK_SECRET_KEYS` (`kid:base64key[,…]`): the first encrypts, all decrypt — rotation without re-encrypting everything at once. Parsed keys are cached per isolate. `secretHint` (`whsec_…abcd`) lets people recognise a secret.
- **Config through a token, not bindings:** `WEBHOOKS_CONFIG` (secret keys, `allowPrivateUrls`) is provided by `apps/api/src/webhooks-config.ts`, like `AUTH_CONFIG`; `allowPrivateUrls` is true only for `BLIXIS_ENV=local`. Missing keys break only webhook management and delivery. Generator: `node tooling/db/src/cli.ts generate-webhook-key <kid>` (`pnpm webhooks:generate-key`).
- **URL policy** (`checkWebhookUrl`): `https:` only (plus `http:` locally); no credentials; ≤ 2048 characters; host names: no `localhost`, `*.localhost|local|internal|home.arpa|lan|corp`, metadata hosts, single-label names; IPv4 literals outside private/reserved ranges (the WHATWG parser normalizes `2130706433` and `0x7f.1` first — tested); IPv6 only global unicast `2000::/3` outside `2001:db8::/32`, with mapped/NAT64 addresses judged by their IPv4 part. DNS names resolving to private addresses aren't resolved here: Workers can't reach private networks, and delivery (003) re-checks the URL.
- **Event types:** a public allow-list (entries, content types, assets); patterns `group.*` and `*` are accepted when they match at least one public type. Internal events (users, memberships, auth) are never deliverable.
- **Environment:** `environment_id` is nullable (all environments). The Drizzle property is `onlyEnvironmentId` so `tenantScope` scopes by organization and space only.
- **Deviation:** no `failure_count` updates or events yet (003), and `webhooks.read`/`webhooks.manage` default to **admins only** — webhooks export data.
- **Coverage:** `webhooks/:webhookId` joined `TENANT_SEGMENTS`; all 6 routes are in the isolation suite (fingerprint includes webhooks) and the authorization matrix; Postman *Webhooks* folder including a refused metadata URL.
- **Staging needs:** `WEBHOOK_SECRET_KEYS` secret and `pnpm db:migrate` (webhooks `0001`) before deploying.
