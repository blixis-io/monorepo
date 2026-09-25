import {
  AUTHORIZATION_SERVICE,
  BLIXIS_CAPABILITIES,
  EVENT_BUS,
  type ModuleHonoEnv,
  subscribe,
} from '@blixis/contracts'
import { DATABASE } from '@blixis/database'
import { defineModule } from '@blixis/kernel'
import { spaceDeleted } from '@blixis/spaces'
import { Hono } from 'hono'
import {
  CONTENT_TYPE_SERVICE,
  createContentTypeService,
  ENTRY_USAGE,
} from './application/content-type.service.ts'
import { BUILT_IN_FIELD_TYPES } from './field-types/built-in/index.ts'
import {
  createFieldTypeRegistry,
  FIELD_TYPES,
  type FieldTypeDefinition,
} from './field-types/define.ts'
import { contentTypeRepository } from './infrastructure/content-type.repository.ts'
import { createContentTypes } from './infrastructure/migrations/0001_create_content_types.ts'
import { CONTENT_PERMISSIONS } from './permissions.ts'
import { contentTypeRoutes } from './rest/content-type.routes.ts'
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
    const registry = createFieldTypeRegistry(
      BUILT_IN_FIELD_TYPES,
      (options.fieldTypes ?? []) as readonly FieldTypeDefinition<never>[],
    )
    ctx.services.provide(FIELD_TYPES, registry)
    ctx.services.provideFactory(
      CONTENT_TYPE_SERVICE,
      ({ services }) =>
        createContentTypeService({
          db: services.get(DATABASE),
          authz: services.get(AUTHORIZATION_SERVICE),
          events: services.get(EVENT_BUS),
          registry,
          entryUsage: services.get(ENTRY_USAGE),
        }),
      { scope: 'request' },
    )
    // TODO(011.001): count entries once the entries table exists; no entries exist before 011.
    ctx.services.provideFactory(ENTRY_USAGE, () => async () => 0, { scope: 'request' })
  },
  rest: {
    path: '/',
    app: new Hono<ModuleHonoEnv>().route('/', fieldTypeRoutes).route('/', contentTypeRoutes),
  },
}))
