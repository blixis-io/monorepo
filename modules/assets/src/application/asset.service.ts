import {
  type Actor,
  type AssetUsage,
  type AuthorizationService,
  actorId,
  ConflictError,
  createServiceToken,
  type EventBus,
  NotFoundError,
  OBJECT_STORAGE_LIMITS,
  type ObjectContent,
  type ObjectRange,
  type ObjectStorage,
  type PermissionId,
  type ServiceToken,
  type UploadedPart,
  ValidationError,
  type ValidationIssue,
} from '@blixis/contracts'
import { type Database, isId, newId, toTransactionScope, withTransaction } from '@blixis/database'
import type { LocaleService } from '@blixis/spaces'
import type { AssetsConfig } from '../config.ts'
import {
  type Asset,
  type AssetStatus,
  assetPath,
  assetStatus,
  BLOCKED_TYPES,
  fileIdOf,
  type LocalizedText,
  mediaType,
  normalizeFilename,
  objectKeyFor,
} from '../domain/asset.ts'
import {
  assetCreated,
  assetDeleted,
  assetPublished,
  assetUnpublished,
  assetUpdated,
} from '../events.ts'
import { assetRepository, type EnvironmentTenant } from '../infrastructure/asset.repository.ts'
import { ASSET_PERMISSIONS } from '../permissions.ts'
import { inspectUpload } from './inspect.ts'

/** An asset as the API returns it. */
export interface AssetView {
  readonly sys: {
    readonly id: string
    readonly type: 'asset'
    readonly environmentId: string
    /** Send it back as `expectedVersion` / `If-Match`. */
    readonly version: number
    readonly status: AssetStatus
    readonly publishedAt: string | null
    readonly firstPublishedAt: string | null
    readonly createdAt: string
    readonly updatedAt: string
    readonly createdBy: string
    readonly updatedBy: string
  }
  readonly fields: {
    readonly filename: string
    readonly title: LocalizedText
    readonly description: LocalizedText
    readonly mimeType: string
    /** `null` while pending. */
    readonly size: number | null
    readonly sha256: string | null
    readonly width: number | null
    readonly height: number | null
    /**
     * Path of the current file on the delivery route, relative to the API origin; `null` while
     * pending. Public once the asset is published.
     */
    readonly url: string | null
  }
}

/** Where the delivery route should go for a requested file (014.004). */
export type AssetDelivery =
  | {
      readonly type: 'file'
      readonly asset: AssetView
      readonly published: boolean
      /** Reads the file (optionally a byte range). */
      read(range?: ObjectRange): Promise<ObjectContent>
    }
  /** The URL names a replaced file: go to the current one. */
  | { readonly type: 'redirect'; readonly location: string; readonly published: boolean }

/** The stored file of an upload, as measured by the storage. */
export interface StoredFile {
  readonly sizeBytes: number
  readonly sha256?: string | null | undefined
  readonly width?: number | null | undefined
  readonly height?: number | null | undefined
}

/** A single-request upload for {@link AssetService.upload}. */
export interface DirectUpload {
  readonly filename: string
  readonly mimeType: string
  /** Exact byte length of `body` (the request's `Content-Length`). */
  readonly size: number
  readonly body: ReadableStream<Uint8Array>
  /** Expected SHA-256, hex; verified by the storage. */
  readonly sha256?: string | undefined
  readonly title?: LocalizedText | undefined
  readonly description?: LocalizedText | undefined
}

/** Options for {@link AssetService.list}. */
export interface AssetListQuery {
  /** `draft` (default): every ready asset; `published`: only published ones; `pending`: uploads in progress. */
  readonly state?: 'draft' | 'published' | 'pending' | undefined
  /** Media type prefix, e.g. `image/` or `application/pdf`. */
  readonly mimeType?: string | undefined
  /** 1–100, default 25. */
  readonly limit?: number | undefined
  readonly cursor?: string | undefined
}

/**
 * Assets of one environment on behalf of an actor (§17, plan 014) — the only path for REST,
 * GraphQL, and imports. The file itself goes to `OBJECT_STORAGE` under the asset's `objectKey`;
 * this service owns the record. Request-scoped: `services.get(ASSET_SERVICE)`.
 */
export interface AssetService {
  /**
   * The tenant of an asset, for asset-id routes: verifies the actor may read it first (§31).
   * @throws NotFoundError for unknown assets and assets the actor cannot access
   */
  resolveTenant(actor: Actor, assetId: string): Promise<EnvironmentTenant>
  /**
   * Starts an upload: validates the name and declared type, and reserves a storage key. The
   * asset is `pending` (invisible to lists by default) until {@link AssetService.markReady}.
   * @throws ValidationError (file name, type not allowed, unknown locales)
   */
  createPending(
    actor: Actor,
    tenant: EnvironmentTenant,
    input: {
      filename: string
      mimeType: string
      title?: LocalizedText | undefined
      description?: LocalizedText | undefined
    },
  ): Promise<{ asset: AssetView; objectKey: string }>
  /**
   * Finishes an upload with the facts of the stored file and emits `asset.created` in the same
   * transaction. @throws ConflictError when the asset isn't pending, ValidationError (too large)
   */
  markReady(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    file: StoredFile,
  ): Promise<AssetView>
  /**
   * Reserves a new storage key for replacing the file of a ready asset (write the file there,
   * then call {@link AssetService.replaceFile}).
   */
  prepareReplacement(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    input: { mimeType: string },
  ): Promise<{ objectKey: string }>
  /**
   * Points the asset at a newly stored file. Emits `asset.updated` with `replacedObjectKey`, so
   * the old file is deleted after the commit.
   * @throws ConflictError (stale `expectedVersion`), ValidationError
   */
  replaceFile(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    input: {
      objectKey: string
      filename?: string | undefined
      mimeType: string
      file: StoredFile
      expectedVersion: number
    },
  ): Promise<AssetView>
  /**
   * Uploads a file in one request (ADR 0013 §1): streams `body` to storage without buffering,
   * checks the signature of images and PDFs, measures the size, hashes it (Workers), reads image
   * dimensions, and creates the asset (`asset.created`). A failed upload leaves nothing behind.
   * With `sha256` (hex, e.g. from `Content-Digest`), the storage stores nothing on a mismatch.
   * @throws ValidationError (size, type, signature, checksum, name, locales)
   */
  upload(actor: Actor, tenant: EnvironmentTenant, input: DirectUpload): Promise<AssetView>
  /**
   * Replaces the file of a ready asset in one request; the old file is deleted after the commit.
   * @throws ConflictError (stale `expectedVersion`), ValidationError
   */
  uploadReplacement(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    input: Omit<DirectUpload, 'title' | 'description' | 'filename'> & {
      filename?: string | undefined
      expectedVersion: number
    },
  ): Promise<AssetView>
  /**
   * Starts a multipart upload of `size` bytes: returns the pending asset, the part size to use
   * (every part but the last), and the number of parts.
   */
  startUpload(
    actor: Actor,
    tenant: EnvironmentTenant,
    input: {
      filename: string
      mimeType: string
      size: number
      title?: LocalizedText | undefined
      description?: LocalizedText | undefined
    },
  ): Promise<{ asset: AssetView; partSize: number; partCount: number }>
  /** Streams part `partNumber` (1-based); its length must match the plan. */
  uploadPart(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    partNumber: number,
    body: ReadableStream<Uint8Array>,
    size: number,
  ): Promise<UploadedPart>
  /** Assembles the parts and creates the asset (`asset.created`). */
  completeUpload(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    parts: readonly UploadedPart[],
  ): Promise<AssetView>
  /** Aborts a multipart upload and removes the pending asset. Idempotent. */
  abortUpload(actor: Actor, tenant: EnvironmentTenant, id: string): Promise<void>
  /**
   * Resolves a delivery URL (`/assets/:spaceId/:assetId/:fileId/…`). Published assets are public;
   * unpublished ones need `assets.preview.read` (preview keys, members). Everything else — unknown,
   * pending, another space, or no access — is `NotFoundError`, so existence never leaks.
   */
  deliver(
    actor: Actor,
    ref: { spaceId: string; assetId: string; fileId: string },
  ): Promise<AssetDelivery>
  /** @throws NotFoundError */
  get(actor: Actor, tenant: EnvironmentTenant, id: string): Promise<AssetView>
  /** Newest first. */
  list(
    actor: Actor,
    tenant: EnvironmentTenant,
    query?: AssetListQuery,
  ): Promise<{ assets: AssetView[]; nextCursor: string | null }>
  /**
   * Changes the file name, title, or description; omitted properties stay. Emits `asset.updated`.
   * @throws ConflictError (stale `expectedVersion`), ValidationError
   */
  updateMetadata(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    input: {
      filename?: string | undefined
      title?: LocalizedText | undefined
      description?: LocalizedText | undefined
      expectedVersion: number
    },
  ): Promise<AssetView>
  /** Publishing a published asset changes nothing. @throws ConflictError while pending */
  publish(actor: Actor, tenant: EnvironmentTenant, id: string): Promise<AssetView>
  /**
   * Unpublishing a draft changes nothing. Refused while published entries link to the asset
   * (their links would stop resolving), unless `force`.
   * @throws ConflictError (linked from published entries)
   */
  unpublish(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    options?: { force?: boolean | undefined },
  ): Promise<AssetView>
  /**
   * Deletes an unpublished (or pending) asset; its file is deleted after the commit through
   * `asset.deleted`. Refused while published entries link to it, unless `force`.
   * @throws ConflictError while published, linked, or on a stale `expectedVersion`
   */
  delete(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    options?: { expectedVersion?: number | undefined; force?: boolean | undefined },
  ): Promise<void>
}

/** Request-scoped {@link AssetService}, provided by `assetsModule()`. */
export const ASSET_SERVICE: ServiceToken<AssetService> =
  createServiceToken<AssetService>('@blixis/assets.assets')

export interface AssetServiceDeps {
  readonly db: Database
  readonly authz: AuthorizationService
  readonly events: EventBus
  readonly locales: Pick<LocaleService, 'codes'>
  readonly config: AssetsConfig
  /** Object storage, resolved on first use. */
  readonly storage: () => ObjectStorage
  /** How content uses assets (`ASSET_USAGE` from `@blixis/content`), when present. */
  readonly usage?: AssetUsage | undefined
}

const P = ASSET_PERMISSIONS
const TITLE_MAX = 500
const DESCRIPTION_MAX = 5000

export function toAssetView(asset: Asset): AssetView {
  return {
    sys: {
      id: asset.id,
      type: 'asset',
      environmentId: asset.environmentId,
      version: asset.version,
      status: assetStatus(asset),
      publishedAt: asset.publishedAt,
      firstPublishedAt: asset.firstPublishedAt,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      createdBy: asset.createdBy,
      updatedBy: asset.updatedBy,
    },
    fields: {
      filename: asset.filename,
      title: asset.title,
      description: asset.description,
      mimeType: asset.mimeType,
      size: asset.sizeBytes,
      sha256: asset.sha256,
      width: asset.width,
      height: asset.height,
      url: asset.status === 'pending' ? null : assetPath(asset),
    },
  }
}

export function createAssetService(deps: AssetServiceDeps): AssetService {
  const { db, authz, events, locales, config, storage } = deps

  const require = (actor: Actor, action: PermissionId, tenant: EnvironmentTenant, id?: string) =>
    authz.require({
      actor,
      action,
      resource: {
        type: 'asset',
        ...(id === undefined ? {} : { id }),
        organizationId: tenant.organizationId,
        spaceId: tenant.spaceId,
      },
    })

  async function load(tenant: EnvironmentTenant, id: string): Promise<Asset> {
    const asset = isId(id) ? await assetRepository.findById(db, tenant, id) : undefined
    if (asset === undefined) throw new NotFoundError('Asset not found')
    return asset
  }

  const stale = (current: number) =>
    new ConflictError(
      `The asset changed since you loaded it (now version ${current}): reload and retry`,
    )

  const payload = (asset: Asset) => ({
    assetId: asset.id,
    organizationId: asset.organizationId,
    spaceId: asset.spaceId,
    environmentId: asset.environmentId,
    objectKey: asset.objectKey,
    version: asset.version,
  })

  function checkFilename(value: string, issues: ValidationIssue[]): string {
    const filename = normalizeFilename(value)
    if (filename === '')
      issues.push({ path: ['filename'], message: 'Give the file a name (at most 255 characters)' })
    return filename
  }

  function checkType(value: string, issues: ValidationIssue[]): string {
    const type = mediaType(value)
    if (BLOCKED_TYPES.includes(type) || !config.allowedTypes.includes(type))
      issues.push({
        path: ['mimeType'],
        message:
          type === '' ? 'Declare the file type' : `Files of type ${type} can't be uploaded here`,
      })
    return type
  }

  async function checkText(
    tenant: EnvironmentTenant,
    name: 'title' | 'description',
    value: unknown,
    issues: ValidationIssue[],
  ): Promise<LocalizedText | undefined> {
    if (value === undefined) return undefined
    const max = name === 'title' ? TITLE_MAX : DESCRIPTION_MAX
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ path: [name], message: 'Use an object of locale code → text' })
      return undefined
    }
    const { codes } = await locales.codes(tenant)
    const result: Record<string, string> = {}
    for (const [code, text] of Object.entries(value)) {
      if (!codes.includes(code)) issues.push({ path: [name, code], message: 'Unknown locale' })
      else if (typeof text !== 'string' || text.length > max)
        issues.push({ path: [name, code], message: `Use text of at most ${max} characters` })
      else if (text.trim() !== '') result[code] = text
    }
    return result
  }

  function checkFile(file: StoredFile) {
    if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0)
      throw new ValidationError('Invalid file size')
    if (file.sizeBytes > config.maxAssetBytes)
      throw new ValidationError('The file is too large', [
        { path: ['size'], message: `Files may be at most ${config.maxAssetBytes} bytes` },
      ])
    const dimension = (v: number | null | undefined) =>
      v === undefined || v === null ? null : Number.isInteger(v) && v > 0 ? v : null
    return {
      sizeBytes: file.sizeBytes,
      sha256: file.sha256 ?? null,
      width: dimension(file.width),
      height: dimension(file.height),
    }
  }

  function checkSize(size: number, max: number, what: string) {
    if (!Number.isSafeInteger(size) || size < 1)
      throw new ValidationError('Invalid upload', [
        { path: ['size'], message: 'Send the exact length of the file (Content-Length)' },
      ])
    if (size > max)
      throw new ValidationError('The file is too large', [
        { path: ['size'], message: `${what} may be at most ${max} bytes` },
      ])
  }

  const checkDigest = (sha256: string | undefined) => {
    if (sha256 !== undefined && !/^[0-9a-f]{64}$/.test(sha256))
      throw new ValidationError('Invalid checksum', [
        { path: ['sha256'], message: 'Use a SHA-256 digest (Content-Digest: sha-256=:…:)' },
      ])
  }

  /** Streams an upload to `key`; returns the facts of the stored file. Cleans up on failure. */
  async function store(
    key: string,
    input: Pick<DirectUpload, 'body' | 'size' | 'mimeType' | 'sha256'>,
  ) {
    const mimeType = mediaType(input.mimeType)
    const { stream, inspection } = inspectUpload(input.body, mimeType)
    const objects = storage()
    try {
      const stored = await objects.put(key, stream, {
        size: input.size,
        contentType: mimeType,
        ...(input.sha256 === undefined ? {} : { sha256: input.sha256 }),
      })
      if (stored.size !== input.size) throw new ValidationError('The upload was incomplete')
      const facts = await inspection.result()
      return { sizeBytes: stored.size, ...facts, sha256: input.sha256 ?? facts.sha256 }
    } catch (error) {
      await objects.delete(key).catch(() => undefined)
      throw inspection.rejection() ?? error
    }
  }

  function partPlan(size: number) {
    const MiB = 1024 * 1024
    // Grow the part size (in whole MiB) only when the file would need more than 10 000 parts.
    const partSize =
      Math.ceil(size / config.multipartPartBytes) > OBJECT_STORAGE_LIMITS.maxParts
        ? Math.ceil(size / OBJECT_STORAGE_LIMITS.maxParts / MiB) * MiB
        : config.multipartPartBytes
    return { partSize, partCount: Math.ceil(size / partSize) }
  }

  async function pendingUpload(tenant: EnvironmentTenant, id: string) {
    const asset = await load(tenant, id)
    if (asset.status !== 'pending' || asset.upload === null)
      throw new ConflictError('No multipart upload is in progress for this asset')
    return { asset, upload: asset.upload }
  }

  /** Published entries linking to the asset block unpublishing and deleting (unless forced). */
  async function refuseIfLinked(tenant: EnvironmentTenant, id: string, action: string) {
    const count = (await deps.usage?.publishedReferrers(tenant, id)) ?? 0
    if (count > 0)
      throw new ConflictError(
        `${count} published ${count === 1 ? 'entry links' : 'entries link'} to this asset: ` +
          `unpublish or change ${count === 1 ? 'it' : 'them'} first, or ${action} with force`,
        { details: { publishedReferrers: count } },
      )
  }

  const service: AssetService = {
    async resolveTenant(actor, assetId) {
      const found = isId(assetId) ? await assetRepository.findForResolution(db, assetId) : undefined
      if (found === undefined) throw new NotFoundError('Asset not found')
      await require(actor, P.read.id, found, assetId)
      return found
    },

    async createPending(actor, tenant, input) {
      await require(actor, P.write.id, tenant)
      const issues: ValidationIssue[] = []
      const filename = checkFilename(String(input.filename ?? ''), issues)
      const mimeType = checkType(String(input.mimeType ?? ''), issues)
      const title = await checkText(tenant, 'title', input.title, issues)
      const description = await checkText(tenant, 'description', input.description, issues)
      if (issues.length > 0) throw new ValidationError('Invalid asset', issues)
      const id = newId()
      const objectKey = objectKeyFor(tenant.spaceId, id, newId())
      const asset = await assetRepository.insertPending(db, tenant, {
        id,
        filename,
        mimeType,
        title: title ?? {},
        description: description ?? {},
        objectKey,
        actor: actorId(actor),
      })
      return { asset: toAssetView(asset), objectKey }
    },

    async markReady(actor, tenant, id, file) {
      await require(actor, P.write.id, tenant, id)
      const facts = checkFile(file)
      const current = await load(tenant, id)
      if (current.status !== 'pending') throw new ConflictError('The asset is already uploaded')
      const ready = await withTransaction(db, async (tx) => {
        const updated = await assetRepository.markReady(tx, tenant, id, {
          ...facts,
          actor: actorId(actor),
        })
        if (updated === undefined) throw new ConflictError('The asset is already uploaded')
        await events.emit(assetCreated, payload(updated), { transaction: toTransactionScope(tx) })
        return updated
      })
      return toAssetView(ready)
    },

    async prepareReplacement(actor, tenant, id, input) {
      await require(actor, P.write.id, tenant, id)
      const issues: ValidationIssue[] = []
      checkType(String(input.mimeType ?? ''), issues)
      if (issues.length > 0) throw new ValidationError('Invalid asset', issues)
      const asset = await load(tenant, id)
      if (asset.status === 'pending') throw new ConflictError('The asset is still uploading')
      return { objectKey: objectKeyFor(tenant.spaceId, asset.id, newId()) }
    },

    async replaceFile(actor, tenant, id, input) {
      await require(actor, P.write.id, tenant, id)
      const asset = await load(tenant, id)
      if (asset.status === 'pending') throw new ConflictError('The asset is still uploading')
      if (asset.version !== input.expectedVersion) throw stale(asset.version)
      const prefix = objectKeyFor(tenant.spaceId, asset.id, '')
      if (!input.objectKey.startsWith(prefix) || input.objectKey === asset.objectKey)
        throw new ValidationError('Invalid storage key for this asset')
      const issues: ValidationIssue[] = []
      const mimeType = checkType(input.mimeType, issues)
      const filename =
        input.filename === undefined ? undefined : checkFilename(input.filename, issues)
      if (issues.length > 0) throw new ValidationError('Invalid asset', issues)
      const facts = checkFile(input.file)
      const updated = await withTransaction(db, async (tx) => {
        const row = await assetRepository.update(tx, tenant, id, input.expectedVersion, {
          ...(filename === undefined ? {} : { filename }),
          mimeType,
          objectKey: input.objectKey,
          ...facts,
          actor: actorId(actor),
        })
        if (row === undefined) throw stale(asset.version + 1)
        await events.emit(
          assetUpdated,
          { ...payload(row), replacedObjectKey: asset.objectKey },
          { transaction: toTransactionScope(tx) },
        )
        return row
      })
      return toAssetView(updated)
    },

    async upload(actor, tenant, input) {
      await require(actor, P.write.id, tenant)
      checkSize(input.size, config.maxDirectUploadBytes, 'Single-request uploads')
      checkSize(input.size, config.maxAssetBytes, 'Files')
      checkDigest(input.sha256)
      const { asset, objectKey } = await service.createPending(actor, tenant, input)
      let file: StoredFile
      try {
        file = await store(objectKey, input)
      } catch (error) {
        await assetRepository.deletePending(db, tenant, asset.sys.id)
        throw error
      }
      return service.markReady(actor, tenant, asset.sys.id, file)
    },

    async uploadReplacement(actor, tenant, id, input) {
      await require(actor, P.write.id, tenant, id)
      checkSize(input.size, config.maxDirectUploadBytes, 'Single-request uploads')
      checkSize(input.size, config.maxAssetBytes, 'Files')
      checkDigest(input.sha256)
      const current = await load(tenant, id)
      if (current.version !== input.expectedVersion) throw stale(current.version)
      const { objectKey } = await service.prepareReplacement(actor, tenant, id, input)
      const file = await store(objectKey, input)
      try {
        return await service.replaceFile(actor, tenant, id, {
          objectKey,
          filename: input.filename,
          mimeType: input.mimeType,
          file,
          expectedVersion: input.expectedVersion,
        })
      } catch (error) {
        await storage()
          .delete(objectKey)
          .catch(() => undefined)
        throw error
      }
    },

    async startUpload(actor, tenant, input) {
      await require(actor, P.write.id, tenant)
      checkSize(input.size, config.maxAssetBytes, 'Files')
      const plan = partPlan(input.size)
      if (plan.partCount > OBJECT_STORAGE_LIMITS.maxParts)
        throw new ValidationError('The file is too large for a multipart upload')
      const { asset, objectKey } = await service.createPending(actor, tenant, input)
      try {
        const { uploadId } = await storage().createMultipart(objectKey, {
          contentType: asset.fields.mimeType,
        })
        await assetRepository.setUpload(db, tenant, asset.sys.id, {
          upload: { id: uploadId, size: input.size, partSize: plan.partSize },
        })
      } catch (error) {
        await assetRepository.deletePending(db, tenant, asset.sys.id)
        throw error
      }
      return { asset, ...plan }
    },

    async uploadPart(actor, tenant, id, partNumber, body, size) {
      await require(actor, P.write.id, tenant, id)
      const { asset, upload } = await pendingUpload(tenant, id)
      const { partCount } = partPlan(upload.size)
      if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > partCount)
        throw new ValidationError('Invalid part', [
          { path: ['partNumber'], message: `Use 1–${partCount}` },
        ])
      const expected =
        partNumber < partCount ? upload.partSize : upload.size - upload.partSize * (partCount - 1)
      if (size !== expected)
        throw new ValidationError('Invalid part', [
          { path: ['size'], message: `Part ${partNumber} must be exactly ${expected} bytes` },
        ])
      // Part 1 carries the file's signature and image header.
      const { stream, inspection } =
        partNumber === 1
          ? inspectUpload(body, asset.mimeType, { hash: false })
          : { stream: body, inspection: undefined }
      let part: UploadedPart
      try {
        part = await storage().uploadPart(asset.objectKey, upload.id, partNumber, stream, size)
      } catch (error) {
        throw inspection?.rejection() ?? error
      }
      if (inspection !== undefined) {
        const { width, height } = await inspection.result()
        await assetRepository.setUpload(db, tenant, id, { width, height })
      }
      return part
    },

    async completeUpload(actor, tenant, id, parts) {
      await require(actor, P.write.id, tenant, id)
      const { asset, upload } = await pendingUpload(tenant, id)
      const { partCount } = partPlan(upload.size)
      const numbers = parts.map((p) => p.partNumber).sort((a, b) => a - b)
      if (numbers.length !== partCount || numbers.some((n, i) => n !== i + 1))
        throw new ValidationError('Invalid parts', [
          { path: ['parts'], message: `Send all ${partCount} parts, numbered 1–${partCount}` },
        ])
      const stored = await storage().completeMultipart(asset.objectKey, upload.id, parts)
      if (stored.size !== upload.size) {
        await storage().delete(asset.objectKey)
        await assetRepository.deletePending(db, tenant, id)
        throw new ValidationError('The assembled file has the wrong size: upload it again')
      }
      return service.markReady(actor, tenant, id, {
        sizeBytes: stored.size,
        sha256: null,
        width: asset.width,
        height: asset.height,
      })
    },

    async abortUpload(actor, tenant, id) {
      await require(actor, P.write.id, tenant, id)
      const asset = isId(id) ? await assetRepository.findById(db, tenant, id) : undefined
      if (asset === undefined) return
      if (asset.status !== 'pending') throw new ConflictError('The asset is already uploaded')
      if (asset.upload !== null) await storage().abortMultipart(asset.objectKey, asset.upload.id)
      await assetRepository.deletePending(db, tenant, id)
    },

    async deliver(actor, ref) {
      const missing = () => new NotFoundError('Asset not found')
      if (!isId(ref.assetId) || !isId(ref.spaceId)) throw missing()
      const asset = await assetRepository.findAnyById(db, ref.assetId)
      if (asset === undefined || asset.spaceId !== ref.spaceId || asset.status === 'pending')
        throw missing()
      const published = asset.publishedAt !== null
      if (!published) {
        try {
          await require(actor, P.previewRead.id, asset, asset.id)
        } catch {
          throw missing()
        }
      }
      if (fileIdOf(asset.objectKey) !== ref.fileId)
        return { type: 'redirect', location: assetPath(asset), published }
      return {
        type: 'file',
        asset: toAssetView(asset),
        published,
        async read(range) {
          const content = await storage().get(asset.objectKey, range === undefined ? {} : { range })
          if (content === undefined) throw missing()
          return content
        },
      }
    },

    async get(actor, tenant, id) {
      await require(actor, P.read.id, tenant, id)
      return toAssetView(await load(tenant, id))
    },

    async list(actor, tenant, query = {}) {
      await require(actor, P.read.id, tenant)
      const limit = query.limit ?? 25
      const issues: ValidationIssue[] = []
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        issues.push({ path: ['limit'], message: 'Use 1–100' })
      if (query.cursor !== undefined && !isId(query.cursor))
        issues.push({ path: ['cursor'], message: 'Use nextCursor from the previous page' })
      const state = query.state ?? 'draft'
      if (!['draft', 'published', 'pending'].includes(state))
        issues.push({ path: ['state'], message: 'Use draft, published, or pending' })
      if (issues.length > 0) throw new ValidationError('Invalid query', issues)
      const rows = await assetRepository.list(db, tenant, {
        status: state === 'pending' ? 'pending' : 'ready',
        published: state === 'published' ? true : undefined,
        mimePrefix: query.mimeType?.toLowerCase(),
        before: query.cursor,
        limit: limit + 1,
      })
      const page = rows.slice(0, limit)
      return {
        assets: page.map(toAssetView),
        nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      }
    },

    async updateMetadata(actor, tenant, id, input) {
      await require(actor, P.write.id, tenant, id)
      const asset = await load(tenant, id)
      if (asset.version !== input.expectedVersion) throw stale(asset.version)
      const issues: ValidationIssue[] = []
      const filename =
        input.filename === undefined ? undefined : checkFilename(String(input.filename), issues)
      const title = await checkText(tenant, 'title', input.title, issues)
      const description = await checkText(tenant, 'description', input.description, issues)
      if (issues.length > 0) throw new ValidationError('Invalid asset', issues)
      const updated = await withTransaction(db, async (tx) => {
        const row = await assetRepository.update(tx, tenant, id, input.expectedVersion, {
          ...(filename === undefined ? {} : { filename }),
          ...(title === undefined ? {} : { title }),
          ...(description === undefined ? {} : { description }),
          actor: actorId(actor),
        })
        if (row === undefined) throw stale(asset.version + 1)
        await events.emit(assetUpdated, payload(row), { transaction: toTransactionScope(tx) })
        return row
      })
      return toAssetView(updated)
    },

    async publish(actor, tenant, id) {
      await require(actor, P.publish.id, tenant, id)
      const asset = await load(tenant, id)
      if (asset.status === 'pending') throw new ConflictError('The asset is still uploading')
      if (asset.publishedAt !== null) return toAssetView(asset)
      const published = await withTransaction(db, async (tx) => {
        const row = await assetRepository.setPublished(tx, tenant, id, true, actorId(actor))
        if (row === undefined) throw new NotFoundError('Asset not found')
        await events.emit(assetPublished, payload(row), { transaction: toTransactionScope(tx) })
        return row
      })
      return toAssetView(published)
    },

    async unpublish(actor, tenant, id, options = {}) {
      await require(actor, P.publish.id, tenant, id)
      const asset = await load(tenant, id)
      if (asset.publishedAt === null) return toAssetView(asset)
      if (options.force !== true) await refuseIfLinked(tenant, id, 'unpublish')
      const draft = await withTransaction(db, async (tx) => {
        const row = await assetRepository.setPublished(tx, tenant, id, false, actorId(actor))
        if (row === undefined) throw new NotFoundError('Asset not found')
        await events.emit(assetUnpublished, payload(row), { transaction: toTransactionScope(tx) })
        return row
      })
      return toAssetView(draft)
    },

    async delete(actor, tenant, id, options = {}) {
      await require(actor, P.delete.id, tenant, id)
      const asset = await load(tenant, id)
      if (options.expectedVersion !== undefined && asset.version !== options.expectedVersion)
        throw stale(asset.version)
      if (asset.publishedAt !== null)
        throw new ConflictError('The asset is published: unpublish it first')
      if (options.force !== true) await refuseIfLinked(tenant, id, 'delete')
      await withTransaction(db, async (tx) => {
        if (!(await assetRepository.delete(tx, tenant, id)))
          throw new NotFoundError('Asset not found')
        await events.emit(assetDeleted, payload(asset), { transaction: toTransactionScope(tx) })
      })
    },
  }
  return service
}
