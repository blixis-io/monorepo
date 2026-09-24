# 007 — Identity & Authentication

## Status

```text
not-started
```

Milestone: Milestone 4 — Identity, tenancy & authorization  
Roadmap scope: MVP / initial platform  
Progress: 0/6 tasks completed

## Objective

Answer "who is the actor?" (§30) for every request: browser users via secure session cookies, automation via bearer API tokens, anonymous otherwise. Users are first-class records owned by `@blixis/users`; credentials and sessions are owned by `@blixis/auth`. The kernel's `actorResolver` is supplied by the auth module so every REST/GraphQL request carries a typed `Actor` in its request context.

## Why this plan exists

§30 separates authentication from authorization; §41 lists `@blixis/auth` and `@blixis/users` as initial modules; §21 places `User` at the root of identity. Tenancy (008) needs users to own organizations, and authorization (009) needs actors. This is also the first real domain vertical slice: REST route → service → repository → Hyperdrive → Neon, with transactional events.

## Scope

In scope:

- ADR for authentication approach (library vs. custom; session vs. token formats; password hashing on Workers)
- `@blixis/users`: users table, repository, `UserService`, `user.created`/`user.updated` events
- `@blixis/auth`: credentials, sessions, sign-up/sign-in/sign-out/me routes, API tokens, actor resolution
- login throttling and CSRF protection for cookie-based requests

Out of scope:

- OAuth/SSO providers, magic links, MFA, email verification, password reset emails (deferred; require email sending decision — see questions)
- organization/space memberships and invitations (plan 008)
- delivery/preview API keys (plan 012)
- authorization/permissions (plan 009)

## Dependencies

Depends on:

- [006 — Events & Async Processing](../006-events-and-async-processing/_index.md)

## Architecture decisions

- **Authentication ≠ authorization** (§30): `@blixis/auth` only produces `Actor`s; it never decides permissions.
- **Module boundaries**: `@blixis/auth` depends on `@blixis/users` through `USER_SERVICE` (public token), never through its repository (§2.5).
- **Actor resolution** is a kernel hook provided by the auth module; transports stay unaware of cookies/tokens.
- **Secrets never logged**: tokens, passwords, cookies (§35).
- **Stored credentials are hashed**: passwords with a Workers-feasible KDF; API tokens stored as SHA-256 hashes with a displayable prefix.
- **Events**: `user.created` is `transactional` (downstream provisioning relies on it); `user.updated` is `best-effort` unless a consumer needs guarantees (record in events decision table).

## Deliverables

- ADR 0009 (authentication approach) accepted.
- `modules/users` and `modules/auth` packages registered in `apps/api`.
- REST endpoints: `POST /api/v1/auth/sign-up`, `POST /api/v1/auth/sign-in`, `POST /api/v1/auth/sign-out`, `GET /api/v1/auth/me`, `GET/POST/DELETE /api/v1/auth/tokens`, `GET/PATCH /api/v1/users/me`.
- Workers-runtime API tests for all flows including negative cases.

## Tasks

- [ ] [001 — Select the authentication approach](./001-select-authentication-approach.md)
- [ ] [002 — Create the users module](./002-users-module.md)
- [ ] [003 — Implement sign-up, sign-in, sign-out, and sessions](./003-auth-module-sessions.md)
- [ ] [004 — Resolve actors from sessions and bearer tokens](./004-actor-resolution.md)
- [ ] [005 — Implement personal API tokens](./005-personal-api-tokens.md)
- [ ] [006 — Add login throttling, CSRF protection, and auth security tests](./006-auth-hardening-and-tests.md)

## Completion criteria

The plan may be marked `completed` when:

- [ ] All tasks `completed`.
- [ ] Session cookie and bearer token both resolve to the correct `Actor` in the request context.
- [ ] Brute-force login throttling and CSRF checks verified by tests.
- [ ] No credential material appears in logs (log-capture test).

## Risks

- **Password hashing CPU cost** on Workers (CPU time limits; PBKDF2 iteration caps in Workers Web Crypto — verify current limits). ADR 0009 must pick parameters that are secure yet within limits, or use an external IdP.
- **Library schema ownership**: auth libraries (e.g. Better Auth) often own their tables and migrations, which may conflict with module-owned migrations (§20). ADR must address this.
- **Cookie scope** between API and admin origins (plan 019) — SameSite and domain decisions affect admin hosting.

## Open questions

- Build on an auth library (e.g. Better Auth, which supports Hono and Workers) or implement a small custom session system? (ADR 0009.)
- Will Blixis use an external identity provider for staff/admin users in production (e.g. Cloudflare Access) in addition to its own accounts?
- Email delivery (verification, password reset, invitations) — Cloudflare Email Service vs. a third-party provider; not needed until invitations (008.004) or password reset. Deferred unless decided earlier.

## Technical notes

No technical notes yet.
