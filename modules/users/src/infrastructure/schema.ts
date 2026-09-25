import { idColumn, timestamps } from '@blixis/database'
import { pgSchema, text } from 'drizzle-orm/pg-core'

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
