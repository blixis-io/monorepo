import { idColumn, tenantColumns, timestamps } from '@blixis/database'
import { boolean, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const spacesSchema = pgSchema('spaces')

export const organizations = spacesSchema.table('organizations', {
  id: idColumn(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  ...timestamps(),
})

export const spaces = spacesSchema.table('spaces', {
  id: idColumn(),
  organizationId: uuid('organization_id').notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  ...timestamps(),
})

export const environments = spacesSchema.table('environments', {
  id: idColumn(),
  ...tenantColumns(),
  key: text('key').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const locales = spacesSchema.table('locales', {
  id: idColumn(),
  ...tenantColumns(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  fallbackCode: text('fallback_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
