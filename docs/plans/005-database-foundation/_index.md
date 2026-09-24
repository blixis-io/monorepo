# 005 — Database Foundation

## Status

```text
completed
```

Milestone: Milestone 3 — Persistence & event infrastructure  
Roadmap scope: MVP / initial platform  
Progress: 8/8 tasks completed

## Objective

Provide a Workers-compatible database layer where every request can obtain a transaction-capable Postgres handle through Hyperdrive to Neon, modules own their schema and migrations, migrations run from tooling (not from the Worker), tests run against real Postgres, and a readiness endpoint proves `Worker → Hyperdrive → Neon` in staging.

## Why this plan exists

§13 makes Neon Postgres the relational source of truth accessed via Hyperdrive, and keeps connection creation behind `@blixis/database`. §20 requires module-owned schemas/repositories. §42 Stage 2 lists exactly this package, Hyperdrive, Neon, migrations, and test DB support. Every domain plan (007+) and the transactional outbox (006) depend on it.

## Scope

In scope:

- ADR selecting driver, query builder/ORM, migration tooling
- `@blixis/database`: connection factory, request-scoped DB service, transactions, error translation, health check
- Neon project/branches and Hyperdrive configurations per environment; local dev connection
- migration runner collecting module-contributed migrations in module order
- test database strategy and helpers in `@blixis/testing`
- ID, timestamp, tenancy-column, and cross-module reference conventions
- readiness endpoint vertical slice

Out of scope:

- domain tables (owned by modules in plans 007+)
- outbox and processed-event tables (plan 006 — owned by `@blixis/events`)
- read replicas, query caching tuning (plan 022 performance work)

## Dependencies

Depends on:

- [004 — Cloudflare Worker Runtime](../004-cloudflare-worker-runtime/_index.md)

## Architecture decisions

- **Postgres is canonical** for all relational state (§13); nothing here moves canonical data to KV (§14).
- **Hyperdrive is the default path** from Workers (§13). Direct Neon connections are used only by tooling (migrations, seeds) and never from the Worker in deployed environments.
- **Per-request clients**: database clients are request-scoped services (ADR 0005) because Workers cannot reuse I/O across requests; Hyperdrive provides pooling.
- **No domain repositories** in `@blixis/database` (§13, §20): it provides connections, transactions, migration infrastructure, and generic helpers only.
- **Module-owned migrations** (§20) contributed via the module contract (`migrations`), executed by a Node-based CLI in module dependency order, tracked per module.
- **Library choice criteria** from §13: TS7-compatible, reliable on Workers, Postgres, no long-lived Node server state, migrations, transactions.

## Deliverables

- ADR 0006 (database stack) and ADR 0007 (IDs & tenancy conventions) accepted.
- `packages/database` exporting `createDatabase`, `DATABASE` token/request-scoped provider, `withTransaction`, error translation, migration types/runner API, `databaseHealthCheck`.
- `tooling/db` CLI: `pnpm db:migrate`, `pnpm db:status`, `pnpm db:new <module> <name>`.
- Neon project with `staging`/`production` branches (and dev/CI strategy) plus Hyperdrive configs bound in `wrangler.jsonc`.
- `@blixis/testing` helpers for an isolated test database.
- `GET /api/v1/health/ready` checks the database via Hyperdrive; verified against staging.

## Tasks

- [x] [001 — Select the Postgres driver, query layer, and migration tooling](./001-select-database-stack.md)
- [x] [002 — Scaffold @blixis/database with per-request connections](./002-scaffold-database-package-and-connection.md)
- [x] [003 — Provision Neon and Hyperdrive and bind them to the API Worker](./003-provision-neon-and-hyperdrive.md)
- [x] [004 — Implement transaction helpers](./004-transactions-and-unit-of-work.md)
- [x] [005 — Build the migration runner for module-owned migrations](./005-migration-infrastructure.md)
- [x] [006 — Implement the test database strategy](./006-test-database-strategy.md)
- [x] [007 — Define ID, timestamp, tenancy, and cross-module schema conventions](./007-ids-tenancy-and-schema-conventions.md)
- [x] [008 — Add the database readiness vertical slice](./008-database-readiness-vertical-slice.md)

## Completion criteria

The plan may be marked `completed` when:

- [x] All tasks `completed`.
- [x] Staging readiness endpoint returns healthy with DB latency measured through Hyperdrive (recorded in Technical notes), or — if account access is unavailable — the same check passes locally through a Hyperdrive local connection string and the staging verification is tracked as a follow-up blocker.
- [x] Migration runner applies fixture-module migrations in module order and is idempotent on re-run.
- [x] Architectural checkpoint CP2b recorded.

## Risks

- **Driver compatibility on Workers**: node-postgres/postgres.js need `nodejs_compat`; behaviour can differ across compatibility dates. Pin and test in `workerd`.
- **Transactions through Hyperdrive**: Hyperdrive pools in transaction mode; session-level features (prepared statements across transactions, `SET` without `LOCAL`, advisory session locks, `LISTEN/NOTIFY`) must be avoided — document.
- **ORM TS7 compatibility**: some ORMs rely on heavy type-level programming; check type-check time with TS7.
- **Cross-module foreign keys** can couple module schemas; decided in 005.007.
- **Migration ordering** between independently versioned third-party modules can conflict; per-module tracking tables mitigate.

## Open questions

- Should modules be allowed to create foreign keys to tables owned by other modules (e.g. content → spaces), or only store IDs and rely on service-level validation? (Decided in ADR 0007; recommendation: FKs allowed only toward modules listed in `meta.requires`, never toward optional/third-party modules.)
- Should each module get its own Postgres schema (namespace) or share `public` with table-name prefixes? (Decided in ADR 0007.)
- Neon branch-per-pull-request for CI vs. local Postgres container? (Decided in 005.006.)

## Technical notes

No technical notes yet.
