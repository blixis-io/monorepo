import {
  AUTHORIZATION_SERVICE,
  BLIXIS_CAPABILITIES,
  EVENT_BUS,
  type ModuleHonoEnv,
  OBJECT_STORAGE,
  subscribe,
} from '@blixis/contracts'
import { DATABASE } from '@blixis/database'
import { defineModule } from '@blixis/kernel'
import { LOCALE_SERVICE, spaceDeleted } from '@blixis/spaces'
import { Hono } from 'hono'
import { ASSET_SERVICE, createAssetService } from './application/asset.service.ts'
import { ASSETS_CONFIG, type AssetsConfig, DEFAULT_ASSETS_CONFIG } from './config.ts'
import { mediaType } from './domain/asset.ts'
import { assetRepository } from './infrastructure/asset.repository.ts'
import { createAssets } from './infrastructure/migrations/0001_create_assets.ts'
import { addUploads } from './infrastructure/migrations/0002_add_uploads.ts'
import { ASSET_PERMISSIONS } from './permissions.ts'
import { assetRoutes } from './rest/asset.routes.ts'
import { deliveryRoutes } from './rest/delivery.routes.ts'

/** Options for {@link assetsModule}; every limit has a default (ADR 0013). */
export type AssetsModuleOptions = Partial<AssetsConfig>

/**
 * Assets (architecture §17, plan 014): files in object storage (`OBJECT_STORAGE`, e.g. R2 through
 * `r2StorageModule()`), with canonical metadata in Postgres.
 */
export const assetsModule = defineModule((options: AssetsModuleOptions) => {
  const config: AssetsConfig = Object.freeze({
    maxDirectUploadBytes:
      options.maxDirectUploadBytes ?? DEFAULT_ASSETS_CONFIG.maxDirectUploadBytes,
    maxAssetBytes: options.maxAssetBytes ?? DEFAULT_ASSETS_CONFIG.maxAssetBytes,
    allowedTypes: (options.allowedTypes ?? DEFAULT_ASSETS_CONFIG.allowedTypes).map(mediaType),
    multipartPartBytes: options.multipartPartBytes ?? DEFAULT_ASSETS_CONFIG.multipartPartBytes,
    deliveryMaxAge: options.deliveryMaxAge ?? DEFAULT_ASSETS_CONFIG.deliveryMaxAge,
  })
  return {
    meta: {
      name: '@blixis/assets',
      version: '0.0.0',
      capabilities: [BLIXIS_CAPABILITIES.assets],
      requires: { '@blixis/spaces': '>=0.0.0', '@blixis/permissions': '>=0.0.0' },
      requiresCapabilities: [BLIXIS_CAPABILITIES.database, BLIXIS_CAPABILITIES.events],
    },
    permissions: Object.values(ASSET_PERMISSIONS),
    migrations: [createAssets, addUploads],
    events: [
      // Space data belongs to its modules: delete this module's rows with the space (plan 008).
      // Stored files are removed by the space cleanup of 014.006.
      subscribe(spaceDeleted, 'delete-space-assets', async ({ payload }, { services }) => {
        await assetRepository.deleteAllForSpace(
          services.get(DATABASE),
          payload.organizationId,
          payload.spaceId,
        )
      }),
    ],
    setup(ctx) {
      ctx.services.provide(ASSETS_CONFIG, config)
      ctx.services.provideFactory(
        ASSET_SERVICE,
        ({ services }) =>
          createAssetService({
            db: services.get(DATABASE),
            authz: services.get(AUTHORIZATION_SERVICE),
            events: services.get(EVENT_BUS),
            locales: services.get(LOCALE_SERVICE),
            // Resolved on first use: reading and editing metadata works without storage.
            storage: () => services.get(OBJECT_STORAGE),
            config,
          }),
        { scope: 'request' },
      )
    },
    rest: [
      { path: '/', app: new Hono<ModuleHonoEnv>().route('/', assetRoutes) },
      // Files of published assets, outside the Management API (014.004).
      { path: '/assets', root: true, app: deliveryRoutes },
    ],
  }
})
