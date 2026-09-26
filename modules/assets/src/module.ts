import {
  ASSET_LOOKUP,
  AUTHORIZATION_SERVICE,
  BLIXIS_CAPABILITIES,
  DELIVERY_INVALIDATION,
  EVENT_BUS,
  type EventEnvelope,
  type ModuleHonoEnv,
  OBJECT_STORAGE,
  subscribe,
} from '@blixis/contracts'
import { DATABASE, isId } from '@blixis/database'
import { defineModule } from '@blixis/kernel'
import { LOCALE_SERVICE, spaceDeleted } from '@blixis/spaces'
import { Hono } from 'hono'
import { ASSET_SERVICE, createAssetService } from './application/asset.service.ts'
import { ASSETS_CONFIG, type AssetsConfig, DEFAULT_ASSETS_CONFIG } from './config.ts'
import { assetPath, mediaType } from './domain/asset.ts'
import { assetDeleted, assetPublished, assetUnpublished, assetUpdated } from './events.ts'
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
      // Published asset data appears in delivery responses (GraphQL): tell the delivery cache.
      ...[assetPublished, assetUnpublished, assetUpdated, assetDeleted].map((event) =>
        subscribe(
          event as typeof assetPublished,
          `delivery-invalidation.${event.type}`,
          async (
            { payload }: EventEnvelope<string, { organizationId: string; spaceId: string }>,
            { services },
          ) => {
            await services.getOptional(DELIVERY_INVALIDATION)?.spaceChanged(payload)
          },
        ),
      ),
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
        ASSET_LOOKUP,
        ({ services }) => ({
          async findMany(tenant, ids) {
            const found = await assetRepository.findReadyByIds(
              services.get(DATABASE),
              tenant,
              ids.filter(isId),
            )
            return found.map((asset) => ({
              id: asset.id,
              status: asset.publishedAt === null ? ('draft' as const) : ('published' as const),
              filename: asset.filename,
              mimeType: asset.mimeType,
              size: asset.sizeBytes ?? 0,
              width: asset.width,
              height: asset.height,
              title: asset.title,
              description: asset.description,
              url: assetPath(asset),
            }))
          },
        }),
        { scope: 'request' },
      )
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
