declare const TRANSACTION_SCOPE: unique symbol

/**
 * Opaque handle for an open database transaction. Created and interpreted only by
 * `@blixis/database`; contracts never expose the underlying client (architecture §4).
 * Passing it to `EventBus.emit` writes transactional events in the same transaction (§32).
 */
export interface TransactionScope {
  readonly [TRANSACTION_SCOPE]: true
}
