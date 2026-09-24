# Database conventions

How module code declares tables and queries Postgres. Decisions: [ADR 0006](../decisions/0006-database-stack.md) (pg + Drizzle) and [ADR 0007](../decisions/0007-ids-and-tenancy-conventions.md) (IDs, timestamps, tenancy). Helpers: `@blixis/database`.

Related: [Migrations](./migrations.md) · [Testing](./testing.md#test-database) · [Database operations](../operations/database.md)

---

## Declaring a table

```ts
import { idColumn, tenantColumns, timestamps } from '@blixis/database'
import { index, pgSchema, text, unique, uuid } from 'drizzle-orm/pg-core'

export const content = pgSchema('content')            // one schema per module

export const entries = content.table(
  'entries',
  {
    id: idColumn(),                                     // uuid primary key, UUIDv7 from newId()
    ...tenantColumns(),                                 // organization_id, space_id (uuid not null)
    contentTypeId: uuid('content_type_id').notNull(),
    slug: text('slug').notNull(),
    ...timestamps(),                                    // created_at, updated_at (timestamptz)
  },
  (t) => [
    unique('entries_space_slug_key').on(t.spaceId, t.slug),     // uniqueness is per tenant
    index('entries_space_created_idx').on(t.spaceId, t.createdAt), // indexes lead with tenant
  ],
)
```

| Rule | Why |
|---|---|
| Table and column names are `snake_case`. TypeScript property names are `camelCase` | Postgres folds identifiers to lower case |
| `id` is `idColumn()`. Never `serial` or a DB-side default | IDs are known before insert (events, outbox, related rows) |
| Tenant tables use `tenantColumns()`, **also on child tables** | Every query can be scoped without joins |
| Unique constraints and indexes include the tenant column first | Correct per-tenant uniqueness; tenant-first query plans |
| Name constraints explicitly (`<table>_<cols>_key`, `_idx`, `_fk`) | `ConflictError.details.constraint` is stable and can be mapped to fields |
| Times are `timestamptz` named `*_at` | UTC, no local-time ambiguity |
| JSON goes in `jsonb` with `$type<…>()` | Typed reads; indexable with GIN when needed |

## Querying: always scoped

```ts
import { DATABASE, isId, requireTenant, tenantScope, translateDatabaseError } from '@blixis/database'
import { NotFoundError } from '@blixis/contracts'
import { and, eq } from 'drizzle-orm'

async function getEntry(ctx: RequestContext, id: string) {
  if (!isId(id)) throw new NotFoundError('Entry not found')      // don't pass garbage to Postgres
  const tenant = requireTenant(ctx, 'organizationId', 'spaceId') // ForbiddenError if unscoped
  const db = ctx.services.get(DATABASE)
  const [entry] = await db
    .select()
    .from(entries)
    .where(and(tenantScope(entries, tenant), eq(entries.id, id)))  // never by ID alone (§31)
  if (entry === undefined) throw new NotFoundError('Entry not found')
  return entry
}
```

- **Never load, update, or delete by ID alone.** Combine `tenantScope(table, tenant)` with the ID condition, **including on updates and deletes**. `tenantScope` fails closed when the tenant is missing.
- **A row from another tenant is "not found"** (`404`), not "forbidden". Don't reveal that it exists.
- **Multi-statement work** uses `withTransaction`. Pass `tx`, or `toTransactionScope(tx)`, down to helpers. See the manual's database page.
- **Driver errors:** `withTransaction` translates them. Elsewhere, wrap the call in `try/catch` and `throw translateDatabaseError(error)`, so raw Drizzle errors, which contain query parameters, never reach logs.

## Deleting

The default is a hard delete plus a domain event (ADR 0007). A module that needs recovery adds `deleted_at timestamptz`, filters `deleted_at is null` in every read, and documents it in its README.

## Other modules' tables

- **Read another module's data through its services or events**, never through its tables.
- **Foreign keys to another module's table only when that module is in your `meta.requires`.** Use `on delete restrict` unless the other module documents a cascade. Reference an optional module or a capability with a plain `uuid` column and keep it consistent through events.

## Row-level security

Not used in the MVP (ADR 0007). Scoping is enforced by `tenantScope` and proven by the tenant isolation suite (roadmap 008.006). It is revisited in plan 020.
