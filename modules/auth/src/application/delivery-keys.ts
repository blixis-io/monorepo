import {
  type Actor,
  type AuthorizationService,
  actorId,
  createServiceToken,
  type DeliveryKeyActor,
  NotFoundError,
  type ServiceToken,
  UnauthorizedError,
  ValidationError,
  validate,
} from '@blixis/contracts'
import { type Database, isId, newId, tenantScope } from '@blixis/database'
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { randomBytes, sha256Hex, toBase64Url } from '../domain/encoding.ts'
import { deliveryKeys } from '../infrastructure/schema.ts'
import { AUTH_PERMISSIONS } from '../permissions.ts'

/** Key prefixes: delivery keys read published content, preview keys drafts too. */
export const DELIVERY_KEY_PREFIX = 'blx_dk_'
export const PREVIEW_KEY_PREFIX = 'blx_pk_'

/** A space tenant verified by the caller (`spaceScoped()`). */
export interface KeyTenant {
  readonly organizationId: string
  readonly spaceId: string
}

/** A delivery or preview key as listed (never the key itself). */
export interface DeliveryKeyRecord {
  readonly id: string
  readonly kind: 'delivery' | 'preview'
  readonly name: string
  /** The first characters of the key, to recognise it, e.g. `blx_dk_Ab3x`. */
  readonly prefix: string
  /** Environment ids the key may read; `null` for all. */
  readonly environmentIds: readonly string[] | null
  readonly createdBy: string
  readonly createdAt: string
  readonly lastUsedAt: string | null
}

/**
 * Delivery and preview keys of a space (plan 012.004). Managing them needs
 * `auth.deliveryKeys.manage`. Request-scoped: `services.get(DELIVERY_KEY_SERVICE)`.
 */
export interface DeliveryKeyService {
  list(actor: Actor, tenant: KeyTenant): Promise<DeliveryKeyRecord[]>
  /**
   * Creates a key; the plaintext `key` is returned **once**.
   * @throws ValidationError (e.g. environment ids not of this space)
   */
  create(
    actor: Actor,
    tenant: KeyTenant,
    input: {
      name: string
      kind: 'delivery' | 'preview'
      environmentIds?: readonly string[] | null
    },
    environmentsOfSpace: readonly string[],
  ): Promise<{ key: string; record: DeliveryKeyRecord }>
  /** @throws NotFoundError */
  revoke(actor: Actor, tenant: KeyTenant, keyId: string): Promise<void>
  /**
   * The actor for a presented key (actor resolution, before the request context exists).
   * @throws UnauthorizedError for unknown or revoked keys
   */
  authenticate(key: string): Promise<DeliveryKeyActor>
  /** Deletes every key of a space (`space.deleted`). */
  deleteAllForSpace(tenant: KeyTenant): Promise<void>
}

export const DELIVERY_KEY_SERVICE: ServiceToken<DeliveryKeyService> =
  createServiceToken<DeliveryKeyService>('@blixis/auth.delivery-keys')

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(['delivery', 'preview']),
  environmentIds: z.array(z.uuid()).max(50).nullable().optional(),
})

type Row = typeof deliveryKeys.$inferSelect
const toRecord = (row: Row): DeliveryKeyRecord => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  prefix: row.prefix,
  environmentIds: row.environmentIds,
  createdBy: row.createdBy,
  createdAt: row.createdAt.toISOString(),
  lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
})

export function createDeliveryKeyService(deps: {
  readonly db: Database
  /** Lazy: key authentication runs before the request context (and authorization) exists. */
  readonly authz: () => AuthorizationService
  readonly now: () => Date
}): DeliveryKeyService {
  const { db, now } = deps
  const requireManage = (actor: Actor, tenant: KeyTenant) =>
    deps.authz().require({
      actor,
      action: AUTH_PERMISSIONS.deliveryKeysManage.id,
      resource: { type: 'space', id: tenant.spaceId, ...tenant },
    })
  const invalid = () => new UnauthorizedError('Invalid or revoked delivery key')

  return {
    async list(actor, tenant) {
      await requireManage(actor, tenant)
      const rows = await db
        .select()
        .from(deliveryKeys)
        .where(and(tenantScope(deliveryKeys, tenant), isNull(deliveryKeys.revokedAt)))
        .orderBy(desc(deliveryKeys.createdAt))
      return rows.map(toRecord)
    },

    async create(actor, tenant, input, environmentsOfSpace) {
      await requireManage(actor, tenant)
      const values = await validate(createSchema, input, { message: 'Invalid delivery key' })
      const foreign = (values.environmentIds ?? []).filter(
        (id) => !environmentsOfSpace.includes(id),
      )
      if (foreign.length > 0)
        throw new ValidationError('Invalid delivery key', [
          {
            path: ['environmentIds'],
            message: `Not environments of this space: ${foreign.join(', ')}`,
          },
        ])
      const prefix = values.kind === 'preview' ? PREVIEW_KEY_PREFIX : DELIVERY_KEY_PREFIX
      const key = `${prefix}${toBase64Url(randomBytes(32))}`
      const [row] = await db
        .insert(deliveryKeys)
        .values({
          id: newId(),
          ...tenant,
          kind: values.kind,
          name: values.name,
          prefix: key.slice(0, prefix.length + 4),
          keyHash: await sha256Hex(key),
          environmentIds:
            values.environmentIds === undefined || values.environmentIds === null
              ? null
              : [...new Set(values.environmentIds)],
          createdBy: actorId(actor),
        })
        .returning()
      if (row === undefined) throw new Error('insert returned no row')
      return { key, record: toRecord(row) }
    },

    async revoke(actor, tenant, keyId) {
      await requireManage(actor, tenant)
      const rows = isId(keyId)
        ? await db
            .update(deliveryKeys)
            .set({ revokedAt: now() })
            .where(
              and(
                tenantScope(deliveryKeys, tenant),
                eq(deliveryKeys.id, keyId),
                isNull(deliveryKeys.revokedAt),
              ),
            )
            .returning({ id: deliveryKeys.id })
        : []
      if (rows.length === 0) throw new NotFoundError('Delivery key not found')
    },

    async authenticate(key) {
      if (!key.startsWith(DELIVERY_KEY_PREFIX) && !key.startsWith(PREVIEW_KEY_PREFIX))
        throw invalid()
      const [row] = await db
        .select()
        .from(deliveryKeys)
        .where(eq(deliveryKeys.keyHash, await sha256Hex(key)))
      if (row === undefined || row.revokedAt !== null) throw invalid()
      // Record use at most hourly: a write per request would cost more than the read.
      await db
        .update(deliveryKeys)
        .set({ lastUsedAt: now() })
        .where(
          and(
            eq(deliveryKeys.id, row.id),
            or(
              isNull(deliveryKeys.lastUsedAt),
              lt(deliveryKeys.lastUsedAt, sql`now() - interval '1 hour'`),
            ),
          ),
        )
      return {
        type: 'deliveryKey',
        keyId: row.id,
        organizationId: row.organizationId,
        spaceId: row.spaceId,
        kind: row.kind,
        environmentIds: row.environmentIds,
      }
    },

    async deleteAllForSpace(tenant) {
      await db.delete(deliveryKeys).where(tenantScope(deliveryKeys, tenant))
    },
  }
}
