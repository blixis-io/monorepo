import type { PermissionId } from '@blixis/contracts'
import { type Database, newId, type Transaction, translateDatabaseError } from '@blixis/database'
import { and, asc, eq } from 'drizzle-orm'
import type { Role } from '../domain/role.ts'
import { roles } from './schema.ts'

type Queryable = Database | Transaction
type Row = typeof roles.$inferSelect

const toRole = (row: Row): Role => ({
  id: row.id,
  organizationId: row.organizationId,
  name: row.name,
  description: row.description,
  permissions: row.permissions as PermissionId[],
  system: false,
  assignableTo: ['organization', 'space'],
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

/** Custom roles, always scoped to their organization (§31). */
export const roleRepository = {
  async listInOrganization(db: Queryable, organizationId: string): Promise<Role[]> {
    const rows = await db
      .select()
      .from(roles)
      .where(eq(roles.organizationId, organizationId))
      .orderBy(asc(roles.name))
    return rows.map(toRole)
  },
  insert(
    db: Queryable,
    values: { organizationId: string; name: string; description: string; permissions: string[] },
  ): Promise<Role> {
    return write(async () => {
      const [row] = await db
        .insert(roles)
        .values({ id: newId(), ...values })
        .returning()
      if (row === undefined) throw new Error('insert returned no row')
      return toRole(row)
    })
  },
  update(
    db: Queryable,
    organizationId: string,
    id: string,
    values: { name?: string; description?: string; permissions?: string[] },
  ): Promise<Role | undefined> {
    return write(async () => {
      const [row] = await db
        .update(roles)
        .set(values)
        .where(and(eq(roles.organizationId, organizationId), eq(roles.id, id)))
        .returning()
      return row === undefined ? undefined : toRole(row)
    })
  },
  async delete(db: Queryable, organizationId: string, id: string): Promise<boolean> {
    const rows = await db
      .delete(roles)
      .where(and(eq(roles.organizationId, organizationId), eq(roles.id, id)))
      .returning({ id: roles.id })
    return rows.length > 0
  },
}
