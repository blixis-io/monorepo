import { defineEvent } from '@blixis/contracts'
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
