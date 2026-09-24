/**
 * `@blixis/database/migrations` — applies module-owned migrations from tooling and CI
 * (architecture §20). Node/CI only: never import this from the Worker.
 *
 * @packageDocumentation
 */
export {
  type AppliedMigration,
  FUNCTION_CHECKSUM,
  type MigrationPlan,
  type ModuleMigration,
  migrationChecksum,
  type PendingMigration,
  planMigrations,
} from './plan.ts'
export {
  MIGRATIONS_TABLE,
  type MigrationRunOptions,
  type MigrationRunResult,
  migrationStatus,
  runMigrations,
} from './run.ts'
