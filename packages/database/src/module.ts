import {
  BLIXIS_CAPABILITIES,
  createServiceToken,
  InfrastructureError,
  type ServiceToken,
} from '@blixis/contracts'
import { defineModule, HEALTH_CHECKS } from '@blixis/kernel'
import { sql } from 'drizzle-orm'
import { createDatabase, type Database } from './create-database.ts'

/**
 * The request-scoped database (a Drizzle instance, ADR 0006). The service type is Drizzle's own
 * API rather than a Blixis wrapper: repositories get the full typed query builder, and a thin
 * wrapper would either leak Drizzle types anyway or hide features modules need.
 */
export const DATABASE: ServiceToken<Database> = createServiceToken<Database>('@blixis/database.db')

/** Options for {@link databaseModule}. */
export interface DatabaseModuleOptions {
  /** Name of the binding holding `connectionString` (the Hyperdrive binding). Default `HYPERDRIVE`. */
  readonly binding?: string
  /** Maximum connections per request scope. See {@link CreateDatabaseOptions.maxConnections}. */
  readonly maxConnections?: number
  /**
   * Register the `database` readiness check (`select 1`, 2 s timeout) for
   * `GET /api/v1/health/ready`. Default `true`.
   */
  readonly healthCheck?: boolean
}

function connectionStringOf(bindings: Readonly<Record<string, unknown>>, name: string): string {
  const binding = bindings[name]
  const value =
    typeof binding === 'object' && binding !== null
      ? (binding as { connectionString?: unknown }).connectionString
      : undefined
  if (typeof value !== 'string' || value === '') {
    throw new InfrastructureError(
      `Database binding "${name}" is missing or has no connectionString`,
    )
  }
  return value
}

/**
 * Platform module that provides {@link DATABASE} per request scope (architecture §13, ADR 0005)
 * and the `blixis.database` capability, and registers the `database` readiness check. The connection string is read from the invocation's
 * bindings (`env.HYPERDRIVE` by default); the connection opens on the first query and is closed
 * when the scope ends (via `waitUntil` on Workers).
 *
 * @example
 * const app = createBlixis({ modules: [databaseModule(), contentModule()] })
 */
export const databaseModule = defineModule((options: DatabaseModuleOptions) => ({
  meta: {
    name: '@blixis/database',
    version: '0.0.0',
    capabilities: [BLIXIS_CAPABILITIES.database],
  },
  setup(ctx) {
    const binding = options.binding ?? 'HYPERDRIVE'
    ctx.services.provideFactory(
      DATABASE,
      ({ bindings }) =>
        createDatabase({
          connectionString: connectionStringOf(bindings, binding),
          ...(options.maxConnections === undefined
            ? {}
            : { maxConnections: options.maxConnections }),
        }),
      { scope: 'request', dispose: (db) => db.close() },
    )
    if (options.healthCheck !== false) {
      ctx.services.get(HEALTH_CHECKS).register({
        name: 'database',
        timeoutMs: 2000,
        async check(services) {
          await services.get(DATABASE).execute(sql`select 1`)
        },
      })
    }
  },
}))
