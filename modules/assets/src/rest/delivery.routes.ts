import type { ModuleHonoEnv, ObjectRange } from '@blixis-io/contracts'
import { Hono } from 'hono'
import { ASSET_SERVICE } from '../application/asset.service.ts'
import { ASSETS_CONFIG } from '../config.ts'
import { inlineType } from '../domain/asset.ts'
import { contentDisposition } from './http.ts'

/**
 * `Range: bytes=…` → one range within `size`; `'unsatisfiable'`; or `undefined` (no range, or
 * several ranges, which are answered with the whole file as RFC 9110 allows).
 */
export function parseRange(
  header: string | undefined,
  size: number,
): { offset: number; length: number } | 'unsatisfiable' | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '')
  if (match === null) return undefined
  const [, from = '', to = ''] = match
  if (from === '' && to === '') return undefined
  if (from === '') {
    const suffix = Number(to)
    if (suffix === 0 || size === 0) return 'unsatisfiable'
    const length = Math.min(suffix, size)
    return { offset: size - length, length }
  }
  const offset = Number(from)
  if (offset >= size) return 'unsatisfiable'
  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1)
  if (end < offset) return 'unsatisfiable'
  return { offset, length: end - offset + 1 }
}

/** Headers every delivered file gets (ADR 0013 §5): no sniffing, no scripts, safe disposition. */
const SAFE_HEADERS = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'accept-ranges': 'bytes',
}

/**
 * Delivery route for asset files (014.004), mounted at the site root:
 * `GET /assets/:spaceId/:assetId/:fileId/:filename`. The file name is cosmetic.
 */
export const deliveryRoutes = new Hono<ModuleHonoEnv>().get(
  '/:spaceId/:assetId/:fileId/:filename',
  async (c) => {
    const config = c.var.services.get(ASSETS_CONFIG)
    const delivery = await c.var.services.get(ASSET_SERVICE).deliver(c.var.requestContext.actor, {
      spaceId: c.req.param('spaceId'),
      assetId: c.req.param('assetId'),
      fileId: c.req.param('fileId'),
    })
    const caching: Record<string, string> = delivery.published
      ? {
          'cache-control': `public, max-age=${config.deliveryMaxAge}`,
          'access-control-allow-origin': '*',
          'cross-origin-resource-policy': 'cross-origin',
        }
      : { 'cache-control': 'private, no-store', vary: 'Authorization' }

    if (delivery.type === 'redirect') {
      return new Response(null, {
        status: 302,
        headers: {
          location: delivery.location,
          ...caching,
          ...(delivery.published ? { 'cache-control': 'public, max-age=60' } : {}),
        },
      })
    }

    const { asset } = delivery
    const size = asset.fields.size ?? 0
    // The URL names an immutable file, so its id is a strong validator.
    const etag = `"${c.req.param('fileId')}"`
    const headers: Record<string, string> = {
      ...SAFE_HEADERS,
      ...caching,
      etag,
      'content-type': asset.fields.mimeType,
      'content-disposition': contentDisposition(
        inlineType(asset.fields.mimeType) ? 'inline' : 'attachment',
        asset.fields.filename,
      ),
    }
    if (
      c.req
        .header('if-none-match')
        ?.split(',')
        .some((tag) => tag.trim() === etag)
    )
      return new Response(null, { status: 304, headers })

    const range = parseRange(c.req.header('range'), size)
    if (range === 'unsatisfiable')
      return new Response(null, {
        status: 416,
        headers: { ...headers, 'content-range': `bytes */${size}` },
      })
    if (c.req.method === 'HEAD')
      return new Response(null, {
        status: 200,
        headers: { ...headers, 'content-length': String(size) },
      })

    const content = await delivery.read(range as ObjectRange | undefined)
    if (range === undefined)
      return new Response(content.body, {
        status: 200,
        headers: { ...headers, 'content-length': String(content.size) },
      })
    return new Response(content.body, {
      status: 206,
      headers: {
        ...headers,
        'content-length': String(range.length),
        'content-range': `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`,
      },
    })
  },
)
