/**
 * An entry of an `entry` content type (§22). Its content lives in immutable versions; the entry
 * points at the current (draft) version and, once published, at the published version.
 */
export interface Entry {
  readonly id: string
  readonly organizationId: string
  readonly spaceId: string
  readonly environmentId: string
  readonly contentTypeId: string
  readonly currentVersionId: string
  /** Number of the current version; increments on every save (optimistic concurrency). */
  readonly version: number
  readonly publishedVersionId: string | null
  readonly publishedAt: string | null
  readonly firstPublishedAt: string | null
  /** Actor ids (`user:…`, `apiToken:…`) as in audit metadata. */
  readonly createdBy: string
  readonly updatedBy: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** One immutable snapshot of an entry's fields, keyed by stable field ids (ADR 0010). */
export interface EntryVersion {
  readonly id: string
  readonly entryId: string
  readonly number: number
  readonly fields: Readonly<Record<string, unknown>>
  /** The content type version the fields were validated against. */
  readonly contentTypeVersion: number
  /** The version this one restored, if it was created by a restore. */
  readonly restoredFrom: string | null
  readonly createdBy: string
  readonly createdAt: string
}

/**
 * `draft`: never published, or unpublished. `published`: the current version is live.
 * `changed`: live, with newer unpublished changes.
 */
export type EntryStatus = 'draft' | 'published' | 'changed'

export function entryStatus(
  entry: Pick<Entry, 'currentVersionId' | 'publishedVersionId'>,
): EntryStatus {
  if (entry.publishedVersionId === null) return 'draft'
  return entry.publishedVersionId === entry.currentVersionId ? 'published' : 'changed'
}

/** An outgoing link of a version (to an entry, or to an asset — plan 014). */
export interface EntryLink {
  readonly type: 'entry' | 'asset'
  readonly id: string
}

/** Which version of entries to read: the latest draft or the published one. */
export type EntryState = 'draft' | 'published'
