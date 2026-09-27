import { type Database, type Transaction, tenantScope } from '@blixis/database'
import { and, asc, eq } from 'drizzle-orm'
import type { Webhook } from '../domain/webhook.ts'
import { webhooks } from './schema.ts'

type Queryable = Database | Transaction

/** A verified space tenant (from `spaceScoped()` or `WEBHOOK_SERVICE.resolveTenant`). */
export interface SpaceTenant {
  readonly organizationId: string
  readonly spaceId: string
}

const toWebhook = (row: typeof webhooks.$inferSelect): Webhook => ({
  id: row.id,
  organizationId: row.organizationId,
  spaceId: row.spaceId,
  environmentId: row.onlyEnvironmentId,
  name: row.name,
  url: row.url,
  eventTypes: row.eventTypes,
  secretEncrypted: row.secretEncrypted,
  secretHint: row.secretHint,
  active: row.active,
  failureCount: row.failureCount,
  disabledReason: row.disabledReason,
  version: row.version,
  createdBy: row.createdBy,
  updatedBy: row.updatedBy,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

const one = <T>(rows: T[]) => rows[0]

/** Changeable properties of a webhook. */
export type WebhookValues = Partial<{
  name: string
  url: string
  eventTypes: string[]
  environmentId: string | null
  active: boolean
  failureCount: number
  disabledReason: string | null
  secretEncrypted: string
  secretHint: string
}>

/** Webhooks, always scoped to their space (§31). */
export const webhookRepository = {
  async insert(
    db: Queryable,
    tenant: SpaceTenant,
    values: Required<
      Pick<
        WebhookValues,
        | 'name'
        | 'url'
        | 'eventTypes'
        | 'environmentId'
        | 'active'
        | 'secretEncrypted'
        | 'secretHint'
      >
    > & {
      id: string
      actor: string
    },
  ): Promise<Webhook> {
    const row = one(
      await db
        .insert(webhooks)
        .values({
          id: values.id,
          ...tenant,
          onlyEnvironmentId: values.environmentId,
          name: values.name,
          url: values.url,
          eventTypes: values.eventTypes,
          active: values.active,
          secretEncrypted: values.secretEncrypted,
          secretHint: values.secretHint,
          createdBy: values.actor,
          updatedBy: values.actor,
        })
        .returning(),
    )
    if (row === undefined) throw new Error('insert returned no row')
    return toWebhook(row)
  },

  async list(db: Queryable, tenant: SpaceTenant) {
    const rows = await db
      .select()
      .from(webhooks)
      .where(tenantScope(webhooks, tenant))
      .orderBy(asc(webhooks.createdAt), asc(webhooks.id))
    return rows.map(toWebhook)
  },

  async findById(db: Queryable, tenant: SpaceTenant, id: string) {
    const row = one(
      await db
        .select()
        .from(webhooks)
        .where(and(tenantScope(webhooks, tenant), eq(webhooks.id, id))),
    )
    return row === undefined ? undefined : toWebhook(row)
  },

  /** Tenant of a webhook for webhook-id routes — the caller authorizes before using it. */
  async findForResolution(db: Queryable, id: string) {
    return one(
      await db
        .select({ organizationId: webhooks.organizationId, spaceId: webhooks.spaceId })
        .from(webhooks)
        .where(eq(webhooks.id, id)),
    )
  },

  /** Updates when `expectedVersion` is current (or always, without one); `undefined` otherwise. */
  async update(
    db: Queryable,
    tenant: SpaceTenant,
    id: string,
    expectedVersion: number | undefined,
    values: WebhookValues & { actor: string },
  ) {
    const { actor, environmentId, ...rest } = values
    const row = one(
      await db
        .update(webhooks)
        .set({
          ...rest,
          ...(environmentId === undefined ? {} : { onlyEnvironmentId: environmentId }),
          version: expectedVersion === undefined ? undefined : expectedVersion + 1,
          updatedBy: actor,
        })
        .where(
          and(
            tenantScope(webhooks, tenant),
            eq(webhooks.id, id),
            ...(expectedVersion === undefined ? [] : [eq(webhooks.version, expectedVersion)]),
          ),
        )
        .returning(),
    )
    return row === undefined ? undefined : toWebhook(row)
  },

  async delete(db: Queryable, tenant: SpaceTenant, id: string): Promise<boolean> {
    const rows = await db
      .delete(webhooks)
      .where(and(tenantScope(webhooks, tenant), eq(webhooks.id, id)))
      .returning({ id: webhooks.id })
    return rows.length > 0
  },

  async deleteAllForSpace(db: Queryable, tenant: SpaceTenant) {
    await db.delete(webhooks).where(tenantScope(webhooks, tenant))
  },
}
