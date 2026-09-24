# 0006 — Database driver, query layer, and migrations

- Status: accepted
- Date: 2026-09-24
- Roadmap task: [005.001](../plans/005-database-foundation/001-select-database-stack.md)

## Context

§13 makes Neon Postgres, reached through Cloudflare Hyperdrive, the relational source of truth. Database creation stays behind `@blixis/database`. §13 leaves the driver and ORM open but requires a solution that supports TypeScript 7, works reliably on Workers, supports Postgres, needs no long-lived Node server state, and supports migrations and transactions. Modules own their tables (§2), and content storage in plan 010 relies on JSONB. The `MigrationDefinition` contract (002.008) already accepts a SQL string or a function as `up`.

Candidates (versions checked on 2026-09-24):
- drivers: `pg` 8.23.0 (node-postgres) and `postgres` 3.4.9 (postgres.js);
- query layers: `drizzle-orm` 0.45.3 (with `drizzle-kit` 0.31.11) and `kysely` 0.29.6.

Neon runs Postgres 18.

## Spike

Setup: one throwaway Worker per combination (compatibility date 2026-08-15, `nodejs_compat`) and a Hyperdrive binding in local mode (`localConnectionString`), connected to `postgres:18-alpine`.

Each Worker did the same work:
- opened a per-request connection;
- ran a transaction with two inserts;
- ran a typed select with a JSONB containment filter (`data @> …`) on a table in a module-owned schema (`content.entries`);
- ran a transaction that throws, to check rollback;
- ran a count;
- closed the connection in `ctx.waitUntil`.

| Check | pg + Drizzle | postgres.js + Drizzle | pg + Kysely |
|---|---|---|---|
| Worker bundle (dry run, gzip) | 82 KiB | **63 KiB** | 109 KiB |
| Transaction + rollback | ✓ | ✓ | ✓ |
| Typed JSONB column and `@>` filter | ✓ (typed with `$type<>()`) | ✓ | ✓ (with the `sql` helper; you declare the JSON types yourself) |
| Postgres schema per module | ✓ `pgSchema('content')` | ✓ | ✓ (`'content.entries'` table key) |
| Local request time (warm, 3 runs) | 20–22 ms | 23–38 ms | 13–27 ms |
| TypeScript 7.0.2 `tsc` (strict, `exactOptionalPropertyTypes`) | no errors | no errors | no errors |
| Table types | inferred from the schema definition | inferred | hand-written `DB` interface (or codegen) |
| Migration tooling | `drizzle-kit generate` → readable SQL files | same | TypeScript migrations |
| Maintenance (last publish) | drizzle 2026-09-21, pg 2026-08-08 | postgres.js 2026-04-05 | kysely 2026-09-16 |

`drizzle-kit generate` produced plain, reviewable SQL, for example `CREATE SCHEMA "content"; CREATE TABLE "content"."entries" (… "data" jsonb DEFAULT '{}'::jsonb NOT NULL …)`. It runs in Node and uses no TypeScript compiler API.

## Decision

The project owner chose this option.

1. **Driver: `pg` (node-postgres)**, the driver Cloudflare recommends for Hyperdrive. It is actively maintained. The Worker needs the `nodejs_compat` compatibility flag, which the API Worker already has (added for Sentry in 004.007).
2. **Query layer: Drizzle ORM.** Each module declares its tables in its own Postgres schema via `pgSchema('<module>')`. Row types are inferred from those declarations, so there are no duplicated interfaces. Raw SQL remains available through `sql```.
3. **Connections: one `pg.Client` per request (or per unit of background work), created from `env.HYPERDRIVE.connectionString` inside the request scope.** It is closed through `waitUntil` when the scope is disposed. Hyperdrive does the pooling, so the Worker keeps no pool or global connection (§13: no long-lived state). `@blixis/database` wraps this (005.002).
4. **Migrations: plain SQL files per module, applied by our own runner (005.005).**
   - `drizzle-kit generate` is a developer tool that proposes the SQL from the schema diff. The generated file is reviewed, edited when needed (data migrations, `CONCURRENTLY`), and committed.
   - Each file becomes a `MigrationDefinition` with a SQL-string `up`. Its id uses the file name `NNNN_snake_case`, generated with `--name`.
   - Neither `drizzle-kit migrate` nor `push` is used against shared databases.
   - Migrations run from Node (CI or a developer machine) against the **direct** Neon URL with the migration role, never through Hyperdrive.
5. **Versions are pinned exactly** in the pnpm catalog (`pg`, `drizzle-orm`, `drizzle-kit`, `@types/pg`), because Drizzle is still 0.x. Upgrades are their own PRs and must pass the database test suite.

## Alternatives considered

- **postgres.js + Drizzle.** It has the smallest bundle (−19 KiB gzip) and the same Drizzle ergonomics. It was rejected because releases are slower and Cloudflare's Hyperdrive guidance now leads with node-postgres. Switching later only touches `@blixis/database`, because Drizzle's API stays the same.
- **pg + Kysely.** It stays close to SQL and needs no ORM layer. It was rejected because it has the largest bundle, table types must be hand-written or generated, and its migrations are TypeScript instead of reviewable SQL.
- **Only a driver, with hand-written SQL.** It has the smallest surface, but offers no type inference for rows or queries across dozens of module tables.

## Consequences

- Module authors write Drizzle table definitions and repositories. `@blixis/database` exposes the Drizzle instance and transaction helpers (005.002, 005.004). Only the database package imports `pg`.
- The Drizzle core adds about 80 KiB gzip to the API Worker.
- Migration SQL stays readable in PR review, and the runner does not depend on Drizzle's migration journal.
- Tests (005.006) use Docker Postgres 18 locally and in CI, with one migrated database per test file (`@blixis/testing/database`). The Vitest Workers pool cannot load `pg`'s Cloudflare socket (`pg-cloudflare` is resolved without the `workerd` condition). Database behaviour is therefore tested in the Node pool, and the deployed path is verified on staging. See the testing conventions for known issues.
- Risks:
  - Drizzle is pre-1.0, and breaking changes between minor versions are possible. Pinned versions and the test database suite (005.006) contain this.
  - `drizzle-kit` may lag behind new Postgres features. Hand-edited SQL is allowed.
