import { idColumn, tenantColumns, timestamps } from '@blixis/database'
import { integer, jsonb, pgSchema, text } from 'drizzle-orm/pg-core'
import type { ContentTypeKind, FieldDefinition, FieldGroup } from '../domain/content-type.ts'

export const contentSchema = pgSchema('content')

export const contentTypes = contentSchema.table('content_types', {
  id: idColumn(),
  ...tenantColumns({ environment: true }),
  kind: text('kind').$type<ContentTypeKind>().notNull(),
  apiId: text('api_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  displayFieldId: text('display_field_id'),
  groups: jsonb('groups').$type<FieldGroup[]>().notNull().default([]),
  fields: jsonb('fields').$type<FieldDefinition[]>().notNull().default([]),
  version: integer('version').notNull().default(1),
  ...timestamps(),
})
