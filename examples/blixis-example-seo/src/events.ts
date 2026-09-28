import { entryDeleted, entryPublished } from '@blixis-io/content-api'
import { spaceDeleted, subscribe } from '@blixis-io/contracts'
import { SEO_SERVICE } from './service.ts'

/** Remembers when an entry was published (idempotent: an upsert with the event's time). */
export const onEntryPublished = subscribe(
  entryPublished,
  'record-published',
  async (envelope, ctx) => {
    const { entryId, organizationId, spaceId, environmentId } = envelope.payload
    await ctx.services
      .get(SEO_SERVICE)
      .markPublished({ organizationId, spaceId, environmentId }, entryId, envelope.timestamp)
    ctx.logger.info('seo: entry published', { entryId })
  },
)

/** Deletes the metadata of deleted entries. */
export const onEntryDeleted = subscribe(entryDeleted, 'delete-entry-seo', async (envelope, ctx) => {
  await ctx.services.get(SEO_SERVICE).deleteEntry(envelope.payload.entryId)
})

/** Deletes a space's metadata: every module that stores per-space data must (`space.deleted`). */
export const onSpaceDeleted = subscribe(spaceDeleted, 'delete-space-seo', async (envelope, ctx) => {
  await ctx.services
    .get(SEO_SERVICE)
    .deleteSpace(envelope.payload.organizationId, envelope.payload.spaceId)
})
