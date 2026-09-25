import { BLIXIS_CAPABILITIES, subscribe } from '@blixis/contracts'
import { DATABASE } from '@blixis/database'
import { defineModule } from '@blixis/kernel'
import { spaceDeleted } from '@blixis/spaces'
import { contentTypeRepository } from './infrastructure/content-type.repository.ts'
import { createContentTypes } from './infrastructure/migrations/0001_create_content_types.ts'
import { CONTENT_PERMISSIONS } from './permissions.ts'

/**
 * Content (architecture §21, plans 010–011): content types and components with typed fields,
 * and — from plan 011 — entries with immutable versions.
 */
export const contentModule = defineModule({
  meta: {
    name: '@blixis/content',
    version: '0.0.0',
    capabilities: [BLIXIS_CAPABILITIES.content],
    requires: { '@blixis/spaces': '>=0.0.0', '@blixis/permissions': '>=0.0.0' },
    requiresCapabilities: [BLIXIS_CAPABILITIES.database, BLIXIS_CAPABILITIES.events],
  },
  permissions: Object.values(CONTENT_PERMISSIONS),
  migrations: [createContentTypes],
  events: [
    // Space data belongs to its modules: delete this module's rows with the space (plan 008).
    subscribe(spaceDeleted, 'delete-space-content', async ({ payload }, { services }) => {
      await contentTypeRepository.deleteAllForSpace(
        services.get(DATABASE),
        payload.organizationId,
        payload.spaceId,
      )
    }),
  ],
})
