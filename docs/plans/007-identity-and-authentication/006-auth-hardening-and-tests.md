# 007.006 — Add login throttling, CSRF protection, and auth security tests

## Status

```text
completed
```

## Parent plan

[007 — Identity & Authentication](./_index.md)

## Objective

Protect authentication endpoints against brute force and cookie-authenticated routes against CSRF, and add a security-focused test suite including log redaction checks.

## Background

§35 forbids logging secrets; §30 authentication must be robust. Workers offers a Rate Limiting binding; alternatively a Postgres-backed attempt counter. ADR 0009 defines CSRF strategy.

## Requirements

- Login throttling: per-email and per-IP attempt limits with backoff; implementation via Workers Rate Limiting binding if suitable (check availability/semantics), otherwise Postgres counter; record choice (feeds plan 020.003).
- CSRF: for cookie-authenticated unsafe methods require matching `Origin` against an allow-list config and/or a custom header; bearer-token requests exempt.
- Security tests: throttling kicks in; CSRF rejection; session fixation (rotation on sign-in); log capture proves no password/token/cookie values logged.
- Update `docs/operations/configuration.md` with allowed-origins config.

## Architectural constraints

- Throttling state must not be KV if strict counting is required (§14); prefer binding or Postgres.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/auth/src/application/throttle.ts
modules/auth/src/infrastructure/migrations/0003_create_throttle.ts
modules/auth/test/security.test.ts
```

### Modify

```text
apps/docs/src/content/docs/concepts/authentication.mdx
docs/ROADMAP.md
docs/plans/007-identity-and-authentication/006-auth-hardening-and-tests.md
docs/plans/007-identity-and-authentication/_index.md
modules/auth/src/application/auth.service.ts
modules/auth/src/index.ts
modules/auth/src/module.ts
modules/auth/src/rest/routes.ts
```

### Delete

```text
None.
```

## Implementation steps

1. Implement throttling.
2. Implement CSRF middleware (kernel-level hook fed by auth config — document ownership).
3. Security test suite.

## Dependencies

Requires:

- [007.005 — Implement personal API tokens](./005-personal-api-tokens.md)

## Acceptance criteria

- [x] Sixth failed login in a short window returns 429 `RATE_LIMITED` with `Retry-After`.
- [x] Cookie-authenticated `POST` from a foreign origin returns 403.
- [x] Log-capture test passes with no secrets.

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
- [x] Choices recorded for reuse in plan 020 rate limiting.

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

- **Throttling choice (feeds 020.003): Postgres counters**, not the Workers Rate Limiting binding. The binding counts per Cloudflare location and eventually, which is too loose to stop distributed guessing against one account. §14 rules out KV for strict counting.
  - Table `auth.sign_in_throttle(key_hash, failures, window_started_at, locked_until)` (migration `0003_create_throttle`).
  - Keys are SHA-256 of `email:<normalized>` and `ip:<CF-Connecting-IP>`: no plain emails or IPs.
- **Policy** (`DEFAULT_THROTTLE_POLICY`, overridable via `authModule({ throttle })`):
  - 5 failures per email / 30 per IP within 15 minutes;
  - the lock lasts 60 s × 2^(failures − limit), capped at 1 h, and returns `RateLimitError` → 429 + `Retry-After`;
  - `assertAllowed` runs **before** scrypt (a locked attacker costs no CPU);
  - unknown emails are counted identically (no enumeration);
  - success clears only the email key (the IP may be shared);
  - the minute cron deletes stale unlocked counters.
- **CSRF:** already enforced since 007.003. Only `/auth/refresh` and `/auth/sign-out` read a cookie, and they require an allowed `Origin` and `application/json`. Every other route authenticates via the `Authorization` header, which browsers never attach cross-site, so bearer requests are exempt by design. `AUTH_ALLOWED_ORIGINS` is documented in `configuration.md` (since 007.003).
- **Session fixation:** sign-in always creates a new refresh-token family with a server-generated token; a presented refresh cookie is ignored (tested: new token, different `sid`).
- **Tests (`modules/auth/test/security.test.ts`):**
  - email lock (even the correct password → 429 + Retry-After; other emails unaffected);
  - unknown-email lock;
  - IP spray lock (other IPs unaffected);
  - success resets the counter, and the stored keys are 64-hex hashes with no emails or IPs;
  - session fixation;
  - **log capture**: every flow including failures, refresh reuse (warning logged), PAT use, and an invalid PAT → no password, access/refresh/rotated token, PAT, or signing-key `d` in any log entry.
  - 37 auth tests in total.
- **Plan 007 completion criterion "session cookie and bearer token resolve to the correct Actor":** under ADR 0009 there is no session cookie on API requests. The cookie only carries the refresh token for `/auth/refresh`. Bearer JWT → `user` actor and bearer `blx_pat_` → `apiToken` actor are both tested (007.004/007.005). The criterion is met in that form.
- **Staging:** needs `db:migrate` (users 0001; auth 0001–0003) before the next deploy; a user already exists.
