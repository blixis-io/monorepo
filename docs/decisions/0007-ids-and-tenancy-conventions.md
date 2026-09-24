# 0007 — IDs, timestamps, and tenancy conventions

- Status: accepted
- Date: 2026-09-24
- Roadmap task: [005.007](../plans/005-database-foundation/007-ids-tenancy-and-schema-conventions.md)

## Context

§31 requires multi-tenancy from the start. Most CMS records belong to an organization and a space, queries must always be scoped, and a resource ID alone is never trusted. §20 gives every module its own schema and migrations. ADR 0006 chose Postgres (Neon) with Drizzle and one Postgres schema per module. Without shared conventions, every domain plan (spaces, content, assets, webhooks, …) would decide these questions again, differently.

## Decision

The project owner chose the ID format; the rest follows the roadmap's recommendations.

1. **Primary keys are UUIDv7** (RFC 9562), generated **in the application** with Web Crypto: `newId()` in `@blixis/database`.
   - Column: `id uuid primary key` (`idColumn()`).
   - The same value is used everywhere: database, REST/GraphQL, URLs, events. There are **no type prefixes** and no second public ID format.
   - UUIDv7 is time-ordered, so B-tree inserts stay local and IDs sort by creation. `newId()` is strictly monotonic per isolate. Workers freeze `Date.now()` within a request, so a 12-bit counter orders IDs within a millisecond, and a clock that goes backwards never produces a smaller ID.
   - Generating IDs in the app, not with `DEFAULT gen_random_uuid()`, means services know the ID before inserting. They can use it in events, outbox rows, and related inserts in the same transaction.
   - Validate IDs from requests with `isId()` before querying.
2. **Timestamps:** `created_at` and `updated_at` as `timestamptz` (stored in UTC; APIs return ISO 8601 with `Z`). `timestamps()` adds both; `updated_at` is refreshed by Drizzle on updates made through the query builder. Other time columns are also `timestamptz` and named `*_at`.
3. **Deletes are hard by default.** Deletion emits a domain event, and audit records follow with plan 020. A module that needs recovery (for example trash for entries or assets) adds `deleted_at timestamptz` explicitly, filters it in every query, and documents this in its README. There is no global soft-delete flag.
4. **Tenancy columns:**
   - Every tenant-owned table has `organization_id uuid not null` and `space_id uuid not null` (`tenantColumns()`), plus `environment_id` where content differs per environment (`tenantColumns({ environment: true })`).
   - They are denormalised onto child tables too, so every query can be scoped without joins.
   - Composite indexes **lead with the tenant column** that queries filter on, for example `(space_id, created_at)`, and unique constraints include it, for example `unique (space_id, slug)`.
5. **Scoping is enforced in the application**, and it fails closed.
   - `requireTenant(ctx, 'organizationId', 'spaceId')` returns the tenant or throws `ForbiddenError`.
   - `tenantScope(table, tenant)` builds the `WHERE` predicate for every tenant column the table has, and throws `ForbiddenError` when the tenant lacks a value. It is a type error to call it on a table without tenant columns.
   - Every query on tenant data combines `tenantScope` with the ID condition.
   - The tenant isolation test suite (plan 008.006) proves this per route.
6. **Row-level security is not used in the MVP.** App-level scoping plus the isolation suite is the control. RLS would need a per-transaction `SET LOCAL` of the tenant on every query through Hyperdrive, which is revisited in plan 020.
7. **Namespacing:** one Postgres schema per module (ADR 0006), named after the module without scope (`@blixis/content` → `content`). Only the module's migrations create or change objects in it. Platform tables live in schema `blixis` (for example `blixis.migrations`).
8. **Cross-module foreign keys** are allowed **only toward modules the referencing module lists in `meta.requires`**. The kernel guarantees such a module is installed and migrated first (bootstrap order). They reference the other module's primary key and use `on delete restrict`, unless that module documents a cascade contract. References to optional modules or to capabilities are plain `uuid` columns without an FK, kept consistent through events.

## Alternatives considered

- **UUIDv7 with typed public prefixes** (`ent_…`, Stripe style). Mix-ups would be visible and caught earlier, but it would add an encode/decode layer at every boundary and two forms of every ID. The owner rejected it.
- **`bigserial` keys:** leak volume and ordering between tenants, can't be generated before insert, and are awkward to merge across branches or environments.
- **UUIDv4:** random insert order fragments indexes, and IDs carry no creation time.
- **A table prefix per module in one schema:** schemas give real namespaces, per-module privileges, and clean `drizzle-kit` filtering.
- **Row-level security now:** adds Hyperdrive session constraints and policy management before any tenant data exists. It is deferred, not rejected.

## Consequences

- The domain plans (spaces, content, assets, webhooks, releases) use `idColumn()`, `tenantColumns()`, `timestamps()`, `requireTenant`, and `tenantScope` instead of re-deciding these conventions. See `docs/conventions/database.md`.
- IDs don't reveal their type, so API errors and logs should name the resource type next to the ID.
- Forgetting `tenantScope` is a correctness bug that the isolation suite must catch. Code review checks every query on tenant tables.
