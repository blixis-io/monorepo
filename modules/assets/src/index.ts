/**
 * `@blixis/assets` — files (images, documents, video) per space: binaries in object storage,
 * canonical metadata in Postgres (architecture §17, ADR 0013).
 *
 * @packageDocumentation
 */

export {
  ASSET_SERVICE,
  type AssetListQuery,
  type AssetService,
  type AssetView,
  type StoredFile,
} from './application/asset.service.ts'
export { ASSETS_CONFIG, type AssetsConfig, DEFAULT_ASSETS_CONFIG } from './config.ts'
export {
  type AssetStatus,
  BLOCKED_TYPES,
  DEFAULT_ALLOWED_TYPES,
  type LocalizedText,
} from './domain/asset.ts'
export {
  assetCreated,
  assetDeleted,
  assetPublished,
  assetUnpublished,
  assetUpdated,
} from './events.ts'
export type { EnvironmentTenant } from './infrastructure/asset.repository.ts'
export { type AssetsModuleOptions, assetsModule } from './module.ts'
export { ASSET_PERMISSIONS } from './permissions.ts'
