# 007.003 — Implement sign-up, sign-in, sign-out, and sessions

## Status

```text
completed
```

## Parent plan

[007 — Identity & Authentication](./_index.md)

## Objective

Create `@blixis/auth` with credential storage, session management per ADR 0009, and routes `sign-up`, `sign-in`, `sign-out`, `me`.

## Background

§41 lists `@blixis/auth`; §9 lists authentication flows as REST responsibilities. Users are created through `USER_SERVICE`, keeping user data ownership in `@blixis/users`.

## Requirements

- Create `modules/auth`; requires `@blixis/users` (package) or capability `blixis.users` — use capability plus public token import from `@blixis/users` (document the dependency choice).
- Migrations: `auth_credentials(user_id pk/fk, password_hash, algorithm, params, updated_at)`, `auth_sessions(id_hash pk, user_id, created_at, expires_at, last_seen_at, user_agent_hash?, revoked_at)`.
- Sign-up: validate input, create user via `USER_SERVICE` and credentials in one transaction, create session, set cookie. Configurable: `allowSignUp` module option (default false in production — first user via CLI/seed, see 008).
- Sign-in: constant-time comparison, generic error message (`UnauthorizedError('Invalid credentials')`), session creation, session rotation on sign-in.
- Sign-out: revoke session, clear cookie.
- `me`: returns the actor's user profile via `USER_SERVICE`.
- Session sliding expiry per ADR; cleanup of expired sessions via cron (register scheduled handler).
- A seed/CLI command `pnpm auth:create-user` (tooling) for bootstrapping the first user without public sign-up.

## Architectural constraints

- Cookies: `HttpOnly`, `Secure` (except local), `SameSite` per ADR, `Path=/`.
- Never log passwords, hashes, session IDs, or cookies (§35).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
apps/api/src/auth-config.ts
apps/docs/src/content/docs/concepts/authentication.mdx
modules/auth/package.json
modules/auth/src/application/auth.service.ts
modules/auth/src/application/config.ts
modules/auth/src/domain/common-passwords.ts
modules/auth/src/domain/encoding.ts
modules/auth/src/domain/jwt.test.ts
modules/auth/src/domain/jwt.ts
modules/auth/src/domain/password.test.ts
modules/auth/src/domain/password.ts
modules/auth/src/events.ts
modules/auth/src/index.ts
modules/auth/src/infrastructure/migrations/0001_create_auth.ts
modules/auth/src/infrastructure/repositories.ts
modules/auth/src/infrastructure/schema.ts
modules/auth/src/module.ts
modules/auth/src/rest/routes.ts
modules/auth/test/auth.test.ts
modules/auth/tsconfig.json
modules/auth/tsconfig.test.json
tooling/db/src/auth.ts
```

### Modify

```text
apps/api/.dev.vars.example
apps/api/package.json
apps/api/src/blixis.config.ts
apps/api/src/env.ts
apps/api/tsconfig.json
apps/api/worker-configuration.d.ts
apps/api/wrangler.jsonc
docs/ROADMAP.md
docs/contracts/events.md
docs/operations/cloudflare.md
docs/operations/configuration.md
docs/plans/007-identity-and-authentication/003-auth-module-sessions.md
docs/plans/007-identity-and-authentication/_index.md
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
tooling/db/package.json
tooling/db/src/cli.ts
tooling/db/tsconfig.json
tsconfig.json
```

### Delete

```text
None.
```

## Implementation steps

1. Scaffold module and migrations.
2. Implement hasher per ADR 0009.
3. Implement auth service (sign-up/in/out, sessions).
4. Implement routes and cookie handling.
5. Add cleanup scheduled handler and bootstrap CLI command.
6. Tests including timing-safe comparison and generic errors.

## Dependencies

Requires:

- [007.002 — Create the users module](./002-users-module.md)

## Acceptance criteria

- [x] Sign-up (when enabled) → sign-in → me → sign-out flow passes in Workers-pool tests.
- [x] Wrong password and unknown email return identical responses.
- [x] Revoked sessions no longer authenticate.
- [x] `pnpm auth:create-user` creates a usable account locally.

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
- [x] Password hashing parameters match ADR 0009 and measured CPU time is recorded.

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

- **Built on ADR 0009 (JWT + refresh tokens) instead of the sessions in this task's text.**
  - `auth.refresh_tokens` replaces `auth_sessions`: a family = a "session".
  - `auth.credentials` stores only the versioned scrypt string (parameters live inside it), not separate `algorithm`/`params` columns.
- **Dependency choice (documented):** `@blixis/auth` has `meta.requires: { '@blixis/users': '>=0.0.0' }` plus `USER_SERVICE` imported from `@blixis/users` (peer dependency). A package requirement, not only a capability, because `auth.*.user_id` has a **foreign key to `users.users`**, which ADR 0007 §8 allows only toward required modules. `on delete restrict`: users are disabled, not deleted.
- **Crypto:**
  - scrypt N=2^15 r=8 via `@noble/hashes` 2.4.0 (catalog); NFKC-normalized input; constant-time compare.
  - `needsRehash` → rehash on sign-in.
  - EdDSA JWT: header `{alg: EdDSA, typ: at+jwt, kid}`; claims iss/aud/sub/sid/iat/exp/jti. Verification: 3 segments, exact alg/typ, known kid, signature, iss/aud, exp/iat ±30 s.
  - Refresh tokens `blx_rt_<32B b64url>`, stored as SHA-256 hex.
- **Timing (enumeration):** an unknown email runs `burnPasswordCheck` against a **precomputed** dummy hash. The first version computed it lazily, which made the first unknown-email sign-in take ~2× longer in `wrangler dev` (210 ms vs 115 ms). Found in the local end-to-end run, fixed, and covered by a unit test.
- **Refresh:**
  - Reject unknown, revoked, expired, or family-expired tokens.
  - A token rotated more than `rotationGraceSeconds` (10) ago → revoke the family and log `auth.refresh_reuse` (warn).
  - Otherwise mark rotated (atomic `where rotated_at is null`) and issue a sibling in the family; expiry = min(now + 30 d, family expiry at 90 d).
  - A disabled or missing user revokes the family.
  - A failed cookie refresh returns the problem response **plus** a cleared cookie. It is built directly, because a thrown error gets a fresh response and would drop `c.header`.
- **Transport and CSRF:**
  - Cookie `blixis_refresh; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Strict` (no `__Host-`, since that requires `Path=/`).
  - Cookie use requires an `Origin` in `AUTH_ALLOWED_ORIGINS` (403 otherwise) and `application/json` (400 otherwise).
  - Body delivery via `tokenDelivery: 'body'`.
  - Responses have `cache-control: no-store`.
- **Config without bindings in the module (§19):** `AUTH_CONFIG` is provided by `apps/api/src/auth-config.ts` from the `AUTH_SIGNING_KEYS` secret and the `AUTH_ALLOWED_ORIGINS` var. The service resolves it **lazily**, so `createAccount` (CLI) needs no keys; keys are imported once per isolate (cache). `AUTH_SIGNING_KEYS` is optional in `apiEnvSchema`, so a missing secret only breaks `/auth/*` (InfrastructureError), not health or readiness.
- **Sign-up** is off by default (`allowSignUp: false`) → 403. `createAccount` (user via `USER_SERVICE.create` in the caller's transaction, plus credentials) serves sign-up and the CLI.
- **CLI (in `tooling/db`):**
  - `pnpm auth:generate-key [kid]` prints an `AUTH_SIGNING_KEYS` value.
  - `pnpm auth:create-user --email --name`, with the password from `AUTH_PASSWORD` (`read -rs`), `DATABASE_URL` (migrator), and the app's own modules. `QUEUE_SENDER` is overridden to fail, so `user.created` stays pending in the outbox for the deployed sweep.
- **Events:** `user.signed-in` / `user.signed-out` (best-effort), registered in `docs/contracts/events.md`.
- **Cron:** deletes refresh tokens whose family ended more than 7 days ago.
- **Verification:**
  - 23 auth tests (14 unit: passwords, JWT tampering / `alg none` / HS256 / unknown kid / expiry / rotation / key parsing, timing; 9 Postgres flows: sign-up, 409/400/403, generic 401 ×3, rotation + reuse → family revoked, grace window, CSRF origin + content type + body delivery, sign-out, JWKS, /me).
  - **Local `wrangler dev` end to end:** sign-in 200 (3-part JWT), wrong password and unknown email both 401, cookie refresh with origin 200, without origin 403, JWKS public only.
  - `auth:create-user` created `owner@example.com` locally (event pending in the outbox); duplicate → "already exists".
  - Total 353 tests; bundle 360 KiB gzip (+14 KiB).
- **Actor resolution** from Bearer tokens follows in 007.004. Until then `/auth/me` and `/users/me` see anonymous for real requests.
- **Staging prerequisites:** `db:migrate` (users + auth), `wrangler secret put AUTH_SIGNING_KEYS --env staging`, then `pnpm auth:create-user`.
