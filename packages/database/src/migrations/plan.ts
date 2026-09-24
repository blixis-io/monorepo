import type { MigrationDefinition } from '@blixis/contracts'

/** A migration contributed by a module (the kernel's `contributions.migrations` entries). */
export interface ModuleMigration {
  readonly module: string
  readonly value: MigrationDefinition
}

/** A row of the tracking table. */
export interface AppliedMigration {
  readonly module: string
  readonly id: string
  readonly checksum: string
  readonly appliedAt: Date
}

/** A migration that has not been applied yet. */
export interface PendingMigration {
  readonly module: string
  readonly id: string
  readonly checksum: string
  readonly migration: MigrationDefinition
}

/** Result of comparing the code's migrations with the tracking table. */
export interface MigrationPlan {
  /** In execution order: modules in bootstrap order, each module's migrations by id. */
  readonly pending: readonly PendingMigration[]
  readonly applied: readonly AppliedMigration[]
  /** Applied migrations no module declares any more (e.g. a removed module). Not an error. */
  readonly unknown: readonly AppliedMigration[]
  /** Problems that block applying (changed or out-of-order migrations). */
  readonly problems: readonly string[]
}

/** Checksum recorded for function migrations; their source is not stable across builds. */
export const FUNCTION_CHECKSUM = 'function'

/**
 * SHA-256 (hex) of a SQL migration's `up` text; {@link FUNCTION_CHECKSUM} for function
 * migrations. Uses Web Crypto, so it runs in Node and Workers alike.
 */
export async function migrationChecksum(migration: MigrationDefinition): Promise<string> {
  if (typeof migration.up !== 'string') return FUNCTION_CHECKSUM
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(migration.up))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

const key = (module: string, id: string) => `${module}\u0000${id}`

/**
 * Compares module migrations with applied ones (architecture §20):
 * - pending migrations in module bootstrap order (the kernel's contribution order), each
 *   module's by id;
 * - a problem when an applied SQL migration's content changed (checksum mismatch);
 * - a problem when a pending migration sorts before one already applied in the same module
 *   (migrations must be appended, never inserted).
 */
export async function planMigrations(
  migrations: readonly ModuleMigration[],
  applied: readonly AppliedMigration[],
): Promise<MigrationPlan> {
  const appliedByKey = new Map(applied.map((row) => [key(row.module, row.id), row]))
  const latestApplied = new Map<string, string>()
  for (const row of applied) {
    const latest = latestApplied.get(row.module)
    if (latest === undefined || row.id > latest) latestApplied.set(row.module, row.id)
  }

  const byModule = new Map<string, ModuleMigration[]>()
  for (const entry of migrations) {
    const list = byModule.get(entry.module) ?? []
    list.push(entry)
    byModule.set(entry.module, list)
  }

  const pending: PendingMigration[] = []
  const problems: string[] = []
  const declared = new Set<string>()
  for (const [module, entries] of byModule) {
    const sorted = [...entries].sort((a, b) => (a.value.id < b.value.id ? -1 : 1))
    for (const { value } of sorted) {
      declared.add(key(module, value.id))
      const checksum = await migrationChecksum(value)
      const row = appliedByKey.get(key(module, value.id))
      if (row !== undefined) {
        if (row.checksum !== checksum && checksum !== FUNCTION_CHECKSUM) {
          problems.push(
            `${module} ${value.id} was changed after it was applied (checksum mismatch); add a new migration instead`,
          )
        }
        continue
      }
      const latest = latestApplied.get(module)
      if (latest !== undefined && value.id < latest) {
        problems.push(
          `${module} ${value.id} sorts before the already applied ${latest}; give it a higher id`,
        )
        continue
      }
      pending.push({ module, id: value.id, checksum, migration: value })
    }
  }

  return {
    pending,
    applied,
    unknown: applied.filter((row) => !declared.has(key(row.module, row.id))),
    problems,
  }
}
