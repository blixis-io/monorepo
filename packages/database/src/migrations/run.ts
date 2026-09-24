import { InfrastructureError, type MigrationExecutor } from '@blixis/contracts'
import { Client } from 'pg'
import { translateDatabaseError } from '../errors.ts'
import {
  type AppliedMigration,
  type MigrationPlan,
  type ModuleMigration,
  type PendingMigration,
  planMigrations,
} from './plan.ts'

/** Schema and table that record applied migrations. Owned by the migration role. */
export const MIGRATIONS_TABLE = 'blixis.migrations'
/** Session advisory lock key (ASCII "blxm") serialising concurrent migration runs. */
const LOCK_KEY = 0x626c786d

const CREATE_TRACKING = `
create schema if not exists blixis;
create table if not exists ${MIGRATIONS_TABLE} (
  module text not null,
  id text not null,
  checksum text not null,
  applied_at timestamptz not null default now(),
  primary key (module, id)
)`

/** Options for {@link runMigrations} and {@link migrationStatus}. */
export interface MigrationRunOptions {
  /**
   * Direct Postgres URL of the **migration role** (never through Hyperdrive: the runner holds a
   * session advisory lock and runs DDL). In tooling: the `DATABASE_URL` environment variable.
   */
  readonly connectionString: string
  /** Module migrations in bootstrap order: `createBlixis({ modules }).contributions.migrations`. */
  readonly migrations: readonly ModuleMigration[]
  /** Progress output, e.g. `console.log`. */
  readonly log?: (message: string) => void
}

/** Result of {@link runMigrations}. */
export interface MigrationRunResult {
  readonly applied: readonly PendingMigration[]
  readonly plan: MigrationPlan
}

async function withClient<T>(connectionString: string, fn: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString })
  try {
    await client.connect()
    return await fn(client)
  } catch (error) {
    throw translateDatabaseError(error)
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function readApplied(client: Client): Promise<AppliedMigration[]> {
  const exists = await client.query<{ table: string | null }>(
    `select to_regclass('${MIGRATIONS_TABLE}')::text as table`,
  )
  if (exists.rows[0]?.table == null) return []
  const result = await client.query<{
    module: string
    id: string
    checksum: string
    applied_at: Date
  }>(
    `select module, id, checksum, applied_at from ${MIGRATIONS_TABLE} order by applied_at, module, id`,
  )
  return result.rows.map((row) => ({
    module: row.module,
    id: row.id,
    checksum: row.checksum,
    appliedAt: row.applied_at,
  }))
}

/** Compares code and database without changing anything (the `db:status` command). */
export async function migrationStatus(
  options: Omit<MigrationRunOptions, 'log'>,
): Promise<MigrationPlan> {
  return withClient(options.connectionString, async (client) =>
    planMigrations(options.migrations, await readApplied(client)),
  )
}

/**
 * Applies pending module migrations (architecture §20; never from inside the Worker).
 *
 * - Holds a session advisory lock; a second concurrent run fails fast.
 * - Creates `blixis.migrations` on first use.
 * - Refuses to run when the plan has problems (changed or out-of-order migrations).
 * - Runs each migration and its tracking row in one transaction, unless the migration sets
 *   `transactional: false` (e.g. `CREATE INDEX CONCURRENTLY`); then the tracking row is written
 *   after the migration succeeds.
 * - Stops at the first failure; earlier migrations stay applied. Re-running is idempotent.
 */
export async function runMigrations(options: MigrationRunOptions): Promise<MigrationRunResult> {
  const log = options.log ?? (() => undefined)
  return withClient(options.connectionString, async (client) => {
    const locked = await client.query<{ locked: boolean }>(
      'select pg_try_advisory_lock($1) as locked',
      [LOCK_KEY],
    )
    if (locked.rows[0]?.locked !== true) {
      throw new InfrastructureError('Another migration run holds the lock; try again later')
    }
    try {
      await client.query(CREATE_TRACKING)
      const plan = await planMigrations(options.migrations, await readApplied(client))
      if (plan.problems.length > 0) {
        throw new InfrastructureError(`Migrations blocked:\n- ${plan.problems.join('\n- ')}`)
      }
      const executor: MigrationExecutor = {
        async execute(sql, params) {
          await client.query(sql, params === undefined ? undefined : [...params])
        },
      }
      const applied: PendingMigration[] = []
      for (const pending of plan.pending) {
        const started = Date.now()
        const transactional = pending.migration.transactional !== false
        if (transactional) await client.query('begin')
        try {
          const { up } = pending.migration
          if (typeof up === 'string') await client.query(up)
          else await up(executor)
          await client.query(
            `insert into ${MIGRATIONS_TABLE} (module, id, checksum) values ($1, $2, $3)`,
            [pending.module, pending.id, pending.checksum],
          )
          if (transactional) await client.query('commit')
        } catch (error) {
          if (transactional) await client.query('rollback').catch(() => undefined)
          log(`failed ${pending.module} ${pending.id}`)
          throw error
        }
        applied.push(pending)
        log(`applied ${pending.module} ${pending.id} (${Date.now() - started} ms)`)
      }
      return { applied, plan }
    } finally {
      await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined)
    }
  })
}
