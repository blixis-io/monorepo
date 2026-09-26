import { createServiceToken, type ServiceToken } from '@blixis/contracts'
import { DEFAULT_ALLOWED_TYPES } from './domain/asset.ts'

/** Upload limits and file types of the app (ADR 0013), from `assetsModule()` options. */
export interface AssetsConfig {
  /** Largest file for a single-request upload. Default 90 MiB (below every plan's body limit). */
  readonly maxDirectUploadBytes: number
  /** Largest asset, also through multipart uploads. Default 1 GiB. */
  readonly maxAssetBytes: number
  /** Media types uploads may declare (lower case, without parameters). */
  readonly allowedTypes: readonly string[]
}

const MiB = 1024 * 1024

export const DEFAULT_ASSETS_CONFIG: AssetsConfig = Object.freeze({
  maxDirectUploadBytes: 90 * MiB,
  maxAssetBytes: 1024 * MiB,
  allowedTypes: DEFAULT_ALLOWED_TYPES,
})

/** The resolved {@link AssetsConfig} (app-scoped). */
export const ASSETS_CONFIG: ServiceToken<AssetsConfig> =
  createServiceToken<AssetsConfig>('@blixis/assets.config')
