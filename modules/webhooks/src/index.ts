/**
 * `@blixis/webhooks` — signed HTTP notifications of domain events to endpoints a space
 * registers (architecture §15, plan 015).
 *
 * @packageDocumentation
 */

export {
  generateWebhookKey,
  generateWebhookSecret,
  WEBHOOK_SECRET_PREFIX,
} from './application/crypto.ts'
export {
  WEBHOOK_SERVICE,
  type WebhookInput,
  type WebhookService,
  type WebhookView,
} from './application/webhook.service.ts'
export { WEBHOOK_FETCH, WEBHOOKS_CONFIG, type WebhooksConfig } from './config.ts'
export { type WebhookBody, webhookBody } from './domain/payload.ts'
export {
  DISABLE_AFTER_FAILURES,
  MAX_ATTEMPTS,
  RETRY_DELAYS_SECONDS,
} from './domain/retry.ts'
export { signWebhook, verifyWebhookSignature } from './domain/signature.ts'
export { checkWebhookUrl, MAX_URL_LENGTH } from './domain/url.ts'
export { matchesEventType, PUBLIC_WEBHOOK_EVENTS } from './domain/webhook.ts'
export { webhookDeliveryRequested, webhookDisabled } from './events.ts'
export type { SpaceTenant } from './infrastructure/webhook.repository.ts'
export { webhooksModule } from './module.ts'
export { WEBHOOK_PERMISSIONS } from './permissions.ts'
export { webhookScoped } from './rest/webhook.routes.ts'
