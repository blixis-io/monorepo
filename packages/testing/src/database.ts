import type { BlixisModule } from '@blixis/contracts'
import { createDatabase, type Database } from '@blixis/database'
import { runMigrations } from '@blixis/database/migrations'
import { createBlixis, noopLogger } from '@blixis/kernel'
import { Client } from 'pg'

/**
 * Environment variable with the URL of a Postgres server the tests may create databases on
 * (locally: `docker compose up -d postgres`; in CI: the Postgres service container).
 */
export const TEST_DATABASE_URL_ENV = 'BLIXIS_TEST_DATABASE_URL'

/**
 * Whether database tests can run. Use with `describe.skipIf(!databaseTestsEnabled())`.
 *
 * @throws Error in CI (`CI=true`) when {@link TEST_DATABASE_URL_ENV} is missing, so database
 * tests can never be skipped silently there.
 */
export function databaseTestsEnabled(): boolean {
  const url = process.env[TEST_DATABASE_URL_ENV]
  if (url !== undefined && url !== '') return true
  if (process.env['CI'] === 'true') {
    throw new Error(`${TEST_DATABASE_URL_ENV} must be set in CI (Postgres service container)`)
  }
  return false
}

/** Options for {@link createTestDatabase}. */
export interface CreateTestDatabaseOptions {
  /** Modules whose migrations are applied (in bootstrap order, exactly like production). */
  readonly modules: readonly BlixisModule[]
  /** Server URL; defaults to `process.env.BLIXIS_TEST_DATABASE_URL`. */
  readonly url?: string
}

/** An isolated, migrated database for one test file (or worker). */
export interface TestDatabase {
  /** The database (same type as the `DATABASE` service). Closed by {@link TestDatabase.drop}. */
  readonly db: Database
  /** Connection URL of this database, e.g. for the migration runner or a second client. */
  readonly url: string
  /** Empties every module table (keeps the schema and applied migrations). Call in `beforeEach`. */
  reset(): Promise<void>
  /** Closes connections and drops the database. Call in `afterAll`. */
  drop(): Promise<void>
}

async function admin(url: string, sql: string): Promise<void> {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await client.query(sql)
  } finally {
    await client.end()
  }
}

/**
 * Creates a fresh database on the test server, applies the modules' migrations with the real
 * runner, and returns it (roadmap 005.006). One database per test file keeps parallel Vitest
 * workers isolated; {@link TestDatabase.reset} isolates tests within a file.
 *
 * @example
 * let t: TestDatabase
 * beforeAll(async () => { t = await createTestDatabase({ modules: [contentModule()] }) })
 * beforeEach(() => t.reset())
 * afterAll(() => t.drop())
 */
export async function createTestDatabase(
  options: CreateTestDatabaseOptions,
): Promise<TestDatabase> {
  const serverUrl = options.url ?? process.env[TEST_DATABASE_URL_ENV]
  if (serverUrl === undefined || serverUrl === '') {
    throw new Error(
      `Set ${TEST_DATABASE_URL_ENV} (e.g. postgres://blixis:blixis@localhost:5432/blixis) to run database tests`,
    )
  }
  const name = `blixis_test_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
  await admin(serverUrl, `create database ${name}`)
  const parsed = new URL(serverUrl)
  parsed.pathname = `/${name}`
  const url = parsed.toString()

  const migrations = createBlixis({ modules: options.modules, logger: noopLogger }).contributions
    .migrations
  await runMigrations({ connectionString: url, migrations })
  const db = createDatabase({ connectionString: url })

  return {
    db,
    url,
    async reset() {
      const client = new Client({ connectionString: url })
      await client.connect()
      try {
        const { rows } = await client.query<{ name: string }>(
          `select format('%I.%I', schemaname, tablename) as name from pg_tables
           where schemaname not in ('pg_catalog', 'information_schema', 'blixis')`,
        )
        if (rows.length > 0) {
          await client.query(
            `truncate ${rows.map((r) => r.name).join(', ')} restart identity cascade`,
          )
        }
      } finally {
        await client.end()
      }
    },
    async drop() {
      await db.close()
      await admin(serverUrl, `drop database if exists ${name} with (force)`)
    },
  }
}

/** A database connection that counts the SQL statements sent through it. */
export interface QueryCounter {
  /** Use as the `DATABASE` service: `serviceOverride(DATABASE, counter.db)`. */
  readonly db: Database
  /** Statements since the last `reset()`. */
  readonly queries: readonly string[]
  reset(): void
  close(): Promise<void>
}

/**
 * Counts SQL statements, e.g. to assert that a GraphQL query or an endpoint stays within a query
 * budget (roadmap 012.008).
 *
 * @example
 * const counter = countQueries(testDb)
 * const t = await createTestBlixis({ modules, database: testDb, overrides: [serviceOverride(DATABASE, counter.db)] })
 * counter.reset(); await t.request('/graphql', …); expect(counter.queries.length).toBeLessThanOrEqual(6)
 */
export function countQueries(database: Pick<TestDatabase, 'url'>): QueryCounter {
  const queries: string[] = []
  const db = createDatabase({
    connectionString: database.url,
    onQuery: (query) => queries.push(query),
  })
  return {
    db,
    get queries() {
      return queries
    },
    reset: () => {
      queries.length = 0
    },
    close: () => db.close(),
  }
}
