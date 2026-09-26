import {
  type Actor,
  type AuthorizationService,
  actorId,
  ConflictError,
  createServiceToken,
  type EventBus,
  NotFoundError,
  type PermissionId,
  type ServiceToken,
  ValidationError,
  type ValidationIssue,
} from '@blixis/contracts'
import { type Database, isId, newId, toTransactionScope, withTransaction } from '@blixis/database'
import type { LocaleService } from '@blixis/spaces'
import type { AssetsConfig } from '../config.ts'
import {
  type Asset,
  type AssetStatus,
  assetStatus,
  BLOCKED_TYPES,
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
  }
}

/** The stored file of an upload, as measured by the storage. */
export interface StoredFile {
  readonly sizeBytes: number
  readonly sha256?: string | null | undefined
  readonly width?: number | null | undefined
  readonly height?: number | null | undefined
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
  /** Unpublishing a draft changes nothing. */
  unpublish(actor: Actor, tenant: EnvironmentTenant, id: string): Promise<AssetView>
  /**
   * Deletes an unpublished (or pending) asset; its file is deleted after the commit through
   * `asset.deleted`. @throws ConflictError while published or on a stale `expectedVersion`
   */
  delete(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    options?: { expectedVersion?: number | undefined },
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
    },
  }
}

export function createAssetService(deps: AssetServiceDeps): AssetService {
  const { db, authz, events, locales, config } = deps

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

  return {
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

    async unpublish(actor, tenant, id) {
      await require(actor, P.publish.id, tenant, id)
      const asset = await load(tenant, id)
      if (asset.publishedAt === null) return toAssetView(asset)
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
      await withTransaction(db, async (tx) => {
        if (!(await assetRepository.delete(tx, tenant, id)))
          throw new NotFoundError('Asset not found')
        await events.emit(assetDeleted, payload(asset), { transaction: toTransactionScope(tx) })
      })
    },
  }
}
