import { idColumn, tenantColumns, timestamps } from '@blixis/database'
import { integer, jsonb, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
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

export const entries = contentSchema.table('entries', {
  id: idColumn(),
  ...tenantColumns({ environment: true }),
  contentTypeId: uuid('content_type_id').notNull(),
  currentVersionId: uuid('current_version_id').notNull(),
  version: integer('version').notNull().default(1),
  publishedVersionId: uuid('published_version_id'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  firstPublishedAt: timestamp('first_published_at', { withTimezone: true }),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  ...timestamps(),
})

export const entryVersions = contentSchema.table('entry_versions', {
  id: idColumn(),
  ...tenantColumns({ environment: true }),
  entryId: uuid('entry_id').notNull(),
  number: integer('number').notNull(),
  fields: jsonb('fields').$type<Record<string, unknown>>().notNull(),
  contentTypeVersion: integer('content_type_version').notNull(),
  restoredFrom: uuid('restored_from'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const entryPublications = contentSchema.table('entry_publications', {
  id: idColumn(),
  ...tenantColumns({ environment: true }),
  entryId: uuid('entry_id').notNull(),
  versionId: uuid('version_id'),
  action: text('action').$type<'publish' | 'unpublish'>().notNull(),
  actor: text('actor').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
})

export const entryReferences = contentSchema.table(
  'entry_references',
  {
    ...tenantColumns({ environment: true }),
    fromEntryId: uuid('from_entry_id').notNull(),
    fromVersionId: uuid('from_version_id').notNull(),
    toType: text('to_type').$type<'entry' | 'asset'>().notNull(),
    toId: uuid('to_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.fromVersionId, t.toType, t.toId] })],
)
