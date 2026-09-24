# 003 — Module Kernel

## Status

```text
in-progress
```

Milestone: Milestone 2 — Kernel walking skeleton on Cloudflare Workers  
Roadmap scope: MVP / initial platform  
Progress: 5/8 tasks completed

## Objective

Deliver a runtime-agnostic kernel that composes explicitly registered modules into a Hono application exactly as described in §43: validate the module graph, create the service registry, run setup hooks, mount REST apps, collect GraphQL/event/permission/migration contributions, run boot hooks, and return the application. Deliver `@blixis/testing` so modules can be booted in tests with `createTestBlixis`.

No CMS domain logic is included (§4 kernel, §42 Stage 1).

## Why this plan exists

The kernel is the composition root that makes "internal and external modules use the same contract" (§2.2) real. It must exist and be proven with fixture modules before any infrastructure or domain module is written, because every later module depends on its service registry, lifecycle, and route mounting. Its validation (§26) is the main defence against misconfigured third-party modules.

## Scope

In scope:

- `@blixis/kernel` package with `defineModule` and `createBlixis`
- module graph validation (§26) and ordering
- service registry with app and request scopes
- setup/boot lifecycle with clear module-attributed errors
- module configuration validation
- Hono REST mounting under `/api/v1`, request context middleware, error-to-HTTP mapping
- collection registries for event subscriptions, GraphQL contributions, permissions, migrations
- `@blixis/testing` with `createTestBlixis` and test helpers

Out of scope:

- Worker entry (`fetch`/`queue`/`scheduled`) and Cloudflare env typing (plan 004)
- GraphQL server and schema composition (plan 012 — the kernel only collects contributions)
- actual event bus implementations (plan 006 — the kernel registers subscriptions)
- migration execution (plan 005)
- authentication (plan 007 — the kernel accepts an actor resolver hook with `anonymous` default)

## Dependencies

Depends on:

- [002 — Public Contracts](../002-public-contracts/_index.md)

## Architecture decisions

- **Explicit composition root** (§2.3): `createBlixis({ modules })` receives module instances; no filesystem or `node_modules` scanning.
- **No special-casing** of first-party modules (§2.2): the kernel never checks `meta.name` prefixes.
- **Runtime-agnostic kernel**: `@blixis/kernel` depends on `hono` and `@blixis/contracts` but not on Cloudflare types; Worker specifics live in `@blixis/cloudflare`/`apps/api` (plan 004).
- **Lifecycle** `define → validate → register (setup) → boot → ready` (§27); boot is lazy on first use because Workers forbid I/O at global scope — setup hooks must not perform I/O (documented rule).
- **Service scopes**: app-scoped singletons plus request-scoped factories (decided in 003.003) because Workers cannot share I/O objects such as DB connections across requests.
- **REST prefix** `/api/v1` (§9). Conflict detection compares concrete method + path pairs after mounting, not only mount prefixes, because several modules legitimately mount under `/spaces/...` (e.g. spaces and content).
- **Errors**: the kernel maps `BlixisError` codes to HTTP statuses using the table from `docs/contracts/errors.md`; unknown errors become `INTERNAL` 500 without leaking messages. Response body format decided in 003.006 (recommendation: RFC 9457 `application/problem+json` with `code`).
- **Fail fast** with errors naming the offending module (§26).

## Deliverables

- `packages/kernel` exporting `defineModule`, `createBlixis`, and kernel-level types.
- `packages/testing` exporting `createTestBlixis`, fake logger, and request helpers.
- Fixture modules in kernel tests covering: services across modules, capabilities, missing dependency, duplicate service, route conflict, config validation failure, setup/boot ordering.
- `docs/kernel/README.md` explaining bootstrap sequence, scopes, and validation errors.

## Tasks

- [x] [001 — Scaffold @blixis/kernel and implement defineModule](./001-scaffold-kernel-and-define-module.md)
- [x] [002 — Implement module graph validation and ordering](./002-module-graph-validation.md)
- [x] [003 — Implement the service registry with app and request scopes](./003-service-registry-and-scopes.md)
- [x] [004 — Implement the setup/boot lifecycle and createBlixis](./004-lifecycle-and-create-blixis.md)
- [x] [005 — Validate module configuration](./005-module-configuration-validation.md)
- [ ] [006 — Mount module REST apps with request context and error mapping](./006-rest-mounting-and-error-mapping.md)
- [ ] [007 — Collect event, GraphQL, permission, and migration contributions](./007-contribution-registries.md)
- [ ] [008 — Create @blixis/testing with createTestBlixis](./008-testing-package-create-test-blixis.md)

## Completion criteria

The plan may be marked `completed` when:

- [ ] All tasks `completed`.
- [ ] A fixture "external" module (defined only with contracts + `defineModule`) boots in `createTestBlixis`, provides a service consumed by a second fixture module, and serves a REST route.
- [ ] Every §26 validation case has a test asserting the error names the offending module.
- [ ] Kernel bundle contains no Cloudflare or Node-only imports (boundary lint passes).

## Risks

- **Lazy boot on Workers**: first request pays boot cost; heavy setup inflates cold starts. Keep setup cheap; measure in plan 004.
- **Request-scope overhead**: creating a scope per request must be cheap (no reflection, simple maps).
- **Hono typing**: combining typed sub-apps can explode type-check time; prefer simple `BlixisHonoEnv` typing over deep route type inference in the kernel.
- **Version compatibility**: semver range checking needs a small Workers-safe semver implementation or dependency; verify bundle size.

## Open questions

- Should route-level conflict detection be strict (fail on identical method+path) or also warn on overlapping wildcard patterns? Default: fail on identical method+path, warn on wildcards.
- Do modules need to declare an explicit `order`/`after` hint, or is dependency order (from `requires`/capabilities) sufficient? Default: dependency order only (§27 keep lifecycle small).

## Technical notes

No technical notes yet.
