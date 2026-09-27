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

/** Request-scoped {@link WebhooksConfig}; the API provides it from the Worker environment. */
export const WEBHOOKS_CONFIG: ServiceToken<WebhooksConfig> =
  createServiceToken<WebhooksConfig>('@blixis/webhooks.config')
