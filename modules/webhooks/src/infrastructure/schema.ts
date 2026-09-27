import { idColumn, tenantColumns, timestamps } from '@blixis/database'
import { boolean, integer, pgSchema, text, uuid } from 'drizzle-orm/pg-core'

export const webhooksSchema = pgSchema('webhooks')

export const webhooks = webhooksSchema.table('webhooks', {
  id: idColumn(),
  // Organization and space only: a webhook may cover every environment of its space.
  ...tenantColumns(),
  // Not named `environmentId`: tenantScope() would then demand an environment context.
  onlyEnvironmentId: uuid('environment_id'),
  name: text('name').notNull(),
  url: text('url').notNull(),
  eventTypes: text('event_types').array().notNull(),
  secretEncrypted: text('secret_encrypted').notNull(),
  secretHint: text('secret_hint').notNull(),
  active: boolean('active').notNull().default(true),
  failureCount: integer('failure_count').notNull().default(0),
  disabledReason: text('disabled_reason'),
  version: integer('version').notNull().default(1),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  ...timestamps(),
})
