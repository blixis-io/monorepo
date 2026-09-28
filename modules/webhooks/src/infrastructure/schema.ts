import { idColumn, tenantColumns, timestamps } from '@blixis-io/database'
import { boolean, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

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

export type DeliveryStatus = 'pending' | 'succeeded' | 'failed' | 'abandoned'

export const deliveries = webhooksSchema.table('deliveries', {
  id: idColumn(),
  ...tenantColumns(),
  webhookId: uuid('webhook_id').notNull(),
  eventId: uuid('event_id').notNull(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  status: text('status').$type<DeliveryStatus>().notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
  lastStatusCode: integer('last_status_code'),
  lastError: text('last_error'),
  ...timestamps(),
})

export const attempts = webhooksSchema.table('attempts', {
  id: idColumn(),
  ...tenantColumns(),
  deliveryId: uuid('delivery_id').notNull(),
  number: integer('number').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  durationMs: integer('duration_ms').notNull(),
  statusCode: integer('status_code'),
  error: text('error'),
  responseExcerpt: text('response_excerpt'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
