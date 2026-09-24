/**
 * `@blixis/events/outbox` — the transactional outbox (architecture §32, ADR 0008). Separate
 * entry point: it depends on `@blixis/database`, the core events package does not.
 *
 * @packageDocumentation
 */
export {
  dispatchOutboxBatch,
  OUTBOX_ALERT_ATTEMPTS,
  type OutboxBatchResult,
  type SweepOptions,
  sweepOutbox,
} from './dispatch.ts'
export {
  createOutbox,
  createProcessed,
  OUTBOX_PENDING,
  type OutboxModuleOptions,
  type OutboxPending,
  outboxModule,
  outboxTransport,
} from './module.ts'
export { postgresProcessedEvents } from './processed.ts'
