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
export { idColumn, idTimestamp, isId, newId, timestamps } from './ids.ts'
export { DATABASE, type DatabaseModuleOptions, databaseModule } from './module.ts'
export {
  assertSameTenant,
  requireTenant,
  type TenantTable,
  tenantColumns,
  tenantScope,
} from './tenancy.ts'
export {
  fromTransactionScope,
  type RetryableTransactionOptions,
  type Transaction,
  type TransactionOptions,
  toTransactionScope,
  withRetryableTransaction,
  withTransaction,
} from './transactions.ts'
