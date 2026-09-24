import type { BlixisModule } from '@blixis/contracts'
import { databaseModule } from '@blixis/database'

/**
 * The explicit module list of the API Worker (architecture §2.3). Modules are imported by
 * package name and listed here — Blixis never discovers modules automatically.
 */
export const modules: readonly BlixisModule[] = [databaseModule()]
