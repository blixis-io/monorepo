import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

/**
 * Anything that carries a Postgres connection string — structurally compatible with the
 * Cloudflare `Hyperdrive` binding, so non-Worker tooling (migrations, tests) can reuse it.
 */
export interface ConnectionSource {
  readonly connectionString: string
}

/** Options for {@link createDatabase}. */
export interface CreateDatabaseOptions extends ConnectionSource {
  /**
   * Maximum concurrent connections of this database instance. Default `4` — below the Workers
   * limit of six simultaneous open connections per invocation, and enough that a query issued
   * outside a running transaction does not wait forever for the transaction's connection.
   */
  readonly maxConnections?: number
  /** Called when an idle connection fails (e.g. dropped by the server). Default: ignored. */
  readonly onIdleError?: (error: Error) => void
}

/**
 * A Drizzle database (ADR 0006) plus `close()`. Module repositories use the Drizzle API
 * directly: `db.select().from(entries).where(...)`.
 */
export type Database = NodePgDatabase & {
  /** Ends all connections. Idempotent; the instance cannot be used afterwards. */
  readonly close: () => Promise<void>
}

/**
 * Creates a database for one request or unit of work (architecture §13).
 *
 * Creation is synchronous and opens no connection: the first query connects (ADR 0005 —
 * service factories are synchronous). On Workers, pass the Hyperdrive connection string;
 * Hyperdrive pools connections to Neon, so the instance must be closed at the end of the
 * invocation — {@link databaseModule} does this automatically.
 *
 * @example
 * const db = createDatabase({ connectionString: env.HYPERDRIVE.connectionString })
 * try {
 *   await db.execute(sql`select 1`)
 * } finally {
 *   await db.close()
 * }
 */
export function createDatabase(options: CreateDatabaseOptions): Database {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 4,
  })
  // Without a listener, an idle-connection error would be an unhandled 'error' event.
  pool.on('error', (error) => options.onIdleError?.(error))
  let closing: Promise<void> | undefined
  const close = (): Promise<void> => {
    closing ??= pool.end()
    return closing
  }
  return Object.assign(drizzle({ client: pool }), { close })
}
