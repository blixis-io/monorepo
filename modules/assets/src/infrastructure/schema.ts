import { idColumn, tenantColumns, timestamps } from '@blixis/database'
import { bigint, integer, jsonb, pgSchema, text, timestamp } from 'drizzle-orm/pg-core'
import type { AssetUploadStatus, LocalizedText } from '../domain/asset.ts'

export const assetsSchema = pgSchema('assets')

export const assets = assetsSchema.table('assets', {
  id: idColumn(),
  ...tenantColumns({ environment: true }),
  status: text('status').$type<AssetUploadStatus>().notNull(),
  filename: text('filename').notNull(),
  title: jsonb('title').$type<LocalizedText>().notNull().default({}),
  description: jsonb('description').$type<LocalizedText>().notNull().default({}),
  mimeType: text('mime_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  sha256: text('sha256'),
  width: integer('width'),
  height: integer('height'),
  objectKey: text('object_key').notNull(),
  version: integer('version').notNull().default(1),
  uploadId: text('upload_id'),
  uploadSize: bigint('upload_size', { mode: 'number' }),
  uploadPartSize: integer('upload_part_size'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  firstPublishedAt: timestamp('first_published_at', { withTimezone: true }),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  ...timestamps(),
})
