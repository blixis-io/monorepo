import {
  type Database,
  newId,
  type Transaction,
  tenantScope,
  translateDatabaseError,
} from '@blixis/database'
import { and, asc, count, eq } from 'drizzle-orm'
import type { ContentType, ContentTypeKind } from '../domain/content-type.ts'
import { contentTypes } from './schema.ts'

type Queryable = Database | Transaction
type Row = typeof contentTypes.$inferSelect

/** A verified environment tenant (from `spaceScoped()`). */
export interface EnvironmentTenant {
  readonly organizationId: string
  readonly spaceId: string
  readonly environmentId: string
}

const toContentType = (row: Row): ContentType => ({
  id: row.id,
  organizationId: row.organizationId,
  spaceId: row.spaceId,
  environmentId: row.environmentId,
  kind: row.kind,
  apiId: row.apiId,
  name: row.name,
  description: row.description,
  displayFieldId: row.displayFieldId,
  groups: row.groups,
  fields: row.fields,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

async function write<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    throw translateDatabaseError(error)
  }
}

type Values = Pick<
  ContentType,
  'kind' | 'apiId' | 'name' | 'description' | 'displayFieldId' | 'groups' | 'fields'
>

/** Content types, always scoped to their environment tenant (§31). */
export const contentTypeRepository = {
  async list(db: Queryable, tenant: EnvironmentTenant, kind?: ContentTypeKind) {
    const rows = await db
      .select()
      .from(contentTypes)
      .where(
        kind === undefined
          ? tenantScope(contentTypes, tenant)
          : and(tenantScope(contentTypes, tenant), eq(contentTypes.kind, kind)),
      )
      .orderBy(asc(contentTypes.name))
    return rows.map(toContentType)
  },

  async findById(db: Queryable, tenant: EnvironmentTenant, id: string) {
    const [row] = await db
      .select()
      .from(contentTypes)
      .where(and(tenantScope(contentTypes, tenant), eq(contentTypes.id, id)))
    return row === undefined ? undefined : toContentType(row)
  },

  async count(db: Queryable, tenant: EnvironmentTenant): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(contentTypes)
      .where(tenantScope(contentTypes, tenant))
    return row?.n ?? 0
  },

  insert(db: Queryable, tenant: EnvironmentTenant, values: Values): Promise<ContentType> {
    return write(async () => {
      const [row] = await db
        .insert(contentTypes)
        .values({
          id: newId(),
          ...tenant,
          ...values,
          groups: [...values.groups],
          fields: [...values.fields],
        })
        .returning()
      if (row === undefined) throw new Error('insert returned no row')
      return toContentType(row)
    })
  },

  /** Updates only if the stored version is still `expectedVersion`; `undefined` otherwise. */
  update(
    db: Queryable,
    tenant: EnvironmentTenant,
    id: string,
    expectedVersion: number,
    values: Values,
  ): Promise<ContentType | undefined> {
    return write(async () => {
      const [row] = await db
        .update(contentTypes)
        .set({
          ...values,
          groups: [...values.groups],
          fields: [...values.fields],
          version: expectedVersion + 1,
        })
        .where(
          and(
            tenantScope(contentTypes, tenant),
            eq(contentTypes.id, id),
            eq(contentTypes.version, expectedVersion),
          ),
        )
        .returning()
      return row === undefined ? undefined : toContentType(row)
    })
  },

  async delete(db: Queryable, tenant: EnvironmentTenant, id: string): Promise<boolean> {
    const rows = await db
      .delete(contentTypes)
      .where(and(tenantScope(contentTypes, tenant), eq(contentTypes.id, id)))
      .returning({ id: contentTypes.id })
    return rows.length > 0
  },

  /** Removes every content type of a space (`space.deleted`). */
  async deleteAllForSpace(db: Queryable, organizationId: string, spaceId: string) {
    await db
      .delete(contentTypes)
      .where(
        and(eq(contentTypes.organizationId, organizationId), eq(contentTypes.spaceId, spaceId)),
      )
  },
}
