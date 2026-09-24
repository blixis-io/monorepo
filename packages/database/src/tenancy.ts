import { ForbiddenError, type TenantContext } from '@blixis/contracts'
import { and, eq, type SQL } from 'drizzle-orm'
import { type PgColumn, uuid } from 'drizzle-orm/pg-core'

type TenantKey = keyof TenantContext

/**
 * Returns the tenant with the given keys guaranteed present (architecture §31). Fails closed:
 * throws `ForbiddenError` when the request is not scoped to them, so a service can never run an
 * unscoped query by accident.
 *
 * @example
 * const { spaceId } = requireTenant(ctx, 'organizationId', 'spaceId')
 */
export function requireTenant<K extends TenantKey>(
  context: { readonly tenant: TenantContext },
  ...keys: readonly K[]
): Required<Pick<TenantContext, K>> & TenantContext {
  const missing = keys.filter((key) => {
    const value = context.tenant[key]
    return value === undefined || value === ''
  })
  if (missing.length > 0) {
    throw new ForbiddenError(`This operation requires a ${missing.join(', ')} context`)
  }
  return context.tenant as Required<Pick<TenantContext, K>> & TenantContext
}

/**
 * Tenant columns for a module table: `organization_id` and `space_id` (both `uuid not null`),
 * plus `environment_id` when `environment: true`. Index them first in composite indexes, e.g.
 * `index().on(t.spaceId, t.createdAt)`.
 */
export function tenantColumns(): {
  organizationId: ReturnType<typeof tenantColumn>
  spaceId: ReturnType<typeof tenantColumn>
}
export function tenantColumns(options: { environment: true }): {
  organizationId: ReturnType<typeof tenantColumn>
  spaceId: ReturnType<typeof tenantColumn>
  environmentId: ReturnType<typeof tenantColumn>
}
export function tenantColumns(options: { environment?: boolean } = {}) {
  return {
    organizationId: tenantColumn('organization_id'),
    spaceId: tenantColumn('space_id'),
    ...(options.environment === true ? { environmentId: tenantColumn('environment_id') } : {}),
  }
}

function tenantColumn(name: string) {
  return uuid(name).notNull()
}

/** A table with some of the tenant columns from {@link tenantColumns}. */
export type TenantTable = { readonly [K in TenantKey]?: PgColumn }

/**
 * `WHERE` predicate restricting `table` to the tenant: one equality per tenant column the table
 * has. Fails closed with `ForbiddenError` when the tenant lacks a value for one of them.
 * Combine it with the ID lookup — never load by ID alone (§31).
 *
 * @example
 * await db.select().from(entries).where(and(tenantScope(entries, ctx.tenant), eq(entries.id, id)))
 */
export function tenantScope(table: TenantTable, tenant: TenantContext): SQL {
  const conditions: SQL[] = []
  for (const key of ['organizationId', 'spaceId', 'environmentId'] as const) {
    const column = table[key]
    if (column === undefined) continue
    const value = tenant[key]
    if (value === undefined || value === '') {
      throw new ForbiddenError(`This operation requires a ${key} context`)
    }
    conditions.push(eq(column, value))
  }
  if (conditions.length === 0) {
    throw new TypeError('tenantScope: the table has no tenant columns')
  }
  return and(...conditions) as SQL
}
