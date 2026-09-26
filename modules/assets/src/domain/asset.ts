/** Upload state of an asset: `pending` until its file is stored, then `ready` (ADR 0013). */
export type AssetUploadStatus = 'pending' | 'ready'

/** Text per locale code, e.g. `{ 'en-US': 'Team photo', 'nl-NL': 'Teamfoto' }`. */
export type LocalizedText = Readonly<Record<string, string>>

/** An asset record: the canonical metadata of one stored file (§17). */
export interface Asset {
  readonly id: string
  readonly organizationId: string
  readonly spaceId: string
  readonly environmentId: string
  readonly status: AssetUploadStatus
  /** Original file name (display and `Content-Disposition` only; never part of the key). */
  readonly filename: string
  readonly title: LocalizedText
  readonly description: LocalizedText
  readonly mimeType: string
  /** Bytes as the storage measured them; `null` while pending. */
  readonly sizeBytes: number | null
  /** SHA-256 (hex) of direct uploads; `null` for multipart uploads and while pending. */
  readonly sha256: string | null
  readonly width: number | null
  readonly height: number | null
  /** Opaque storage key `<spaceId>/<assetId>/<fileId>`; a new file gets a new key. */
  readonly objectKey: string
  readonly version: number
  /** A multipart upload in progress (pending assets only). */
  readonly upload: { readonly id: string; readonly size: number; readonly partSize: number } | null
  readonly publishedAt: string | null
  readonly firstPublishedAt: string | null
  readonly createdBy: string
  readonly updatedBy: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** Lifecycle as the API shows it: uploading, uploaded but not public, or public. */
export type AssetStatus = 'pending' | 'draft' | 'published'

export const assetStatus = (asset: Pick<Asset, 'status' | 'publishedAt'>): AssetStatus =>
  asset.status === 'pending' ? 'pending' : asset.publishedAt === null ? 'draft' : 'published'

/** The storage key of one file of an asset (ADR 0013 §2). */
export const objectKeyFor = (spaceId: string, assetId: string, fileId: string): string =>
  `${spaceId}/${assetId}/${fileId}`

/** The file id: the last segment of an object key. */
export const fileIdOf = (objectKey: string): string => objectKey.split('/').at(-1) ?? ''

/**
 * Path of an asset's current file on the delivery route (014.004), relative to the API origin:
 * `/assets/<spaceId>/<assetId>/<fileId>/<filename>`. A new file means a new URL.
 */
export const assetPath = (
  asset: Pick<Asset, 'spaceId' | 'id' | 'objectKey' | 'filename'>,
): string =>
  `/assets/${asset.spaceId}/${asset.id}/${fileIdOf(asset.objectKey)}/${encodeURIComponent(asset.filename)}`

/** Types shown in the browser (`inline`); everything else downloads (`attachment`). */
export const inlineType = (mimeType: string): boolean =>
  /^(image|audio|video)\//.test(mimeType) || mimeType === 'application/pdf'

/**
 * A safe display file name: the last path segment, without control characters, at most 255
 * characters. Never used to build storage keys.
 */
export function normalizeFilename(name: string): string {
  const base = name.split(/[/\\]/).at(-1) ?? ''
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return clean.slice(0, 255)
}

/** Types uploads may declare by default (ADR 0013 §4). */
export const DEFAULT_ALLOWED_TYPES: readonly string[] = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/svg+xml',
  'application/pdf',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'video/mp4',
  'video/webm',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
])

/**
 * Types a browser runs as a document or script. Never accepted, even when an app adds them to
 * `allowedTypes` (ADR 0013 §4).
 */
export const BLOCKED_TYPES: readonly string[] = Object.freeze([
  'text/html',
  'application/xhtml+xml',
  'text/javascript',
  'application/javascript',
  'application/ecmascript',
  'text/xml',
  'application/xml',
])

/** The bare media type in lower case (`Image/PNG; charset=x` → `image/png`). */
export const mediaType = (value: string): string => (value.split(';')[0] ?? '').trim().toLowerCase()
