import type { EnvironmentTenant } from '@blixis/content-api'
import { createServiceToken, type ServiceToken } from '@blixis/contracts'
import { type Database, tenantScope } from '@blixis/database'
import { and, eq, sql } from 'drizzle-orm'
import { seoEntries } from './schema.ts'

/** SEO metadata of one entry. `title` falls back to the module's `defaultTitle`. */
export interface SeoMetadata {
  readonly entryId: string
  readonly title: string
  readonly description: string | null
  /** When the entry was last published (from `entry.published`), or `null`. */
  readonly lastPublishedAt: string | null
}

/** The plugin's public service. Callers authorize first; the service only scopes by tenant. */
export interface SeoService {
  get(tenant: EnvironmentTenant, entryId: string): Promise<SeoMetadata>
  set(
    tenant: EnvironmentTenant,
    entryId: string,
    input: { title: string | null; description: string | null },
  ): Promise<SeoMetadata>
  /**
   * For delivery: the metadata of an entry the caller already delivered (so it is authorized).
   * Entry ids are UUIDs, unique across tenants.
   */
  forDeliveredEntries(entryIds: readonly string[]): Promise<Map<string, SeoMetadata>>
  markPublished(tenant: EnvironmentTenant, entryId: string, at: string): Promise<void>
  deleteEntry(entryId: string): Promise<void>
  deleteSpace(organizationId: string, spaceId: string): Promise<void>
}

/** Request-scoped {@link SeoService}. Other modules may use it through this token. */
export const SEO_SERVICE: ServiceToken<SeoService> = createServiceToken<SeoService>(
  '@blixis-example/seo.service',
)

type Row = typeof seoEntries.$inferSelect

export function createSeoService(db: Database, defaultTitle: string): SeoService {
  const view = (entryId: string, row: Row | undefined): SeoMetadata => ({
    entryId,
    title: row?.title ?? defaultTitle,
    description: row?.description ?? null,
    lastPublishedAt: row?.lastPublishedAt?.toISOString() ?? null,
  })
  const upsert = (tenant: EnvironmentTenant, entryId: string, values: Partial<Row>) =>
    db
      .insert(seoEntries)
      .values({ entryId, ...tenant, ...values })
      .onConflictDoUpdate({ target: seoEntries.entryId, set: { ...values, updatedAt: sql`now()` } })
      .returning()

  return {
    async get(tenant, entryId) {
      const [row] = await db
        .select()
        .from(seoEntries)
        .where(and(eq(seoEntries.entryId, entryId), tenantScope(seoEntries, tenant)))
      return view(entryId, row)
    },
    async set(tenant, entryId, input) {
      const [row] = await upsert(tenant, entryId, input)
      return view(entryId, row)
    },
    async forDeliveredEntries(entryIds) {
      if (entryIds.length === 0) return new Map()
      const rows = await db
        .select()
        .from(seoEntries)
        .where(sql`${seoEntries.entryId} in ${[...entryIds]}`)
      const byId = new Map(rows.map((row) => [row.entryId, row]))
      return new Map(entryIds.map((id) => [id, view(id, byId.get(id))]))
    },
    async markPublished(tenant, entryId, at) {
      await upsert(tenant, entryId, { lastPublishedAt: new Date(at) })
    },
    async deleteEntry(entryId) {
      await db.delete(seoEntries).where(eq(seoEntries.entryId, entryId))
    },
    async deleteSpace(organizationId, spaceId) {
      await db
        .delete(seoEntries)
        .where(and(eq(seoEntries.organizationId, organizationId), eq(seoEntries.spaceId, spaceId)))
    },
  }
}
