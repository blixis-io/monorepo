import { InfrastructureError, type TransactionScope } from '@blixis/contracts'
import type { Database } from './create-database.ts'
import { databaseErrorCode, isDatabaseError, translateDatabaseError } from './errors.ts'

/** An open transaction: the same Drizzle query API as {@link Database}, bound to one connection. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/** Options for {@link withTransaction}. */
export interface TransactionOptions {
  /** Default `read committed` (Postgres' default). Use `serializable` with {@link withRetryableTransaction}. */
  readonly isolationLevel?: 'read committed' | 'repeatable read' | 'serializable'
  /** Default `read write`. */
  readonly accessMode?: 'read only' | 'read write'
}

const scopes = new WeakMap<Transaction, TransactionScope>()
const transactions = new WeakMap<TransactionScope, Transaction>()
const ended = new WeakSet<Transaction>()

/**
 * Runs `fn` in one transaction and returns its result (architecture §13). Commits when `fn`
 * resolves, rolls back when it throws. Driver errors are rethrown as Blixis errors via
 * {@link translateDatabaseError}; errors thrown by `fn` itself (e.g. `NotFoundError`) pass through.
 *
 * Nesting is deliberately not supported: `withTransaction` accepts a {@link Database}, not a
 * {@link Transaction}. Pass `tx` (or its {@link TransactionScope}) down instead. Explicit
 * savepoints remain available through Drizzle's `tx.transaction(...)`.
 *
 * On Hyperdrive, session state does not survive the transaction: use `SET LOCAL`, never `SET`
 * (docs/operations/database.md).
 *
 * @example
 * const entry = await withTransaction(db, async (tx) => {
 *   const [row] = await tx.insert(entries).values(input).returning()
 *   await events.emit(entryCreated(row), { transaction: toTransactionScope(tx) })
 *   return row
 * })
 */
export async function withTransaction<T>(
  db: Database,
  fn: (tx: Transaction) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  let current: Transaction | undefined
  try {
    return await db.transaction(
      async (tx) => {
        current = tx
        return fn(tx)
      },
      {
        isolationLevel: options.isolationLevel ?? 'read committed',
        ...(options.accessMode === undefined ? {} : { accessMode: options.accessMode }),
      },
    )
  } catch (error) {
    throw isDatabaseError(error) ? translateDatabaseError(error) : error
  } finally {
    if (current !== undefined) ended.add(current)
  }
}

/** Options for {@link withRetryableTransaction}. */
export interface RetryableTransactionOptions extends TransactionOptions {
  /** Total attempts including the first. Default `3`. */
  readonly attempts?: number
}

/** Serialisation failure and deadlock: the transaction was rolled back and may simply be rerun. */
const RERUNNABLE = new Set(['40001', '40P01'])

/**
 * {@link withTransaction} that reruns `fn` after a serialisation failure or deadlock, at most
 * `attempts` times (default 3; isolation default `serializable`). Other errors — including lost
 * connections, where the commit outcome is unknown — are never retried. `fn` must be safe to
 * run again: no side effects outside the transaction (emit events through the outbox).
 */
export async function withRetryableTransaction<T>(
  db: Database,
  fn: (tx: Transaction) => Promise<T>,
  options: RetryableTransactionOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3)
  const transactionOptions: TransactionOptions = {
    isolationLevel: options.isolationLevel ?? 'serializable',
    ...(options.accessMode === undefined ? {} : { accessMode: options.accessMode }),
  }
  for (let attempt = 1; ; attempt++) {
    try {
      return await withTransaction(db, fn, transactionOptions)
    } catch (error) {
      const code = databaseErrorCode(error)
      if (attempt >= attempts || code === undefined || !RERUNNABLE.has(code)) throw error
    }
  }
}

/**
 * Wraps a transaction in the opaque contracts handle, so it can cross package boundaries (e.g.
 * `EventBus.emit(..., { transaction })` writing to the outbox in the same transaction, §32).
 * Returns the same handle for the same transaction.
 */
export function toTransactionScope(tx: Transaction): TransactionScope {
  const existing = scopes.get(tx)
  if (existing !== undefined) return existing
  const scope = Object.freeze({}) as TransactionScope
  scopes.set(tx, scope)
  transactions.set(scope, tx)
  return scope
}

/**
 * Returns the transaction behind a {@link TransactionScope}.
 *
 * @throws InfrastructureError when the scope was not created by this package (a forged or
 * foreign handle) or its transaction has already ended.
 */
export function fromTransactionScope(scope: TransactionScope): Transaction {
  const tx = transactions.get(scope)
  if (tx === undefined) {
    throw new InfrastructureError('Unknown transaction scope (not created by @blixis/database)')
  }
  if (ended.has(tx)) {
    throw new InfrastructureError('Transaction scope used after its transaction ended')
  }
  return tx
}
