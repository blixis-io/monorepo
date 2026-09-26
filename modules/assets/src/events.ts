import { defineEvent } from '@blixis/contracts'
import { z } from 'zod'

const payload = z.object({
  assetId: z.string(),
  organizationId: z.string(),
  spaceId: z.string(),
  environmentId: z.string(),
  /** Storage key of the asset's current file. */
  objectKey: z.string(),
  version: z.number().int(),
})

/**
 * An upload finished: the asset is `ready`. Transactional (webhooks, search). Pending uploads
 * emit nothing.
 */
export const assetCreated = defineEvent({
  type: 'asset.created',
  version: 1,
  delivery: 'transactional',
  schema: payload,
  description: 'An asset finished uploading and is ready.',
})

/**
 * Metadata or the file changed. When the file was replaced, `replacedObjectKey` names the old
 * object, which the assets module deletes after the commit (ADR 0013 §2). Transactional.
 */
export const assetUpdated = defineEvent({
  type: 'asset.updated',
  version: 1,
  delivery: 'transactional',
  schema: payload.extend({ replacedObjectKey: z.string().optional() }),
  description: 'An asset’s metadata or file changed; `replacedObjectKey` names a replaced file.',
})

/** The asset was deleted; its object is deleted after the commit. Transactional. */
export const assetDeleted = defineEvent({
  type: 'asset.deleted',
  version: 1,
  delivery: 'transactional',
  schema: payload,
  description: 'An asset was deleted; its file is removed from storage after the commit.',
})

/** The asset became public. Transactional: delivery caches and webhooks rely on it. */
export const assetPublished = defineEvent({
  type: 'asset.published',
  version: 1,
  delivery: 'transactional',
  schema: payload,
  description: 'An asset was published.',
})

/** The asset was taken offline. Transactional. */
export const assetUnpublished = defineEvent({
  type: 'asset.unpublished',
  version: 1,
  delivery: 'transactional',
  schema: payload,
  description: 'An asset was unpublished.',
})
