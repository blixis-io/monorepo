import { type Actor, createServiceToken, type ServiceToken } from '@blixis/contracts'
import type { EnvironmentTenant } from './content-types.ts'

/** Entry fields in API shape: values by field `apiId`; localized fields map locale codes to values. */
export type ApiFields = Record<string, unknown>

/**
 * `draft`: never published, or unpublished. `published`: the current version is live.
 * `changed`: live, with newer unpublished changes.
 */
export type EntryStatus = 'draft' | 'published' | 'changed'

/** Which version of entries to read: the latest draft or the published one. */
export type EntryState = 'draft' | 'published'

/** System properties of an entry as the API returns them. */
export interface EntrySys {
  readonly id: string
  readonly type: 'entry'
  readonly contentType: { readonly id: string; readonly apiId: string }
  readonly environmentId: string
  /** Number of the current (latest) version — send it back as `expectedVersion`. */
  readonly version: number
  /** Number of the version these fields come from. */
  readonly fieldsVersion: number
  readonly status: EntryStatus
  readonly publishedVersionId: string | null
  readonly publishedAt: string | null
  readonly firstPublishedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly createdBy: string
  readonly updatedBy: string
}

/** An entry with the fields of one version, keyed by `apiId` (ADR 0010 §3). */
export interface EntryView {
  readonly sys: EntrySys
  readonly fields: ApiFields
}

/** One version of an entry, as the API returns it. */
export interface EntryVersionView {
  readonly sys: {
    readonly id: string
    readonly entryId: string
    readonly number: number
    readonly contentTypeVersion: number
    readonly restoredFrom: string | null
    readonly isCurrent: boolean
    readonly isPublished: boolean
    readonly createdAt: string
    readonly createdBy: string
  }
  readonly fields: ApiFields
}

/** Options for {@link ContentService.list}. */
export interface EntryListQuery {
  /** Content type `apiId` (or id). Required for field filters. */
  readonly contentType?: string | undefined
  /** `draft` (default): latest versions; `published`: only published entries, their live version. */
  readonly state?: EntryState | undefined
  readonly updatedSince?: string | undefined
  /** 1–100, default 25. */
  readonly limit?: number | undefined
  /** `nextCursor` of the previous page. */
  readonly cursor?: string | undefined
  /** Equality filters on non-localized fields by `apiId`, e.g. `{ slug: 'home' }`. */
  readonly fields?: Readonly<Record<string, string>> | undefined
}

/**
 * Entries of one environment on behalf of an actor (§22, plan 011) — the only path for REST,
 * GraphQL, imports, and background jobs. Every save appends an immutable version; nothing is
 * overwritten. Request-scoped: `services.get(CONTENT_SERVICE)`.
 */
export interface ContentService {
  /**
   * The tenant of an entry, for entry-id routes: verifies the actor may read it first (§31).
   * @throws NotFoundError for unknown entries and entries the actor cannot access
   */
  resolveTenant(actor: Actor, entryId: string): Promise<EnvironmentTenant>
  /** Creates an entry (version 1); fields are validated as a draft. */
  create(
    actor: Actor,
    tenant: EnvironmentTenant,
    input: { contentType: string; fields: unknown },
  ): Promise<EntryView>
  /** @throws NotFoundError (unknown, or not published for `state: 'published'`) */
  get(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    options?: { state?: EntryState },
  ): Promise<EntryView>
  list(
    actor: Actor,
    tenant: EnvironmentTenant,
    query?: EntryListQuery,
  ): Promise<{ entries: EntryView[]; nextCursor: string | null }>
  /**
   * Saves a new draft version with the complete fields.
   * @throws ConflictError when `expectedVersion` is not the current version
   */
  update(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    input: { fields: unknown; expectedVersion: number },
  ): Promise<EntryView>
  /** Deletes an unpublished entry with all versions. @throws ConflictError while published */
  delete(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    options?: { expectedVersion?: number },
  ): Promise<void>
  /**
   * Publishes a version (default: the current one). It is validated strictly (`publish` mode) and
   * every linked entry must exist, be published, and have an allowed type. Publishing the version
   * that is already live changes nothing. Emits `entry.published` in the same transaction.
   * @throws ValidationError (with paths), ConflictError (stale `expectedVersion`)
   */
  publish(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    options?: { versionId?: string | undefined; expectedVersion?: number | undefined },
  ): Promise<EntryView>
  /**
   * Takes the entry offline. Refused while other published entries link to it, unless `force`.
   * Unpublishing a draft changes nothing. Emits `entry.unpublished` in the same transaction.
   * @throws ConflictError (linked from published entries)
   */
  unpublish(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    options?: { force?: boolean | undefined },
  ): Promise<EntryView>
  /** Versions newest first; pass `nextBefore` as `before` for the next page (limit 1–100). */
  listVersions(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    page?: { limit?: number | undefined; before?: number | undefined },
  ): Promise<{ versions: EntryVersionView[]; nextBefore: number | null }>
  /** @throws NotFoundError */
  getVersion(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    versionId: string,
  ): Promise<EntryVersionView>
  /**
   * Saves an old version's fields as a new version (history is never rewritten). The fields are
   * checked as a draft against the **current** content type; incompatible values are reported.
   * Emits `entry.updated` with `restoredFrom`.
   * @throws NotFoundError, ValidationError, ConflictError (stale `expectedVersion`)
   */
  restoreVersion(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    versionId: string,
    expectedVersion: number,
  ): Promise<EntryView>
  /** Entries linking to this one through their current (`draft`) or published version. */
  findReferrers(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    options?: { state?: EntryState | undefined },
  ): Promise<EntryView[]>
  /**
   * Loads the entries linked from `entryIds`, level by level up to `depth` (0–3), with one batch
   * query per level. Cycles are followed once; links that don't resolve (missing, or unpublished
   * for `published`) are left out. Asset links aren't resolved here (GraphQL delivers assets).
   */
  resolveLinks(
    actor: Actor,
    tenant: EnvironmentTenant,
    entryIds: readonly string[],
    options?: { depth?: number | undefined; state?: EntryState | undefined },
  ): Promise<EntryView[]>
}

/** Request-scoped {@link ContentService}, provided by the content module. */
export const CONTENT_SERVICE: ServiceToken<ContentService> =
  createServiceToken<ContentService>('@blixis/content.entries')
