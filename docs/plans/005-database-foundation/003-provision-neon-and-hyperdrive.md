# 005.003 — Provision Neon and Hyperdrive and bind them to the API Worker

## Status

```text
not-started
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
```

### Modify

```text
apps/api/wrangler.jsonc
apps/api/src/env.ts
apps/api/src/blixis.config.ts
apps/api/.dev.vars.example
apps/api/package.json
docs/operations/configuration.md
docs/operations/cloudflare.md
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

- [ ] `wrangler dev` connects to local Postgres through the Hyperdrive binding (verified by a temporary query or by 005.008 once available).
- [ ] Staging and production Hyperdrive IDs are configured in `wrangler.jsonc`.
- [ ] `docs/operations/database.md` documents branches, roles, and secret locations.

## Validation

```bash
docker compose up -d postgres
pnpm --filter @blixis/api dev
pnpm --filter @blixis/api exec wrangler hyperdrive list
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
- [ ] Least-privilege roles verified.
- [ ] If account access is missing, set this task to `blocked` with a Blocker section instead of faking IDs.

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
