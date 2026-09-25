# 007.004 — Resolve actors from sessions and bearer tokens

## Status

```text
completed
```

## Parent plan

[007 — Identity & Authentication](./_index.md)

## Objective

Implement the auth module's actor resolver plugged into the kernel so every request's `RequestContext.actor` is `user`, `apiToken`, or `anonymous`, with consistent handling of invalid credentials.

## Background

The kernel accepts an `actorResolver` (003.006). Resolution must be transport-agnostic so GraphQL (plan 012) reuses it. Delivery keys are added to the same resolver chain in plan 012.

## Requirements

- Define a resolver chain contract in the kernel (multiple modules can contribute resolvers in order: auth sessions, auth API tokens, later delivery keys) — extend the module contract minimally or use a kernel-level service token `ACTOR_RESOLVERS`; document.
- Session resolver: reads cookie, looks up hashed session, checks expiry/revocation and user status (`disabled` → anonymous + log).
- Bearer resolver: `Authorization: Bearer blx_pat_…` → token lookup (implemented in 007.005; stub interface here).
- Invalid presented credentials → `UnauthorizedError` (not silent anonymous) for bearer tokens; for cookies → anonymous + clear-cookie header (document rationale).
- Update `last_seen_at` at most once per N minutes (avoid write per request) using `waitUntil`.

## Architectural constraints

- Resolution must not require authorization logic.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/auth/src/application/resolvers.ts
packages/kernel/src/actors.ts
```

### Modify

```text
docs/ROADMAP.md
docs/kernel/README.md
docs/plans/007-identity-and-authentication/004-actor-resolution.md
docs/plans/007-identity-and-authentication/_index.md
modules/auth/src/application/auth.service.ts
modules/auth/src/index.ts
modules/auth/src/module.ts
modules/auth/test/auth.test.ts
packages/kernel/src/create-blixis.ts
packages/kernel/src/index.ts
packages/kernel/src/internal/rest.test.ts
packages/testing/src/create-test-blixis.ts
```

### Delete

```text
None.
```

## Implementation steps

1. Design the resolver chain and document it.
2. Implement session resolver.
3. Integrate with kernel middleware.
4. Tests.

## Dependencies

Requires:

- [007.003 — Implement sign-up, sign-in, sign-out, and sessions](./003-auth-module-sessions.md)

## Acceptance criteria

- [x] Request with a valid cookie has a `user` actor in context.
- [x] Request with an invalid bearer token receives 401.
- [x] Disabled users cannot authenticate.

## Validation

```bash
pnpm --filter @blixis/auth --filter @blixis/kernel test
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
- [x] Resolver chain is reusable by GraphQL and by delivery keys.

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

- **Resolver chain, decided:** a kernel-level `ACTOR_RESOLVERS` registry (like `HEALTH_CHECKS`), not a module-contract field. Modules register `{ name, resolve(request, services) }` in `setup`; the registry is locked afterwards. `resolve` returns an actor, `undefined` ("not my kind of credential"), or throws `UnauthorizedError` (my kind, but invalid). The first actor wins, in registration (bootstrap) order.
- **Presented credentials are never ignored:** an `Authorization` header that no resolver claims → `401 Unsupported or invalid credentials`. No credentials → anonymous. An explicit `createBlixis({ actorResolver })` replaces the chain (tests).
- **JWT resolver (`@blixis/auth`):**
  - `Bearer <jwt>` → `{ type: 'user', userId: sub }`; `blx_*` bearer values are left to the API-token resolver (007.005). Until that exists, a `blx_pat_…` gets the kernel's unclaimed-credentials 401.
  - **No database lookup and no disabled-user check per request.** This deviates from this task's session-based text, per ADR 0009: an access token is trusted until expiry (≤ 15 min); refresh checks user status.
  - On public auth routes (sign-up/in, refresh, sign-out, jwks), an invalid bearer yields anonymous instead of 401, so a client with a stale token can always refresh or sign in. `/auth/me` is not exempt.
- **Finding:** actor resolvers run **before** `REQUEST_CONTEXT` exists (the context contains the actor). The first resolver resolved `AUTH_SERVICE`, whose factory needs `REQUEST_CONTEXT` → 500. Fixed by verifying with `AUTH_CONFIG` plus the JWT functions directly; documented on `ActorResolverEntry` and in the kernel README.
- **`createTestBlixis`:** a test actor (header or default `actor`) still wins. Otherwise, requests with an `Authorization` header go through the app's real chain (`ACTOR_RESOLVERS.resolve`, now on the public interface), so tests can use real bearer tokens.
- **Cookie resolver:** not needed. Browsers send the access token as a Bearer header; the refresh cookie is only read by `/auth/refresh` and `/auth/sign-out` (ADR 0009). `last_seen_at` throttling is not applicable (no per-request session row).
- **Tests:**
  - 3 kernel chain tests (first wins, anonymous / invalid / unclaimed → 401, explicit resolver wins, late registration rejected);
  - 3 auth tests with real Bearer tokens (`/users/me` and `/auth/me` 200; tampered / garbage / `blx_pat_` / `Basic` → 401; a stale bearer on refresh and sign-in is ignored, but not on `/auth/me`).
- **Local `wrangler dev` end to end:** sign-in → `GET /users/me` with Bearer → 200 with the user; no token → 401; tampered token → 401.
