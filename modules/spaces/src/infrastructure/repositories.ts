import {
  type Database,
  newId,
  type Transaction,
  tenantScope,
  translateDatabaseError,
} from '@blixis/database'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Environment, Locale, Organization, Space } from '../domain/tenancy.ts'
import { environments, locales, organizations, spaces } from './schema.ts'

type Queryable = Database | Transaction
const iso = (date: Date) => date.toISOString()

const toOrganization = (row: typeof organizations.$inferSelect): Organization => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
})
const toSpace = (row: typeof spaces.$inferSelect): Space => ({
  id: row.id,
  organizationId: row.organizationId,
  name: row.name,
  slug: row.slug,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
})
const toEnvironment = (row: typeof environments.$inferSelect): Environment => ({
  id: row.id,
  organizationId: row.organizationId,
  spaceId: row.spaceId,
  key: row.key,
  isDefault: row.isDefault,
  createdAt: iso(row.createdAt),
})
const toLocale = (row: typeof locales.$inferSelect): Locale => ({
  id: row.id,
  organizationId: row.organizationId,
  spaceId: row.spaceId,
  code: row.code,
  name: row.name,
  isDefault: row.isDefault,
  fallbackCode: row.fallbackCode,
  createdAt: iso(row.createdAt),
})

/** Runs an insert/update and maps unique violations to `ConflictError` (with the constraint). */
async function write<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    throw translateDatabaseError(error)
  }
}

export const organizationRepository = {
  async findById(db: Queryable, id: string): Promise<Organization | undefined> {
    const [row] = await db.select().from(organizations).where(eq(organizations.id, id))
    return row === undefined ? undefined : toOrganization(row)
  },
  async findManyByIds(db: Queryable, ids: readonly string[]): Promise<Organization[]> {
    if (ids.length === 0) return []
    const rows = await db
      .select()
      .from(organizations)
      .where(inArray(organizations.id, [...ids]))
      .orderBy(asc(organizations.name))
    return rows.map(toOrganization)
  },
  insert(db: Queryable, values: { name: string; slug: string }): Promise<Organization> {
    return write(async () => {
      const [row] = await db
        .insert(organizations)
        .values({ id: newId(), ...values })
        .returning()
      return toOrganization(row ?? fail())
    })
  },
  update(
    db: Queryable,
    id: string,
    values: { name?: string | undefined; slug?: string | undefined },
  ): Promise<Organization | undefined> {
    return write(async () => {
      const [row] = await db
        .update(organizations)
        .set(values)
        .where(eq(organizations.id, id))
        .returning()
      return row === undefined ? undefined : toOrganization(row)
    })
  },
}

export const spaceRepository = {
  /** A space **only if** it belongs to `organizationId` (§31: never by id alone). */
  async findInOrganization(
    db: Queryable,
    organizationId: string,
    spaceId: string,
  ): Promise<Space | undefined> {
    const [row] = await db
      .select()
      .from(spaces)
      .where(and(eq(spaces.organizationId, organizationId), eq(spaces.id, spaceId)))
    return row === undefined ? undefined : toSpace(row)
  },
  /**
   * Looks a space up by id to learn its organization — for tenant resolution only (008.005),
   * which then verifies the actor's membership before anything is returned to a client.
   */
  async findForResolution(db: Queryable, spaceId: string): Promise<Space | undefined> {
    const [row] = await db.select().from(spaces).where(eq(spaces.id, spaceId))
    return row === undefined ? undefined : toSpace(row)
  },
  async listInOrganization(db: Queryable, organizationId: string): Promise<Space[]> {
    const rows = await db
      .select()
      .from(spaces)
      .where(eq(spaces.organizationId, organizationId))
      .orderBy(asc(spaces.name))
    return rows.map(toSpace)
  },
  insert(
    db: Queryable,
    values: { organizationId: string; name: string; slug: string },
  ): Promise<Space> {
    return write(async () => {
      const [row] = await db
        .insert(spaces)
        .values({ id: newId(), ...values })
        .returning()
      return toSpace(row ?? fail())
    })
  },
  /** Deletes a space with its environments and locales (tenant-scoped). `false` if not found. */
  async delete(db: Queryable, organizationId: string, spaceId: string): Promise<boolean> {
    const tenant = { organizationId, spaceId }
    await db.delete(environments).where(tenantScope(environments, tenant))
    await db.delete(locales).where(tenantScope(locales, tenant))
    const rows = await db
      .delete(spaces)
      .where(and(eq(spaces.organizationId, organizationId), eq(spaces.id, spaceId)))
      .returning({ id: spaces.id })
    return rows.length > 0
  },
  update(
    db: Queryable,
    organizationId: string,
    spaceId: string,
    values: { name?: string | undefined; slug?: string | undefined },
  ): Promise<Space | undefined> {
    return write(async () => {
      const [row] = await db
        .update(spaces)
        .set(values)
        .where(and(eq(spaces.organizationId, organizationId), eq(spaces.id, spaceId)))
        .returning()
      return row === undefined ? undefined : toSpace(row)
    })
  },
}

type Tenant = { readonly organizationId: string; readonly spaceId: string }

export const environmentRepository = {
  async list(db: Queryable, tenant: Tenant): Promise<Environment[]> {
    const rows = await db
      .select()
      .from(environments)
      .where(tenantScope(environments, tenant))
      .orderBy(asc(environments.key))
    return rows.map(toEnvironment)
  },
  insert(
    db: Queryable,
    tenant: Tenant,
    values: { key: string; isDefault: boolean },
  ): Promise<Environment> {
    return write(async () => {
      const [row] = await db
        .insert(environments)
        .values({ id: newId(), ...tenant, ...values })
        .returning()
      return toEnvironment(row ?? fail())
    })
  },
}

export const localeRepository = {
  async list(db: Queryable, tenant: Tenant): Promise<Locale[]> {
    const rows = await db
      .select()
      .from(locales)
      .where(tenantScope(locales, tenant))
      .orderBy(asc(locales.code))
    return rows.map(toLocale)
  },
  insert(
    db: Queryable,
    tenant: Tenant,
    values: { code: string; name: string; isDefault: boolean; fallbackCode: string | null },
  ): Promise<Locale> {
    return write(async () => {
      const [row] = await db
        .insert(locales)
        .values({ id: newId(), ...tenant, ...values })
        .returning()
      return toLocale(row ?? fail())
    })
  },
  async findById(db: Queryable, tenant: Tenant, id: string): Promise<Locale | undefined> {
    const [row] = await db
      .select()
      .from(locales)
      .where(and(tenantScope(locales, tenant), eq(locales.id, id)))
    return row === undefined ? undefined : toLocale(row)
  },
  async clearDefault(db: Queryable, tenant: Tenant): Promise<void> {
    await db
      .update(locales)
      .set({ isDefault: false })
      .where(and(tenantScope(locales, tenant), eq(locales.isDefault, true)))
  },
  update(
    db: Queryable,
    tenant: Tenant,
    id: string,
    values: {
      name?: string | undefined
      fallbackCode?: string | null | undefined
      isDefault?: boolean | undefined
    },
  ): Promise<Locale | undefined> {
    return write(async () => {
      const [row] = await db
        .update(locales)
        .set(values)
        .where(and(tenantScope(locales, tenant), eq(locales.id, id)))
        .returning()
      return row === undefined ? undefined : toLocale(row)
    })
  },
  async delete(db: Queryable, tenant: Tenant, id: string): Promise<void> {
    await db.delete(locales).where(and(tenantScope(locales, tenant), eq(locales.id, id)))
  },
}

function fail(): never {
  throw new Error('insert returned no row')
}
