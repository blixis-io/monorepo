import { type Database, newId, type Transaction, tenantScope } from '@blixis/database'
import { and, asc, count, desc, eq, inArray, lt, or, type SQL, sql } from 'drizzle-orm'
import type { Entry, EntryLink, EntryState, EntryVersion } from '../domain/entry.ts'
import type { EnvironmentTenant } from './content-type.repository.ts'
import { entries, entryPublications, entryReferences, entryVersions } from './schema.ts'

type Queryable = Database | Transaction
const iso = (d: Date | null) => (d === null ? null : d.toISOString())

const toEntry = (row: typeof entries.$inferSelect): Entry => ({
  id: row.id,
  organizationId: row.organizationId,
  spaceId: row.spaceId,
  environmentId: row.environmentId,
  contentTypeId: row.contentTypeId,
  currentVersionId: row.currentVersionId,
  version: row.version,
  publishedVersionId: row.publishedVersionId,
  publishedAt: iso(row.publishedAt),
  firstPublishedAt: iso(row.firstPublishedAt),
  createdBy: row.createdBy,
  updatedBy: row.updatedBy,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

const toVersion = (row: typeof entryVersions.$inferSelect): EntryVersion => ({
  id: row.id,
  entryId: row.entryId,
  number: row.number,
  fields: row.fields,
  contentTypeVersion: row.contentTypeVersion,
  restoredFrom: row.restoredFrom,
  createdBy: row.createdBy,
  createdAt: row.createdAt.toISOString(),
})

/** A new version's content. */
export interface VersionInput {
  readonly fields: Record<string, unknown>
  readonly contentTypeVersion: number
  readonly actor: string
  readonly links: readonly EntryLink[]
  readonly restoredFrom?: string | null
}

/** Keyset position in `updated_at desc, id desc` order. */
export interface EntryCursor {
  readonly updatedAt: string
  readonly id: string
}

/** Entries and their immutable versions, always scoped to the environment tenant (§31). */
export const entryRepository = {
  /** Creates an entry with version 1. */
  async create(
    tx: Transaction,
    tenant: EnvironmentTenant,
    contentTypeId: string,
    input: VersionInput,
  ): Promise<{ entry: Entry; version: EntryVersion }> {
    const entryId = newId()
    const versionId = newId()
    const [entry] = await tx
      .insert(entries)
      .values({
        id: entryId,
        ...tenant,
        contentTypeId,
        currentVersionId: versionId,
        version: 1,
        createdBy: input.actor,
        updatedBy: input.actor,
      })
      .returning()
    const version = await insertVersion(tx, tenant, entryId, versionId, 1, input)
    return { entry: toEntry(entry ?? fail()), version }
  },

  /**
   * Appends a version if the entry is still at `expectedVersion`; `undefined` when another save
   * came first (the caller reports a conflict). The entry row is updated first, which locks it.
   */
  async append(
    tx: Transaction,
    tenant: EnvironmentTenant,
    entryId: string,
    expectedVersion: number,
    input: VersionInput,
  ): Promise<{ entry: Entry; version: EntryVersion } | undefined> {
    const versionId = newId()
    const [row] = await tx
      .update(entries)
      .set({ version: expectedVersion + 1, currentVersionId: versionId, updatedBy: input.actor })
      .where(
        and(
          tenantScope(entries, tenant),
          eq(entries.id, entryId),
          eq(entries.version, expectedVersion),
        ),
      )
      .returning()
    if (row === undefined) return undefined
    const version = await insertVersion(tx, tenant, entryId, versionId, expectedVersion + 1, input)
    return { entry: toEntry(row), version }
  },

  async findById(db: Queryable, tenant: EnvironmentTenant, id: string): Promise<Entry | undefined> {
    const [row] = await db
      .select()
      .from(entries)
      .where(and(tenantScope(entries, tenant), eq(entries.id, id)))
    return row === undefined ? undefined : toEntry(row)
  },

  /**
   * An entry by id alone — only to learn its tenant for entry-id routes, which then verify the
   * actor's access before anything is returned (§31).
   */
  async findForResolution(db: Queryable, id: string): Promise<Entry | undefined> {
    const [row] = await db.select().from(entries).where(eq(entries.id, id))
    return row === undefined ? undefined : toEntry(row)
  },

  async findManyByIds(
    db: Queryable,
    tenant: EnvironmentTenant,
    ids: readonly string[],
  ): Promise<Entry[]> {
    if (ids.length === 0) return []
    const rows = await db
      .select()
      .from(entries)
      .where(and(tenantScope(entries, tenant), inArray(entries.id, [...ids])))
    return rows.map(toEntry)
  },

  /**
   * Entries with their current (`draft`) or published version in one query — the batch step of
   * link resolution. Unpublished entries are left out for `published`.
   */
  async findManyWithVersions(
    db: Queryable,
    tenant: EnvironmentTenant,
    ids: readonly string[],
    state: EntryState,
  ): Promise<{ entry: Entry; version: EntryVersion }[]> {
    if (ids.length === 0) return []
    const versionColumn =
      state === 'published' ? entries.publishedVersionId : entries.currentVersionId
    const rows = await db
      .select({ entry: entries, version: entryVersions })
      .from(entries)
      .innerJoin(entryVersions, eq(entryVersions.id, versionColumn))
      .where(and(tenantScope(entries, tenant), inArray(entries.id, [...ids])))
    return rows.map((r) => ({ entry: toEntry(r.entry), version: toVersion(r.version) }))
  },

  async version(db: Queryable, tenant: EnvironmentTenant, entryId: string, versionId: string) {
    const [row] = await db
      .select()
      .from(entryVersions)
      .where(
        and(
          tenantScope(entryVersions, tenant),
          eq(entryVersions.entryId, entryId),
          eq(entryVersions.id, versionId),
        ),
      )
    return row === undefined ? undefined : toVersion(row)
  },

  async versionsByIds(
    db: Queryable,
    tenant: EnvironmentTenant,
    ids: readonly string[],
  ): Promise<EntryVersion[]> {
    if (ids.length === 0) return []
    const rows = await db
      .select()
      .from(entryVersions)
      .where(and(tenantScope(entryVersions, tenant), inArray(entryVersions.id, [...ids])))
    return rows.map(toVersion)
  },

  /** Versions newest first; `before` is a version number for paging. */
  async versions(
    db: Queryable,
    tenant: EnvironmentTenant,
    entryId: string,
    page: { limit: number; before?: number | undefined },
  ): Promise<EntryVersion[]> {
    const rows = await db
      .select()
      .from(entryVersions)
      .where(
        and(
          tenantScope(entryVersions, tenant),
          eq(entryVersions.entryId, entryId),
          page.before === undefined ? undefined : lt(entryVersions.number, page.before),
        ),
      )
      .orderBy(desc(entryVersions.number))
      .limit(page.limit)
    return rows.map(toVersion)
  },

  /**
   * Entries (with their current or published version) in `updated_at desc, id desc` order.
   * `fieldFilters` are stored-shape equality filters (`{ fieldId: value }`) on that version.
   */
  async list(
    db: Queryable,
    tenant: EnvironmentTenant,
    query: {
      state: EntryState
      contentTypeId?: string | undefined
      updatedSince?: string | undefined
      cursor?: EntryCursor | undefined
      fieldFilters?: Record<string, unknown> | undefined
      limit: number
    },
  ): Promise<{ entry: Entry; version: EntryVersion }[]> {
    const versionColumn =
      query.state === 'published' ? entries.publishedVersionId : entries.currentVersionId
    const conditions: (SQL | undefined)[] = [
      tenantScope(entries, tenant),
      query.contentTypeId === undefined
        ? undefined
        : eq(entries.contentTypeId, query.contentTypeId),
      query.updatedSince === undefined
        ? undefined
        : sql`${entries.updatedAt} >= ${query.updatedSince}`,
      query.cursor === undefined
        ? undefined
        : or(
            sql`${entries.updatedAt} < ${query.cursor.updatedAt}`,
            and(
              sql`${entries.updatedAt} = ${query.cursor.updatedAt}`,
              lt(entries.id, query.cursor.id),
            ),
          ),
      query.fieldFilters === undefined || Object.keys(query.fieldFilters).length === 0
        ? undefined
        : sql`${entryVersions.fields} @> ${JSON.stringify(query.fieldFilters)}::jsonb`,
    ]
    const rows = await db
      .select({ entry: entries, version: entryVersions })
      .from(entries)
      .innerJoin(entryVersions, eq(entryVersions.id, versionColumn))
      .where(and(...conditions))
      .orderBy(desc(entries.updatedAt), desc(entries.id))
      .limit(query.limit)
    return rows.map((r) => ({ entry: toEntry(r.entry), version: toVersion(r.version) }))
  },

  /** Points the publication at `versionId` (or clears it) and records the history row. */
  async setPublished(
    tx: Transaction,
    tenant: EnvironmentTenant,
    entryId: string,
    versionId: string | null,
    actor: string,
  ): Promise<Entry> {
    const now = new Date()
    const [row] = await tx
      .update(entries)
      .set({
        publishedVersionId: versionId,
        publishedAt: versionId === null ? null : now,
        ...(versionId === null
          ? {}
          : { firstPublishedAt: sql`coalesce(${entries.firstPublishedAt}, ${now})` }),
        updatedBy: actor,
      })
      .where(and(tenantScope(entries, tenant), eq(entries.id, entryId)))
      .returning()
    await tx.insert(entryPublications).values({
      id: newId(),
      ...tenant,
      entryId,
      versionId,
      action: versionId === null ? 'unpublish' : 'publish',
      actor,
      at: now,
    })
    return toEntry(row ?? fail())
  },

  async delete(tx: Transaction, tenant: EnvironmentTenant, id: string): Promise<boolean> {
    const rows = await tx
      .delete(entries)
      .where(and(tenantScope(entries, tenant), eq(entries.id, id)))
      .returning({ id: entries.id })
    return rows.length > 0
  },

  async countByContentType(
    db: Queryable,
    tenant: EnvironmentTenant,
    contentTypeId: string,
  ): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(entries)
      .where(and(tenantScope(entries, tenant), eq(entries.contentTypeId, contentTypeId)))
    return row?.n ?? 0
  },

  /** Entries whose current or published version contains a block of the component. */
  async countContainingComponent(
    db: Queryable,
    tenant: EnvironmentTenant,
    componentId: string,
  ): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(distinct ${entries.id})::int` })
      .from(entries)
      .innerJoin(
        entryVersions,
        or(
          eq(entryVersions.id, entries.currentVersionId),
          eq(entryVersions.id, entries.publishedVersionId),
        ),
      )
      .where(
        and(
          tenantScope(entries, tenant),
          sql`jsonb_path_exists(${entryVersions.fields}, '$.** ? (@._type == $t)', jsonb_build_object('t', ${componentId}::text))`,
        ),
      )
    return row?.n ?? 0
  },

  /**
   * Entries linking to a target through their current (`draft`) or published version.
   */
  async referrers(
    db: Queryable,
    tenant: EnvironmentTenant,
    target: EntryLink,
    state: EntryState,
  ): Promise<Entry[]> {
    const versionColumn =
      state === 'published' ? entries.publishedVersionId : entries.currentVersionId
    const rows = await db
      .selectDistinct({ entry: entries })
      .from(entryReferences)
      .innerJoin(
        entries,
        and(
          eq(entries.id, entryReferences.fromEntryId),
          eq(versionColumn, entryReferences.fromVersionId),
        ),
      )
      .where(
        and(
          tenantScope(entryReferences, tenant),
          eq(entryReferences.toType, target.type),
          eq(entryReferences.toId, target.id),
        ),
      )
      .orderBy(asc(entries.createdAt))
    return rows.map((r) => toEntry(r.entry))
  },

  async deleteAllForSpace(db: Queryable, organizationId: string, spaceId: string) {
    await db
      .delete(entries)
      .where(and(eq(entries.organizationId, organizationId), eq(entries.spaceId, spaceId)))
  },
}

async function insertVersion(
  tx: Transaction,
  tenant: EnvironmentTenant,
  entryId: string,
  id: string,
  number: number,
  input: VersionInput,
): Promise<EntryVersion> {
  const [row] = await tx
    .insert(entryVersions)
    .values({
      id,
      ...tenant,
      entryId,
      number,
      fields: input.fields,
      contentTypeVersion: input.contentTypeVersion,
      restoredFrom: input.restoredFrom ?? null,
      createdBy: input.actor,
    })
    .returning()
  const unique = new Map(input.links.map((l) => [`${l.type}:${l.id}`, l]))
  if (unique.size > 0) {
    await tx.insert(entryReferences).values(
      [...unique.values()].map((link) => ({
        ...tenant,
        fromEntryId: entryId,
        fromVersionId: id,
        toType: link.type,
        toId: link.id,
      })),
    )
  }
  return toVersion(row ?? fail())
}

function fail(): never {
  throw new Error('write returned no row')
}
