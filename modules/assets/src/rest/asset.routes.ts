import { type ModuleHonoEnv, TENANT_BINDER, ValidationError } from '@blixis/contracts'
import { requireTenant } from '@blixis/database'
import { idempotent } from '@blixis/database/idempotency'
import { spaceScoped } from '@blixis/spaces'
import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { ASSET_SERVICE, type AssetListQuery, type AssetView } from '../application/asset.service.ts'
import type { LocalizedText } from '../domain/asset.ts'
import { contentLength, filenameFromDisposition, sha256FromContentDigest } from './http.ts'

type Ctx = Context<ModuleHonoEnv>
const json = async (c: Ctx) => (await c.req.json().catch(() => ({}))) as Record<string, unknown>
const actorOf = (c: Ctx) => c.var.requestContext.actor
const assetId = (c: Ctx) => c.req.param('assetId') ?? ''
const assets = (c: Ctx) => c.var.services.get(ASSET_SERVICE)
const tenantOf = (c: Ctx) => {
  const { organizationId, spaceId, environmentId } = requireTenant(
    c.var.requestContext,
    'organizationId',
    'spaceId',
    'environmentId',
  )
  return { organizationId, spaceId, environmentId }
}
const text = (value: unknown) => value as LocalizedText | undefined

/**
 * Asset-id routes (§31): resolves the asset's tenant — verifying the actor may read it — and binds
 * it to the request, like `spaceScoped()` does for `/spaces/:spaceId`.
 */
export function assetScoped() {
  return async (c: Ctx, next: Next): Promise<void> => {
    const tenant = await assets(c).resolveTenant(actorOf(c), assetId(c))
    c.set('requestContext', c.var.services.get(TENANT_BINDER).bind(tenant))
    await next()
  }
}

/** `ETag` is the asset's version: `If-Match` on changes maps to `expectedVersion`. */
const withEtag = (c: Ctx, asset: AssetView) => c.header('ETag', `"${asset.sys.version}"`)

function expectedVersion(c: Ctx, body: Record<string, unknown> = {}): number | undefined {
  if (typeof body['expectedVersion'] === 'number') return body['expectedVersion']
  const header = c.req.header('if-match')
  if (header === undefined) return undefined
  const value = Number(header.replace(/^W\//, '').replaceAll('"', ''))
  if (!Number.isInteger(value))
    throw new ValidationError('Invalid If-Match', [
      { path: ['If-Match'], message: 'Use the ETag of the asset, e.g. "3"' },
    ])
  return value
}

/** The streamed file of an upload request: raw body with its type, length, and name. */
function rawFile(c: Ctx) {
  const body = c.req.raw.body
  const size = contentLength(c.req.header('content-length'))
  if (body === null || size === 0)
    throw new ValidationError('Empty upload', [{ path: ['body'], message: 'Send the file' }])
  return {
    body,
    size,
    mimeType: c.req.header('content-type') ?? '',
    filename:
      filenameFromDisposition(c.req.header('content-disposition')) ?? c.req.query('filename'),
    sha256: sha256FromContentDigest(c.req.header('content-digest')),
  }
}

function listQuery(c: Ctx): AssetListQuery {
  const query = c.req.query()
  const state = query['state']
  if (state !== undefined && state !== 'draft' && state !== 'published' && state !== 'pending')
    throw new ValidationError('Invalid query', [
      { path: ['state'], message: 'Use draft, published, or pending' },
    ])
  return {
    state,
    mimeType: query['mimeType'],
    limit: query['limit'] === undefined ? undefined : Number(query['limit']),
    cursor: query['cursor'],
  }
}

/** Asset management routes (plan 014.003). Handlers only translate HTTP ⇄ `ASSET_SERVICE`. */
export const assetRoutes = new Hono<ModuleHonoEnv>()
  .get('/spaces/:spaceId/assets', spaceScoped(), async (c) =>
    c.json(await assets(c).list(actorOf(c), tenantOf(c), listQuery(c))),
  )
  // Single-request upload: the body is the file (ADR 0013 §1).
  .post('/spaces/:spaceId/assets', spaceScoped(), async (c) => {
    const file = rawFile(c)
    const asset = await assets(c).upload(actorOf(c), tenantOf(c), {
      ...file,
      filename: file.filename ?? '',
    })
    withEtag(c, asset)
    return c.json(asset, 201)
  })
  // Multipart upload for large files: start, then parts, then complete.
  .post('/spaces/:spaceId/assets/uploads', spaceScoped(), async (c) => {
    const body = await json(c)
    const started = await assets(c).startUpload(actorOf(c), tenantOf(c), {
      filename: String(body['filename'] ?? ''),
      mimeType: String(body['mimeType'] ?? ''),
      size: Number(body['size']),
      title: text(body['title']),
      description: text(body['description']),
    })
    return c.json(started, 201)
  })
  .put('/assets/:assetId/upload/parts/:partNumber', assetScoped(), async (c) => {
    const file = rawFile(c)
    const part = await assets(c).uploadPart(
      actorOf(c),
      tenantOf(c),
      assetId(c),
      Number(c.req.param('partNumber')),
      file.body,
      file.size,
    )
    return c.json(part)
  })
  .post('/assets/:assetId/upload/complete', assetScoped(), async (c) => {
    const body = await json(c)
    const parts = Array.isArray(body['parts']) ? body['parts'] : []
    const asset = await assets(c).completeUpload(
      actorOf(c),
      tenantOf(c),
      assetId(c),
      parts.map((p: { partNumber?: unknown; etag?: unknown }) => ({
        partNumber: Number(p?.partNumber),
        etag: String(p?.etag ?? ''),
      })),
    )
    withEtag(c, asset)
    return c.json(asset)
  })
  .delete('/assets/:assetId/upload', assetScoped(), async (c) => {
    await assets(c).abortUpload(actorOf(c), tenantOf(c), assetId(c))
    return c.body(null, 204)
  })
  .get('/assets/:assetId', assetScoped(), async (c) => {
    const asset = await assets(c).get(actorOf(c), tenantOf(c), assetId(c))
    withEtag(c, asset)
    return c.json(asset)
  })
  .patch('/assets/:assetId', assetScoped(), async (c) => {
    const body = await json(c)
    const asset = await assets(c).updateMetadata(actorOf(c), tenantOf(c), assetId(c), {
      filename: typeof body['filename'] === 'string' ? body['filename'] : undefined,
      title: text(body['title']),
      description: text(body['description']),
      expectedVersion: expectedVersion(c, body) ?? Number.NaN,
    })
    withEtag(c, asset)
    return c.json(asset)
  })
  // Replaces the file (single request); the old file is deleted after the commit.
  .put('/assets/:assetId/file', assetScoped(), async (c) => {
    const file = rawFile(c)
    const asset = await assets(c).uploadReplacement(actorOf(c), tenantOf(c), assetId(c), {
      ...file,
      expectedVersion: expectedVersion(c) ?? Number.NaN,
    })
    withEtag(c, asset)
    return c.json(asset)
  })
  .delete('/assets/:assetId', assetScoped(), async (c) => {
    const version = expectedVersion(c)
    await assets(c).delete(
      actorOf(c),
      tenantOf(c),
      assetId(c),
      version === undefined ? {} : { expectedVersion: version },
    )
    return c.body(null, 204)
  })
  .post('/assets/:assetId/publish', assetScoped(), idempotent(), async (c) => {
    const asset = await assets(c).publish(actorOf(c), tenantOf(c), assetId(c))
    withEtag(c, asset)
    return c.json(asset)
  })
  .post('/assets/:assetId/unpublish', assetScoped(), idempotent(), async (c) => {
    const asset = await assets(c).unpublish(actorOf(c), tenantOf(c), assetId(c))
    withEtag(c, asset)
    return c.json(asset)
  })
