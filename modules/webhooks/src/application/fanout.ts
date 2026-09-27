import type { EventBus, EventEnvelope } from '@blixis/contracts'
import { type Database, toTransactionScope, withTransaction } from '@blixis/database'
import { webhookBody } from '../domain/payload.ts'
import { matchesEventType } from '../domain/webhook.ts'
import { webhookDeliveryRequested } from '../events.ts'
import { deliveryRepository } from '../infrastructure/delivery.repository.ts'

/**
 * Turns one domain event into pending deliveries for every matching active webhook of its space
 * (plan 015.002), and requests each delivery in the same transaction. Idempotent: a redelivered
 * event finds its rows and requests nothing again.
 */
export async function fanOut(
  deps: { readonly db: Database; readonly events: EventBus },
  envelope: EventEnvelope,
): Promise<number> {
  const payload = (envelope.payload ?? {}) as Record<string, unknown>
  const organizationId = String(payload['organizationId'] ?? envelope.tenantId ?? '')
  const spaceId = String(payload['spaceId'] ?? envelope.spaceId ?? '')
  if (organizationId === '' || spaceId === '') return 0
  const tenant = { organizationId, spaceId }
  const environmentId = payload['environmentId']
  const matching = (await deliveryRepository.activeWebhooks(deps.db, tenant)).filter(
    (webhook) =>
      (webhook.environmentId === null || webhook.environmentId === environmentId) &&
      webhook.eventTypes.some((pattern) => matchesEventType(pattern, envelope.type)),
  )
  if (matching.length === 0) return 0
  const body = webhookBody(envelope)
  return withTransaction(deps.db, async (tx) => {
    const created = await deliveryRepository.createForEvent(
      tx,
      tenant,
      matching.map((w) => w.id),
      body,
    )
    for (const delivery of created)
      await deps.events.emit(
        webhookDeliveryRequested,
        { deliveryId: delivery.id, webhookId: delivery.webhookId, ...tenant },
        { transaction: toTransactionScope(tx) },
      )
    return created.length
  })
}
