import type { RestOperation, SameShape } from '@blixis/contracts'
import { z } from 'zod'
import type { AttemptView, DeliveryView, WebhookView } from '../application/webhook.service.ts'

export const webhookSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    eventTypes: z.array(z.string()).describe('Public event types, `group.*`, or `*`'),
    environmentId: z.string().nullable(),
    active: z.boolean(),
    secretHint: z.string().describe('e.g. `whsec_…a1b2`'),
    failureCount: z.number().int(),
    disabledReason: z.string().nullable(),
    version: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
    createdBy: z.string(),
    updatedBy: z.string(),
  })
  .meta({ id: 'Webhook', description: 'A webhook (never its secret)' })

export const webhookBodySchema = z
  .object({
    id: z.string().describe('Event id: deduplicate on it'),
    type: z.string(),
    version: z.number().int(),
    createdAt: z.string(),
    spaceId: z.string(),
    environmentId: z.string().nullable(),
    data: z.record(z.string(), z.unknown()),
  })
  .meta({ id: 'WebhookBody', description: 'What an endpoint receives (docs/api/webhooks.md)' })

export const deliverySchema = z
  .object({
    id: z.string().describe('Also the `Blixis-Delivery-Id` header'),
    eventId: z.string(),
    eventType: z.string(),
    status: z.enum(['pending', 'succeeded', 'failed', 'abandoned']),
    attempts: z.number().int(),
    nextAttemptAt: z.string().nullable(),
    lastStatusCode: z.number().int().nullable(),
    lastError: z.string().nullable(),
    payload: webhookBodySchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'WebhookDelivery', description: 'One event sent (or to be sent) to one webhook' })

export const attemptSchema = z
  .object({
    number: z.number().int(),
    startedAt: z.string(),
    durationMs: z.number().int(),
    statusCode: z.number().int().nullable(),
    error: z.string().nullable(),
    responseExcerpt: z.string().nullable().describe('At most the first 1 KB'),
  })
  .meta({ id: 'WebhookAttempt', description: 'One HTTP attempt of a delivery' })

const checks: [
  SameShape<z.output<typeof webhookSchema>, WebhookView>,
  SameShape<z.output<typeof deliverySchema>, DeliveryView>,
  SameShape<z.output<typeof attemptSchema>, AttemptView>,
] = [true, true, true]
void checks

const input = z.object({
  name: z.string(),
  url: z.string().describe('https:// on a public host'),
  eventTypes: z.array(z.string()),
  environmentId: z.string().nullable().optional(),
  active: z.boolean().optional(),
})
const withSecret = z.object({
  webhook: webhookSchema,
  secret: z.string().describe('`whsec_…`, shown once'),
})

/** Operations of `@blixis/webhooks` (ADR 0015). */
export const WEBHOOK_OPERATIONS: readonly RestOperation[] = [
  {
    method: 'GET',
    path: '/spaces/:spaceId/webhooks',
    id: 'listWebhooks',
    tag: 'Webhooks',
    summary: 'Webhooks of a space',
    permission: 'webhooks.read',
    responses: {
      200: { description: 'OK', schema: z.object({ webhooks: z.array(webhookSchema) }) },
    },
  },
  {
    method: 'POST',
    path: '/spaces/:spaceId/webhooks',
    id: 'createWebhook',
    tag: 'Webhooks',
    summary: 'Create a webhook; the signing secret is returned once',
    permission: 'webhooks.manage',
    request: { body: input },
    responses: { 201: { description: 'Created', schema: withSecret } },
  },
  {
    method: 'GET',
    path: '/webhooks/:webhookId',
    id: 'getWebhook',
    tag: 'Webhooks',
    summary: 'Get a webhook',
    permission: 'webhooks.read',
    responses: { 200: { description: 'OK', schema: webhookSchema } },
  },
  {
    method: 'PATCH',
    path: '/webhooks/:webhookId',
    id: 'updateWebhook',
    tag: 'Webhooks',
    summary: 'Change a webhook; `active: true` also clears failures',
    permission: 'webhooks.manage',
    request: {
      headers: { 'If-Match': 'Current version, e.g. `"2"`' },
      body: input.partial().extend({ expectedVersion: z.number().int().optional() }),
    },
    responses: { 200: { description: 'OK', schema: webhookSchema } },
  },
  {
    method: 'POST',
    path: '/webhooks/:webhookId/rotate-secret',
    id: 'rotateWebhookSecret',
    tag: 'Webhooks',
    summary: 'Replace the signing secret; the new one is returned once',
    permission: 'webhooks.manage',
    responses: { 200: { description: 'OK', schema: withSecret } },
  },
  {
    method: 'DELETE',
    path: '/webhooks/:webhookId',
    id: 'deleteWebhook',
    tag: 'Webhooks',
    summary: 'Delete a webhook and its delivery log',
    permission: 'webhooks.manage',
    responses: { 204: { description: 'Deleted' } },
  },
  {
    method: 'GET',
    path: '/webhooks/:webhookId/deliveries',
    id: 'listWebhookDeliveries',
    tag: 'Webhooks',
    summary: 'The delivery log, newest first',
    permission: 'webhooks.read',
    request: {
      query: z.object({
        status: z.enum(['pending', 'succeeded', 'failed', 'abandoned']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: 'OK',
        schema: z.object({
          deliveries: z.array(deliverySchema),
          nextCursor: z.string().nullable(),
        }),
      },
    },
  },
  {
    method: 'GET',
    path: '/webhooks/:webhookId/deliveries/:deliveryId',
    id: 'getWebhookDelivery',
    tag: 'Webhooks',
    summary: 'One delivery with every attempt',
    permission: 'webhooks.read',
    responses: {
      200: {
        description: 'OK',
        schema: deliverySchema.extend({ attemptLog: z.array(attemptSchema) }),
      },
    },
  },
  {
    method: 'POST',
    path: '/webhooks/:webhookId/deliveries/:deliveryId/redeliver',
    id: 'redeliverWebhook',
    tag: 'Webhooks',
    summary: 'Send a delivery again (same delivery id)',
    permission: 'webhooks.manage',
    request: { idempotent: true },
    responses: { 202: { description: 'Queued', schema: deliverySchema } },
  },
  {
    method: 'POST',
    path: '/webhooks/:webhookId/test',
    id: 'testWebhook',
    tag: 'Webhooks',
    summary: 'Send a signed `webhook.ping`',
    permission: 'webhooks.manage',
    responses: { 202: { description: 'Queued', schema: deliverySchema } },
  },
]
