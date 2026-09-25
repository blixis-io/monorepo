import { idColumn, timestamps } from '@blixis/database'
import { pgSchema, text, uuid } from 'drizzle-orm/pg-core'

export const usersSchema = pgSchema('users')

export const users = usersSchema.table('users', {
  id: idColumn(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  status: text('status', { enum: ['active', 'disabled'] })
    .notNull()
    .default('active'),
  ...timestamps(),
})

export const memberships = usersSchema.table('memberships', {
  id: idColumn(),
  userId: uuid('user_id').notNull(),
  organizationId: uuid('organization_id').notNull(),
  spaceId: uuid('space_id'),
  roleKey: text('role_key').notNull(),
  ...timestamps(),
})
