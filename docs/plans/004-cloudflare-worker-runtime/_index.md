# 004 — Cloudflare Worker Runtime

## Status

```text
in-progress
```

Milestone: Milestone 2 — Kernel walking skeleton on Cloudflare Workers  
Roadmap scope: MVP / initial platform  
Progress: 5/7 tasks completed

## Objective

Run the kernel on Cloudflare Workers as the walking skeleton: `apps/api` composes modules through `blixis.config.ts`, validates its environment, exposes a Worker entry that routes `fetch`, `queue`, and `scheduled` invocations through the kernel, is tested inside the Workers runtime, and can be deployed (dry-run in CI, real deploy to a staging Worker once credentials exist).

## Why this plan exists

§11–§12 and §19 make Cloudflare Workers the primary runtime with bindings for every platform resource; §46 mandates a modular monolith with one API Worker. Proving the kernel inside `workerd` early surfaces runtime restrictions (no global-scope I/O, per-request I/O isolation, Node compatibility gaps) before databases and domain modules depend on the design.

## Scope

In scope:

- `@blixis/cloudflare` package: `CloudflareEnv` binding types, env validation helpers, `ExecutionContext` utilities
- `apps/api` Worker: `wrangler.jsonc`, `src/index.ts`, `src/blixis.config.ts`, `src/env.ts`
- Worker entry adapter: `fetch`, `queue`, `scheduled` routed through kernel (queue/scheduled dispatch targets are registered by later plans)
- environment/secret validation at boot
- Workers-runtime tests with `@cloudflare/vitest-pool-workers`
- wrangler environments (local, staging, production) and deploy dry-run in CI
- Sentry error monitoring for the Worker (kernel `ErrorReporter` port + Sentry adapter)

Out of scope:

- Hyperdrive/Neon (plan 005), Queues producers/consumers (plan 006), KV (plan 013), R2 (plan 014), Workflows (plan 016), Service Bindings (plan 020)
- CD pipeline with real production deploys (plan 021)

## Dependencies

Depends on:

- [003 — Module Kernel](../003-module-kernel/_index.md)

## Architecture decisions

- **One API Worker** (§46) hosting Management REST and (later) GraphQL delivery (§45).
- **Bindings, not REST APIs** for Cloudflare resources (§11, §48 Architecture.14).
- **Domain packages do not depend on `@blixis/cloudflare`** (§4); only `apps/api` and infrastructure adapters do.
- **Env typing**: `wrangler types` generates the runtime binding types; `@blixis/cloudflare` defines the `CloudflareEnv` contract (§19) that the generated types must satisfy (compile-time check), plus a runtime validation schema for vars/secrets.
- **Compatibility**: pin a recent `compatibility_date`; enable `nodejs_compat` only if a chosen dependency requires it (database drivers usually do — decided in plan 005); record every flag with its reason.
- **Worker entry shape**: `createBlixis` returns a `BlixisApp`; `apps/api/src/index.ts` exports `{ fetch, queue, scheduled }` built by a `@blixis/cloudflare` adapter, plus any Workflow classes as named exports (plan 016).
- **`ctx.waitUntil`** is used for request-scope disposal and post-response work; no floating promises.

## Deliverables

- `apps/api` runs locally with `wrangler dev` and answers `GET /api/v1/health`.
- Workers-runtime test suite passes in CI.
- `wrangler deploy --dry-run` passes in CI and reports bundle size.
- Unexpected errors reported to Sentry (org `private-m57`) with environment, release, and request IDs.
- Staging Worker deployed manually once (if Cloudflare account access is available) and documented in `docs/operations/cloudflare.md`.

## Tasks

- [x] [001 — Scaffold @blixis/cloudflare with binding types and env validation](./001-scaffold-cloudflare-package-and-env-typing.md)
- [x] [002 — Create the apps/api Worker application](./002-create-api-worker-app.md)
- [x] [003 — Implement the Worker entry adapter for fetch, queue, and scheduled](./003-worker-entry-adapter.md)
- [x] [004 — Validate environment configuration at boot](./004-environment-configuration-validation.md)
- [x] [005 — Add Workers-runtime integration tests for apps/api](./005-workers-runtime-tests.md)
- [ ] [006 — Configure wrangler environments and deploy dry-run in CI](./006-environments-and-deploy-dry-run.md)
- [ ] [007 — Integrate Sentry error monitoring for the API Worker](./007-sentry-error-monitoring.md)

## Completion criteria

The plan may be marked `completed` when:

- [ ] All tasks `completed`.
- [ ] Health endpoint works under `wrangler dev` and in the Workers test pool.
- [ ] Invalid/missing required env vars cause a clear boot error naming the variable (never its value).
- [ ] Architectural checkpoint CP2a: kernel boots inside `workerd` with lazy boot and per-request scopes verified.

## Risks

- **Global-scope restrictions**: accidental I/O or `crypto.getRandomValues` during module evaluation fails in Workers; tests must run in `workerd`, not Node only.
- **Bundle size / startup time limits**: monitor from the first deploy; record baseline.
- **Wrangler/vitest-pool-workers version skew**: pin versions together.
- **Account access**: real deploy requires Cloudflare credentials; tasks must not block on it (dry-run is the gate).

## Open questions

- Custom domain or `workers.dev` initially? (Cloudflare account is set up as of 2026-09-24; domain still open — see `docs/setup-checklist.md`.)
- Is the Workers Paid plan active? (Needed for Queues and higher CPU limits; affects plan 006.)

## Technical notes

No technical notes yet.
