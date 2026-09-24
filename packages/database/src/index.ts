/**
 * `@blixis/database` — Postgres access on Workers through Hyperdrive (architecture §13,
 * ADR 0006): a per-request Drizzle database service and translation of driver errors into
 * Blixis errors, and transactions. Migrations (005.005) follow.
 *
 * @packageDocumentation
 */
export {
  type ConnectionSource,
  type CreateDatabaseOptions,
  createDatabase,
  type Database,
} from './create-database.ts'
export { databaseErrorCode, isDatabaseError, translateDatabaseError } from './errors.ts'
export { DATABASE, type DatabaseModuleOptions, databaseModule } from './module.ts'
export {
  fromTransactionScope,
  type RetryableTransactionOptions,
  type Transaction,
  type TransactionOptions,
  toTransactionScope,
  withRetryableTransaction,
  withTransaction,
} from './transactions.ts'
