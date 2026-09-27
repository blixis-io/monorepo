import { createServiceToken, type ServiceToken } from '@blixis/contracts'

/** Deployment settings of webhooks, from the app (only platform code reads bindings, §19). */
export interface WebhooksConfig {
  /** `WEBHOOK_SECRET_KEYS`: `kid:base64key[,…]` (AES-GCM, 32 bytes). The first encrypts. */
  readonly secretKeys: string
  /**
   * Accept `http:` and private/loopback targets — local development only, so a receiver on
   * `http://localhost` works. Never in deployed environments.
   */
  readonly allowPrivateUrls: boolean
}

/**
 * The `fetch` deliveries use. Optional: without a provider, the runtime's `fetch`. Tests
 * override it with a local receiver (no network in CI).
 */
export const WEBHOOK_FETCH: ServiceToken<(request: Request) => Promise<Response>> =
  createServiceToken<(request: Request) => Promise<Response>>('@blixis/webhooks.fetch')

/** Request-scoped {@link WebhooksConfig}; the API provides it from the Worker environment. */
export const WEBHOOKS_CONFIG: ServiceToken<WebhooksConfig> =
  createServiceToken<WebhooksConfig>('@blixis/webhooks.config')
