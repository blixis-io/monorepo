import { BLIXIS_CAPABILITIES, subscribe } from '@blixis/contracts'
import { DATABASE } from '@blixis/database'
import { defineModule } from '@blixis/kernel'
import { spaceDeleted } from '@blixis/spaces'
import { BUILT_IN_FIELD_TYPES } from './field-types/built-in/index.ts'
import {
  createFieldTypeRegistry,
  FIELD_TYPES,
  type FieldTypeDefinition,
} from './field-types/define.ts'
import { contentTypeRepository } from './infrastructure/content-type.repository.ts'
import { createContentTypes } from './infrastructure/migrations/0001_create_content_types.ts'
import { CONTENT_PERMISSIONS } from './permissions.ts'
import { fieldTypeRoutes } from './rest/field-types.routes.ts'

/** Options for {@link contentModule}. */
export interface ContentModuleOptions {
  /**
   * Extra field types, e.g. from other packages (`vendor.name` ids). They are available to every
   * content type of the app next to the built-in types. See the manual: *Custom field types*.
   */
  // biome-ignore lint/suspicious/noExplicitAny: settings types differ per field type
  readonly fieldTypes?: readonly FieldTypeDefinition<any>[]
}

/**
 * Content (architecture §21, plans 010–011): content types and components with typed fields,
 * and — from plan 011 — entries with immutable versions.
 */
export const contentModule = defineModule((options: ContentModuleOptions) => ({
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
  setup(ctx) {
    ctx.services.provide(
      FIELD_TYPES,
      createFieldTypeRegistry(
        BUILT_IN_FIELD_TYPES,
        (options.fieldTypes ?? []) as readonly FieldTypeDefinition<never>[],
      ),
    )
  },
  rest: { path: '/field-types', app: fieldTypeRoutes },
}))
