# 007.003 — Implement sign-up, sign-in, sign-out, and sessions

## Status

```text
not-started
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
modules/auth/package.json
modules/auth/tsconfig.json
modules/auth/src/index.ts
modules/auth/src/module.ts
modules/auth/src/domain/credentials.ts
modules/auth/src/domain/session.ts
modules/auth/src/application/auth.service.ts
modules/auth/src/infrastructure/password-hasher.ts
modules/auth/src/infrastructure/session.repository.ts
modules/auth/src/infrastructure/credential.repository.ts
modules/auth/src/infrastructure/migrations/0001_create_auth_tables.sql
modules/auth/src/rest/routes.ts
modules/auth/test/
tooling/db/src/commands/create-user.ts
```

### Modify

```text
apps/api/src/blixis.config.ts
apps/api/package.json
apps/api/wrangler.jsonc (cron for session cleanup, if separate)
tsconfig.json
package.json
pnpm-lock.yaml
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

- [ ] Sign-up (when enabled) → sign-in → me → sign-out flow passes in Workers-pool tests.
- [ ] Wrong password and unknown email return identical responses.
- [ ] Revoked sessions no longer authenticate.
- [ ] `pnpm auth:create-user` creates a usable account locally.

## Validation

```bash
pnpm --filter @blixis/auth test
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
- [ ] Password hashing parameters match ADR 0009 and measured CPU time is recorded.

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
