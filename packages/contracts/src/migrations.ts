/**
 * Minimal execution interface migrations receive. Implemented by `@blixis/database`
 * (plan 005); intentionally tiny so contracts expose no database client (architecture §4).
 */
export interface MigrationExecutor {
  /** Executes one SQL statement (or a script, if the driver supports it). */
  execute(sql: string, params?: readonly unknown[]): Promise<void>
}

/** A migration step: SQL text or a function using the executor. */
export type MigrationStep = string | ((db: MigrationExecutor) => Promise<void>)

/**
 * A schema migration owned by a module (§5, §20). Migrations run from tooling/CI in module
 * dependency order — never inside the API Worker.
 */
export interface MigrationDefinition {
  /**
   * Sortable id, unique within the module, e.g. `0001_create_entries`.
   * Applied migrations must never change (checksums are verified).
   */
  readonly id: string
  readonly up: MigrationStep
  /** Optional rollback; production relies on expand/contract instead (see deployment docs). */
  readonly down?: MigrationStep
  /** Run inside a transaction. Defaults to `true`; set `false` e.g. for `CREATE INDEX CONCURRENTLY`. */
  readonly transactional?: boolean
}

const MIGRATION_ID_PATTERN = /^\d{4}_[a-z0-9]+(?:_[a-z0-9]+)*$/

/** Declares a migration and checks the id format (`NNNN_snake_case_name`). */
export function defineMigration(migration: MigrationDefinition): MigrationDefinition {
  if (!MIGRATION_ID_PATTERN.test(migration.id)) {
    throw new TypeError(
      `Invalid migration id "${migration.id}": use "NNNN_snake_case_name", e.g. "0001_create_entries"`,
    )
  }
  return Object.freeze({ ...migration })
}
