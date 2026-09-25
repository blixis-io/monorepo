import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { BlixisModule } from '@blixis/contracts'

/** The API Worker's real module list, so the suites cover exactly what the API serves. */
export async function apiModules(): Promise<readonly BlixisModule[]> {
  const config = path.resolve(import.meta.dirname, '../../../apps/api/src/blixis.config.ts')
  return ((await import(pathToFileURL(config).href)) as { modules: readonly BlixisModule[] })
    .modules
}
