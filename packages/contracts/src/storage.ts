import { createServiceToken, type ServiceToken } from './services.ts'

/**
 * Bodies an {@link ObjectStorage} accepts. Prefer a stream with a known `size`: large files must
 * never be read into memory (ADR 0013).
 */
export type ObjectBody = ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView | string

/** A stored object as {@link ObjectStorage} reports it. */
export interface StoredObject {
  readonly key: string
  /** Size in bytes, as the storage measured it. */
  readonly size: number
  /** Opaque version tag of the stored bytes (quoted for use as an HTTP `ETag`). */
  readonly etag: string
  readonly contentType?: string
  readonly uploadedAt: Date
}

/** A stored object with its bytes, from `ObjectStorage.get`. */
export interface ObjectContent extends StoredObject {
  readonly body: ReadableStream<Uint8Array>
  /** The byte range returned, when a range was requested. */
  readonly range?: { readonly offset: number; readonly length: number }
}

/** A byte range: from `offset` (and `length` bytes, or to the end), or the last `suffix` bytes. */
export type ObjectRange =
  | { readonly offset: number; readonly length?: number }
  | { readonly suffix: number }

/** Options for `ObjectStorage.put`. */
export interface PutObjectOptions {
  /** Byte length of `body`. Required for streams: the storage streams without buffering. */
  readonly size?: number
  readonly contentType?: string
  /**
   * Expected SHA-256 of the bytes, hex. The storage verifies it and stores nothing on a mismatch
   * (throws `ValidationError`).
   */
  readonly sha256?: string
}

/** One uploaded part of a multipart upload, as passed back to `ObjectStorage.completeMultipart`. */
export interface UploadedPart {
  readonly partNumber: number
  readonly etag: string
}

/**
 * Binary object storage (ADR 0013), e.g. R2 through a binding. Keys are opaque and chosen by the
 * caller; metadata that matters lives in Postgres, never only here (§17).
 *
 * Provided as {@link OBJECT_STORAGE} by an infrastructure module (`r2StorageModule()` from
 * `@blixis/cloudflare`); tests use `createMemoryObjectStorage()` from `@blixis/testing`.
 */
export interface ObjectStorage {
  /** Stores `body` under `key`, replacing an existing object. */
  put(key: string, body: ObjectBody, options?: PutObjectOptions): Promise<StoredObject>
  /** The object's bytes, or `undefined` if it doesn't exist. */
  get(key: string, options?: { readonly range?: ObjectRange }): Promise<ObjectContent | undefined>
  /** The object's metadata, or `undefined` if it doesn't exist. */
  head(key: string): Promise<StoredObject | undefined>
  /** Deletes objects. Missing keys are ignored, so deleting is idempotent. */
  delete(keys: string | readonly string[]): Promise<void>
  /** Keys under `prefix`, a page at a time (`cursor` continues; absent on the last page). */
  list(
    prefix: string,
    options?: { readonly cursor?: string; readonly limit?: number },
  ): Promise<{ readonly keys: string[]; readonly cursor?: string }>
  /** Starts a multipart upload for `key`. */
  createMultipart(
    key: string,
    options?: { readonly contentType?: string },
  ): Promise<{ readonly uploadId: string }>
  /**
   * Uploads part `partNumber` (1–10 000). All parts but the last must have the same size, at
   * least 5 MiB.
   */
  uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: ObjectBody,
    size: number,
  ): Promise<UploadedPart>
  /** Assembles the parts into the object. */
  completeMultipart(
    key: string,
    uploadId: string,
    parts: readonly UploadedPart[],
  ): Promise<StoredObject>
  /** Discards an unfinished multipart upload. Idempotent. */
  abortMultipart(key: string, uploadId: string): Promise<void>
}

/** The object storage of this deployment (optional: only apps that store files provide one). */
export const OBJECT_STORAGE: ServiceToken<ObjectStorage> = createServiceToken<ObjectStorage>(
  '@blixis/contracts.object-storage',
)

/** Storage limits shared by adapters and fakes (R2, ADR 0013). */
export const OBJECT_STORAGE_LIMITS = Object.freeze({
  /** Smallest part of a multipart upload, except the last. */
  minPartBytes: 5 * 1024 * 1024,
  /** Most parts in one multipart upload. */
  maxParts: 10_000,
})
