# Migrations

How modules own and evolve their database schema. This implements architecture §5, §13, and §20 and [ADR 0006](../decisions/0006-database-stack.md). The runner lives in `@blixis/database/migrations`, and the CLI in `tooling/db`.

Related: [Database operations](../operations/database.md) · [Testing](./testing.md) · [Deployment](../operations/deployment.md)

---

## Rules

1. **Each module owns one Postgres schema**, named after the module (for example `content`). Its tables live only there, declared with Drizzle's `pgSchema('<name>')`. Modules never change another module's tables.
2. **Migrations are SQL**, in `MigrationDefinition`s the module lists in `migrations: [...]`. Use a function `up` only when SQL alone can't do it, such as data backfills that need logic. Function migrations are not checksum-verified.
3. **Ids are `NNNN_snake_case` and only ever appended.** An applied migration is never edited or renumbered: its SQL checksum is verified on every run, and a migration numbered before one that is already applied blocks the run.
4. **One transaction per migration.** The migration and its tracking row commit together. Set `transactional: false` only for statements Postgres forbids inside transactions (`CREATE INDEX CONCURRENTLY`), and keep such migrations to that single statement.
5. **Expand/contract, never breaking.** A deploy runs migrations **before** the new Worker version, while the old one still serves traffic. So:
   - add nullable columns or columns with defaults;
   - backfill data;
   - switch the code over;
   - drop old columns or tables only in a later release.
6. **Migrations never run in the Worker.** They run from `tooling/db`, in CI (plan 021) or by hand, over a **direct** connection as `blixis_migrator`, never through Hyperdrive.

## Writing a migration

```bash
pnpm db:new modules/content create_entries   # → modules/content/src/migrations/0001_create_entries.ts
```

1. Change the module's Drizzle schema.
2. Let drizzle-kit propose the SQL: `pnpm --filter <module> exec drizzle-kit generate --name create_entries`, with `schemaFilter: ['<schema>']` in that module's `drizzle.config.ts`. Treat its output as a draft.
3. Paste the reviewed SQL into the scaffolded file. Adjust it as needed, for example for data migrations, `CONCURRENTLY`, or constraint names.
4. Register it in the module:
   ```ts
   import { migration as createEntries } from './migrations/0001_create_entries.ts'
   export const contentModule = defineModule({ meta, migrations: [createEntries], ... })
   ```
5. Apply locally: `docker compose up -d postgres`, then `DATABASE_URL=postgres://blixis:blixis@localhost:5432/blixis pnpm db:migrate`.

## Commands

| Command | Does |
|---|---|
| `pnpm db:migrate [--config <file>]` | Applies pending migrations in module bootstrap order, then each module's migrations by id |
| `pnpm db:status [--config <file>]` | Lists `applied`, `pending`, `unknown` (applied but no longer declared), and `blocked` migrations. Exits 1 when blocked |
| `pnpm db:new <module-dir> <name>` | Scaffolds the next numbered migration file |

`--config` defaults to `apps/api/src/blixis.config.ts`, the API Worker's explicit module list. The CLI only calls `createBlixis({ modules })`, which validates the graph and collects contributions without running `setup` or `boot` and without Worker bindings. `DATABASE_URL` must be the migration role's direct URL.

## How the runner works

- **Tracking table** `blixis.migrations (module, id, checksum, applied_at)`, primary key `(module, id)`. The first run creates it in schema `blixis`.
- **Lock:** a session advisory lock (`pg_try_advisory_lock`). A second concurrent run fails fast instead of waiting.
- **Planning** (`planMigrations`): compares declared and applied migrations. It reports checksum mismatches and inserted-before-applied ids as problems, which block the run.
- **On failure:** the run stops at the first failing migration. A transactional migration is fully rolled back, including its tracking row. Earlier migrations stay applied, and a re-run continues from the failed one.
- **Error output:** shows the translated error and its sanitized cause (driver message and SQLSTATE), never the connection string.
