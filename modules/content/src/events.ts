import { defineEvent } from '@blixis/contracts'
import { z } from 'zod'

const payload = z.object({
  contentTypeId: z.string(),
  environmentId: z.string(),
  apiId: z.string(),
  kind: z.enum(['entry', 'component']),
  version: z.number().int(),
})

/** A content type or component was created. Best-effort (consumers: GraphQL schema cache, 012). */
export const contentTypeCreated = defineEvent({
  type: 'content-type.created',
  version: 1,
  delivery: 'best-effort',
  schema: payload,
  description: 'A content type or component was created.',
})

/** A content type or component changed; `version` is the new version. */
export const contentTypeUpdated = defineEvent({
  type: 'content-type.updated',
  version: 1,
  delivery: 'best-effort',
  schema: payload,
  description: 'A content type or component changed (fields, settings, names).',
})

/** A content type or component was deleted. */
export const contentTypeDeleted = defineEvent({
  type: 'content-type.deleted',
  version: 1,
  delivery: 'best-effort',
  schema: payload,
  description: 'A content type or component was deleted.',
})

const entryPayload = z.object({
  entryId: z.string(),
  environmentId: z.string(),
  contentTypeId: z.string(),
  versionId: z.string(),
})

/** An entry was created (version 1). Best-effort. */
export const entryCreated = defineEvent({
  type: 'entry.created',
  version: 1,
  delivery: 'best-effort',
  schema: entryPayload,
  description: 'An entry was created with its first draft version.',
})

/** A new draft version was saved (or restored: `restoredFrom`). Best-effort. */
export const entryUpdated = defineEvent({
  type: 'entry.updated',
  version: 1,
  delivery: 'best-effort',
  schema: entryPayload.extend({ restoredFrom: z.string().optional() }),
  description: 'A new draft version of an entry was saved or restored.',
})

/** An entry and all its versions were deleted. Transactional: caches and webhooks rely on it. */
export const entryDeleted = defineEvent({
  type: 'entry.deleted',
  version: 1,
  delivery: 'transactional',
  schema: entryPayload,
  description: 'An unpublished entry was deleted with all its versions.',
})

/** A version went live. Transactional: delivery caches and webhooks rely on it. */
export const entryPublished = defineEvent({
  type: 'entry.published',
  version: 1,
  delivery: 'transactional',
  schema: entryPayload,
  description: 'A version of an entry was published.',
})

/** An entry was taken offline. Transactional. */
export const entryUnpublished = defineEvent({
  type: 'entry.unpublished',
  version: 1,
  delivery: 'transactional',
  schema: entryPayload,
  description: 'An entry was unpublished; `versionId` is the version that was live.',
})
