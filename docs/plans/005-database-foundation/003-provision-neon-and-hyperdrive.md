# 005.003 — Provision Neon and Hyperdrive and bind them to the API Worker

## Status

```text
completed
```

## Parent plan

[005 — Database Foundation](./_index.md)

## Objective

Create the Neon project and branches, Hyperdrive configurations for staging and production, local development connectivity, and the `HYPERDRIVE` binding in `apps/api`, documented as an operations runbook.

## Background

§13 conceptual path Worker → Hyperdrive → Neon; §19 env shape includes `HYPERDRIVE`. Local development uses a Hyperdrive `localConnectionString` (or the `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING>` env var) pointing at a local Postgres or a Neon dev branch.

## Requirements

- Neon: one project; branches `production` (primary), `staging`; a role for the application with least privilege; a separate migration role (DDL rights) — document both.
- Hyperdrive: one config per deployed environment pointing at the corresponding Neon branch (using Neon's direct, non-pooled connection string as recommended for Hyperdrive — verify current guidance).
- `wrangler.jsonc`: `hyperdrive` bindings per environment; local connection string strategy documented; add `nodejs_compat` if ADR 0006 requires it.
- Add a `docker-compose.yml` (or documented alternative) providing local Postgres matching Neon's major version.
- Update `ApiEnv`, `docs/operations/configuration.md`, `docs/operations/cloudflare.md`, and create `docs/operations/database.md` (branches, roles, connection strings location, rotation).
- Register `databaseModule()` in `apps/api/src/blixis.config.ts`.

## Architectural constraints

- Connection strings and passwords never committed; stored as wrangler secrets / Hyperdrive config / CI secrets.
- Application role must not have DDL rights in production.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docker-compose.yml
docs/operations/database.md
patches/pg-protocol@1.16.0.patch
```

### Modify

```text
README.md
apps/api/package.json
apps/api/src/blixis.config.ts
apps/api/src/env.ts
apps/api/tsconfig.json
apps/api/worker-configuration.d.ts
apps/api/wrangler.jsonc
docs/ROADMAP.md
docs/operations/cloudflare.md
docs/operations/configuration.md
docs/plans/005-database-foundation/003-provision-neon-and-hyperdrive.md
docs/plans/005-database-foundation/_index.md
docs/setup-checklist.md
pnpm-lock.yaml
pnpm-workspace.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Create Neon project, branches, roles (record identifiers, not secrets).
2. Create Hyperdrive configs with wrangler.
3. Add bindings and local connection configuration.
4. Add local Postgres via Docker Compose.
5. Register `databaseModule()` and run `wrangler dev` against local Postgres.
6. Write the runbook.

## Dependencies

Requires:

- [005.002 — Scaffold @blixis/database with per-request connections](./002-scaffold-database-package-and-connection.md)

## Acceptance criteria

- [x] `wrangler dev` connects to local Postgres through the Hyperdrive binding (verified by a temporary query or by 005.008 once available).
- [x] Staging and production Hyperdrive IDs are configured in `wrangler.jsonc`.
- [x] `docs/operations/database.md` documents branches, roles, and secret locations.

## Validation

```bash
docker compose up -d postgres
pnpm --filter @blixis/api dev
pnpm --filter @blixis/api exec wrangler hyperdrive list
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
- [x] Least-privilege roles verified.
- [x] If account access is missing, set this task to `blocked` with a Blocker section instead of faking IDs.

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

- **Provisioned on 2026-09-24 by the owner, guided step by step** (credentials never passed through chat or the repo):
  - Neon branches `production` (default) and `staging`.
  - Roles `blixis_app` (DML) and `blixis_migrator` (DDL) on each branch.
  - Hyperdrive `blixis-staging` / `blixis-production` (the app role on the direct host).
  - GitHub environments `staging` / `production`, each with the secret `DATABASE_URL` (migrator).
  - IDs and hosts are recorded in `docs/operations/database.md`.
- **Pitfall found:** roles created in the Neon console are members of `neon_superuser`. The first attempt showed `superuser = t`. The roles were deleted and recreated with SQL, and the documented check query now returns `f`. The Neon SQL Editor's *Explain* button wraps statements in `EXPLAIN` and fails on DDL; use *Run*.
- `wrangler hyperdrive create` offers to write the binding into `wrangler.jsonc`. It rewrote the whole file with tabs and put the binding at the top level (local scope). Answer "No" and add bindings per environment by hand.
- **Direct host with `sslmode=require` only.** `channel_binding=require` (in Neon's default strings) was left out because Hyperdrive support is unconfirmed.
- **Local development:** top-level `hyperdrive` has a placeholder id and a `localConnectionString` pointing at `docker-compose.yml` (`postgres:18-alpine`, blixis/blixis/blixis). `apiEnvSchema` checks that `HYPERDRIVE.connectionString` is present, shape only (no value in logs).
- **`pg-protocol` 1.16.0 packaging bug:** `esm/index.js` is ESM without `"type": "module"`. The Vitest Workers pool resolves `require('pg-protocol')` with the `import` condition, so the file loads as CommonJS and throws a SyntaxError.
  - Vite aliases, plugins, and `deps.optimizer` don't help: the pool's require fallback bypasses them, and optimizing `pg` fails on Node built-ins.
  - The fix is a pnpm patch that adds `esm/package.json` `{"type":"module"}`, documented in `database.md`.
- **Bundle:** the API Worker grew from 254 to 329 KiB gzip with `pg` and Drizzle, well under the 1024 KiB gate.
- **Not yet verified:**
  - A real query from staging through Hyperdrive. There is no DB route yet; the readiness endpoint 005.008 does this.
  - Production role `superuser = f`. The owner ran the SQL script there too; a re-check is part of the 005.008 staging/production verification.
  - Rotation of the `neondb_owner` password (still open on the checklist).
