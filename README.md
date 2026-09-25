# Blixis

[![ci](https://github.com/blixis-io/monorepo/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/blixis-io/monorepo/actions/workflows/ci.yml)

Blixis is a modular, extensible **headless CMS** built for **Cloudflare Workers**. It is written in **TypeScript 7** with **Hono**, and exposes **REST** (management) and **GraphQL Yoga** (delivery) APIs. **Neon Postgres**, reached through **Hyperdrive**, is the source of truth. Queues, KV, R2, and Workflows provide the platform infrastructure. First-party and third-party modules implement the same public contract.

> **Status:** early implementation — Milestone 1 (workspace & public contracts). Progress is tracked in [docs/ROADMAP.md](docs/ROADMAP.md).

---

## Developer documentation

The manual and API reference for module authors: **[blixis-docs.frosty-hill-6079.workers.dev](https://blixis-docs.frosty-hill-6079.workers.dev)** — a Starlight site in `apps/docs` (`pnpm --filter @blixis/docs dev` locally), deployed from `main`.

## Architecture

The architecture covers the design principles, module contract, kernel, and Cloudflare platform usage. It also defines data ownership, events, security boundaries, and the rules every contributor and coding agent must follow.

→ [docs/BLIXIS_ARCHITECTURE.md](docs/BLIXIS_ARCHITECTURE.md)

## Roadmap

The roadmap contains 23 plans and 132 tasks across 9 milestones. It also includes the dependency graph, architectural checkpoints, the register of open decisions, and deferred work. Each plan has its own specification and task files.

→ [docs/ROADMAP.md](docs/ROADMAP.md) · plans in [docs/plans/](docs/plans/)

## Getting started

Covers prerequisites, first-time setup, running the API locally, and working on a roadmap task.

→ [docs/development/getting-started.md](docs/development/getting-started.md)

## Monorepo

Describes the pnpm workspace layout (`apps/`, `packages/`, `modules/`, `tooling/`), dependency rules, catalogs, and root scripts.

→ [docs/development/monorepo.md](docs/development/monorepo.md)

## Package conventions

Covers where packages live, the `package.json` and tsconfig template, dependency and peer rules, and forbidden import patterns.

→ [docs/conventions/packages.md](docs/conventions/packages.md)

## Code standards

Covers TypeScript rules, naming, module boundaries, layering, errors, validation, async on Workers, logging, and dependencies.

→ [docs/conventions/code-standards.md](docs/conventions/code-standards.md)

## Git workflow

Blixis uses GitHub Flow: short-lived branches, pull requests, squash merges, and `main` as the always-deployable staging branch.

→ [docs/conventions/git-workflow.md](docs/conventions/git-workflow.md)

## Commit messages

Commits follow Conventional Commits, with the project's types and scopes. Commits carry no AI attribution.

→ [docs/conventions/commit-messages.md](docs/conventions/commit-messages.md)

## Testing

Covers the test levels (unit to end-to-end), Workers-runtime tests, the test database, coverage, and what CI runs.

→ [docs/conventions/testing.md](docs/conventions/testing.md)

## Database conventions

Tables, IDs (UUIDv7), timestamps, tenancy columns, always-scoped queries, cross-module references.

→ [docs/conventions/database.md](docs/conventions/database.md)

## Tenancy

Verified tenant context for space-scoped routes (`spaceScoped()`), memberships, deleting spaces.

→ [docs/conventions/tenancy.md](docs/conventions/tenancy.md)

## Migrations

Module-owned SQL migrations: ids, checksums, expand/contract, `db:migrate` / `db:status` / `db:new`.

→ [docs/conventions/migrations.md](docs/conventions/migrations.md)

## Environments

Blixis runs in local, preview, **staging** (tracks `main`), and **production** (receives released versions). The page covers resources and configuration per environment.

→ [docs/operations/environments.md](docs/operations/environments.md)

## Release & deployment

Covers semantic versioning, release-please, the staging and production pipelines, migrations, rollback, and hotfixes.

→ [docs/operations/deployment.md](docs/operations/deployment.md)

## Cloudflare Workers

Covers resource naming, the `wrangler.jsonc` structure per environment, secrets, local development, CI API tokens, and monitoring.

→ [docs/operations/cloudflare.md](docs/operations/cloudflare.md)

## Postman

Postman collection and environments (local, staging, production) with automatic token refresh.

→ [docs/development/postman.md](docs/development/postman.md)

## Database

Neon branches and roles, Hyperdrive, where connection strings live, local Postgres, rotation.

→ [docs/operations/database.md](docs/operations/database.md)

## Events operations

The event pipeline in staging and production: outbox backlog, queue, DLQ, processed markers, troubleshooting.

→ [docs/operations/events.md](docs/operations/events.md)

## GitHub Actions

Covers the workflows, shared setup, CI, release and deploy sketches, secrets and variables per environment, and workflow conventions.

→ [docs/operations/github-actions.md](docs/operations/github-actions.md)

## Repository settings

Covers merge settings, rulesets, environments, Actions permissions, security features, and secrets rotation.

→ [docs/operations/repository.md](docs/operations/repository.md)

## Decisions

Architecture decision records (ADRs) for choices the architecture leaves open, such as the toolchain, test runner and linting.

→ [docs/decisions/](docs/decisions/README.md)

## Setup checklist

Lists the accounts, decisions, and settings the project still needs, such as Cloudflare, Neon, domains, licence, and alerts.

→ [docs/setup-checklist.md](docs/setup-checklist.md)

---

Repository: [github.com/blixis-io/monorepo](https://github.com/blixis-io/monorepo)
