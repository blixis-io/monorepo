import { newId } from '@blixis/shared'
import { timestamp, uuid } from 'drizzle-orm/pg-core'

export { idTimestamp, isId, newId } from '@blixis/shared'

/** Primary key column: `id uuid primary key`, filled with {@link newId} by the application. */
export const idColumn = () => uuid('id').primaryKey().$defaultFn(newId)

/**
 * `created_at` / `updated_at` (`timestamptz`, UTC). `updated_at` is refreshed by Drizzle on
 * every update issued through the query builder.
 */
export const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
