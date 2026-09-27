import { type Database, newId, type Transaction } from '@blixis/database'
import { and, eq, inArray } from 'drizzle-orm'
import type { WebhookBody } from '../domain/payload.ts'
import { deliveries, webhooks } from './schema.ts'
import type { SpaceTenant } from './webhook.repository.ts'

type Queryable = Database | Transaction

/** Webhook deliveries (plan 015.002+). */
export const deliveryRepository = {
  /** Active webhooks of a space — fan-out input (platform code, no actor). */
  async activeWebhooks(db: Queryable, tenant: SpaceTenant) {
    return db
      .select({
        id: webhooks.id,
        environmentId: webhooks.onlyEnvironmentId,
        eventTypes: webhooks.eventTypes,
      })
      .from(webhooks)
      .where(
        and(
          eq(webhooks.organizationId, tenant.organizationId),
          eq(webhooks.spaceId, tenant.spaceId),
          eq(webhooks.active, true),
        ),
      )
  },

  /**
   * Creates one pending delivery per webhook for an event; pairs that exist already (a
   * redelivered event) are skipped. Returns the rows actually created.
   */
  async createForEvent(
    tx: Queryable,
    tenant: SpaceTenant,
    webhookIds: readonly string[],
    body: WebhookBody,
  ): Promise<{ id: string; webhookId: string }[]> {
    if (webhookIds.length === 0) return []
    return tx
      .insert(deliveries)
      .values(
        webhookIds.map((webhookId) => ({
          id: newId(),
          ...tenant,
          webhookId,
          eventId: body.id,
          eventType: body.type,
          payload: body as unknown as Record<string, unknown>,
          nextAttemptAt: new Date(),
        })),
      )
      .onConflictDoNothing({ target: [deliveries.webhookId, deliveries.eventId] })
      .returning({ id: deliveries.id, webhookId: deliveries.webhookId })
  },

  async findByIds(db: Queryable, ids: readonly string[]) {
    if (ids.length === 0) return []
    return db
      .select()
      .from(deliveries)
      .where(inArray(deliveries.id, [...ids]))
  },
}
