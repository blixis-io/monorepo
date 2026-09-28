import type { RestOperation, SameShape } from '@blixis-io/contracts'
import { z } from 'zod'
import type { AssetView } from '../application/asset.service.ts'

const localized = z.record(z.string(), z.string()).describe('Text per locale code')

export const assetSchema = z
  .object({
    sys: z.object({
      id: z.string(),
      type: z.literal('asset'),
      environmentId: z.string(),
      version: z.number().int().describe('Send it back as `If-Match`'),
      status: z.enum(['pending', 'draft', 'published']),
      publishedAt: z.string().nullable(),
      firstPublishedAt: z.string().nullable(),
      createdAt: z.string(),
      updatedAt: z.string(),
      createdBy: z.string(),
      updatedBy: z.string(),
    }),
    fields: z.object({
      filename: z.string(),
      title: localized,
      description: localized,
      mimeType: z.string(),
      size: z.number().int().nullable().describe('Bytes; `null` while pending'),
      sha256: z.string().nullable(),
      width: z.number().int().nullable(),
      height: z.number().int().nullable(),
      url: z.string().nullable().describe('Path on the delivery route; `null` while pending'),
    }),
  })
  .meta({ id: 'Asset', description: 'A file with its metadata' })

const check: SameShape<z.output<typeof assetSchema>, AssetView> = true
void check

const ifMatch = { 'If-Match': 'Current version of the asset, e.g. `"2"`' }
const uploadHeaders = {
  'Content-Type': 'The file type, e.g. `image/png`',
  'Content-Length': 'Required: the exact size of the file',
  'Content-Disposition': "The file name: `attachment; filename*=UTF-8''name.png`",
  'Content-Digest': 'Optional SHA-256 (RFC 9530): `sha-256=:<base64>:`',
}
const one = { 200: { description: 'OK', schema: assetSchema } }
const part = z.object({ partNumber: z.number().int(), etag: z.string() })

/** Operations of `@blixis/assets` (ADR 0015). */
export const ASSET_OPERATIONS: readonly RestOperation[] = [
  {
    method: 'GET',
    path: '/spaces/:spaceId/assets',
    id: 'listAssets',
    tag: 'Assets',
    summary: 'List assets, newest first',
    permission: 'assets.read',
    request: {
      query: z.object({
        state: z.enum(['draft', 'published', 'pending']).optional(),
        mimeType: z.string().optional().describe('A type or prefix, e.g. `image/`'),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
        environment: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: 'OK',
        schema: z.object({ assets: z.array(assetSchema), nextCursor: z.string().nullable() }),
      },
    },
  },
  {
    method: 'POST',
    path: '/spaces/:spaceId/assets',
    id: 'uploadAsset',
    tag: 'Assets',
    summary: 'Upload a file in one request (≤ 90 MiB); the body is the file',
    permission: 'assets.write',
    request: { body: 'binary', headers: uploadHeaders },
    responses: { 201: { description: 'Created', schema: assetSchema } },
  },
  {
    method: 'POST',
    path: '/spaces/:spaceId/assets/uploads',
    id: 'startAssetUpload',
    tag: 'Assets',
    summary: 'Start a multipart upload for a large file',
    permission: 'assets.write',
    request: {
      body: z.object({
        filename: z.string(),
        mimeType: z.string(),
        size: z.number().int(),
        title: localized.optional(),
        description: localized.optional(),
      }),
    },
    responses: {
      201: {
        description: 'Created',
        schema: z.object({
          asset: assetSchema,
          partSize: z.number().int(),
          partCount: z.number().int(),
        }),
      },
    },
  },
  {
    method: 'PUT',
    path: '/assets/:assetId/upload/parts/:partNumber',
    id: 'uploadAssetPart',
    tag: 'Assets',
    summary: 'Upload one part (exactly `partSize` bytes, except the last)',
    permission: 'assets.write',
    request: { body: 'binary', headers: { 'Content-Length': 'Required: the part size' } },
    responses: { 200: { description: 'OK', schema: part } },
  },
  {
    method: 'POST',
    path: '/assets/:assetId/upload/complete',
    id: 'completeAssetUpload',
    tag: 'Assets',
    summary: 'Assemble the parts and create the asset',
    permission: 'assets.write',
    request: { body: z.object({ parts: z.array(part) }) },
    responses: one,
  },
  {
    method: 'DELETE',
    path: '/assets/:assetId/upload',
    id: 'abortAssetUpload',
    tag: 'Assets',
    summary: 'Abort a multipart upload',
    permission: 'assets.write',
    responses: { 204: { description: 'Aborted' } },
  },
  {
    method: 'GET',
    path: '/assets/:assetId',
    id: 'getAsset',
    tag: 'Assets',
    summary: 'Get an asset',
    permission: 'assets.read',
    responses: one,
  },
  {
    method: 'PATCH',
    path: '/assets/:assetId',
    id: 'updateAsset',
    tag: 'Assets',
    summary: 'Change the file name, title, or description',
    permission: 'assets.write',
    request: {
      headers: ifMatch,
      body: z.object({
        filename: z.string().optional(),
        title: localized.optional(),
        description: localized.optional(),
        expectedVersion: z.number().int().optional(),
      }),
    },
    responses: one,
  },
  {
    method: 'PUT',
    path: '/assets/:assetId/file',
    id: 'replaceAssetFile',
    tag: 'Assets',
    summary: 'Replace the file (single request); the old file is deleted after the change',
    permission: 'assets.write',
    request: { body: 'binary', headers: { ...uploadHeaders, ...ifMatch } },
    responses: one,
  },
  {
    method: 'DELETE',
    path: '/assets/:assetId',
    id: 'deleteAsset',
    tag: 'Assets',
    summary: 'Delete an unpublished asset and its file',
    permission: 'assets.delete',
    request: {
      headers: ifMatch,
      query: z.object({
        force: z.boolean().optional().describe('Also when published entries link to it'),
      }),
    },
    responses: { 204: { description: 'Deleted' } },
  },
  {
    method: 'POST',
    path: '/assets/:assetId/publish',
    id: 'publishAsset',
    tag: 'Assets',
    summary: 'Publish an asset',
    permission: 'assets.publish',
    request: { idempotent: true },
    responses: one,
  },
  {
    method: 'POST',
    path: '/assets/:assetId/unpublish',
    id: 'unpublishAsset',
    tag: 'Assets',
    summary: 'Unpublish an asset (refused while published entries use it, unless forced)',
    permission: 'assets.publish',
    request: { idempotent: true, body: z.object({ force: z.boolean().optional() }) },
    responses: one,
  },
]

/** The delivery route (outside `/api/v1`). */
export const ASSET_DELIVERY_OPERATIONS: readonly RestOperation[] = [
  {
    method: 'GET',
    path: '/:spaceId/:assetId/:fileId/:filename',
    id: 'downloadAsset',
    tag: 'Asset delivery',
    summary: 'Download a file: public when published, preview access otherwise',
    description: 'Supports `Range`, `If-None-Match`, and `HEAD`. Use the asset’s `fields.url`.',
    auth: false,
    responses: {
      200: { description: 'The file' },
      206: { description: 'A byte range' },
      302: { description: 'The URL names a replaced file; `Location` is the current one' },
      304: { description: 'Not modified' },
      416: { description: 'Range not satisfiable' },
    },
  },
]
