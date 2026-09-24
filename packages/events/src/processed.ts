import { createServiceToken, type ServiceToken, type TransactionScope } from '@blixis/contracts'

/**
 * Records which subscription has processed which event (§33), so redeliveries skip handlers
 * that already succeeded. Implemented on Postgres by `outboxModule()` (`@blixis/events/outbox`).
 * Subscriptions are identified as `<module>#<subscription id>`.
 */
export interface ProcessedEvents {
  /** `after` mode: whether the subscription already processed the event. */
  isProcessed(subscription: string, eventId: string): Promise<boolean>
  /** `after` mode: records success (no-op if already recorded). */
  markProcessed(subscription: string, eventId: string): Promise<void>
  /**
   * `transactional` mode: in one transaction, inserts the marker first and — only if it was not
   * there yet — runs `fn` with that transaction. Returns `false` for a duplicate (fn not run).
   * If `fn` throws, marker and effects roll back together.
   */
  runOnce(
    subscription: string,
    eventId: string,
    fn: (transaction: TransactionScope) => Promise<void>,
  ): Promise<boolean>
}

/** Request-scoped {@link ProcessedEvents}; optional — without it, handlers are not deduplicated. */
export const PROCESSED_EVENTS: ServiceToken<ProcessedEvents> = createServiceToken<ProcessedEvents>(
  '@blixis/events.processed',
)
