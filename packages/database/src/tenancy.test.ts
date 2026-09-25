import { ForbiddenError } from '@blixis/contracts'
import { PgDialect, pgSchema, text } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { idColumn, timestamps } from './ids.ts'
import { requireTenant, type TenantTable, tenantColumns, tenantScope } from './tenancy.ts'

const content = pgSchema('content')
const entries = content.table('entries', {
  id: idColumn(),
  ...tenantColumns(),
  title: text('title').notNull(),
  ...timestamps(),
})
const variants = content.table('variants', {
  id: idColumn(),
  ...tenantColumns({ environment: true }),
})
const global = content.table('global', { id: idColumn() })
const render = (sql: ReturnType<typeof tenantScope>) => new PgDialect().sqlToQuery(sql)

describe('requireTenant', () => {
  it('returns the tenant when the required keys are present', () => {
    const tenant = { organizationId: 'o1', spaceId: 's1' }
    expect(requireTenant({ tenant }, 'organizationId', 'spaceId').spaceId).toBe('s1')
  })

  it('fails closed with ForbiddenError naming what is missing', () => {
    expect(() => requireTenant({ tenant: { organizationId: 'o1' } }, 'spaceId')).toThrowError(
      new ForbiddenError('This operation requires a spaceId context'),
    )
    expect(() => requireTenant({ tenant: { spaceId: '' } }, 'spaceId')).toThrow(ForbiddenError)
  })
})

describe('tenantScope', () => {
  it('builds one equality per tenant column of the table', () => {
    const query = render(tenantScope(entries, { organizationId: 'o1', spaceId: 's1' }))
    expect(query.sql).toBe(
      '("content"."entries"."organization_id" = $1 and "content"."entries"."space_id" = $2)',
    )
    expect(query.params).toEqual(['o1', 's1'])
    const withEnv = render(
      tenantScope(variants, { organizationId: 'o1', spaceId: 's1', environmentId: 'e1' }),
    )
    expect(withEnv.params).toEqual(['o1', 's1', 'e1'])
  })

  it('fails closed when the tenant lacks a value the table needs', () => {
    expect(() => tenantScope(entries, { organizationId: 'o1' })).toThrow(ForbiddenError)
    expect(() => tenantScope(variants, { organizationId: 'o1', spaceId: 's1' })).toThrowError(
      /environmentId/,
    )
  })

  it('rejects tables without tenant columns (a type error too)', () => {
    const untyped = global as unknown as TenantTable
    expect(() => tenantScope(untyped, { organizationId: 'o1' })).toThrowError(/no tenant columns/)
  })
})

describe('column helpers', () => {
  it('declare uuid ids generated in the app and UTC timestamps', () => {
    expect(entries.id.getSQLType()).toBe('uuid')
    expect(entries.id.defaultFn?.()).toMatch(/^[0-9a-f-]{36}$/)
    expect(entries.createdAt.getSQLType()).toBe('timestamp with time zone')
    expect(entries.spaceId.notNull).toBe(true)
  })
})

describe('assertSameTenant', () => {
  it('passes for matching or absent ids and 404s on any mismatch', async () => {
    const { assertSameTenant } = await import('./tenancy.ts')
    const { NotFoundError } = await import('@blixis/contracts')
    const tenant = { organizationId: 'o1', spaceId: 's1', environmentId: 'e1' }
    expect(() => assertSameTenant({ organizationId: 'o1', spaceId: 's1' }, tenant)).not.toThrow()
    expect(() => assertSameTenant({ spaceId: 's1', environmentId: null }, tenant)).not.toThrow()
    expect(() =>
      assertSameTenant({ organizationId: 'o1', spaceId: 's2' }, tenant, 'Entry'),
    ).toThrowError(new NotFoundError('Entry not found'))
    expect(() => assertSameTenant({ spaceId: 's1' }, { organizationId: 'o1' })).toThrow(
      NotFoundError,
    )
  })
})
