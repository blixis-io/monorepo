# 007.005 — Implement personal API tokens

## Status

```text
completed
```

## Parent plan

[007 — Identity & Authentication](./_index.md)

## Objective

Allow authenticated users to create, list, and revoke personal API tokens for Management API automation, stored hashed with optional expiry and scopes.

## Background

§9 REST Management API is used by automation (CI, migrations scripts, SDK). §30 prefers permission-based checks; token scopes restrict a token to a subset of permissions, enforced by the authorization service in plan 009.

## Requirements

- Migration: `auth_api_tokens(id, user_id, name, prefix, token_hash, scopes text[], expires_at, last_used_at, created_at, revoked_at)`.
- Routes: `GET /api/v1/auth/tokens`, `POST /api/v1/auth/tokens` (returns plaintext once), `DELETE /api/v1/auth/tokens/:id`.
- Bearer resolver implementation producing `Actor { type: 'apiToken', tokenId, ownerId, scopes }`.
- Tokens cannot create other tokens (sessions only) — document.
- Tests: create/list/revoke, expiry, revoked token 401, plaintext never retrievable after creation.

## Architectural constraints

- Only hashes stored; compare via hash lookup (no timing issues on plaintext).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/auth/src/application/api-tokens.ts
modules/auth/src/infrastructure/migrations/0002_create_api_tokens.ts
```

### Modify

```text
apps/docs/src/content/docs/concepts/authentication.mdx
docs/ROADMAP.md
docs/contracts/events.md
docs/development/postman.md
docs/plans/007-identity-and-authentication/005-personal-api-tokens.md
docs/plans/007-identity-and-authentication/_index.md
modules/auth/src/application/auth.service.ts
modules/auth/src/application/resolvers.ts
modules/auth/src/index.ts
modules/auth/src/infrastructure/repositories.ts
modules/auth/src/infrastructure/schema.ts
modules/auth/src/module.ts
modules/auth/src/rest/routes.ts
modules/auth/test/auth.test.ts
modules/users/src/application/user.service.ts
modules/users/src/events.ts
modules/users/src/index.ts
modules/users/test/users.test.ts
tooling/postman/blixis.postman_collection.json
tooling/postman/local.postman_environment.json
tooling/postman/production.postman_environment.json
tooling/postman/src/collection.test.ts
tooling/postman/staging.postman_environment.json
```

### Delete

```text
None.
```

## Implementation steps

1. Migration and repository.
2. Service and routes.
3. Bearer resolver.
4. Tests.

## Dependencies

Requires:

- [007.004 — Resolve actors from sessions and bearer tokens](./004-actor-resolution.md)

## Acceptance criteria

- [x] A created token authenticates `GET /api/v1/auth/me` via bearer header.
- [x] Revoked or expired tokens return 401.
- [x] Listing never returns token plaintext or hash.

## Validation

```bash
pnpm --filter @blixis/auth test
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
- [x] Token prefix format documented for secret scanning.

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

- **Table:** `auth.api_tokens` (migration `0002_create_api_tokens`) instead of `auth_api_tokens`. Tokens are `blx_pat_<32B b64url>`, stored as a SHA-256 hash with a unique index, so lookup is by hash and the plaintext is never compared. The display `prefix` is the first 12 characters. `scopes text[]`, optional `expires_at`, `last_used_at`, `revoked_at`.
- **Scopes:** must be permission ids that modules registered (`KERNEL_CONTRIBUTIONS.permissions`). None are registered yet (plan 009), so only an empty scope list is accepted today; unknown → 400.
- **`apiTokenActorResolver`:**
  - Registered after the JWT resolver: `Bearer blx_pat_…` → `{ type: 'apiToken', tokenId, ownerId, scopes }`. Revoked, expired, or unknown → 401.
  - `last_used_at` is updated only when null or older than 5 minutes (a conditional `update`, no write on most requests).
  - `API_TOKEN_SERVICE` has no `REQUEST_CONTEXT` dependency, because it runs inside actor resolution (see 007.004).
- **"Tokens cannot create tokens" (documented):** token management requires a `user` actor (API token → 403, anonymous → 401) **and** `assertActiveSession`, which verifies the JWT and checks that its refresh family is still active. A signed-out session cannot use its remaining ≤ 15-minute access token for token management (ADR 0009: sensitive operations re-check).
- **Disabled users:** the users module now emits a **transactional `user.disabled`** event inside the disable transaction (a new event, registered in `docs/contracts/events.md`), in addition to the best-effort `user.updated`. `@blixis/auth` subscribes (`revoke-credentials`) and revokes all API tokens and refresh families; the handler is idempotent. Without it, long-lived API tokens of a disabled user would keep working.
- **Routes:** `GET/POST /api/v1/auth/tokens`, `DELETE /api/v1/auth/tokens/:id` (404 for another user's token). The creation response has `cache-control: no-store`.
- **Postman:** a new "API tokens" folder (create stores `apiToken` as a secret and `apiTokenId`; list; revoke) before "Sign out". The environments gained `apiToken`/`apiTokenId`, and the drift test caught the new routes before they were added.
- **Verification:**
  - 5 new Postgres tests: create/list/use/`last_used_at`, token → 403 on management and unknown scope → 400, revoked/expired/unknown → 401 and a foreign revoke → 404, a signed-out session can't manage tokens while `/users/me` still works, and disabling revokes the PAT and refresh token.
  - Users test: the `user.disabled` event.
  - Local `wrangler dev`: Newman 13 requests / 33 assertions, 0 failures; PAT → `/users/me` 200; PAT → create token 403.
