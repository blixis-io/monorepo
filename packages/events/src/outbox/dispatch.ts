import type { EventEnvelope, Logger } from '@blixis/contracts'
import { type Database, withTransaction } from '@blixis/database'
import { sql } from 'drizzle-orm'
import type { QueueSender } from '../queue.ts'

/** `$1::uuid, $2::uuid, …` — Drizzle expands arrays into parameter lists, not Postgres arrays. */
const idList = (ids: readonly string[]) =>
  sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )

/** Pending rows with this many failed attempts are logged at `error` on every sweep. */
export const OUTBOX_ALERT_ATTEMPTS = 10

/** Result of one dispatch batch. */
export interface OutboxBatchResult {
  readonly selected: number
  readonly sent: number
  readonly failed: boolean
}

/**
 * Dispatches one batch of pending outbox rows (ADR 0008): selects them `FOR UPDATE SKIP LOCKED`
 * inside a transaction, sends them with one queue batch, and marks them dispatched — or, when
 * the send fails, records the attempt and error and leaves them pending. Concurrent dispatchers
 * skip each other's rows; a crash after send and before commit re-sends (at-least-once).
 *
 * @param filter `ids` (post-commit: only these rows) or `olderThanSeconds` (sweep).
 */
export async function dispatchOutboxBatch(
  db: Database,
  sender: QueueSender,
  filter: { readonly ids: readonly string[] } | { readonly olderThanSeconds: number },
  options: { readonly limit: number; readonly logger: Logger },
): Promise<OutboxBatchResult> {
  return withTransaction(db, async (tx) => {
    const condition =
      'ids' in filter
        ? sql`id in (${idList(filter.ids)})`
        : sql`created_at < now() - make_interval(secs => ${filter.olderThanSeconds})`
    const { rows } = await tx.execute<{
      id: string
      envelope: EventEnvelope
      attempts: number
    }>(sql`
      select id, envelope, attempts from events.outbox
      where dispatched_at is null and ${condition}
      order by created_at
      limit ${options.limit}
      for update skip locked`)
    if (rows.length === 0) return { selected: 0, sent: 0, failed: false }
    const ids = rows.map((row) => row.id)
    try {
      await sender.send(rows.map((row) => row.envelope))
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      await tx.execute(sql`
        update events.outbox set attempts = attempts + 1, last_error = ${message.slice(0, 1000)}
        where id in (${idList(ids)})`)
      for (const row of rows) {
        if (row.attempts + 1 >= OUTBOX_ALERT_ATTEMPTS) {
          options.logger.error('outbox.stuck', {
            eventId: row.id,
            eventType: row.envelope.type,
            attempts: row.attempts + 1,
          })
        }
      }
      options.logger.warn('outbox.send_failed', { events: rows.length, error: message })
      return { selected: rows.length, sent: 0, failed: true }
    }
    await tx.execute(sql`
      update events.outbox set dispatched_at = now(), attempts = attempts + 1, last_error = null
      where id in (${idList(ids)})`)
    return { selected: rows.length, sent: rows.length, failed: false }
  })
}

/** Options for {@link sweepOutbox}. */
export interface SweepOptions {
  readonly batchSize: number
  /** Leave rows younger than this to the post-commit dispatch. */
  readonly minAgeSeconds: number
  /** Stop after this many batches per run (budget per cron invocation). */
  readonly maxBatches: number
  readonly retentionDays: number
  readonly logger: Logger
}

/**
 * The cron sweep (ADR 0008): dispatches pending rows in batches until none are left, a send
 * fails, or the batch budget is used; then deletes rows dispatched more than `retentionDays`
 * ago. Returns the number of events sent.
 */
export async function sweepOutbox(
  db: Database,
  sender: QueueSender,
  options: SweepOptions,
): Promise<number> {
  let sent = 0
  for (let batch = 0; batch < options.maxBatches; batch++) {
    const result = await dispatchOutboxBatch(
      db,
      sender,
      { olderThanSeconds: options.minAgeSeconds },
      { limit: options.batchSize, logger: options.logger },
    )
    sent += result.sent
    if (result.failed || result.selected < options.batchSize) break
  }
  const deleted = await db.execute(sql`
    delete from events.outbox
    where dispatched_at < now() - make_interval(days => ${options.retentionDays})`)
  if (sent > 0 || (deleted.rowCount ?? 0) > 0) {
    options.logger.info('outbox.swept', { sent, deleted: deleted.rowCount ?? 0 })
  }
  return sent
}
