import type {
  Asset,
  BinaryBody,
  ContentType,
  Entry,
  Operations,
  Session,
  Webhook,
  WebhookDelivery,
} from './generated/api.ts'
import { ROUTES } from './generated/api.ts'
import { createHttp, type HttpOptions } from './http.ts'

/** A Management API operation id, e.g. `publishEntry`. */
export type OperationId = keyof Operations

type Empty = Record<string, never>
/** The inputs of an operation: path `params`, `query`, and `body`, each only when it has any. */
export type OperationInput<K extends OperationId> = (Operations[K]['params'] extends Empty
  ? { params?: undefined }
  : { params: Operations[K]['params'] }) &
  (Operations[K]['query'] extends Empty
    ? { query?: undefined }
    : { query?: Operations[K]['query'] | undefined }) &
  (Operations[K]['body'] extends undefined ? { body?: undefined } : { body: Operations[K]['body'] })

/** Per-call options. */
export interface CallOptions {
  /**
   * Makes a command safe to retry (`Idempotency-Key`). Commands that support it get a random key
   * automatically; pass your own to deduplicate across processes.
   */
  readonly idempotencyKey?: string | undefined
  /** The version you edited (`If-Match`); a stale one answers `409 CONFLICT`. */
  readonly ifMatch?: number | string | undefined
  /** Extra request headers. */
  readonly headers?: Readonly<Record<string, string>> | undefined
}

/** Options of {@link createBlixisClient}. */
export interface BlixisClientOptions extends HttpOptions {}

const fill = (path: string, params: Readonly<Record<string, string>> | undefined) =>
  path.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const value = params?.[name]
    if (value === undefined) throw new TypeError(`Missing path parameter "${name}"`)
    return encodeURIComponent(value)
  })

/** `Content-Disposition` carrying a UTF-8 file name (RFC 6266). */
const disposition = (filename: string) =>
  `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`

/** Upload options for {@link BlixisClient.assets}. */
export interface UploadOptions {
  readonly filename: string
  /** The file type; defaults to the Blob's type. */
  readonly contentType?: string | undefined
  /** Byte length — needed for streams (server runtimes), where the SDK can't measure it. */
  readonly size?: number | undefined
  /** Expected SHA-256 (hex): the server stores nothing on a mismatch. */
  readonly sha256?: string | undefined
}

const hexToBase64 = (hex: string) =>
  btoa(String.fromCharCode(...(hex.match(/../g) ?? []).map((h) => Number.parseInt(h, 16))))

/**
 * A client for the Management API (plan 017). Authenticate with an API token (`blx_pat_…`) or an
 * access token. Works wherever `fetch` does: Workers, browsers, Node, Deno, Bun.
 *
 * @example
 * const blixis = createBlixisClient({ baseUrl: 'https://api.example.com', token: process.env.BLIXIS_TOKEN })
 * for await (const entry of blixis.entries.iterate(spaceId, { contentType: 'page' })) console.log(entry.sys.id)
 */
export function createBlixisClient(options: BlixisClientOptions) {
  const http = createHttp(options)

  /** Calls any operation by id, fully typed. */
  async function call<K extends OperationId>(
    id: K,
    input: OperationInput<K>,
    callOptions: CallOptions & { binary?: BinaryBody } = {},
  ): Promise<Operations[K]['response']> {
    const route = ROUTES[id] as {
      method: string
      path: string
      body: 'none' | 'json' | 'binary'
      auth?: false
      idempotent?: true
    }
    const headers: Record<string, string> = { ...callOptions.headers }
    if (route.idempotent === true)
      headers['idempotency-key'] = callOptions.idempotencyKey ?? crypto.randomUUID()
    if (callOptions.ifMatch !== undefined) headers['if-match'] = `"${callOptions.ifMatch}"`
    const { params, query, body } = input as {
      params?: Record<string, string>
      query?: Record<string, unknown>
      body?: unknown
    }
    return http.json<Operations[K]['response']>({
      method: route.method,
      path: fill(route.path, params),
      query,
      ...(route.body === 'binary'
        ? { binary: (body ?? callOptions.binary) as BinaryBody }
        : { json: body }),
      headers,
      anonymous: route.auth === false,
    })
  }

  /** Pages through a list operation. */
  async function* paginate<T>(
    fetchPage: (cursor: string | undefined) => Promise<{ items: T[]; nextCursor: string | null }>,
  ): AsyncGenerator<T> {
    let cursor: string | undefined
    do {
      const page = await fetchPage(cursor)
      yield* page.items
      cursor = page.nextCursor ?? undefined
    } while (cursor !== undefined)
  }

  function uploadHeaders(file: BinaryBody, upload: UploadOptions) {
    const type = upload.contentType ?? (file instanceof Blob ? file.type : '')
    if (type === '') throw new TypeError('Pass contentType: the file type can’t be detected')
    return {
      'content-type': type,
      'content-disposition': disposition(upload.filename),
      ...(upload.size === undefined ? {} : { 'content-length': String(upload.size) }),
      ...(upload.sha256 === undefined
        ? {}
        : { 'content-digest': `sha-256=:${hexToBase64(upload.sha256)}:` }),
    }
  }

  type EntryQuery = Operations['listEntries']['query']
  type AssetQuery = Operations['listAssets']['query']

  return {
    call,

    /** The signed-in user: profile and UI preferences. */
    me: {
      get: () => call('getProfile', {}),
      update: (body: Operations['updateProfile']['body']) => call('updateProfile', { body }),
      preferences: () => call('getPreferences', {}),
      /** Replaces the preferences; omitted fields reset to their defaults. */
      updatePreferences: (body: Operations['updatePreferences']['body']) =>
        call('updatePreferences', { body }),
    },

    organizations: {
      list: async () => (await call('listOrganizations', {})).organizations,
      create: (body: Operations['createOrganization']['body']) =>
        call('createOrganization', { body }),
      get: (orgId: string) => call('getOrganization', { params: { orgId } }),
    },

    spaces: {
      list: async (orgId: string) => (await call('listSpaces', { params: { orgId } })).spaces,
      create: (orgId: string, body: Operations['createSpace']['body']) =>
        call('createSpace', { params: { orgId }, body }),
      get: (spaceId: string) => call('getSpace', { params: { spaceId } }),
      delete: (spaceId: string) => call('deleteSpace', { params: { spaceId } }),
    },

    /** Field types of this app (built-in and from plugins), with their settings JSON Schemas. */
    fieldTypes: {
      list: async () => (await call('listFieldTypes', {})).fieldTypes,
    },

    contentTypes: {
      list: async (spaceId: string, query?: Operations['listContentTypes']['query']) =>
        (await call('listContentTypes', { params: { spaceId }, query })).contentTypes,
      get: (spaceId: string, contentTypeId: string): Promise<ContentType> =>
        call('getContentType', { params: { spaceId, contentTypeId } }),
      create: (spaceId: string, body: Operations['createContentType']['body']) =>
        call('createContentType', { params: { spaceId }, body }),
      update: (
        spaceId: string,
        contentTypeId: string,
        body: Operations['updateContentType']['body'],
      ) => call('updateContentType', { params: { spaceId, contentTypeId }, body }),
      delete: (spaceId: string, contentTypeId: string) =>
        call('deleteContentType', { params: { spaceId, contentTypeId } }),
    },

    entries: {
      /** One page; use `iterate` to walk all of them. */
      list: (spaceId: string, query?: EntryQuery) =>
        call('listEntries', { params: { spaceId }, query }),
      /** Every matching entry, fetching pages as you go. */
      iterate: (spaceId: string, query: EntryQuery = {}): AsyncGenerator<Entry> =>
        paginate(async (cursor) => {
          const page = await call('listEntries', {
            params: { spaceId },
            query: { ...query, ...(cursor === undefined ? {} : { cursor }) },
          })
          return { items: page.entries, nextCursor: page.nextCursor }
        }),
      get: (entryId: string, query?: Operations['getEntry']['query']) =>
        call('getEntry', { params: { entryId }, query }),
      create: (spaceId: string, contentType: string, fields: Record<string, unknown> = {}) =>
        call('createEntry', { params: { spaceId }, body: { contentType, fields } }),
      /** Saves a new version with the complete fields; `version` is the one you edited. */
      update: (entryId: string, fields: Record<string, unknown>, version: number) =>
        call('updateEntry', { params: { entryId }, body: { fields } }, { ifMatch: version }),
      publish: (
        entryId: string,
        options: { versionId?: string; version?: number } & CallOptions = {},
      ) =>
        call(
          'publishEntry',
          {
            params: { entryId },
            body: options.versionId === undefined ? {} : { versionId: options.versionId },
          },
          { ...options, ...(options.version === undefined ? {} : { ifMatch: options.version }) },
        ),
      unpublish: (entryId: string, options: { force?: boolean } & CallOptions = {}) =>
        call(
          'unpublishEntry',
          { params: { entryId }, body: options.force === true ? { force: true } : {} },
          options,
        ),
      delete: (entryId: string, version?: number) =>
        call(
          'deleteEntry',
          { params: { entryId } },
          version === undefined ? {} : { ifMatch: version },
        ),
      versions: (entryId: string, query?: Operations['listEntryVersions']['query']) =>
        call('listEntryVersions', { params: { entryId }, query }),
    },

    assets: {
      list: (spaceId: string, query?: AssetQuery) =>
        call('listAssets', { params: { spaceId }, query }),
      iterate: (spaceId: string, query: AssetQuery = {}): AsyncGenerator<Asset> =>
        paginate(async (cursor) => {
          const page = await call('listAssets', {
            params: { spaceId },
            query: { ...query, ...(cursor === undefined ? {} : { cursor }) },
          })
          return { items: page.assets, nextCursor: page.nextCursor }
        }),
      get: (assetId: string) => call('getAsset', { params: { assetId } }),
      /** Uploads a file in one request (up to 90 MiB); larger files: `uploadLarge`. */
      upload: async (spaceId: string, file: BinaryBody, upload: UploadOptions) =>
        call(
          'uploadAsset',
          { params: { spaceId }, body: file },
          { headers: uploadHeaders(file, upload) },
        ),
      /** Uploads a large Blob in parts (multipart), reporting progress after each part. */
      uploadLarge: async (
        spaceId: string,
        file: Blob,
        upload: UploadOptions & {
          onProgress?: (uploadedBytes: number, totalBytes: number) => void
        },
      ): Promise<Asset> => {
        const mimeType = upload.contentType ?? file.type
        const started = await call('startAssetUpload', {
          params: { spaceId },
          body: { filename: upload.filename, mimeType, size: file.size },
        })
        const assetId = started.asset.sys.id
        try {
          const parts: Operations['completeAssetUpload']['body']['parts'] = []
          for (let n = 1; n <= started.partCount; n++) {
            const chunk = file.slice((n - 1) * started.partSize, n * started.partSize)
            parts.push(
              await call(
                'uploadAssetPart',
                { params: { assetId, partNumber: String(n) }, body: chunk },
                { headers: { 'content-type': 'application/octet-stream' } },
              ),
            )
            upload.onProgress?.(Math.min(n * started.partSize, file.size), file.size)
          }
          return await call('completeAssetUpload', { params: { assetId }, body: { parts } })
        } catch (error) {
          await call('abortAssetUpload', { params: { assetId } }).catch(() => undefined)
          throw error
        }
      },
      update: (assetId: string, body: Operations['updateAsset']['body'], version: number) =>
        call('updateAsset', { params: { assetId }, body }, { ifMatch: version }),
      replaceFile: async (
        assetId: string,
        file: BinaryBody,
        upload: UploadOptions & { version: number },
      ) =>
        call(
          'replaceAssetFile',
          { params: { assetId }, body: file },
          { headers: uploadHeaders(file, upload), ifMatch: upload.version },
        ),
      publish: (assetId: string, options?: CallOptions) =>
        call('publishAsset', { params: { assetId } }, options),
      unpublish: (assetId: string, options: { force?: boolean } & CallOptions = {}) =>
        call(
          'unpublishAsset',
          { params: { assetId }, body: options.force === true ? { force: true } : {} },
          options,
        ),
      delete: (assetId: string, options: { force?: boolean; version?: number } = {}) =>
        call(
          'deleteAsset',
          { params: { assetId }, query: options.force === true ? { force: true } : {} },
          options.version === undefined ? {} : { ifMatch: options.version },
        ),
    },

    webhooks: {
      list: async (spaceId: string): Promise<Webhook[]> =>
        (await call('listWebhooks', { params: { spaceId } })).webhooks,
      /** Creates a webhook; store the returned `secret`, it is shown only once. */
      create: (spaceId: string, body: Operations['createWebhook']['body']) =>
        call('createWebhook', { params: { spaceId }, body }),
      update: (webhookId: string, body: Operations['updateWebhook']['body'], version: number) =>
        call('updateWebhook', { params: { webhookId }, body }, { ifMatch: version }),
      rotateSecret: (webhookId: string) => call('rotateWebhookSecret', { params: { webhookId } }),
      delete: (webhookId: string) => call('deleteWebhook', { params: { webhookId } }),
      test: (webhookId: string): Promise<WebhookDelivery> =>
        call('testWebhook', { params: { webhookId } }),
      deliveries: (webhookId: string, query?: Operations['listWebhookDeliveries']['query']) =>
        call('listWebhookDeliveries', { params: { webhookId }, query }),
      redeliver: (webhookId: string, deliveryId: string, options?: CallOptions) =>
        call('redeliverWebhook', { params: { webhookId, deliveryId } }, options),
    },

    deliveryKeys: {
      list: async (spaceId: string) =>
        (await call('listDeliveryKeys', { params: { spaceId } })).deliveryKeys,
      /** Creates a key; the returned `key` is shown only once. */
      create: (spaceId: string, body: Operations['createDeliveryKey']['body']) =>
        call('createDeliveryKey', { params: { spaceId }, body }),
      revoke: (spaceId: string, keyId: string) =>
        call('revokeDeliveryKey', { params: { spaceId, keyId } }),
    },

    apiTokens: {
      list: async () => (await call('listApiTokens', {})).tokens,
      /** Creates an API token; the returned `token` is shown only once. Needs a signed-in session. */
      create: (body: Operations['createApiToken']['body']) => call('createApiToken', { body }),
      revoke: (id: string) => call('revokeApiToken', { params: { id } }),
    },
  }
}

/** A client from {@link createBlixisClient}. */
export type BlixisClient = ReturnType<typeof createBlixisClient>

/**
 * Signs in with email and password and returns the session with its tokens (for scripts and
 * servers; browsers use the cookie flow). Pass `accessToken` to {@link createBlixisClient}.
 */
export async function signIn(
  options: Pick<HttpOptions, 'baseUrl' | 'fetch' | 'timeoutMs'>,
  credentials: { email: string; password: string },
): Promise<Session> {
  const http = createHttp({ ...options, retries: 0 })
  return http.json<Session>({
    method: 'POST',
    path: ROUTES.signIn.path,
    json: { ...credentials, tokenDelivery: 'body' },
    anonymous: true,
  })
}
