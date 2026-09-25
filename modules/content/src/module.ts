import {
  AUTHORIZATION_SERVICE,
  BLIXIS_CAPABILITIES,
  EVENT_BUS,
  type ModuleHonoEnv,
  subscribe,
} from '@blixis/contracts'
import { DATABASE } from '@blixis/database'
import { defineModule } from '@blixis/kernel'
import { LOCALE_SERVICE, spaceDeleted } from '@blixis/spaces'
import { Hono } from 'hono'
import { CONTENT_SERVICE, createContentService } from './application/content.service.ts'
import {
  CONTENT_TYPE_SERVICE,
  createContentTypeService,
  ENTRY_USAGE,
} from './application/content-type.service.ts'
import { createEntrySchemaCache } from './application/entry-schema.ts'
import { BUILT_IN_FIELD_TYPES } from './field-types/built-in/index.ts'
import {
  createFieldTypeRegistry,
  FIELD_TYPES,
  type FieldTypeDefinition,
} from './field-types/define.ts'
import { contentTypeRepository } from './infrastructure/content-type.repository.ts'
import { entryRepository } from './infrastructure/entry.repository.ts'
import { createContentTypes } from './infrastructure/migrations/0001_create_content_types.ts'
import { createEntries } from './infrastructure/migrations/0002_create_entries.ts'
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
  migrations: [createContentTypes, createEntries],
  events: [
    // Space data belongs to its modules: delete this module's rows with the space (plan 008).
    subscribe(spaceDeleted, 'delete-space-content', async ({ payload }, { services }) => {
      const db = services.get(DATABASE)
      // Entries first: they reference content types.
      await entryRepository.deleteAllForSpace(db, payload.organizationId, payload.spaceId)
      await contentTypeRepository.deleteAllForSpace(db, payload.organizationId, payload.spaceId)
    }),
  ],
  setup(ctx) {
    const registry = createFieldTypeRegistry(
      BUILT_IN_FIELD_TYPES,
      (options.fieldTypes ?? []) as readonly FieldTypeDefinition<never>[],
    )
    ctx.services.provide(FIELD_TYPES, registry)
    // Compiled entry validators are pure data: one isolate-level cache (010.004).
    const schemas = createEntrySchemaCache()
    ctx.services.provideFactory(
      CONTENT_SERVICE,
      ({ services }) =>
        createContentService({
          db: services.get(DATABASE),
          authz: services.get(AUTHORIZATION_SERVICE),
          events: services.get(EVENT_BUS),
          registry,
          schemas,
          locales: services.get(LOCALE_SERVICE),
        }),
      { scope: 'request' },
    )
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
    ctx.services.provideFactory(
      ENTRY_USAGE,
      ({ services }) => {
        const db = services.get(DATABASE)
        return async (tenant, contentTypeId) => {
          const type = await contentTypeRepository.findById(db, tenant, contentTypeId)
          if (type === undefined) return 0
          return type.kind === 'component'
            ? entryRepository.countContainingComponent(db, tenant, contentTypeId)
            : entryRepository.countByContentType(db, tenant, contentTypeId)
        }
      },
      { scope: 'request' },
    )
  },
  rest: {
    path: '/',
    app: new Hono<ModuleHonoEnv>().route('/', fieldTypeRoutes).route('/', contentTypeRoutes),
  },
}))
