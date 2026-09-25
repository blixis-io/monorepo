# Blixis Development Roadmap

## Overview

This roadmap turns [`BLIXIS_ARCHITECTURE.md`](./BLIXIS_ARCHITECTURE.md) into an ordered, executable implementation plan for the Blixis headless CMS: a modular monolith on Cloudflare Workers (Hono, REST + GraphQL Yoga), Neon Postgres through Hyperdrive, Queues, KV, R2, Workflows, and an explicit module kernel that loads first-party and third-party modules through one contract.

- **Plans:** 23 · **Tasks:** 132 · **Milestones:** 9
- **Architecture** (`BLIXIS_ARCHITECTURE.md`) is the source of truth for *what* to build.
- **This roadmap** is the source of truth for *order*, *dependencies*, and *progress*.
- **Plans** (`plans/XXX-*/_index.md`) specify each subsystem; **tasks** (`plans/XXX-*/YYY-*.md`) are the executable units.
- **Decisions** the architecture leaves open are made in dedicated decision tasks and recorded as ADRs in [`docs/decisions/`](./decisions/README.md). Architecture section references such as "§13" point to `BLIXIS_ARCHITECTURE.md`.

Task IDs use the form `PPP.TTT` (plan number, task number). Task numbering restarts in every plan.

**Project conventions** (apply to every task): [Code standards](./conventions/code-standards.md) · [Git workflow](./conventions/git-workflow.md) · [Commit messages](./conventions/commit-messages.md) · [Testing](./conventions/testing.md) · [Monorepo](./development/monorepo.md) · [Environments](./operations/environments.md) · [Release & deployment](./operations/deployment.md) · [Cloudflare Workers](./operations/cloudflare.md) · [GitHub Actions](./operations/github-actions.md) · [Repository settings](./operations/repository.md) · [Setup checklist](./setup-checklist.md)

### How agents use this roadmap

Before starting a task:

1. Read `docs/BLIXIS_ARCHITECTURE.md`, this roadmap, the plan `_index.md`, and the task file.
2. Verify every task listed under the task's **Dependencies** is `completed`; if not, do not start.
3. Create a branch per the [Git workflow](./conventions/git-workflow.md) (e.g. `feat/001-001-initialize-pnpm-workspace`).
4. Set the task status to `in-progress` in the task file **and** here; if it is the plan's first active task, set the plan to `in-progress` (in `_index.md` and here).

After implementation:

1. Run the task's **Validation**, then set status `review`.
2. Perform the **Review checklist**; fix findings.
3. Update **Technical notes** and correct **Files and folders** to the actual change set.
4. Set the task to `completed`; tick it here and in `_index.md`; update the plan progress count; mark the plan `completed` when all tasks are done and its completion criteria hold.
5. Open a PR with a Conventional Commit title (no AI attribution), wait for green CI, squash-merge; the merge deploys to staging once plan 021 is in place.

If blocked: set `blocked`, add a `## Blocker` section to the task (what, why, what unblocks it, which plan/task is involved), and mark it `[!]` here. Never silently work around an architectural blocker. Never mark work completed merely because code was written.

**Definition of ready:** parent plan exists · dependencies completed · scope, files, constraints, acceptance criteria, and validation defined · no unresolved blocking decision.

**Definition of done:** implementation complete · acceptance criteria and tests pass · review done · file list reflects actual changes · technical notes updated · **developer manual updated when public package APIs change** (TSDoc complete; concept page in `apps/docs` adjusted) · task `completed` · `_index.md` and this roadmap updated.

## Status legend

| Marker | Task status | Plan status |
|---|---|---|
| `[ ]` | `not-started` | `not-started` |
| `[~]` | `in-progress` | `in-progress` |
| `[!]` | `blocked` | `blocked` |
| `[R]` | `review` | — |
| `[x]` | `completed` | `completed` |

The checkbox marker is visual; the textual status inside each task file is authoritative.

## Plan summary

| Plan | Milestone | Scope | Status | Progress | Depends on |
|---|---|---|---|---|---|
| [001 — Project Foundation](./plans/001-project-foundation/_index.md) | M1 | MVP | `completed` | 7/7 | — |
| [002 — Public Contracts](./plans/002-public-contracts/_index.md) | M1 | MVP | `completed` | 8/8 | 001 |
| [023 — Developer Documentation Site](./plans/023-developer-documentation-site/_index.md) | M1 | MVP | `completed` | 4/4 | 002 |
| [003 — Module Kernel](./plans/003-module-kernel/_index.md) | M2 | MVP | `completed` | 8/8 | 002 |
| [004 — Cloudflare Worker Runtime](./plans/004-cloudflare-worker-runtime/_index.md) | M2 | MVP | `completed` | 7/7 | 003 |
| [005 — Database Foundation](./plans/005-database-foundation/_index.md) | M3 | MVP | `completed` | 8/8 | 004 |
| [006 — Events & Async Processing](./plans/006-events-and-async-processing/_index.md) | M3 | MVP | `completed` | 7/7 | 005 |
| [007 — Identity & Authentication](./plans/007-identity-and-authentication/_index.md) | M4 | MVP | `in-progress` | 5/6 | 006 |
| [008 — Tenancy: Organizations, Spaces & Memberships](./plans/008-tenancy-organizations-and-spaces/_index.md) | M4 | MVP | `not-started` | 0/6 | 007 |
| [009 — Authorization & Permissions](./plans/009-authorization-and-permissions/_index.md) | M4 | MVP | `not-started` | 0/5 | 008 |
| [010 — Content Modeling](./plans/010-content-modeling/_index.md) | M5 | MVP | `not-started` | 0/5 | 009 |
| [011 — Entries, Versions & Publishing](./plans/011-entries-and-publishing/_index.md) | M5 | MVP | `not-started` | 0/7 | 010 |
| [012 — GraphQL Platform & Content Delivery API](./plans/012-graphql-delivery-api/_index.md) | M6 | MVP | `not-started` | 0/8 | 011 |
| [013 — Delivery Caching & Invalidation](./plans/013-delivery-caching/_index.md) | M6 | MVP | `not-started` | 0/5 | 012 |
| [014 — Assets on R2](./plans/014-assets/_index.md) | M7 | MVP | `not-started` | 0/6 | 012 |
| [015 — Webhooks](./plans/015-webhooks/_index.md) | M7 | MVP | `not-started` | 0/5 | 011 |
| [016 — Releases & Cloudflare Workflows](./plans/016-releases-and-workflows/_index.md) | M7 | Extended | `not-started` | 0/4 | 013, 014, 015 |
| [017 — SDK & Example Astro Consumer](./plans/017-sdk-and-example-consumer/_index.md) | M8 | MVP | `not-started` | 0/4 | 013, 014, 015 |
| [018 — Extension Platform & Example Plugin](./plans/018-extension-platform/_index.md) | M8 | MVP | `not-started` | 0/5 | 017 |
| [019 — Admin UI Foundation](./plans/019-admin-ui-foundation/_index.md) | M8 | MVP | `not-started` | 0/4 | 017 |
| [020 — Observability & Security Hardening](./plans/020-observability-and-security-hardening/_index.md) | M9 | MVP | `not-started` | 0/5 | 013, 014, 015 |
| [021 — CI/CD & Release Engineering](./plans/021-ci-cd-and-release-engineering/_index.md) | M9 | MVP | `not-started` | 0/3 | 011 |
| [022 — Production Readiness & Launch](./plans/022-production-readiness/_index.md) | M9 | MVP | `not-started` | 0/5 | 013, 014, 015, 018, 019, 020, 021 |

## Milestones

| Milestone | Plans | Exit criteria |
|---|---|---|
| **M1 — Workspace & public contracts** | 001, 002, 023 | Monorepo with TS7, lint/boundary checks, tests, CI; `@blixis/contracts` complete with a type-checked sample third-party module. |
| **M2 — Kernel walking skeleton on Cloudflare Workers** | 003, 004 | `@blixis/kernel` composes modules; `apps/api` Worker serves `/api/v1/health` in `workerd`; deploy dry-run in CI. Checkpoints CP1, CP2a. |
| **M3 — Persistence & event infrastructure** | 005, 006 | Worker → Hyperdrive → Neon readiness slice; module-owned migrations; outbox → Queue → idempotent consumers proven. Checkpoints CP2b, CP3. |
| **M4 — Identity, tenancy & authorization** | 007, 008, 009 | Sessions/API tokens, organizations/spaces/memberships, permission-based authorization; isolation and authz matrices in CI. Checkpoint CP4. |
| **M5 — Content management core** | 010, 011 | Content types, fields, immutable entry versions, publish/unpublish with transactional events via REST. Checkpoint CP5. |
| **M6 — Content delivery** | 012, 013 | GraphQL Yoga delivery with delivery/preview keys, limits, batching; edge caching with event-driven invalidation. Checkpoint CP6. |
| **M7 — Assets, integrations & durable processes** | 014, 015, 016* | R2 assets with Postgres metadata; signed webhooks with retries; *(Extended)* releases on Workflows. |
| **M8 — Consumers & extension platform** | 017, 018, 019 | SDK, Astro example site, example third-party plugin proven by a CI gate, publishable packages, minimal React/shadcn admin. Checkpoint CP7. |
| **M9 — Production readiness** | 020, 021, 022 | Observability, rate limits, security review, automated deploys, DR drill, docs, conformance review, launch. Checkpoint CP8. |

\* Plan 016 is **Extended** scope (architecture §41 lists releases as "later"); it is fully planned but does not block MVP launch (plan 022).

### MVP vs. extended scope

- **MVP / initial platform:** plans 001–015 and 017–022.
- **Extended (planned, post-MVP):** plan 016 — Releases & Cloudflare Workflows. It may be executed any time after its dependencies (013, 014, 015) are complete, including before launch if capacity allows.
- **Deferred / future:** see [Deferred / future work](#deferred--future-work). Not scheduled.

### Recommended execution order and parallelism

Plans are numbered in a valid dependency order, except **023** (developer documentation site), which was added on 2026-09-24 and runs right after 002, before 003. The critical path is `001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010 → 011 → 012 → 013/014 → 017 → 018/019 → 022`. After plan 011, several plans can run in parallel:

- **012** GraphQL delivery, **015** webhooks, and **021** CI/CD all depend only on 011.
- **013** caching and **014** assets can run in parallel after 012.
- **017** SDK, **020** observability/security, and **016** releases (Extended) start once 013, 014, and 015 are complete.
- **018** extension platform and **019** admin UI can run in parallel after 017.

### Deviations from the architecture's suggested development order (§42)

| §42 suggestion | Roadmap | Reason |
|---|---|---|
| Events (Stage 5) after content (Stage 4) | Events infrastructure (006) before identity and content | The first domain events (`user.created`, `space.created`, `entry.published`) must use the outbox from day one (§32); retrofitting consistency is riskier than building the abstraction first. |
| Cloudflare runtime implicit in Stage 1 | Dedicated plan 004 before the database | Proves the kernel inside `workerd` (global-scope and per-request I/O rules) before infrastructure depends on the design. |
| Stage 8 "plugins" as a single example | Plan 018 adds a CI gate, public content-capability package, and package publishing | §52 requires *continuous* proof of contract sufficiency, not a one-off demo. |
| Not listed | Plans 019–022 (admin, hardening, CI/CD, readiness) | The architecture's target system (§50) includes the admin UI; observability/security (§35, §39) and operability require explicit work. |

## Plans

### Milestone 1 — Workspace & public contracts

#### 001 — Project Foundation

Status: `completed` · Progress: 7/7 · Scope: MVP  
Plan: [001-project-foundation/_index.md](./plans/001-project-foundation/_index.md)  
Depends on: None

Creates the pnpm monorepo, TypeScript 7 baseline, package conventions, linting/boundary checks, the test runner, and CI. Ends with one proving package (`@blixis/shared`) that builds, lints, and tests through the same pipeline every later package will use.

- [x] [001.001 — Initialize pnpm workspace and repository](./plans/001-project-foundation/001-initialize-pnpm-workspace.md)
- [x] [001.002 — Record toolchain decisions for TypeScript 7, build, test, and lint](./plans/001-project-foundation/002-record-toolchain-decisions.md)
- [x] [001.003 — Configure root TypeScript 7 setup](./plans/001-project-foundation/003-configure-typescript.md)
- [x] [001.004 — Define package conventions and create @blixis/shared](./plans/001-project-foundation/004-define-package-conventions.md)
- [x] [001.005 — Configure linting, formatting, and package-boundary checks](./plans/001-project-foundation/005-configure-lint-format-and-boundaries.md)
- [x] [001.006 — Configure the test runner for unit and Workers-runtime tests](./plans/001-project-foundation/006-configure-test-runner.md)
- [x] [001.007 — Set up the continuous integration pipeline](./plans/001-project-foundation/007-setup-ci-pipeline.md)

#### 002 — Public Contracts

Status: `completed` · Progress: 8/8 · Scope: MVP  
Plan: [002-public-contracts/_index.md](./plans/002-public-contracts/_index.md)  
Depends on: [001 — Project Foundation](./plans/001-project-foundation/_index.md)

Creates `@blixis/contracts`: the small, stable, dependency-light package that every internal and external module builds against — module and lifecycle contracts, typed service tokens, capabilities, public errors, validation (Standard Schema), events, permissions/actors, request context, and migration contracts.

- [x] [002.001 — Scaffold the @blixis/contracts package](./plans/002-public-contracts/001-scaffold-contracts-package.md)
- [x] [002.002 — Define module, metadata, contribution, and lifecycle contracts](./plans/002-public-contracts/002-define-module-contracts.md)
- [x] [002.003 — Define typed service tokens and capability identifiers](./plans/002-public-contracts/003-define-service-tokens-and-capabilities.md)
- [x] [002.004 — Define the public error model](./plans/002-public-contracts/004-define-public-errors.md)
- [x] [002.005 — Select the validation library and define the schema contract](./plans/002-public-contracts/005-select-validation-library.md)
- [x] [002.006 — Define event envelope, definition, and subscription contracts](./plans/002-public-contracts/006-define-event-contracts.md)
- [x] [002.007 — Define actor, permission, and authorization contracts](./plans/002-public-contracts/007-define-permission-and-actor-contracts.md)
- [x] [002.008 — Define request context and migration contracts](./plans/002-public-contracts/008-define-request-context-and-migration-contracts.md)

#### 023 — Developer Documentation Site

Status: `completed` · Progress: 4/4 · Scope: MVP  
Plan: [023-developer-documentation-site/_index.md](./plans/023-developer-documentation-site/_index.md)  
Depends on: [002 — Public Contracts](./plans/002-public-contracts/_index.md)

Adds `apps/docs`: a Starlight (Astro) documentation site with a hand-written developer manual for module authors and an API reference generated from TSDoc, built in CI and deployed to Cloudflare. Starts with `@blixis/contracts`; every later plan that changes a public package extends it. Added on request of the project owner; executed before plan 003.

- [x] [023.001 — Scaffold the Starlight documentation site](./plans/023-developer-documentation-site/001-scaffold-docs-site.md)
- [x] [023.002 — Generate the API reference from TSDoc](./plans/023-developer-documentation-site/002-generate-api-reference.md)
- [x] [023.003 — Write the developer manual for module authors](./plans/023-developer-documentation-site/003-write-developer-manual.md)
- [x] [023.004 — Deploy the documentation site to Cloudflare](./plans/023-developer-documentation-site/004-deploy-docs-to-cloudflare.md)

### Milestone 2 — Kernel walking skeleton on Cloudflare Workers

#### 003 — Module Kernel

Status: `completed` · Progress: 8/8 · Scope: MVP  
Plan: [003-module-kernel/_index.md](./plans/003-module-kernel/_index.md)  
Depends on: [002 — Public Contracts](./plans/002-public-contracts/_index.md)

Builds `@blixis/kernel` — `defineModule`, module graph validation, the typed service registry with scopes, the setup/boot lifecycle, module config validation, Hono REST mounting with error mapping and request context, contribution collection (events, GraphQL, permissions, migrations) — plus `@blixis/testing` with `createTestBlixis`.

- [x] [003.001 — Scaffold @blixis/kernel and implement defineModule](./plans/003-module-kernel/001-scaffold-kernel-and-define-module.md)
- [x] [003.002 — Implement module graph validation and ordering](./plans/003-module-kernel/002-module-graph-validation.md)
- [x] [003.003 — Implement the service registry with app and request scopes](./plans/003-module-kernel/003-service-registry-and-scopes.md)
- [x] [003.004 — Implement the setup/boot lifecycle and createBlixis](./plans/003-module-kernel/004-lifecycle-and-create-blixis.md)
- [x] [003.005 — Validate module configuration](./plans/003-module-kernel/005-module-configuration-validation.md)
- [x] [003.006 — Mount module REST apps with request context and error mapping](./plans/003-module-kernel/006-rest-mounting-and-error-mapping.md)
- [x] [003.007 — Collect event, GraphQL, permission, and migration contributions](./plans/003-module-kernel/007-contribution-registries.md)
- [x] [003.008 — Create @blixis/testing with createTestBlixis](./plans/003-module-kernel/008-testing-package-create-test-blixis.md)

#### 004 — Cloudflare Worker Runtime

Status: `completed` · Progress: 7/7 · Scope: MVP  
Plan: [004-cloudflare-worker-runtime/_index.md](./plans/004-cloudflare-worker-runtime/_index.md)  
Depends on: [003 — Module Kernel](./plans/003-module-kernel/_index.md)

Creates `@blixis/cloudflare` (binding types, request-context helpers) and `apps/api` — the single modular-monolith Worker with `wrangler.jsonc`, explicit `blixis.config.ts`, typed env validation, `fetch`/`queue`/`scheduled` entry handlers, Workers-runtime tests, and a deployable-but-empty staging Worker.

- [x] [004.001 — Scaffold @blixis/cloudflare with binding types and env validation](./plans/004-cloudflare-worker-runtime/001-scaffold-cloudflare-package-and-env-typing.md)
- [x] [004.002 — Create the apps/api Worker application](./plans/004-cloudflare-worker-runtime/002-create-api-worker-app.md)
- [x] [004.003 — Implement the Worker entry adapter for fetch, queue, and scheduled](./plans/004-cloudflare-worker-runtime/003-worker-entry-adapter.md)
- [x] [004.004 — Validate environment configuration at boot](./plans/004-cloudflare-worker-runtime/004-environment-configuration-validation.md)
- [x] [004.005 — Add Workers-runtime integration tests for apps/api](./plans/004-cloudflare-worker-runtime/005-workers-runtime-tests.md)
- [x] [004.006 — Configure wrangler environments and deploy dry-run in CI](./plans/004-cloudflare-worker-runtime/006-environments-and-deploy-dry-run.md)
- [x] [004.007 — Integrate Sentry error monitoring for the API Worker](./plans/004-cloudflare-worker-runtime/007-sentry-error-monitoring.md)

### Milestone 3 — Persistence & event infrastructure

#### 005 — Database Foundation

Status: `completed` · Progress: 8/8 · Scope: MVP  
Plan: [005-database-foundation/_index.md](./plans/005-database-foundation/_index.md)  
Depends on: [004 — Cloudflare Worker Runtime](./plans/004-cloudflare-worker-runtime/_index.md)

Selects the Postgres driver/query layer/migration tooling (ADR), builds `@blixis/database` (per-request Hyperdrive connections, transactions, migration runner for module-owned migrations, health check), provisions Neon + Hyperdrive per environment, defines the test-database strategy, ID and tenancy conventions, and ends with a deployed DB readiness vertical slice.

- [x] [005.001 — Select the Postgres driver, query layer, and migration tooling](./plans/005-database-foundation/001-select-database-stack.md)
- [x] [005.002 — Scaffold @blixis/database with per-request connections](./plans/005-database-foundation/002-scaffold-database-package-and-connection.md)
- [x] [005.003 — Provision Neon and Hyperdrive and bind them to the API Worker](./plans/005-database-foundation/003-provision-neon-and-hyperdrive.md)
- [x] [005.004 — Implement transaction helpers](./plans/005-database-foundation/004-transactions-and-unit-of-work.md)
- [x] [005.005 — Build the migration runner for module-owned migrations](./plans/005-database-foundation/005-migration-infrastructure.md)
- [x] [005.006 — Implement the test database strategy](./plans/005-database-foundation/006-test-database-strategy.md)
- [x] [005.007 — Define ID, timestamp, tenancy, and cross-module schema conventions](./plans/005-database-foundation/007-ids-tenancy-and-schema-conventions.md)
- [x] [005.008 — Add the database readiness vertical slice](./plans/005-database-foundation/008-database-readiness-vertical-slice.md)

#### 006 — Events & Async Processing

Status: `completed` · Progress: 7/7 · Scope: MVP  
Plan: [006-events-and-async-processing/_index.md](./plans/006-events-and-async-processing/_index.md)  
Depends on: [005 — Database Foundation](./plans/005-database-foundation/_index.md)

Builds `@blixis/events` (event registry, in-process bus, transactional outbox, idempotent consumer wrapper, command idempotency keys) and the Cloudflare Queue producer/consumer adapters in `@blixis/cloudflare`, ending with an end-to-end test proving at-least-once delivery is processed exactly once.

- [x] [006.001 — Scaffold @blixis/events with the event definition registry](./plans/006-events-and-async-processing/001-scaffold-events-package-and-registry.md)
- [x] [006.002 — Implement the in-process event bus](./plans/006-events-and-async-processing/002-in-process-event-bus.md)
- [x] [006.003 — Implement the Cloudflare Queue producer adapter](./plans/006-events-and-async-processing/003-cloudflare-queue-producer-adapter.md)
- [x] [006.004 — Implement queue consumer dispatch to module subscriptions](./plans/006-events-and-async-processing/004-queue-consumer-dispatch.md)
- [x] [006.005 — Implement the transactional outbox and dispatcher](./plans/006-events-and-async-processing/005-transactional-outbox.md)
- [x] [006.006 — Implement idempotent consumers and command idempotency keys](./plans/006-events-and-async-processing/006-idempotent-consumers-and-command-keys.md)
- [x] [006.007 — Verify the event pipeline end to end](./plans/006-events-and-async-processing/007-event-pipeline-end-to-end.md)

### Milestone 4 — Identity, tenancy & authorization

#### 007 — Identity & Authentication

Status: `in-progress` · Progress: 5/6 · Scope: MVP  
Plan: [007-identity-and-authentication/_index.md](./plans/007-identity-and-authentication/_index.md)  
Depends on: [006 — Events & Async Processing](./plans/006-events-and-async-processing/_index.md)

Decides the authentication approach (ADR), then builds `@blixis/users` (user records, `USER_SERVICE`, user events) and `@blixis/auth` (password sign-up/sign-in, Postgres-backed sessions, personal API tokens, actor resolution for the kernel), with login rate limiting and CSRF protection for cookie sessions.

- [x] [007.001 — Select the authentication approach](./plans/007-identity-and-authentication/001-select-authentication-approach.md)
- [x] [007.002 — Create the users module](./plans/007-identity-and-authentication/002-users-module.md)
- [x] [007.003 — Implement sign-up, sign-in, sign-out, and sessions](./plans/007-identity-and-authentication/003-auth-module-sessions.md)
- [x] [007.004 — Resolve actors from sessions and bearer tokens](./plans/007-identity-and-authentication/004-actor-resolution.md)
- [x] [007.005 — Implement personal API tokens](./plans/007-identity-and-authentication/005-personal-api-tokens.md)
- [ ] [007.006 — Add login throttling, CSRF protection, and auth security tests](./plans/007-identity-and-authentication/006-auth-hardening-and-tests.md)

#### 008 — Tenancy: Organizations, Spaces & Memberships

Status: `not-started` · Progress: 0/6 · Scope: MVP  
Plan: [008-tenancy-organizations-and-spaces/_index.md](./plans/008-tenancy-organizations-and-spaces/_index.md)  
Depends on: [007 — Identity & Authentication](./plans/007-identity-and-authentication/_index.md)

Builds `@blixis/spaces` (organizations, spaces, default environment, locales) and memberships in `@blixis/users`, tenant context resolution from routes with ownership verification, and a cross-tenant isolation test suite — the multi-tenancy backbone for every content record.

- [ ] [008.001 — Create the spaces module with organization and space schema](./plans/008-tenancy-organizations-and-spaces/001-organizations-and-spaces-schema.md)
- [ ] [008.002 — Implement organization and space memberships](./plans/008-tenancy-organizations-and-spaces/002-memberships.md)
- [ ] [008.003 — Implement organization/space services and management routes](./plans/008-tenancy-organizations-and-spaces/003-space-service-and-management-routes.md)
- [ ] [008.004 — Implement environment and locale management](./plans/008-tenancy-organizations-and-spaces/004-environments-and-locales.md)
- [ ] [008.005 — Resolve and verify tenant context per request](./plans/008-tenancy-organizations-and-spaces/005-tenant-context-resolution.md)
- [ ] [008.006 — Add the cross-tenant isolation test suite](./plans/008-tenancy-organizations-and-spaces/006-tenancy-isolation-tests.md)

#### 009 — Authorization & Permissions

Status: `not-started` · Progress: 0/5 · Scope: MVP  
Plan: [009-authorization-and-permissions/_index.md](./plans/009-authorization-and-permissions/_index.md)  
Depends on: [008 — Tenancy: Organizations, Spaces & Memberships](./plans/008-tenancy-organizations-and-spaces/_index.md)

Builds `@blixis/permissions`: a registry of module-declared permissions, system and custom roles mapped to permissions, the `AUTHORIZATION_SERVICE` (`can`/`require` with tenant-ownership checks and API-token scopes), enforcement in existing modules, and an authorization test matrix.

- [ ] [009.001 — Create the permissions module and registry](./plans/009-authorization-and-permissions/001-permissions-module-and-registry.md)
- [ ] [009.002 — Implement roles and role assignments](./plans/009-authorization-and-permissions/002-roles-and-role-assignments.md)
- [ ] [009.003 — Implement the authorization service](./plans/009-authorization-and-permissions/003-authorization-service.md)
- [ ] [009.004 — Enforce permissions in existing modules](./plans/009-authorization-and-permissions/004-enforce-permissions-in-existing-modules.md)
- [ ] [009.005 — Build the authorization test matrix](./plans/009-authorization-and-permissions/005-authorization-test-matrix.md)

### Milestone 5 — Content management core

#### 010 — Content Modeling

Status: `not-started` · Progress: 0/5 · Scope: MVP  
Plan: [010-content-modeling/_index.md](./plans/010-content-modeling/_index.md)  
Depends on: [009 — Authorization & Permissions](./plans/009-authorization-and-permissions/_index.md)

Decides the content storage model (ADR), then builds the `@blixis/content` module's modeling half: content types, field definitions, an extensible field-type system, entry payload validation derived from content types, and content-type management REST routes with events and safe-change rules.

- [ ] [010.001 — Decide the content storage model](./plans/010-content-modeling/001-content-storage-design.md)
- [ ] [010.002 — Scaffold the content module and content type schema](./plans/010-content-modeling/002-content-module-scaffold-and-type-schema.md)
- [ ] [010.003 — Implement the built-in field type system](./plans/010-content-modeling/003-field-type-system.md)
- [ ] [010.004 — Compile entry validators from content types](./plans/010-content-modeling/004-entry-schema-compiler.md)
- [ ] [010.005 — Implement the content type service and REST routes](./plans/010-content-modeling/005-content-type-service-and-routes.md)

#### 011 — Entries, Versions & Publishing

Status: `not-started` · Progress: 0/7 · Scope: MVP  
Plan: [011-entries-and-publishing/_index.md](./plans/011-entries-and-publishing/_index.md)  
Depends on: [010 — Content Modeling](./plans/010-content-modeling/_index.md)

Completes `@blixis/content` with entries, immutable entry versions, publications (draft vs. published), explicit publish/unpublish commands with idempotency keys and transactional events, version history/restore, reference integrity, and an end-to-end content management vertical slice.

- [ ] [011.001 — Create entry, version, and publication schema](./plans/011-entries-and-publishing/001-entry-and-version-schema.md)
- [ ] [011.002 — Implement ContentService draft lifecycle](./plans/011-entries-and-publishing/002-content-service-draft-lifecycle.md)
- [ ] [011.003 — Implement entry management REST routes](./plans/011-entries-and-publishing/003-entry-management-routes.md)
- [ ] [011.004 — Implement publish and unpublish commands](./plans/011-entries-and-publishing/004-publish-and-unpublish-commands.md)
- [ ] [011.005 — Implement version history and restore](./plans/011-entries-and-publishing/005-version-history-and-restore.md)
- [ ] [011.006 — Implement entry references and link resolution](./plans/011-entries-and-publishing/006-references-and-link-resolution.md)
- [ ] [011.007 — Verify the content management vertical slice end to end](./plans/011-entries-and-publishing/007-content-vertical-slice-end-to-end.md)

### Milestone 6 — Content delivery

#### 012 — GraphQL Platform & Content Delivery API

Status: `not-started` · Progress: 0/8 · Scope: MVP  
Plan: [012-graphql-delivery-api/_index.md](./plans/012-graphql-delivery-api/_index.md)  
Depends on: [011 — Entries, Versions & Publishing](./plans/011-entries-and-publishing/_index.md)

Builds `@blixis/graphql` (GraphQL Yoga on Workers at `/graphql`, schema composition from module contributions, context, error mapping), space-scoped delivery/preview API keys, the delivery schema strategy (ADR), published and preview content delivery resolvers backed by `ContentService`, and query safety limits with batching.

- [ ] [012.001 — Scaffold @blixis/graphql with GraphQL Yoga on Workers](./plans/012-graphql-delivery-api/001-scaffold-graphql-package-with-yoga.md)
- [ ] [012.002 — Compose and validate the schema from module contributions](./plans/012-graphql-delivery-api/002-schema-composition-and-scalars.md)
- [ ] [012.003 — Map Blixis errors to GraphQL errors](./plans/012-graphql-delivery-api/003-graphql-error-mapping.md)
- [ ] [012.004 — Implement delivery and preview API keys](./plans/012-graphql-delivery-api/004-delivery-and-preview-api-keys.md)
- [ ] [012.005 — Decide the delivery schema strategy](./plans/012-graphql-delivery-api/005-decide-delivery-schema-strategy.md)
- [ ] [012.006 — Implement content delivery schema and resolvers](./plans/012-graphql-delivery-api/006-content-delivery-schema-and-resolvers.md)
- [ ] [012.007 — Implement preview (draft) delivery](./plans/012-graphql-delivery-api/007-preview-delivery.md)
- [ ] [012.008 — Enforce query limits and verify batching](./plans/012-graphql-delivery-api/008-query-limits-and-batching.md)

#### 013 — Delivery Caching & Invalidation

Status: `not-started` · Progress: 0/5 · Scope: MVP  
Plan: [013-delivery-caching/_index.md](./plans/013-delivery-caching/_index.md)  
Depends on: [012 — GraphQL Platform & Content Delivery API](./plans/012-graphql-delivery-api/_index.md)

Decides the caching strategy (ADR) across the five layers in §34, then implements Cache API caching for published delivery responses with deterministic cache keys, a KV adapter for content-version stamps (justified by measurement), event-driven invalidation from `entry.published`/`content-type.*` events, HTTP cache headers, and cache-correctness tests.

- [ ] [013.001 — Measure delivery baseline and decide the caching strategy](./plans/013-delivery-caching/001-caching-strategy-and-baseline.md)
- [ ] [013.002 — Implement Cache API and KV adapters](./plans/013-delivery-caching/002-cache-and-kv-adapters.md)
- [ ] [013.003 — Cache published delivery responses](./plans/013-delivery-caching/003-delivery-response-caching.md)
- [ ] [013.004 — Invalidate delivery caches from content events](./plans/013-delivery-caching/004-event-driven-invalidation.md)
- [ ] [013.005 — Review cache correctness and document operations](./plans/013-delivery-caching/005-cache-correctness-review.md)

### Milestone 7 — Assets, integrations & durable processes

#### 014 — Assets on R2

Status: `not-started` · Progress: 0/6 · Scope: MVP  
Plan: [014-assets/_index.md](./plans/014-assets/_index.md)  
Depends on: [012 — GraphQL Platform & Content Delivery API](./plans/012-graphql-delivery-api/_index.md)

Builds `@blixis/assets`: an object-storage port with an R2 adapter, asset metadata in Postgres, upload flows streamed through the Worker (upload strategy ADR), management routes, public asset delivery with caching, asset events, content asset-link validation via capability, and idempotent R2 cleanup on deletion.

- [ ] [014.001 — Decide upload strategy and implement the R2 object storage adapter](./plans/014-assets/001-upload-strategy-and-object-storage.md)
- [ ] [014.002 — Create the assets module schema and service](./plans/014-assets/002-asset-schema-and-service.md)
- [ ] [014.003 — Implement upload flows and asset management routes](./plans/014-assets/003-upload-flows-and-routes.md)
- [ ] [014.004 — Serve published assets](./plans/014-assets/004-asset-delivery.md)
- [ ] [014.005 — Validate asset links from content via capability](./plans/014-assets/005-content-asset-links.md)
- [ ] [014.006 — Implement idempotent asset deletion and orphan cleanup](./plans/014-assets/006-asset-deletion-and-cleanup.md)

#### 015 — Webhooks

Status: `not-started` · Progress: 0/5 · Scope: MVP  
Plan: [015-webhooks/_index.md](./plans/015-webhooks/_index.md)  
Depends on: [011 — Entries, Versions & Publishing](./plans/011-entries-and-publishing/_index.md)

Builds `@blixis/webhooks`: space-scoped webhook configurations, fan-out from domain events to delivery requests, a queue-driven delivery consumer with HMAC signatures, timeouts, backoff and SSRF protection, delivery logs with manual redelivery, and end-to-end tests.

- [ ] [015.001 — Create the webhooks module and configuration API](./plans/015-webhooks/001-webhook-configuration.md)
- [ ] [015.002 — Fan out domain events to webhook delivery requests](./plans/015-webhooks/002-event-fanout.md)
- [ ] [015.003 — Deliver webhooks with signatures, timeouts, and retries](./plans/015-webhooks/003-delivery-consumer.md)
- [ ] [015.004 — Expose delivery logs, redelivery, and test pings](./plans/015-webhooks/004-delivery-logs-and-redelivery.md)
- [ ] [015.005 — Verify webhooks end to end](./plans/015-webhooks/005-webhooks-end-to-end.md)

#### 016 — Releases & Cloudflare Workflows

Status: `not-started` · Progress: 0/4 · Scope: Extended  
Plan: [016-releases-and-workflows/_index.md](./plans/016-releases-and-workflows/_index.md)  
Depends on: [013 — Delivery Caching & Invalidation](./plans/013-delivery-caching/_index.md), [014 — Assets on R2](./plans/014-assets/_index.md), [015 — Webhooks](./plans/015-webhooks/_index.md)

Introduces Cloudflare Workflows behind an adapter (how modules contribute durable workflows to the single Worker), then builds `@blixis/releases`: grouping entries/assets into releases and publishing them item by item via a durable, retry-safe "publish release" Workflow, plus scheduled publishing.

- [ ] [016.001 — Define the Workflows integration pattern and adapter](./plans/016-releases-and-workflows/001-workflows-integration-pattern.md)
- [ ] [016.002 — Create the releases module](./plans/016-releases-and-workflows/002-releases-module.md)
- [ ] [016.003 — Implement the publish-release Workflow](./plans/016-releases-and-workflows/003-publish-release-workflow.md)
- [ ] [016.004 — Implement scheduled release publishing](./plans/016-releases-and-workflows/004-scheduled-publishing.md)

### Milestone 8 — Consumers & extension platform

#### 017 — SDK & Example Astro Consumer

Status: `not-started` · Progress: 0/4 · Scope: MVP  
Plan: [017-sdk-and-example-consumer/_index.md](./plans/017-sdk-and-example-consumer/_index.md)  
Depends on: [013 — Delivery Caching & Invalidation](./plans/013-delivery-caching/_index.md), [014 — Assets on R2](./plans/014-assets/_index.md), [015 — Webhooks](./plans/015-webhooks/_index.md)

Builds `@blixis/sdk` — a Workers/browser/Node-compatible client with a typed Management REST client and a GraphQL delivery client (preview support) — and `apps/example-site`, an Astro site consuming published content through the SDK with preview mode and webhook-triggered rebuild guidance.

- [ ] [017.001 — Decide and implement the REST API type source](./plans/017-sdk-and-example-consumer/001-rest-api-type-source.md)
- [ ] [017.002 — Create @blixis/sdk core and Management REST client](./plans/017-sdk-and-example-consumer/002-sdk-core-and-management-client.md)
- [ ] [017.003 — Add the GraphQL delivery client](./plans/017-sdk-and-example-consumer/003-sdk-graphql-delivery-client.md)
- [ ] [017.004 — Build the Astro example site](./plans/017-sdk-and-example-consumer/004-example-astro-site.md)

#### 018 — Extension Platform & Example Plugin

Status: `not-started` · Progress: 0/5 · Scope: MVP  
Plan: [018-extension-platform/_index.md](./plans/018-extension-platform/_index.md)  
Depends on: [017 — SDK & Example Astro Consumer](./plans/017-sdk-and-example-consumer/_index.md)

Proves the "internal and external modules share one contract" promise: moves shared public content capabilities to a public contract location, writes the module authoring guide, builds an example third-party plugin outside the workspace consumed as a packed npm package, adds a CI job that fails if the plugin needs internal imports, and makes public packages versioned and publishable.

- [ ] [018.001 — Relocate public content capability contracts](./plans/018-extension-platform/001-public-content-capability-contracts.md)
- [ ] [018.002 — Write the module authoring guide and security model](./plans/018-extension-platform/002-authoring-guide-and-security-model.md)
- [ ] [018.003 — Build the example external SEO plugin](./plans/018-extension-platform/003-example-external-plugin.md)
- [ ] [018.004 — Add the extension contract CI gate and API surface reports](./plans/018-extension-platform/004-extension-contract-ci-gate.md)
- [ ] [018.005 — Version and publish public packages](./plans/018-extension-platform/005-package-versioning-and-publishing.md)

#### 019 — Admin UI Foundation

Status: `not-started` · Progress: 0/4 · Scope: MVP  
Plan: [019-admin-ui-foundation/_index.md](./plans/019-admin-ui-foundation/_index.md)  
Depends on: [017 — SDK & Example Astro Consumer](./plans/017-sdk-and-example-consumer/_index.md)

Creates `apps/admin` (React + shadcn/ui) as a pure client of the Management REST API via `@blixis/sdk`: stack/hosting decision, auth and session handling, organization/space navigation shell, content type editor, and entry editor with draft/publish/version history — the minimum editorial UI for the MVP.

- [ ] [019.001 — Decide the admin stack and scaffold apps/admin](./plans/019-admin-ui-foundation/001-admin-stack-and-scaffold.md)
- [ ] [019.002 — Implement admin authentication and navigation shell](./plans/019-admin-ui-foundation/002-admin-auth-and-shell.md)
- [ ] [019.003 — Implement the content type editor](./plans/019-admin-ui-foundation/003-content-type-editor.md)
- [ ] [019.004 — Implement the entry list and editor with publishing](./plans/019-admin-ui-foundation/004-entry-editor-and-publishing.md)

### Milestone 9 — Production readiness

#### 020 — Observability & Security Hardening

Status: `not-started` · Progress: 0/5 · Scope: MVP  
Plan: [020-observability-and-security-hardening/_index.md](./plans/020-observability-and-security-hardening/_index.md)  
Depends on: [013 — Delivery Caching & Invalidation](./plans/013-delivery-caching/_index.md), [014 — Assets on R2](./plans/014-assets/_index.md), [015 — Webhooks](./plans/015-webhooks/_index.md)

Hardens the platform: structured logging with correlation IDs across requests, events, and Workflows with secret redaction; Workers observability (logs/traces) configuration; rate limiting for public and management APIs; a security review (headers, CORS, secrets, dependencies, SSRF, tenancy); and a Service Binding adapter plus Worker-extraction playbook for future splits.

- [ ] [020.001 — Implement structured logging, redaction, and correlation propagation](./plans/020-observability-and-security-hardening/001-structured-logging-and-correlation.md)
- [ ] [020.002 — Configure Workers observability and write the observability runbook](./plans/020-observability-and-security-hardening/002-workers-observability-configuration.md)
- [ ] [020.003 — Implement API rate limiting](./plans/020-observability-and-security-hardening/003-rate-limiting.md)
- [ ] [020.004 — Perform the platform security review and fixes](./plans/020-observability-and-security-hardening/004-security-review.md)
- [ ] [020.005 — Add the Service Binding adapter and Worker extraction playbook](./plans/020-observability-and-security-hardening/005-service-binding-adapter-and-extraction-playbook.md)

#### 021 — CI/CD & Release Engineering

Status: `not-started` · Progress: 0/3 · Scope: MVP  
Plan: [021-ci-cd-and-release-engineering/_index.md](./plans/021-ci-cd-and-release-engineering/_index.md)  
Depends on: [011 — Entries, Versions & Publishing](./plans/011-entries-and-publishing/_index.md)

Automates delivery: staging deploys on every merge to `main` with migrations run first, production deploys of released versions (`vX.Y.Z` via release-please) with rollback, Neon-branch preview environments for pull requests, and repository governance (required checks, branch protection, dependency update automation, secrets rotation).

- [ ] [021.001 — Automate staging deploys from main and production deploys from versions](./plans/021-ci-cd-and-release-engineering/001-staging-and-production-deploy-pipelines.md)
- [ ] [021.002 — Add pull request preview environments](./plans/021-ci-cd-and-release-engineering/002-pull-request-preview-environments.md)
- [ ] [021.003 — Configure required checks, branch protection, and dependency update automation](./plans/021-ci-cd-and-release-engineering/003-repository-governance-and-dependency-updates.md)

#### 022 — Production Readiness & Launch

Status: `not-started` · Progress: 0/5 · Scope: MVP  
Plan: [022-production-readiness/_index.md](./plans/022-production-readiness/_index.md)  
Depends on: [013 — Delivery Caching & Invalidation](./plans/013-delivery-caching/_index.md), [014 — Assets on R2](./plans/014-assets/_index.md), [015 — Webhooks](./plans/015-webhooks/_index.md), [018 — Extension Platform & Example Plugin](./plans/018-extension-platform/_index.md), [019 — Admin UI Foundation](./plans/019-admin-ui-foundation/_index.md), [020 — Observability & Security Hardening](./plans/020-observability-and-security-hardening/_index.md), [021 — CI/CD & Release Engineering](./plans/021-ci-cd-and-release-engineering/_index.md)

Final gate before production use: load and performance testing on staging, backup/restore and disaster recovery for Neon and R2, API and operator documentation, an architecture conformance review against §48/§52, and a launch checklist executed end to end.

- [ ] [022.001 — Define performance targets and run load tests](./plans/022-production-readiness/001-performance-and-load-testing.md)
- [ ] [022.002 — Implement and drill backup, restore, and disaster recovery](./plans/022-production-readiness/002-backup-restore-and-disaster-recovery.md)
- [ ] [022.003 — Publish documentation and API reference](./plans/022-production-readiness/003-documentation-and-api-reference.md)
- [ ] [022.004 — Perform the architecture conformance review](./plans/022-production-readiness/004-architecture-conformance-review.md)
- [ ] [022.005 — Execute the launch checklist](./plans/022-production-readiness/005-launch-checklist.md)

## Dependency graph

Arrows point from prerequisite to dependent plan. `[CPn]` marks an architectural checkpoint at the end of that plan.

```text
001 Project Foundation
 │
 ▼
002 Public Contracts ──────▶ 023 Developer Documentation Site
 │
 ▼
003 Module Kernel ............................................ [CP1]
 │
 ▼
004 Cloudflare Worker Runtime ................................ [CP2a]
 │
 ▼
005 Database Foundation ...................................... [CP2b]
 │
 ▼
006 Events & Async Processing ................................ [CP3]
 │
 ▼
007 Identity & Authentication
 │
 ▼
008 Tenancy: Organizations, Spaces & Memberships
 │
 ▼
009 Authorization & Permissions .............................. [CP4]
 │
 ▼
010 Content Modeling
 │
 ▼
011 Entries, Versions & Publishing ........................... [CP5]
 │
 ├──────────────────────────┬─────────────────────────────┐
 ▼                          ▼                             ▼
012 GraphQL Delivery      015 Webhooks                  021 CI/CD & Release Eng.
 │                          │                             │
 ├─────────────┐            │                             │
 ▼             ▼            │                             │
013 Caching   014 Assets    │                             │
 [CP6]         │            │                             │
 │             │            │                             │
 └──────┬──────┴────────────┘                             │
        │  (all of 013 + 014 + 015)                       │
        ├──────────────────┬──────────────────┐           │
        ▼                  ▼                  ▼           │
      017 SDK &          020 Observability  016 Releases & │
      Example Site       & Security         Workflows      │
        │                  │                (Extended)     │
        ├─────────┐        │                               │
        ▼         ▼        │                               │
      018 Ext.  019 Admin  │                               │
      Platform  UI         │                               │
      [CP7]     │          │                               │
        │       │          │                               │
        └───────┴────┬─────┴───────────────────────────────┘
                     ▼
            022 Production Readiness & Launch ............ [CP8]
```

## Architectural checkpoints

Checkpoints are review gates where the architecture is validated against working software. Record the evidence (test names, measurements, links) directly under each checkpoint when it is reached, and create follow-up tasks for any violation.

- [x] **CP1 — Kernel contract proof** (end of [003](./plans/003-module-kernel/_index.md)). An "external-style" fixture module written with only `@blixis/contracts` + `defineModule` boots, provides/consumes services via capabilities, and serves a route; every §26 validation failure names the offending module. *Evidence:* 003.008 end-to-end kernel suite.
  - **Passed 2026-09-24.** `packages/testing/test/kernel.e2e.test.ts`: `@acme/blixis-external` (contracts + hono + zod only — not even `defineModule`) requires capability `fixture.greeting`, consumes `GREETING_SERVICE` in a REST route, validates its config, and maps a thrown `UnauthorizedError` to a 401 problem response. Missing capability, duplicate module, incompatible version, and duplicate service provider each fail with the module name. Contract gaps found on the way and fixed in contracts: `has()` token invariance (`AnyServiceToken`), `setup`/`boot` variance (methods), `EventSubscription.handle` variance.
- [x] **CP2a — Kernel on `workerd`** (end of [004](./plans/004-cloudflare-worker-runtime/_index.md)). Lazy boot, per-request service scopes, `fetch`/`queue`/`scheduled` entry routing verified in the Workers runtime; bundle-size baseline recorded. Passed 2026-09-24: `apps/api/test/*.worker.test.ts` run the entry in `workerd`. Bundle baseline: ~254 KiB gzip with Sentry (gate 1024 KiB).
- [x] **CP2b — Database path** (end of [005](./plans/005-database-foundation/_index.md)). `Worker → Hyperdrive → Neon` readiness verified on staging with latency numbers; request-scoped connections confirmed; module-owned migrations applied in module order. Passed 2026-09-24: staging `/api/v1/health/ready` through Hyperdrive → Neon (eu-central-1): first database check 89 ms, warm 7–15 ms (13 calls); request scopes close connections via `waitUntil`; runner applies module migrations in bootstrap order (integration tests in CI).
- [x] **CP3 — Event consistency** (end of [006](./plans/006-events-and-async-processing/_index.md)). Rolled-back transactions emit nothing; committed transactional events are delivered via outbox → Queue; redeliveries are processed once (§32, §33). Passed 2026-09-25:
  - End-to-end test against Postgres: a rollback emits nothing; committed events go through outbox → queue → consumer; redeliveries and retries produce one effect; a queue outage is recovered by the sweep.
  - Staging: queue consumer attached, outbox cron `Ok` every minute, no Sentry issues.
- [ ] **CP4 — Tenancy & authorization** (end of [009](./plans/009-authorization-and-permissions/_index.md)). Isolation suite and authz matrix cover every tenant-scoped route; no role-name checks outside `@blixis/permissions` (§30, §31).
- [ ] **CP5 — Content vertical slice** (end of [011](./plans/011-entries-and-publishing/_index.md)). request → Hono route → `ContentService` → repository → Hyperdrive → Neon, plus publish → outbox → Queue → subscriber, on staging; review against §48 rules.
- [ ] **CP6 — Delivery performance & cache correctness** (end of [013](./plans/013-delivery-caching/_index.md)). Measured before/after caching; bounded staleness after publish; no cross-tenant or preview cache leakage (§34).
- [ ] **CP7 — Extension contract sufficiency** (end of [018](./plans/018-extension-platform/_index.md)). Example plugin installed from a packed tarball works using only public packages; CI gate enforces it continuously (§42 Stage 8, §52).
- [ ] **CP8 — Architecture conformance & launch** (end of [022](./plans/022-production-readiness/_index.md)). Conformance review against §2, §4, §24–§35, §46–§48 with no blocking violations; launch checklist complete.

## Open architectural decisions

Decisions the architecture intentionally leaves open. Each is resolved by the linked task, shortly before the first task that depends on it. Update the **Resolution** column when the ADR is accepted.

| # | Decision | Resolved in | Default / recommendation | Resolution |
|---|---|---|---|---|
| D1 | TS7 build & declaration emit, source vs. `dist` consumption, test runner, lint/format and boundary tooling | [001.002](./plans/001-project-foundation/002-record-toolchain-decisions.md) | `tsc -b` if TS7 emit is stable; Vitest + `@cloudflare/vitest-pool-workers`; tooling without compiler-API dependency | **resolved 2026-09-24:** TS 7.0.2 `tsc -b`, `nodenext` + `.ts` imports, `dist` consumption ([ADR 0001](./decisions/0001-typescript-7-build-strategy.md)); Vitest 4.1 + pool-workers 0.22 ([ADR 0002](./decisions/0002-test-runner.md)); Biome 2.5 + custom boundary checker ([ADR 0003](./decisions/0003-lint-format-and-boundaries.md)) |
| D2 | CI provider | [001.007](./plans/001-project-foundation/007-setup-ci-pipeline.md) | GitHub Actions | **resolved 2026-09-24:** GitHub Actions on `blixis-io/monorepo` ([GitHub Actions](./operations/github-actions.md)) |
| D3 | Hono types in `@blixis/contracts` (`RestContribution`) | [002.002](./plans/002-public-contracts/002-define-module-contracts.md) | `hono` as type-only peer dependency | open |
| D4 | Validation library | [002.005](./plans/002-public-contracts/005-select-validation-library.md) | Standard Schema in contracts; one default library for first-party code | **resolved 2026-09-24:** Zod 4 for first-party code; contracts expose vendored Standard Schema v1 ([ADR 0004](./decisions/0004-validation-library.md)) |
| D5 | Service scopes on Workers (app vs. request) | [003.003](./plans/003-module-kernel/003-service-registry-and-scopes.md) | App singletons + request-scoped factories for I/O-holding services | **resolved 2026-09-24:** app + request scopes, synchronous factories, scopes created by transports ([ADR 0005](./decisions/0005-service-scopes.md)) |
| D6 | Postgres driver, query builder/ORM, migration format | [005.001](./plans/005-database-foundation/001-select-database-stack.md) | **pg + Drizzle ORM; SQL-file migrations per module** ([ADR 0006](./decisions/0006-database-stack.md)) | decided |
| D7 | Test database strategy | [005.006](./plans/005-database-foundation/006-test-database-strategy.md) | Docker Postgres locally and in CI; Neon branches for staging smoke | open |
| D8 | IDs, tenancy columns, module schema namespacing, cross-module foreign keys | [005.007](./plans/005-database-foundation/007-ids-tenancy-and-schema-conventions.md) | **UUIDv7 (plain, app-generated); tenant columns + fail-closed `tenantScope`; schema per module; FKs only toward `meta.requires`; no RLS in MVP** ([ADR 0007](./decisions/0007-ids-and-tenancy-conventions.md)) | decided |
| D9 | Outbox dispatch trigger & retention | [006.005](./plans/006-events-and-async-processing/005-transactional-outbox.md) | **Post-commit `waitUntil` dispatch + 1-minute cron sweep; `SKIP LOCKED` batches; at-least-once; 7-day retention** ([ADR 0008](./decisions/0008-outbox-dispatch.md)) | decided |
| D10 | Authentication approach (library vs. custom, sessions, hashing on Workers, API tokens, CSRF) | [007.001](./plans/007-identity-and-authentication/001-select-authentication-approach.md) | **Custom: EdDSA JWT access tokens (15 min) + rotating hashed refresh tokens (family revocation), scrypt N=2^15, opaque `blx_pat_` API tokens, Origin check on cookie endpoints** ([ADR 0009](./decisions/0009-authentication.md)) | decided |
| D11 | Email delivery for invitations/password reset | [008.002](./plans/008-tenancy-organizations-and-spaces/002-memberships.md) (deferred) | Add existing users only in MVP | open |
| D12 | Environments beyond the default `main` | [008.004](./plans/008-tenancy-organizations-and-spaces/004-environments-and-locales.md) | One default environment; `environment_id` columns from day one | open |
| D13 | Content storage model (JSONB shape, localisation, references, rich text, schema evolution) | [010.001](./plans/010-content-modeling/001-content-storage-design.md) | JSONB keyed by stable field ID and locale | open |
| D14 | Delivery GraphQL schema (generic vs. generated per space) | [012.005](./plans/012-graphql-delivery-api/005-decide-delivery-schema-strategy.md) | Generated typed schema per space/environment, cached by content-model version | open |
| D15 | Delivery cache invalidation (versioned keys via KV vs. purge vs. TTL) | [013.001](./plans/013-delivery-caching/001-caching-strategy-and-baseline.md) | Versioned keys with KV stamp, justified by measurement | open |
| D16 | Asset upload strategy and serving domain | [014.001](./plans/014-assets/001-upload-strategy-and-object-storage.md) | Stream through Worker via R2 binding; multipart for large files | open |
| D17 | Workflows integration pattern & scheduling | [016.001](./plans/016-releases-and-workflows/001-workflows-integration-pattern.md) | Explicit class exports in composition root | open |
| D18 | REST type source for SDK (OpenAPI vs. shared schemas) | [017.001](./plans/017-sdk-and-example-consumer/001-rest-api-type-source.md) | OpenAPI generated from route schemas | open |
| D19 | Location of public content capability contracts | [018.001](./plans/018-extension-platform/001-public-content-capability-contracts.md) | New `@blixis/content-api` package | open |
| D20 | npm scope ownership, licence, published package set | [018.005](./plans/018-extension-platform/005-package-versioning-and-publishing.md) | Must be confirmed by the project owner | open |
| D21 | Admin stack and hosting (cookie strategy) | [019.001](./plans/019-admin-ui-foundation/001-admin-stack-and-scaffold.md) | Same-site hosting (Worker static assets or sibling subdomain) | open |
| D22 | Rate limiting mechanism | [020.003](./plans/020-observability-and-security-hardening/003-rate-limiting.md) | Workers Rate Limiting binding; WAF rules if a zone is available | open |
| D23 | SLOs, RPO/RTO | [022.001](./plans/022-production-readiness/001-performance-and-load-testing.md) | Proposed defaults in 022; owner confirms | open |
| D24 | Environments and release model | [021.001](./plans/021-ci-cd-and-release-engineering/001-staging-and-production-deploy-pipelines.md) | — | **resolved 2026-09-24:** `main` → staging; versions `vX.Y.Z` (release-please) → production ([Environments](./operations/environments.md), [Release & deployment](./operations/deployment.md)) |
| D25 | Git workflow and commit convention | — | — | **resolved 2026-09-24:** GitHub Flow, squash merges, Conventional Commits, no AI attribution ([Git workflow](./conventions/git-workflow.md), [Commit messages](./conventions/commit-messages.md)) |
| D26 | Error tracking and alert destination | [004.007](./plans/004-cloudflare-worker-runtime/007-sentry-error-monitoring.md) | — | **resolved 2026-09-24:** Sentry (org `private-m57`) |

## Cloudflare platform coverage

| Capability | Introduced in | Notes |
|---|---|---|
| Workers | 004 | One modular-monolith API Worker (§46). |
| Hyperdrive | 005 | Default DB path; per-request clients (§13). |
| Neon Postgres | 005 | Canonical relational store; branches per environment. |
| Queues | 006 | Event bus adapter, DLQ, idempotent consumers (§15, §33). |
| Cron Triggers | 006 | Outbox sweep, retention and cleanup jobs. |
| Cache API | 013 | Published delivery responses (§34). |
| Workers KV | 013 | Only with measured need — version stamps for cache keys (§14). |
| R2 | 014 | Asset binaries; metadata in Postgres (§17). |
| Workflows | 016 (Extended) | Release publishing, scheduled publishing (§16). |
| Service Bindings | 020 | Adapter and extraction playbook only; no split (§18, §46). |
| Rate Limiting | 007, 020 | Login throttling; API rate limits. |
| *Sentry (external)* | 004.007, 020.002 | Error tracking, releases, alerts. |
| Durable Objects, Workers for Platforms, Vectorize, Analytics Engine | — | Deferred (§11 "optional later"). |

## Deferred / future work

Not scheduled. Items move into a new plan only through a roadmap update with a stated reason.

**Extension platform (architecture §39–§40):**

- Phase 2 — runtime enable/disable of bundled modules per tenant, with `ModuleConfiguration` stored in Postgres and resolved configuration cached in KV only when useful.
- Phase 3 — isolated, untrusted user plugins via Workers for Platforms (dispatch namespaces, restricted bindings, manifests, usage limits, versioning/rollback).
- Extension marketplace (§47 non-goal for v1).
- Public API for third-party field types (see plan 010 open questions).

**Optional Cloudflare capabilities (§11):** Durable Objects, Workers for Platforms, Vectorize, Analytics Engine.

**Later first-party modules (§41):** `@blixis/localization` (translation workflows), `@blixis/search`, `@blixis/import-export` (Workflow-based bulk jobs), `@blixis/audit`, `@blixis/analytics`.

**Content & editorial:** creating/cloning additional environments; content-type/field-level permissions; version retention/compaction; soft-delete/trash; image transformations (Cloudflare Images or Image Resizing); asset folders/tags; GraphQL management mutations; admin screens for roles, webhooks, API keys, full asset library.

**Identity:** OAuth/SSO, MFA, email verification, password reset, email invitations (requires D11).

**Topology:** splitting Delivery or other workloads into separate Workers via Service Bindings — only when a §46 reason exists (playbook in 020.005).

**Non-goals for v1 (§47):** arbitrary runtime package loading, untrusted plugin sandboxing, microservices per module, custom GraphQL/database/queue/object-storage engines, real-time collaborative editing, visual page builder, AI features.
