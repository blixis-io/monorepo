# 020.003 — Implement API rate limiting

## Status

```text
in-progress
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
packages/kernel/src/rate-limit.ts
packages/kernel/src/rate-limit.test.ts
packages/cloudflare/src/rate-limiter.ts
packages/cloudflare/src/rate-limiter.test.ts
```

### Modify

```text
packages/kernel/src/create-blixis.ts
packages/kernel/src/index.ts
packages/kernel/src/internal/rest.ts
packages/cloudflare/src/index.ts
apps/api/wrangler.jsonc
apps/api/worker-configuration.d.ts
apps/api/src/index.ts
apps/docs/src/content/docs/extending/authoring-guide.mdx
docs/operations/configuration.md
docs/operations/observability.md
docs/api-surface/kernel.api.md
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
- [x] Health endpoints never limited (test; staging health stayed 200 during the bursts).

## Validation

```bash
pnpm --filter @blixis/kernel --filter @blixis/cloudflare test
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

- **Mechanism: Workers Rate Limiting binding.** Per-location, eventually consistent counters with no extra round trip; limits live in `wrangler.jsonc` per environment. WAF rate limiting rules need a zone and the Workers still run on `workers.dev`, so they are deferred to plan 021 (custom domain) as a coarse per-IP second layer. Durable Objects (exact global counters) were not needed for abuse protection and would add latency to every request.
- **Kernel API:** `createBlixis({ rateLimits: { limiters(env), defaults } })` applies one limiter per route class (`anonymous` per IP, `actor` per `actorId`, `delivery` per key) in the request middleware after authentication; `rateLimit({ limiter, key? })` adds a tighter limiter on a module route. The binding fixes limit and period, so the hook takes a limiter *name* instead of `{ limit, period }` as the task sketch had it.
- **Health checks** are answered before the request middleware, so they are never limited (test). CORS preflights are answered before it too.
- **Fails open** on limiter errors (`rate_limit.unavailable`), and a missing binding disables that class, so local tools and tests without bindings keep working.
- **No GraphQL or auth changes needed:** GraphQL and asset delivery are root routes behind the same middleware; the sign-in throttle (Postgres, per email and IP) stays as the strict layer for credentials.
- `apps/api/src/env.ts` unchanged: bindings are typed by `wrangler types` (`worker-configuration.d.ts`), not by the env schema.
- **Staging verification (2026-09-29): the binding does not enforce.** Deployed with the bindings (versions `18b3a869…`, `d72ba3f4…`); 330 sequential, 500 parallel, 450 and 1,500 sustained anonymous requests from one stable IPv4 (colo AMS) all got `401`, never `429`. No `rate_limit.not_configured` and no `rate_limit.unavailable`, so the limiter was found and `limit()` resolved `success: true`. Locally (`wrangler dev`, with and without a Sentry DSN) the same code answers `429` from request 301. Same symptom reported on the Cloudflare Community (binding always returns `success=true` for the same key and colo).
- **Decision (owner: "do what you think is best"):** keep the binding code (correct, tested, costs nothing), don't add Durable Object or Postgres counters for now (a round trip on every request for abuse protection). Require WAF rate limiting rules once the custom domain exists: added to the launch checklist (022.005). Optional owner action: Cloudflare support ticket (Worker `blixis-api-staging`, namespaces 1101–1103).
- #152 added `rate_limit.not_configured` (warn once) and `rate_limit.checked` (debug), which is how the cause was narrowed down.
- Note: `wrangler deploy --var LOG_LEVEL:debug` did not change `LOG_LEVEL` for the deployed version (`vars` in `wrangler.jsonc` won); set it in the file temporarily when debug logs are needed.
- **Status:** stays `in-progress`: the acceptance criterion (limits verified on staging) can't be met until the binding enforces or the WAF rules exist.
