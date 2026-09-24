import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { BlixisModule } from '@blixis/contracts'
import type { ModuleMigration } from '@blixis/database/migrations'
import { createBlixis, noopLogger } from '@blixis/kernel'

/**
 * Loads an app's explicit module list (§2.3) and returns its migrations in bootstrap order.
 * Only `createBlixis` runs: it validates the module graph and collects contributions
 * synchronously, without running `setup`/`boot` or needing Worker bindings.
 */
export async function loadMigrations(configPath: string): Promise<readonly ModuleMigration[]> {
  const url = pathToFileURL(path.resolve(configPath)).href
  const config = (await import(url)) as { modules?: readonly BlixisModule[] }
  if (!Array.isArray(config.modules)) {
    throw new Error(`${configPath} does not export a "modules" array`)
  }
  return createBlixis({ modules: config.modules, logger: noopLogger }).contributions.migrations
}
