import { tenantColumns } from '@blixis/database'
import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const authSchema = pgSchema('auth')

export const credentials = authSchema.table('credentials', {
  userId: uuid('user_id').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const refreshTokens = authSchema.table('refresh_tokens', {
  id: uuid('id').primaryKey(),
  tokenHash: text('token_hash').notNull(),
  familyId: uuid('family_id').notNull(),
  userId: uuid('user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  familyExpiresAt: timestamp('family_expires_at', { withTimezone: true }).notNull(),
  rotatedAt: timestamp('rotated_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  userAgent: text('user_agent'),
})

export const apiTokens = authSchema.table('api_tokens', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  tokenHash: text('token_hash').notNull(),
  scopes: text('scopes').array().notNull().default([]),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
})

export const deliveryKeys = authSchema.table('delivery_keys', {
  id: uuid('id').primaryKey(),
  ...tenantColumns(),
  kind: text('kind').$type<'delivery' | 'preview'>().notNull(),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  keyHash: text('key_hash').notNull(),
  environmentIds: uuid('environment_ids').array(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
})
