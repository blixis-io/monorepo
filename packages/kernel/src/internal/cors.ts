import type { Hono } from 'hono'
import type { BlixisHonoEnv } from '../hono-env.ts'

/** Cross-origin access for browser clients on other origins, e.g. the admin (ADR 0017). */
export interface CorsOptions {
  /**
   * Exact origins (`https://admin.example.com`) allowed to call the API with credentials — the
   * refresh cookie and `Authorization`. Receives the Worker environment. Everything else gets no
   * CORS headers, so browsers block it.
   */
  readonly origins: (env: Readonly<Record<string, unknown>>) => readonly string[]
}

const ALLOW_METHODS = 'GET, POST, PUT, PATCH, DELETE'
/** Request headers the Management API and GraphQL read. */
const ALLOW_HEADERS = [
  'authorization',
  'content-type',
  'content-disposition',
  'content-digest',
  'if-match',
  'if-none-match',
  'idempotency-key',
  'x-blixis-environment',
  'x-blixis-space',
  'x-correlation-id',
].join(', ')
/** Response headers clients may read. */
const EXPOSE_HEADERS = [
  'etag',
  'location',
  'retry-after',
  'x-request-id',
  'x-correlation-id',
  'x-blixis-cache',
].join(', ')

/**
 * Installs CORS before every other middleware: preflights from allowed origins answer `204`
 * without running the request pipeline; actual responses get `Access-Control-Allow-Origin` with
 * credentials. `Vary: Origin` keeps shared caches correct.
 */
export function installCors(app: Hono<BlixisHonoEnv>, options: CorsOptions): void {
  app.use('*', async (c, next) => {
    const origin = c.req.header('origin')
    const allowed =
      origin !== undefined &&
      options.origins((c.env ?? {}) as Readonly<Record<string, unknown>>).includes(origin)
    if (c.req.method === 'OPTIONS' && c.req.header('access-control-request-method') !== undefined) {
      if (!allowed) return c.body(null, 204, { vary: 'Origin' })
      return c.body(null, 204, {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
        'access-control-allow-methods': ALLOW_METHODS,
        'access-control-allow-headers': ALLOW_HEADERS,
        'access-control-max-age': '600',
        vary: 'Origin',
      })
    }
    await next()
    c.res.headers.append('vary', 'Origin')
    if (allowed) {
      c.res.headers.set('access-control-allow-origin', origin)
      c.res.headers.set('access-control-allow-credentials', 'true')
      c.res.headers.set('access-control-expose-headers', EXPOSE_HEADERS)
    }
    return undefined
  })
}
