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
  /**
   * Part size offered to multipart uploads (grown for huge files to stay within 10 000 parts).
   * Default 10 MiB; R2 needs at least 5 MiB.
   */
  readonly multipartPartBytes: number
  /**
   * `max-age` (seconds) of published files on the delivery route. URLs name an immutable file, but
   * an unpublished or deleted asset stays in browser and CDN caches this long. Default 1 day.
   */
  readonly deliveryMaxAge: number
  /** Pending uploads older than this many hours are removed by the cleanup job. Default 24. */
  readonly pendingTtlHours: number
  /** Cron trigger (as in `wrangler.jsonc`) of the cleanup job. Default `* * * * *`. */
  readonly cleanupCron: string
}

const MiB = 1024 * 1024

export const DEFAULT_ASSETS_CONFIG: AssetsConfig = Object.freeze({
  maxDirectUploadBytes: 90 * MiB,
  maxAssetBytes: 1024 * MiB,
  allowedTypes: DEFAULT_ALLOWED_TYPES,
  multipartPartBytes: 10 * MiB,
  deliveryMaxAge: 86_400,
  pendingTtlHours: 24,
  cleanupCron: '* * * * *',
})

/** The resolved {@link AssetsConfig} (app-scoped). */
export const ASSETS_CONFIG: ServiceToken<AssetsConfig> =
  createServiceToken<AssetsConfig>('@blixis/assets.config')
