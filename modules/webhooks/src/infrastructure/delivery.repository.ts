import { type Database, newId, type Transaction } from '@blixis-io/database'
import { and, asc, desc, eq, inArray, lt, lte, ne, sql } from 'drizzle-orm'
import type { WebhookBody } from '../domain/payload.ts'
import { attempts, type DeliveryStatus, deliveries, webhooks } from './schema.ts'
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
          nextAttemptAt: sql`now()`,
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

  /**
   * Claims a due pending delivery for one attempt: bumps `attempts` and leases it for
   * `leaseSeconds`, so a concurrent consumer or sweep can't send it at the same time. Returns
   * the delivery with its webhook, or `undefined` when it isn't due (or not pending).
   */
  async claim(db: Queryable, id: string, leaseSeconds: number) {
    const [row] = await db
      .update(deliveries)
      .set({
        attempts: sql`${deliveries.attempts} + 1`,
        nextAttemptAt: sql`now() + make_interval(secs => ${leaseSeconds})`,
      })
      .where(
        and(
          eq(deliveries.id, id),
          eq(deliveries.status, 'pending'),
          lte(deliveries.nextAttemptAt, sql`now()`),
        ),
      )
      .returning()
    if (row === undefined) return undefined
    const [webhook] = await db.select().from(webhooks).where(eq(webhooks.id, row.webhookId))
    return webhook === undefined ? undefined : { delivery: row, webhook }
  },

  /** Records the result of an attempt. */
  async finish(
    db: Queryable,
    id: string,
    result: {
      status: DeliveryStatus
      nextAttemptAt: Date | null
      statusCode: number | null
      error: string | null
    },
  ) {
    await db
      .update(deliveries)
      .set({
        status: result.status,
        nextAttemptAt: result.nextAttemptAt,
        lastStatusCode: result.statusCode,
        lastError: result.error,
      })
      .where(eq(deliveries.id, id))
  },

  async insertAttempt(db: Queryable, values: typeof attempts.$inferInsert) {
    await db.insert(attempts).values(values)
  },

  /** Ids of pending deliveries whose next attempt is due, oldest first (the retry sweep). */
  async due(db: Queryable, limit: number): Promise<string[]> {
    const rows = await db
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(and(eq(deliveries.status, 'pending'), lte(deliveries.nextAttemptAt, sql`now()`)))
      .orderBy(asc(deliveries.nextAttemptAt))
      .limit(limit)
    return rows.map((r) => r.id)
  },

  /** Counts a failed attempt; returns the webhook's new consecutive failure count. */
  async countFailure(db: Queryable, webhookId: string): Promise<number> {
    const [row] = await db
      .update(webhooks)
      .set({ failureCount: sql`${webhooks.failureCount} + 1` })
      .where(eq(webhooks.id, webhookId))
      .returning({ failureCount: webhooks.failureCount })
    return row?.failureCount ?? 0
  },

  async resetFailures(db: Queryable, webhookId: string) {
    await db
      .update(webhooks)
      .set({ failureCount: 0 })
      .where(and(eq(webhooks.id, webhookId), sql`${webhooks.failureCount} <> 0`))
  },

  /** Disables an active webhook; `false` if it was inactive already. */
  async disable(db: Queryable, webhookId: string, reason: string): Promise<boolean> {
    const rows = await db
      .update(webhooks)
      .set({ active: false, disabledReason: reason })
      .where(and(eq(webhooks.id, webhookId), eq(webhooks.active, true)))
      .returning({ id: webhooks.id })
    return rows.length > 0
  },

  /** Deliveries of one webhook, newest first (UUIDv7 ids); `before` is the previous page's last id. */
  async listForWebhook(
    db: Queryable,
    tenant: SpaceTenant,
    webhookId: string,
    query: { status?: DeliveryStatus | undefined; before?: string | undefined; limit: number },
  ) {
    return db
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.organizationId, tenant.organizationId),
          eq(deliveries.spaceId, tenant.spaceId),
          eq(deliveries.webhookId, webhookId),
          query.status === undefined ? undefined : eq(deliveries.status, query.status),
          query.before === undefined ? undefined : lt(deliveries.id, query.before),
        ),
      )
      .orderBy(desc(deliveries.id))
      .limit(query.limit)
  },

  async findForWebhook(db: Queryable, tenant: SpaceTenant, webhookId: string, id: string) {
    const [row] = await db
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.organizationId, tenant.organizationId),
          eq(deliveries.spaceId, tenant.spaceId),
          eq(deliveries.webhookId, webhookId),
          eq(deliveries.id, id),
        ),
      )
    return row
  },

  async attemptsOf(db: Queryable, deliveryId: string) {
    return db
      .select()
      .from(attempts)
      .where(eq(attempts.deliveryId, deliveryId))
      .orderBy(asc(attempts.number))
  },

  /** Makes a delivery due again (redelivery): pending, next attempt now. */
  async requeue(db: Queryable, id: string) {
    const [row] = await db
      .update(deliveries)
      .set({ status: 'pending', nextAttemptAt: sql`now()` })
      .where(eq(deliveries.id, id))
      .returning()
    return row
  },

  /** Deletes finished deliveries (and their attempts) older than `days`. Returns the count. */
  async deleteOlderThan(db: Queryable, days: number): Promise<number> {
    const rows = await db
      .delete(deliveries)
      .where(
        and(
          ne(deliveries.status, 'pending'),
          lt(deliveries.createdAt, sql`now() - make_interval(days => ${days})`),
        ),
      )
      .returning({ id: deliveries.id })
    return rows.length
  },
}
