import { type Database, toTransactionScope, withTransaction } from '@blixis/database'
import { sql } from 'drizzle-orm'
import type { ProcessedEvents } from '../processed.ts'

/**
 * {@link ProcessedEvents} on `events.processed` (primary key `(subscription, event_id)`).
 * `runOnce` inserts the marker first; a concurrent duplicate blocks on the uncommitted row and
 * then sees the conflict, so the handler runs at most once per committed marker.
 */
export function postgresProcessedEvents(db: Database): ProcessedEvents {
  return {
    async isProcessed(subscription, eventId) {
      const { rows } = await db.execute(sql`
        select 1 from events.processed where subscription = ${subscription} and event_id = ${eventId}::uuid`)
      return rows.length > 0
    },
    async markProcessed(subscription, eventId) {
      await db.execute(sql`
        insert into events.processed (subscription, event_id) values (${subscription}, ${eventId}::uuid)
        on conflict do nothing`)
    },
    runOnce(subscription, eventId, fn) {
      return withTransaction(db, async (tx) => {
        const { rows } = await tx.execute(sql`
          insert into events.processed (subscription, event_id) values (${subscription}, ${eventId}::uuid)
          on conflict do nothing
          returning 1`)
        if (rows.length === 0) return false
        await fn(toTransactionScope(tx))
        return true
      })
    },
  }
}
