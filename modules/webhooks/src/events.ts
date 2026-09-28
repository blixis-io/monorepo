import { defineEvent } from '@blixis-io/contracts'
import { z } from 'zod'

/**
 * A delivery row was created (or queued again for redelivery); the delivery consumer sends it
 * (plan 015.003). Internal: never sent to webhooks. Transactional with the row.
 */
export const webhookDeliveryRequested = defineEvent({
  type: 'webhook.delivery.requested',
  version: 1,
  delivery: 'transactional',
  schema: z.object({
    deliveryId: z.string(),
    webhookId: z.string(),
    organizationId: z.string(),
    spaceId: z.string(),
  }),
  description: 'A webhook delivery is due; the webhooks module sends it.',
})

/**
 * Blixis disabled a webhook after repeated failed deliveries (plan 015.003); an admin reactivates
 * it with `PATCH { active: true }`. Internal (notifications, audit); never sent to webhooks.
 */
export const webhookDisabled = defineEvent({
  type: 'webhook.disabled',
  version: 1,
  delivery: 'best-effort',
  schema: z.object({
    webhookId: z.string(),
    organizationId: z.string(),
    spaceId: z.string(),
    reason: z.string(),
  }),
  description: 'A webhook was disabled after repeated failed deliveries.',
})
