import { ValidationError } from '@blixis-io/contracts'
import type { Context, Hono, MiddlewareHandler, Next } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { BlixisHonoEnv } from '../hono-env.ts'

/**
 * Headers every API response carries (security review 020.004). Set only when the handler did
 * not: asset delivery sends its own sandboxing CSP, and the GraphiQL page (never in production)
 * needs scripts, so HTML responses get no default CSP.
 */
const BASELINE: readonly (readonly [string, string])[] = [
  ['x-content-type-options', 'nosniff'],
  ['referrer-policy', 'no-referrer'],
  ['strict-transport-security', 'max-age=63072000; includeSubDomains'],
  ['x-frame-options', 'DENY'],
]
const API_CSP = "default-src 'none'; frame-ancestors 'none'"

/** Installs the baseline headers as the outermost middleware, so every response gets them. */
export function installSecurityHeaders(app: Hono<BlixisHonoEnv>): void {
  app.use('*', async (c, next) => {
    await next()
    try {
      const headers = c.res.headers
      for (const [name, value] of BASELINE) if (!headers.has(name)) headers.set(name, value)
      const type = headers.get('content-type') ?? ''
      if (!headers.has('content-security-policy') && !type.startsWith('text/html'))
        headers.set('content-security-policy', API_CSP)
    } catch {
      // Immutable headers (a passed-through response): leave them as they are.
    }
  })
}

/** Default limit for JSON request bodies (`createBlixis({ maxJsonBodyBytes })`). */
export const DEFAULT_MAX_JSON_BODY_BYTES = 1024 * 1024

const JSON_TYPE = /^application\/([\w.+-]+\+)?json\b/i

/**
 * Caps JSON request bodies (with or without `Content-Length`), so one request can't make the
 * isolate parse megabytes of JSON. Other content types pass through: raw asset uploads have their
 * own limits (ADR 0013), and GraphQL has `maxBodyBytes`.
 */
export function jsonBodyLimit(
  maxBytes: number,
): (c: Context<BlixisHonoEnv>, next: Next) => Promise<void> {
  const limit: MiddlewareHandler<BlixisHonoEnv> = bodyLimit({
    maxSize: maxBytes,
    onError: () => {
      throw new ValidationError('The request body is too large', [
        { path: [], message: `JSON bodies are limited to ${maxBytes} bytes`, code: 'too_large' },
      ])
    },
  })
  return async (c, next) => {
    if (JSON_TYPE.test(c.req.header('content-type') ?? '')) await limit(c, next)
    else await next()
  }
}
