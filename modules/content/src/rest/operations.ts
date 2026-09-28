import type { RestOperation, SameShape } from '@blixis-io/contracts'
import { z } from 'zod'
import type { EntryVersionView, EntryView } from '../application/content.service.ts'
import type { ContentTypeView } from '../application/content-type.service.ts'
import { createContentTypeSchema, updateContentTypeSchema } from '../domain/content-type.ts'
import type { FieldTypeInfo } from '../field-types/define.ts'

const timestamp = z.string().describe('ISO 8601, UTC')

export const fieldTypeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    localizable: z.boolean(),
    builtIn: z.boolean(),
    settingsSchema: z.unknown().describe('JSON Schema of the type’s settings'),
  })
  .meta({ id: 'FieldType', description: 'A field type available in this app' })

export const fieldSchema = z
  .object({
    id: z.string().describe('Stable 8-character id; keys stored values'),
    apiId: z.string(),
    name: z.string(),
    type: z.string().describe('A field type id, e.g. `text`, `blocks`, `acme.color`'),
    required: z.boolean(),
    localized: z.boolean(),
    disabled: z.boolean(),
    settings: z.record(z.string(), z.unknown()),
    description: z.string().optional(),
    group: z.string().optional(),
    hidden: z.boolean().optional(),
    showWhen: z.object({ field: z.string(), equals: z.unknown() }).optional(),
  })
  .meta({ id: 'Field', description: 'A field of a content type or component' })

export const contentTypeSchema = z
  .object({
    id: z.string(),
    environmentId: z.string(),
    kind: z.enum(['entry', 'component']),
    apiId: z.string(),
    name: z.string(),
    description: z.string(),
    displayField: z.string().nullable(),
    groups: z.array(z.object({ id: z.string(), name: z.string() })),
    fields: z.array(fieldSchema),
    version: z.number().int().describe('Send it back as `version` when updating'),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .meta({ id: 'ContentType', description: 'A content type or component' })

export const entrySysSchema = z
  .object({
    id: z.string(),
    type: z.literal('entry'),
    contentType: z.object({ id: z.string(), apiId: z.string() }),
    environmentId: z.string(),
    version: z.number().int().describe('Current version number; send it back as `If-Match`'),
    fieldsVersion: z.number().int().describe('Version the fields come from'),
    status: z.enum(['draft', 'published', 'changed']),
    publishedVersionId: z.string().nullable(),
    publishedAt: z.string().nullable(),
    firstPublishedAt: z.string().nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: z.string(),
    updatedBy: z.string(),
  })
  .meta({ id: 'EntrySys', description: 'System properties of an entry' })

const fieldsSchema = z
  .record(z.string(), z.unknown())
  .describe('Field values keyed by apiId; localized fields map locale codes to values')

export const entrySchema = z
  .object({ sys: entrySysSchema, fields: fieldsSchema })
  .meta({ id: 'Entry', description: 'An entry with the fields of one version' })

export const entryVersionSchema = z
  .object({
    sys: z.object({
      id: z.string(),
      entryId: z.string(),
      number: z.number().int(),
      contentTypeVersion: z.number().int(),
      restoredFrom: z.string().nullable(),
      isCurrent: z.boolean(),
      isPublished: z.boolean(),
      createdAt: timestamp,
      createdBy: z.string(),
    }),
    fields: fieldsSchema,
  })
  .meta({ id: 'EntryVersion', description: 'One immutable version of an entry' })

const checks: [
  SameShape<z.output<typeof fieldTypeSchema>, FieldTypeInfo>,
  SameShape<z.output<typeof contentTypeSchema>, ContentTypeView>,
  SameShape<z.output<typeof entrySchema>, EntryView>,
  SameShape<z.output<typeof entryVersionSchema>, EntryVersionView>,
] = [true, true, true, true]
void checks

const includes = z
  .object({ entries: z.array(entrySchema) })
  .describe('Linked entries, with `include`')
const state = z
  .enum(['draft', 'published'])
  .optional()
  .describe('`draft` (default): latest versions; `published`: live versions only')
const ifMatch = {
  'If-Match': 'Current version of the entry, e.g. `"3"` (or `expectedVersion` in the body)',
}
const one = (description = 'OK') => ({ 200: { description, schema: entrySchema } })

/** Operations of `@blixis/content` (ADR 0015). */
export const CONTENT_OPERATIONS: readonly RestOperation[] = [
  {
    method: 'GET',
    path: '/field-types',
    id: 'listFieldTypes',
    tag: 'Content types',
    summary: 'Field types of this app, with their settings schema',
    responses: {
      200: { description: 'OK', schema: z.object({ fieldTypes: z.array(fieldTypeSchema) }) },
    },
  },
  {
    method: 'GET',
    path: '/spaces/:spaceId/content-types',
    id: 'listContentTypes',
    tag: 'Content types',
    summary: 'Content types and components',
    permission: 'content.types.read',
    request: {
      query: z.object({
        kind: z.enum(['entry', 'component']).optional(),
        environment: z.string().optional(),
      }),
    },
    responses: {
      200: { description: 'OK', schema: z.object({ contentTypes: z.array(contentTypeSchema) }) },
    },
  },
  {
    method: 'POST',
    path: '/spaces/:spaceId/content-types',
    id: 'createContentType',
    tag: 'Content types',
    summary: 'Create a content type or component',
    permission: 'content.types.write',
    request: { body: createContentTypeSchema },
    responses: { 201: { description: 'Created', schema: contentTypeSchema } },
  },
  {
    method: 'GET',
    path: '/spaces/:spaceId/content-types/:contentTypeId',
    id: 'getContentType',
    tag: 'Content types',
    summary: 'Get a content type (by id or apiId)',
    permission: 'content.types.read',
    responses: { 200: { description: 'OK', schema: contentTypeSchema } },
  },
  {
    method: 'PATCH',
    path: '/spaces/:spaceId/content-types/:contentTypeId',
    id: 'updateContentType',
    tag: 'Content types',
    summary: 'Change a content type; `fields` is the complete list',
    permission: 'content.types.write',
    request: { body: updateContentTypeSchema },
    responses: { 200: { description: 'OK', schema: contentTypeSchema } },
  },
  {
    method: 'DELETE',
    path: '/spaces/:spaceId/content-types/:contentTypeId',
    id: 'deleteContentType',
    tag: 'Content types',
    summary: 'Delete a content type without entries',
    permission: 'content.types.write',
    responses: { 204: { description: 'Deleted' } },
  },
  {
    method: 'GET',
    path: '/spaces/:spaceId/entries',
    id: 'listEntries',
    tag: 'Entries',
    summary: 'List entries, newest change first',
    description: 'Filter by field equality with `fields.<apiId>=value` (needs `contentType`).',
    permission: 'content.entries.read',
    request: {
      query: z.object({
        contentType: z.string().optional(),
        state,
        updatedSince: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
        include: z
          .number()
          .int()
          .min(0)
          .max(3)
          .optional()
          .describe('Levels of linked entries to include'),
        environment: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: 'OK',
        schema: z.object({
          entries: z.array(entrySchema),
          nextCursor: z.string().nullable(),
          includes: includes.optional(),
        }),
      },
    },
  },
  {
    method: 'POST',
    path: '/spaces/:spaceId/entries',
    id: 'createEntry',
    tag: 'Entries',
    summary: 'Create an entry (version 1, a draft)',
    permission: 'content.entries.write',
    request: {
      body: z.object({
        contentType: z.string().describe('apiId or id'),
        fields: fieldsSchema.optional(),
      }),
    },
    responses: { 201: { description: 'Created', schema: entrySchema } },
  },
  {
    method: 'GET',
    path: '/entries/:entryId',
    id: 'getEntry',
    tag: 'Entries',
    summary: 'Get an entry (current or published version)',
    permission: 'content.entries.read',
    request: { query: z.object({ state, include: z.number().int().min(0).max(3).optional() }) },
    responses: {
      200: { description: 'OK', schema: entrySchema.extend({ includes: includes.optional() }) },
    },
  },
  {
    method: 'GET',
    path: '/entries/:entryId/referrers',
    id: 'listEntryReferrers',
    tag: 'Entries',
    summary: 'Entries linking to this one',
    permission: 'content.entries.read',
    request: { query: z.object({ state }) },
    responses: { 200: { description: 'OK', schema: z.object({ entries: z.array(entrySchema) }) } },
  },
  {
    method: 'PATCH',
    path: '/entries/:entryId',
    id: 'updateEntry',
    tag: 'Entries',
    summary: 'Save a new version with the complete fields',
    permission: 'content.entries.write',
    request: {
      headers: ifMatch,
      body: z.object({ fields: fieldsSchema, expectedVersion: z.number().int().optional() }),
    },
    responses: one(),
  },
  {
    method: 'DELETE',
    path: '/entries/:entryId',
    id: 'deleteEntry',
    tag: 'Entries',
    summary: 'Delete an unpublished entry with all versions',
    permission: 'content.entries.delete',
    request: { headers: ifMatch },
    responses: { 204: { description: 'Deleted' } },
  },
  {
    method: 'POST',
    path: '/entries/:entryId/publish',
    id: 'publishEntry',
    tag: 'Entries',
    summary: 'Publish a version (default: the current one)',
    permission: 'content.entries.publish',
    request: {
      idempotent: true,
      headers: ifMatch,
      body: z.object({
        versionId: z.string().optional(),
        expectedVersion: z.number().int().optional(),
      }),
    },
    responses: one(),
  },
  {
    method: 'POST',
    path: '/entries/:entryId/unpublish',
    id: 'unpublishEntry',
    tag: 'Entries',
    summary: 'Take an entry offline (refused while published entries link to it, unless forced)',
    permission: 'content.entries.publish',
    request: { idempotent: true, body: z.object({ force: z.boolean().optional() }) },
    responses: one(),
  },
  {
    method: 'GET',
    path: '/entries/:entryId/versions',
    id: 'listEntryVersions',
    tag: 'Entries',
    summary: 'Versions, newest first',
    permission: 'content.entries.read',
    request: {
      query: z.object({
        limit: z.number().int().min(1).max(100).optional(),
        before: z.number().int().optional(),
      }),
    },
    responses: {
      200: {
        description: 'OK',
        schema: z.object({
          versions: z.array(entryVersionSchema),
          nextBefore: z.number().int().nullable(),
        }),
      },
    },
  },
  {
    method: 'GET',
    path: '/entries/:entryId/versions/:versionId',
    id: 'getEntryVersion',
    tag: 'Entries',
    summary: 'One version',
    permission: 'content.entries.read',
    responses: { 200: { description: 'OK', schema: entryVersionSchema } },
  },
  {
    method: 'POST',
    path: '/entries/:entryId/versions/:versionId/restore',
    id: 'restoreEntryVersion',
    tag: 'Entries',
    summary: 'Save an old version’s fields as a new version',
    permission: 'content.entries.write',
    request: { headers: ifMatch, body: z.object({ expectedVersion: z.number().int().optional() }) },
    responses: one(),
  },
]
