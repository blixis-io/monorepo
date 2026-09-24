# Database (Neon + Hyperdrive)

This page covers where Blixis's Postgres runs, which roles exist, where connection strings live, and how to rotate credentials. It implements architecture §13; the stack itself (pg and Drizzle) is decided in [ADR 0006](../decisions/0006-database-stack.md).

Related: [Cloudflare Workers](./cloudflare.md) · [Configuration](./configuration.md) · [GitHub Actions](./github-actions.md) · [Setup checklist](../setup-checklist.md#database-neon)

---

## Topology

```text
API Worker ──HYPERDRIVE──▶ Hyperdrive (pooling, EU) ──▶ Neon branch (direct host, eu-central-1)
CI migrations ──DATABASE_URL (direct)──────────────────▶ Neon branch
```

| | Staging | Production |
|---|---|---|
| Neon project | `blixis` (`plain-frost-79494892`), org `org-odd-thunder-61292824`, Postgres 18, `aws-eu-central-1` | same |
| Neon branch | `staging` (`br-curly-tooth-b1qdmtls`) | `production` (`br-old-silence-b18786qc`, default) |
| Direct host | `ep-super-silence-b16959eh.c-5.eu-central-1.aws.neon.tech` | `ep-sparkling-truth-b1kq7cbm.c-5.eu-central-1.aws.neon.tech` |
| Database | `neondb` | `neondb` |
| Hyperdrive config | `blixis-staging` (`2140b66bf63640059dc89b926d10ca3a`) | `blixis-production` (`01eefb16f5004d80addedcfe9e69f430`) |
| Worker binding | `HYPERDRIVE` in `env.staging` | `HYPERDRIVE` in `env.production` |
| Migration secret | GitHub env `staging` → `DATABASE_URL` | GitHub env `production` → `DATABASE_URL` |

- Hyperdrive and migrations use the **direct** host, without `-pooler`, because Hyperdrive does its own pooling.
- Connection strings use `sslmode=require`. Neon's `channel_binding=require` is left out because Hyperdrive's support for it is not confirmed.

## Roles

| Role | Used by | Rights |
|---|---|---|
| `neondb_owner` | People only, for emergencies and role management | Owner. Never used by the app or CI |
| `blixis_migrator` | CI `db:migrate` (005.005), through `DATABASE_URL` | `CONNECT`, and `CREATE` on the database (module schemas). Owns all schemas and tables |
| `blixis_app` | The Worker, through Hyperdrive | `CONNECT`, `USAGE` on schemas, DML on tables (`SELECT`, `INSERT`, `UPDATE`, `DELETE`), sequences, functions. **No DDL.** Has `statement_timeout 30s` and `idle_in_transaction_session_timeout 60s` |


> [!WARNING]
> Always create roles with **SQL**. Roles created in the Neon console, CLI, or API automatically become members of `neon_superuser`, which can read and write all data and create roles. Verify with:
>
> ```sql
> SELECT rolname, pg_has_role(rolname, 'neon_superuser', 'member') AS superuser
> FROM pg_roles WHERE rolname LIKE 'blixis_%';   -- both rows must be false
> ```

Run the setup script once per branch as `neondb_owner` in the Neon SQL Editor, using **Run**, not *Explain*. Each branch gets its own passwords:

```sql
CREATE ROLE blixis_migrator LOGIN PASSWORD '<migrator-password>';
CREATE ROLE blixis_app      LOGIN PASSWORD '<app-password>';

REVOKE ALL ON DATABASE neondb FROM PUBLIC;
GRANT CONNECT ON DATABASE neondb TO blixis_migrator, blixis_app;
GRANT CREATE ON DATABASE neondb TO blixis_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

GRANT blixis_migrator TO neondb_owner;
ALTER DEFAULT PRIVILEGES FOR ROLE blixis_migrator GRANT USAGE ON SCHEMAS TO blixis_app;
ALTER DEFAULT PRIVILEGES FOR ROLE blixis_migrator GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO blixis_app;
ALTER DEFAULT PRIVILEGES FOR ROLE blixis_migrator GRANT USAGE, SELECT ON SEQUENCES TO blixis_app;
ALTER DEFAULT PRIVILEGES FOR ROLE blixis_migrator GRANT EXECUTE ON FUNCTIONS TO blixis_app;

ALTER ROLE blixis_app SET statement_timeout = '30s';
ALTER ROLE blixis_app SET idle_in_transaction_session_timeout = '60s';
```

These default privileges apply only to objects **created by `blixis_migrator`**. Migrations must therefore always run as that role; objects created by other roles are not visible to the app.

## Where connection strings live

| Connection | Stored in | Never in |
|---|---|---|
| App → Neon (`blixis_app`) | Inside the Hyperdrive configuration. The Worker only receives `env.HYPERDRIVE.connectionString`, a Hyperdrive-local URL | `wrangler.jsonc`, the repo, logs |
| Migrations (`blixis_migrator`) | GitHub environment secret `DATABASE_URL` (`staging` / `production`); a developer's git-ignored `.env` when needed | the repo, chat, CI logs |
| Owner (`neondb_owner`) | The owner's password manager | anywhere else |
| Local | `postgres://blixis:blixis@localhost:5432/blixis` (Docker, local only) | — |

Create or update values without passing them through shell history:

```bash
cd apps/api
read -rs "PW?blixis_app password: "; echo
npx wrangler hyperdrive update <hyperdrive-id> \
  --origin-password="$PW"          # or: hyperdrive create <name> --connection-string="postgresql://blixis_app:${PW}@<direct-host>/neondb?sslmode=require"
unset PW

gh secret set DATABASE_URL --env staging --repo blixis-io/monorepo   # prompts for the value
```

## Migrations

Until the release pipeline runs migrations (plan 021), the owner applies them to staging and production **before deploying**, without putting the URL in shell history:

```bash
read -rs "DATABASE_URL?blixis_migrator URL (staging): "; export DATABASE_URL; echo
pnpm db:status && pnpm db:migrate
unset DATABASE_URL
```

`pnpm db:migrate` / `db:status` run as `blixis_migrator` with `DATABASE_URL`, the direct URL, never through Hyperdrive. They record applied migrations in `blixis.migrations`, and a session advisory lock prevents concurrent runs. Conventions: [Migrations](../conventions/migrations.md).

## Transactions on Hyperdrive

Hyperdrive pools connections in **transaction mode**: between transactions, a Worker's connection may be handed to another client. So:

- **Session state does not survive a transaction.** Inside a transaction use `SET LOCAL` (for example `SET LOCAL statement_timeout = '5s'`), never `SET`. Don't rely on session-level advisory locks, `LISTEN`/`NOTIFY`, temporary tables, or named prepared statements (`pg` uses unnamed ones by default).
- **Keep transactions short** and never wait on outside I/O (`fetch`, queues) inside one. `blixis_app` aborts transactions that are idle for more than 60 s.
- **Use `withTransaction(db, fn)`** from `@blixis/database`. It defaults to `read committed`, translates driver errors, and does not nest; explicit savepoints are available through `tx.transaction(...)`.
- **Use `withRetryableTransaction`** for `serializable` work. It reruns `fn` (up to three times by default) only after a serialisation failure (`40001`) or deadlock (`40P01`). It never retries a lost connection, because the commit outcome is unknown.
- **Pass `toTransactionScope(tx)`** to other packages (for example the outbox in plan 006), and turn it back into a transaction with `fromTransactionScope`. A scope is rejected once its transaction has ended.

## Local development

```bash
docker compose up -d postgres     # Postgres 18 on localhost:5432 (blixis/blixis/blixis)
pnpm --filter @blixis/api dev     # HYPERDRIVE → localConnectionString in wrangler.jsonc
```

- The host port is **5432**. If another Postgres already uses it, stop that one or set `BLIXIS_POSTGRES_PORT` (for example `55432`) and point the Worker at the new port with `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`.
- To use a different local database, set `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`.
- The Docker user is a superuser. Least-privilege behaviour is verified on staging and in the migration tests (005.005 and 005.006).

## Rotation

Rotate on a schedule (at least yearly), and immediately whenever a password may have been exposed.

1. In the Neon SQL Editor on the affected branch, run `ALTER ROLE <role> PASSWORD '<new>'` (or use the console's **Reset password** for `neondb_owner`).
2. Update the consumer:
   - for `blixis_app`, run `wrangler hyperdrive update <id> --origin-password=…`;
   - for `blixis_migrator`, run `gh secret set DATABASE_URL --env <env>`.
3. Verify: `curl <api>/api/v1/health/ready` for the app (expects `checks.database.status = ok`); a `db:migrate` dry run for the migrator.
4. Note the date in the setup checklist.

## Known workaround: `pg-protocol` patch

`pg-protocol` 1.16.0 ships `esm/index.js` as ESM without `"type": "module"`. Node and Wrangler's bundler cope with this, but the Vitest Workers pool loads the file as CommonJS and fails. `patches/pg-protocol@1.16.0.patch` adds `esm/package.json` with `{"type":"module"}` (`pnpm-workspace.yaml#patchedDependencies`). Drop the patch once upstream fixes the file; pnpm fails the install if the patched version is no longer resolved.
