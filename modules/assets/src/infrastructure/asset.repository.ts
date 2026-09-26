import { type Database, type Transaction, tenantScope } from '@blixis/database'
import { and, desc, eq, isNotNull, isNull, like, lt, type SQL, sql } from 'drizzle-orm'
import type { Asset, AssetUploadStatus, LocalizedText } from '../domain/asset.ts'
import { assets } from './schema.ts'

type Queryable = Database | Transaction
const iso = (d: Date | null) => (d === null ? null : d.toISOString())

/** A verified environment tenant (from `spaceScoped()` or `ASSET_SERVICE.resolveTenant`). */
export interface EnvironmentTenant {
  readonly organizationId: string
  readonly spaceId: string
  readonly environmentId: string
}

const toAsset = (row: typeof assets.$inferSelect): Asset => ({
  id: row.id,
  organizationId: row.organizationId,
  spaceId: row.spaceId,
  environmentId: row.environmentId,
  status: row.status,
  filename: row.filename,
  title: row.title,
  description: row.description,
  mimeType: row.mimeType,
  sizeBytes: row.sizeBytes,
  sha256: row.sha256,
  width: row.width,
  height: row.height,
  objectKey: row.objectKey,
  version: row.version,
  publishedAt: iso(row.publishedAt),
  firstPublishedAt: iso(row.firstPublishedAt),
  createdBy: row.createdBy,
  updatedBy: row.updatedBy,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

const one = <T>(rows: T[]): T | undefined => rows[0]

/** Assets, always scoped to their environment tenant (§31). */
export const assetRepository = {
  async insertPending(
    tx: Queryable,
    tenant: EnvironmentTenant,
    values: {
      id: string
      filename: string
      mimeType: string
      title: LocalizedText
      description: LocalizedText
      objectKey: string
      actor: string
    },
  ): Promise<Asset> {
    const row = one(
      await tx
        .insert(assets)
        .values({
          id: values.id,
          ...tenant,
          status: 'pending',
          filename: values.filename,
          mimeType: values.mimeType,
          title: values.title,
          description: values.description,
          objectKey: values.objectKey,
          createdBy: values.actor,
          updatedBy: values.actor,
        })
        .returning(),
    )
    if (row === undefined) throw new Error('insert returned no row')
    return toAsset(row)
  },

  async findById(db: Queryable, tenant: EnvironmentTenant, id: string) {
    const row = one(
      await db
        .select()
        .from(assets)
        .where(and(tenantScope(assets, tenant), eq(assets.id, id))),
    )
    return row === undefined ? undefined : toAsset(row)
  },

  /** Tenant of an asset for asset-id routes — the caller authorizes before using it. */
  async findForResolution(db: Queryable, id: string) {
    const row = one(
      await db
        .select({
          organizationId: assets.organizationId,
          spaceId: assets.spaceId,
          environmentId: assets.environmentId,
        })
        .from(assets)
        .where(eq(assets.id, id)),
    )
    return row
  },

  /** Newest first (UUIDv7 ids are creation-ordered); `before` is the last id of the previous page. */
  async list(
    db: Queryable,
    tenant: EnvironmentTenant,
    query: {
      status?: AssetUploadStatus | undefined
      published?: boolean | undefined
      mimePrefix?: string | undefined
      before?: string | undefined
      limit: number
    },
  ): Promise<Asset[]> {
    const conditions: (SQL | undefined)[] = [
      tenantScope(assets, tenant),
      query.status === undefined ? undefined : eq(assets.status, query.status),
      query.published === undefined
        ? undefined
        : query.published
          ? isNotNull(assets.publishedAt)
          : isNull(assets.publishedAt),
      query.mimePrefix === undefined
        ? undefined
        : like(assets.mimeType, `${query.mimePrefix.replace(/[\\%_]/g, '\\$&')}%`),
      query.before === undefined ? undefined : lt(assets.id, query.before),
    ]
    const rows = await db
      .select()
      .from(assets)
      .where(and(...conditions))
      .orderBy(desc(assets.id))
      .limit(query.limit)
    return rows.map(toAsset)
  },

  /** `pending` → `ready` with the stored file's facts; `undefined` if not pending (any more). */
  async markReady(
    tx: Queryable,
    tenant: EnvironmentTenant,
    id: string,
    file: {
      sizeBytes: number
      sha256: string | null
      width: number | null
      height: number | null
      actor: string
    },
  ) {
    const row = one(
      await tx
        .update(assets)
        .set({
          status: 'ready',
          sizeBytes: file.sizeBytes,
          sha256: file.sha256,
          width: file.width,
          height: file.height,
          updatedBy: file.actor,
        })
        .where(and(tenantScope(assets, tenant), eq(assets.id, id), eq(assets.status, 'pending')))
        .returning(),
    )
    return row === undefined ? undefined : toAsset(row)
  },

  /** Updates when `expectedVersion` is current; `undefined` otherwise (stale or missing). */
  async update(
    tx: Queryable,
    tenant: EnvironmentTenant,
    id: string,
    expectedVersion: number,
    values: Partial<{
      filename: string
      title: LocalizedText
      description: LocalizedText
      mimeType: string
      objectKey: string
      sizeBytes: number
      sha256: string | null
      width: number | null
      height: number | null
    }> & { actor: string },
  ) {
    const { actor, ...changes } = values
    const row = one(
      await tx
        .update(assets)
        .set({ ...changes, version: expectedVersion + 1, updatedBy: actor })
        .where(
          and(tenantScope(assets, tenant), eq(assets.id, id), eq(assets.version, expectedVersion)),
        )
        .returning(),
    )
    return row === undefined ? undefined : toAsset(row)
  },

  async setPublished(
    tx: Queryable,
    tenant: EnvironmentTenant,
    id: string,
    published: boolean,
    actor: string,
  ) {
    const row = one(
      await tx
        .update(assets)
        .set(
          published
            ? {
                publishedAt: sql`now()`,
                firstPublishedAt: sql`coalesce(${assets.firstPublishedAt}, now())`,
                updatedBy: actor,
              }
            : { publishedAt: null, updatedBy: actor },
        )
        .where(and(tenantScope(assets, tenant), eq(assets.id, id)))
        .returning(),
    )
    return row === undefined ? undefined : toAsset(row)
  },

  async delete(tx: Queryable, tenant: EnvironmentTenant, id: string): Promise<boolean> {
    const rows = await tx
      .delete(assets)
      .where(and(tenantScope(assets, tenant), eq(assets.id, id)))
      .returning({ id: assets.id })
    return rows.length > 0
  },

  async deleteAllForSpace(db: Queryable, organizationId: string, spaceId: string) {
    await db.delete(assets).where(tenantScope(assets, { organizationId, spaceId }))
  },
}
