# 020.003 — Implement API rate limiting

## Status

```text
not-started
```

## Parent plan

[020 — Observability & Security Hardening](./_index.md)

## Objective

Apply rate limits to delivery (per delivery key), management (per actor/token), and unauthenticated endpoints using Cloudflare primitives, returning `RATE_LIMITED` with `Retry-After`.

## Background

§28 `RateLimitError`; 007.006 login throttling; §14 KV unsuitable for strict counters.

## Requirements

- Decide mechanism (Workers Rate Limiting binding vs. WAF rate limiting rules vs. both) — record in plan Technical notes/ADR addendum.
- Kernel middleware hook `rateLimit({ key, limit, period })` usable by modules; default policies per route class.
- Limits configurable per environment; documented defaults.
- Tests with a fake limiter; staging verification.

## Architectural constraints

- Limits must not apply to health checks.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/cloudflare/src/rate-limiter.ts
packages/kernel/src/internal/rate-limit.ts
packages/kernel/src/internal/rate-limit.test.ts
```

### Modify

```text
apps/api/wrangler.jsonc
apps/api/src/env.ts
packages/graphql/src/module.ts
modules/auth/src/application/throttle.ts
docs/operations/configuration.md
```

### Delete

```text
None.
```

## Implementation steps

1. Mechanism decision.
2. Middleware and adapters.
3. Apply policies.
4. Tests and docs.

## Dependencies

Requires:

- [020.002 — Configure Workers observability and write the observability runbook](./002-workers-observability-configuration.md)

## Acceptance criteria

- [ ] Exceeding the delivery limit returns 429 with `Retry-After`.
- [ ] Health endpoints never limited.

## Validation

```bash
pnpm test --filter @blixis/kernel --filter @blixis/cloudflare
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
- [ ] Limits documented for SDK consumers (`docs/api/delivery.md`).

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
