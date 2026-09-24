import { eventsQueueModule } from '@blixis/cloudflare'
import type { BlixisModule } from '@blixis/contracts'
import { databaseModule } from '@blixis/database'
import { eventsModule, queueTransport } from '@blixis/events'

/**
 * The explicit module list of the API Worker (architecture §2.3). Modules are imported by
 * package name and listed here — Blixis never discovers modules automatically.
 */
export const modules: readonly BlixisModule[] = [
  databaseModule(),
  // Best-effort events → EVENTS queue; transactional events → outbox (added in 006.005).
  eventsModule({ transport: queueTransport() }),
  eventsQueueModule(),
]
