import { createServiceToken, type ServiceToken } from './services.ts'

/** An environment tenant (organization, space, environment). */
interface EnvironmentRef {
  readonly organizationId: string
  readonly spaceId: string
  readonly environmentId: string
}

/** What other modules may know about an asset (plan 014.005): enough to link and render it. */
export interface AssetSummary {
  readonly id: string
  readonly status: 'draft' | 'published'
  readonly filename: string
  readonly mimeType: string
  readonly size: number
  readonly width: number | null
  readonly height: number | null
  /** Text per locale code. */
  readonly title: Readonly<Record<string, string>>
  readonly description: Readonly<Record<string, string>>
  /** Path of the file on the delivery route, relative to the API origin. */
  readonly url: string
}

/**
 * Looks up assets of an environment for platform code — content link validation and delivery —
 * without authorization (the caller authorizes its own request). Provided by `@blixis/assets`
 * (capability `blixis.assets`); optional: `services.getOptional(ASSET_LOOKUP)`.
 */
export interface AssetLookup {
  /** The uploaded (not pending) assets among `ids`; unknown ids are left out. */
  findMany(tenant: EnvironmentRef, ids: readonly string[]): Promise<AssetSummary[]>
}

export const ASSET_LOOKUP: ServiceToken<AssetLookup> = createServiceToken<AssetLookup>(
  '@blixis/contracts.asset-lookup',
)

/**
 * Tells the delivery layer that published data of a space changed outside content itself (e.g.
 * an asset was published), so cached delivery responses must not be served any more (ADR 0012).
 * Provided by `@blixis/content`; optional for callers.
 */
export interface DeliveryInvalidation {
  spaceChanged(tenant: { readonly organizationId: string; readonly spaceId: string }): Promise<void>
}

export const DELIVERY_INVALIDATION: ServiceToken<DeliveryInvalidation> =
  createServiceToken<DeliveryInvalidation>('@blixis/contracts.delivery-invalidation')
