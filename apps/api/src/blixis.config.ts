import { eventsQueueModule } from '@blixis/cloudflare'
import type { BlixisModule } from '@blixis/contracts'
import { databaseModule } from '@blixis/database'
import { eventsModule, queueTransport } from '@blixis/events'
import { outboxModule, outboxTransport } from '@blixis/events/outbox'

/**
 * The explicit module list of the API Worker (architecture §2.3). Modules are imported by
 * package name and listed here — Blixis never discovers modules automatically.
 */
export const modules: readonly BlixisModule[] = [
  databaseModule(),
  // Best-effort events → EVENTS queue; transactional events → outbox (ADR 0008).
  eventsModule({
    transport: queueTransport({ transactional: outboxTransport() }),
    queues: ['blixis-events-local', 'blixis-events-staging', 'blixis-events-production'],
  }),
  eventsQueueModule(),
  // Owns events.outbox (migration); post-commit dispatch + sweep on the `* * * * *` cron.
  outboxModule(),
]
