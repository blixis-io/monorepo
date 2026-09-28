import {
  ASSET_LOOKUP,
  ASSET_USAGE,
  AUTHORIZATION_SERVICE,
  BLIXIS_CAPABILITIES,
  DELIVERY_INVALIDATION,
  EVENT_BUS,
  type EventEnvelope,
  type ModuleHonoEnv,
  OBJECT_STORAGE,
  subscribe,
} from '@blixis-io/contracts'
import { DATABASE, isId } from '@blixis-io/database'
import { BACKGROUND_HANDLERS, defineModule } from '@blixis-io/kernel'
import { LOCALE_SERVICE, spaceDeleted } from '@blixis-io/spaces'
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
import { ASSET_DELIVERY_OPERATIONS, ASSET_OPERATIONS } from './rest/operations.ts'

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
    pendingTtlHours: options.pendingTtlHours ?? DEFAULT_ASSETS_CONFIG.pendingTtlHours,
    cleanupCron: options.cleanupCron ?? DEFAULT_ASSETS_CONFIG.cleanupCron,
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
      // Files go only after the metadata commit (ADR 0013 §2): deleting a missing key is a no-op,
      // so redelivered events are harmless.
      subscribe(assetDeleted, 'delete-file', async ({ payload }, { services }) => {
        await services.getOptional(OBJECT_STORAGE)?.delete(payload.objectKey)
      }),
      subscribe(assetUpdated, 'delete-replaced-file', async ({ payload }, { services }) => {
        if (payload.replacedObjectKey !== undefined)
          await services.getOptional(OBJECT_STORAGE)?.delete(payload.replacedObjectKey)
      }),
      // Every file of a deleted space, page by page (keys start with the space id).
      subscribe(spaceDeleted, 'delete-space-files', async ({ payload }, { services }) => {
        const storage = services.getOptional(OBJECT_STORAGE)
        if (storage === undefined) return
        let cursor: string | undefined
        do {
          const page = await storage.list(`${payload.spaceId}/`, {
            ...(cursor === undefined ? {} : { cursor }),
            limit: 1000,
          })
          await storage.delete(page.keys)
          cursor = page.cursor
        } while (cursor !== undefined)
      }),
      // Space data belongs to its modules: delete this module's rows with the space (plan 008).
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
      // Abandoned uploads: pending assets older than `pendingTtlHours` lose their row, their
      // multipart upload, and whatever was stored (one indexed query per run when idle).
      ctx.services.get(BACKGROUND_HANDLERS).onScheduled(config.cleanupCron, (_event, background) =>
        background
          .runInScope(
            { actor: { type: 'system', component: '@blixis/assets.cleanup' } },
            async ({ services }) => {
              const db = services.get(DATABASE)
              const stale = await assetRepository.findStalePending(db, config.pendingTtlHours, 100)
              if (stale.length === 0) return
              const storage = services.get(OBJECT_STORAGE)
              for (const asset of stale) {
                if (asset.upload !== null)
                  await storage.abortMultipart(asset.objectKey, asset.upload.id)
                await storage.delete(asset.objectKey)
                await assetRepository.deletePending(db, asset, asset.id)
              }
              background.logger.info('assets.cleanup', { removedPendingUploads: stale.length })
            },
          )
          .then(() => undefined),
      )
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
            usage: services.getOptional(ASSET_USAGE),
            config,
          }),
        { scope: 'request' },
      )
    },
    rest: [
      {
        path: '/',
        app: new Hono<ModuleHonoEnv>().route('/', assetRoutes),
        operations: ASSET_OPERATIONS,
      },
      // Files of published assets, outside the Management API (014.004).
      { path: '/assets', root: true, app: deliveryRoutes, operations: ASSET_DELIVERY_OPERATIONS },
    ],
  }
})
