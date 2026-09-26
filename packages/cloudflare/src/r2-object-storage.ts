import {
  InfrastructureError,
  NotFoundError,
  OBJECT_STORAGE,
  type ObjectBody,
  type ObjectContent,
  type ObjectStorage,
  type StoredObject,
  ValidationError,
} from '@blixis/contracts'
import { defineModule } from '@blixis/kernel'

/** R2 `delete` accepts at most this many keys per call. */
const DELETE_BATCH = 1000

const toStored = (object: R2Object): StoredObject => ({
  key: object.key,
  size: object.size,
  etag: object.httpEtag,
  ...(object.httpMetadata?.contentType === undefined
    ? {}
    : { contentType: object.httpMetadata.contentType }),
  uploadedAt: object.uploaded,
})

/**
 * R2 needs the length of a stream up front. A request body with `Content-Length` has one; any
 * other stream is piped through a `FixedLengthStream`, which also fails if the byte count differs.
 */
function withLength(body: ObjectBody, size: number | undefined): ObjectBody {
  if (!(body instanceof ReadableStream) || size === undefined) return body
  const fixed = new FixedLengthStream(size)
  void body.pipeTo(fixed.writable).catch(() => undefined)
  return fixed.readable
}

async function call<T>(what: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/checksum|did not match/i.test(message))
      throw new ValidationError('Checksum mismatch: nothing was stored', [
        { path: ['sha256'], message: 'The received bytes have a different SHA-256' },
      ])
    if (/NoSuchUpload|upload.*(not exist|not found)|10024/i.test(message))
      throw new NotFoundError('Multipart upload not found')
    if (/length|bytes/i.test(message) && /stream|expected/i.test(message))
      throw new ValidationError('Body length differs from the declared size')
    throw new InfrastructureError(`Object storage ${what} failed`, {
      cause: error,
      retryable: true,
    })
  }
}

/**
 * {@link ObjectStorage} on an R2 bucket binding (ADR 0013). Streams bodies without buffering;
 * pass `size` with streams that don't come from a request with `Content-Length`.
 *
 * @example
 * const storage = r2ObjectStorage(env.ASSETS)
 * await storage.put(`${spaceId}/${assetId}/${fileId}`, request.body, { size, contentType })
 */
export function r2ObjectStorage(bucket: R2Bucket): ObjectStorage {
  return {
    put: (key, body, options = {}) =>
      call('put', async () =>
        toStored(
          await bucket.put(key, withLength(body, options.size) as ReadableStream, {
            ...(options.contentType === undefined
              ? {}
              : { httpMetadata: { contentType: options.contentType } }),
            ...(options.sha256 === undefined ? {} : { sha256: options.sha256 }),
          }),
        ),
      ),

    get: (key, options = {}) =>
      call('get', async () => {
        const range = options.range
        const object = await bucket.get(key, range === undefined ? {} : { range })
        if (object === null) return undefined
        const content: ObjectContent = {
          ...toStored(object),
          body: object.body as ReadableStream<Uint8Array>,
        }
        if (range === undefined) return content
        const offset = 'suffix' in range ? Math.max(0, object.size - range.suffix) : range.offset
        const end =
          'suffix' in range || range.length === undefined
            ? object.size
            : Math.min(object.size, offset + range.length)
        return { ...content, range: { offset, length: end - offset } }
      }),

    head: (key) =>
      call('head', async () => {
        const object = await bucket.head(key)
        return object === null ? undefined : toStored(object)
      }),

    delete: (keys) =>
      call('delete', async () => {
        const all = typeof keys === 'string' ? [keys] : [...keys]
        for (let i = 0; i < all.length; i += DELETE_BATCH)
          await bucket.delete(all.slice(i, i + DELETE_BATCH))
      }),

    list: (prefix, options = {}) =>
      call('list', async () => {
        const page = await bucket.list({
          prefix,
          ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        })
        const keys = page.objects.map((o) => o.key)
        return page.truncated ? { keys, cursor: page.cursor } : { keys }
      }),

    createMultipart: (key, options = {}) =>
      call('createMultipart', async () => {
        const upload = await bucket.createMultipartUpload(
          key,
          options.contentType === undefined
            ? {}
            : { httpMetadata: { contentType: options.contentType } },
        )
        return { uploadId: upload.uploadId }
      }),

    uploadPart: (key, uploadId, partNumber, body, size) =>
      call('uploadPart', async () => {
        const upload = bucket.resumeMultipartUpload(key, uploadId)
        const part = await upload.uploadPart(partNumber, withLength(body, size) as ReadableStream)
        return { partNumber: part.partNumber, etag: part.etag }
      }),

    completeMultipart: (key, uploadId, parts) =>
      call('completeMultipart', async () =>
        toStored(
          await bucket
            .resumeMultipartUpload(key, uploadId)
            .complete(parts.map((p) => ({ partNumber: p.partNumber, etag: p.etag }))),
        ),
      ),

    abortMultipart: (key, uploadId) =>
      call('abortMultipart', async () => {
        try {
          await bucket.resumeMultipartUpload(key, uploadId).abort()
        } catch (error) {
          // Aborting twice (or after R2 expired the upload) is fine.
          if (!/NoSuchUpload|not exist|not found|10024/i.test(String(error))) throw error
        }
      }),
  }
}

/** Options for {@link r2StorageModule}. */
export interface R2StorageModuleOptions {
  /** Name of the R2 bucket binding. Default `ASSETS`. */
  readonly binding?: string
}

/**
 * Platform module providing `OBJECT_STORAGE` (from `@blixis/contracts`) per request, backed by
 * the Worker's R2 bucket binding (ADR 0013).
 */
export const r2StorageModule = defineModule((options: R2StorageModuleOptions) => ({
  meta: { name: '@blixis/cloudflare.r2-storage', version: '0.0.0' },
  setup(ctx) {
    const name = options.binding ?? 'ASSETS'
    ctx.services.provideFactory(
      OBJECT_STORAGE,
      ({ bindings }) => {
        const bucket = bindings[name] as R2Bucket | undefined
        if (bucket === undefined || typeof bucket.createMultipartUpload !== 'function') {
          throw new InfrastructureError(`R2 bucket binding "${name}" is missing`)
        }
        return r2ObjectStorage(bucket)
      },
      { scope: 'request' },
    )
  },
}))
