import { idColumn, timestamps } from '@blixis/database'
import { pgSchema, text, uuid } from 'drizzle-orm/pg-core'

export const permissionsSchema = pgSchema('permissions')

/** Custom roles of an organization (system roles are defined in code). */
export const roles = permissionsSchema.table('roles', {
  id: idColumn(),
  organizationId: uuid('organization_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  permissions: text('permissions').array().notNull().default([]),
  ...timestamps(),
})
