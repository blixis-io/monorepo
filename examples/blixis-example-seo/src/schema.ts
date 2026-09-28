import { tenantColumns, timestamps } from '@blixis-io/database'
import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/** The plugin owns one Postgres schema; nothing else reads it (§20). */
export const seoSchema = pgSchema('example_seo')

/** SEO metadata per entry, with the entry's tenant for scoping and cleanup. */
export const seoEntries = seoSchema.table('entries', {
  entryId: uuid('entry_id').primaryKey(),
  ...tenantColumns({ environment: true }),
  title: text('title'),
  description: text('description'),
  lastPublishedAt: timestamp('last_published_at', { withTimezone: true }),
  ...timestamps(),
})
