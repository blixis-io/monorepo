import {
  NotFoundError,
  OBJECT_STORAGE_LIMITS,
  type ObjectBody,
  type ObjectContent,
  type ObjectRange,
  type ObjectStorage,
  type StoredObject,
  ValidationError,
} from '@blixis/contracts'

interface Entry {
  readonly bytes: Uint8Array
  readonly contentType?: string
  readonly etag: string
  readonly uploadedAt: Date
}

/** Options for {@link createMemoryObjectStorage}. */
export interface MemoryObjectStorageOptions {
  /** Smallest multipart part except the last. Default 5 MiB, like R2. */
  readonly minPartBytes?: number
  readonly now?: () => Date
}

/** A {@link ObjectStorage} fake with inspection helpers. */
export interface MemoryObjectStorage extends ObjectStorage {
  /** Stored keys, sorted. */
  keys(): string[]
  /** The stored bytes of `key` as text (for assertions). */
  text(key: string): string | undefined
  /** Unfinished multipart uploads. */
  readonly pendingUploads: number
}

async function toBytes(body: ObjectBody): Promise<Uint8Array> {
  if (typeof body === 'string') return new TextEncoder().encode(body)
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
  return new Uint8Array(await new Response(body).arrayBuffer())
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function slice(bytes: Uint8Array, range: ObjectRange | undefined) {
  if (range === undefined) return { bytes, range: undefined }
  const offset = 'suffix' in range ? Math.max(0, bytes.length - range.suffix) : range.offset
  const end =
    'suffix' in range || range.length === undefined
      ? bytes.length
      : Math.min(bytes.length, offset + range.length)
  return { bytes: bytes.slice(offset, end), range: { offset, length: end - offset } }
}

/**
 * In-memory {@link ObjectStorage} for tests: same contract as the R2 adapter, including checksum
 * verification and R2's multipart rules (equal parts but the last, minimum part size).
 *
 * @example
 * const storage = createMemoryObjectStorage()
 * const t = await createTestBlixis({ modules, overrides: [serviceOverride(OBJECT_STORAGE, storage)] })
 */
export function createMemoryObjectStorage(
  options: MemoryObjectStorageOptions = {},
): MemoryObjectStorage {
  const now = options.now ?? (() => new Date())
  const minPartBytes = options.minPartBytes ?? OBJECT_STORAGE_LIMITS.minPartBytes
  const objects = new Map<string, Entry>()
  const uploads = new Map<
    string,
    { key: string; contentType?: string; parts: Map<number, Uint8Array> }
  >()
  const meta = (key: string, entry: Entry): StoredObject => ({
    key,
    size: entry.bytes.length,
    etag: entry.etag,
    ...(entry.contentType === undefined ? {} : { contentType: entry.contentType }),
    uploadedAt: entry.uploadedAt,
  })
  const store = async (key: string, bytes: Uint8Array, contentType?: string) => {
    const entry: Entry = {
      bytes,
      etag: `"${(await sha256Hex(bytes)).slice(0, 32)}"`,
      ...(contentType === undefined ? {} : { contentType }),
      uploadedAt: now(),
    }
    objects.set(key, entry)
    return meta(key, entry)
  }
  const upload = (key: string, uploadId: string) => {
    const found = uploads.get(uploadId)
    if (found === undefined || found.key !== key)
      throw new NotFoundError('Multipart upload not found')
    return found
  }

  return {
    async put(key, body, putOptions = {}) {
      const bytes = await toBytes(body)
      if (putOptions.size !== undefined && putOptions.size !== bytes.length)
        throw new ValidationError(`Expected ${putOptions.size} bytes, received ${bytes.length}`)
      if (putOptions.sha256 !== undefined && putOptions.sha256 !== (await sha256Hex(bytes)))
        throw new ValidationError('Checksum mismatch: nothing was stored', [
          { path: ['sha256'], message: 'The received bytes have a different SHA-256' },
        ])
      return store(key, bytes, putOptions.contentType)
    },
    async get(key, getOptions = {}) {
      const entry = objects.get(key)
      if (entry === undefined) return undefined
      const part = slice(entry.bytes, getOptions.range)
      const content: ObjectContent = {
        ...meta(key, entry),
        body: new Response(part.bytes as Uint8Array<ArrayBuffer>)
          .body as ReadableStream<Uint8Array>,
        ...(part.range === undefined ? {} : { range: part.range }),
      }
      return content
    },
    async head(key) {
      const entry = objects.get(key)
      return entry === undefined ? undefined : meta(key, entry)
    },
    async delete(keys) {
      for (const key of typeof keys === 'string' ? [keys] : keys) objects.delete(key)
    },
    async list(prefix, listOptions = {}) {
      const all = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort()
      const start = listOptions.cursor === undefined ? 0 : Number(listOptions.cursor)
      const limit = listOptions.limit ?? 1000
      const keys = all.slice(start, start + limit)
      return start + limit < all.length ? { keys, cursor: String(start + limit) } : { keys }
    },
    async createMultipart(key, multipartOptions = {}) {
      const uploadId = crypto.randomUUID()
      uploads.set(uploadId, {
        key,
        ...(multipartOptions.contentType === undefined
          ? {}
          : { contentType: multipartOptions.contentType }),
        parts: new Map(),
      })
      return { uploadId }
    },
    async uploadPart(key, uploadId, partNumber, body, size) {
      const found = upload(key, uploadId)
      if (
        !Number.isInteger(partNumber) ||
        partNumber < 1 ||
        partNumber > OBJECT_STORAGE_LIMITS.maxParts
      )
        throw new ValidationError(`Part number must be 1–${OBJECT_STORAGE_LIMITS.maxParts}`)
      const bytes = await toBytes(body)
      if (bytes.length !== size)
        throw new ValidationError(`Expected ${size} bytes, received ${bytes.length}`)
      found.parts.set(partNumber, bytes)
      return { partNumber, etag: `"${(await sha256Hex(bytes)).slice(0, 32)}"` }
    },
    async completeMultipart(key, uploadId, parts) {
      const found = upload(key, uploadId)
      const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber)
      const chunks = ordered.map((p) => {
        const bytes = found.parts.get(p.partNumber)
        if (bytes === undefined) throw new ValidationError(`Part ${p.partNumber} was not uploaded`)
        return bytes
      })
      if (chunks.length === 0) throw new ValidationError('A multipart upload needs parts')
      const first = chunks[0]?.length ?? 0
      chunks.slice(0, -1).forEach((chunk, index) => {
        if (chunk.length < minPartBytes)
          throw new ValidationError(`Part ${index + 1} is smaller than ${minPartBytes} bytes`)
        if (chunk.length !== first)
          throw new ValidationError('All parts except the last must be the same size')
      })
      const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
      }
      uploads.delete(uploadId)
      return store(key, bytes, found.contentType)
    },
    async abortMultipart(_key, uploadId) {
      uploads.delete(uploadId)
    },
    keys: () => [...objects.keys()].sort(),
    text(key) {
      const entry = objects.get(key)
      return entry === undefined ? undefined : new TextDecoder().decode(entry.bytes)
    },
    get pendingUploads() {
      return uploads.size
    },
  }
}
