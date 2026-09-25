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
