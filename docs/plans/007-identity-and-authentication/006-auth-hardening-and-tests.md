# 007.006 — Add login throttling, CSRF protection, and auth security tests

## Status

```text
not-started
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
modules/auth/test/security.test.ts
apps/api/test/auth-security.worker.test.ts
```

### Modify

```text
modules/auth/src/rest/routes.ts
modules/auth/src/module.ts
packages/kernel/src/internal/rest.ts (CSRF middleware hook, if kernel-level)
apps/api/wrangler.jsonc
docs/operations/configuration.md
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

- [ ] Sixth failed login in a short window returns 429 `RATE_LIMITED` with `Retry-After`.
- [ ] Cookie-authenticated `POST` from a foreign origin returns 403.
- [ ] Log-capture test passes with no secrets.

## Validation

```bash
pnpm test --filter @blixis/auth
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
- [ ] Choices recorded for reuse in plan 020 rate limiting.

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
