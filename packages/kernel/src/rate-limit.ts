import {
  type Actor,
  actorId,
  createServiceToken,
  type Logger,
  type ModuleHonoEnv,
  RateLimitError,
} from '@blixis-io/contracts'
import type { Context, MiddlewareHandler } from 'hono'

/**
 * One fixed-window limiter, such as a Workers Rate Limiting binding (`@blixis/cloudflare`
 * `workersRateLimiters`). The limit and window are part of the limiter, not of the call.
 */
export interface RateLimiter {
  /** Counts one request for `key`. Resolves `false` when the key is over its limit. */
  limit(key: string): Promise<boolean>
  /** Length of the window in seconds; limited clients get it as `Retry-After`. */
  readonly periodSeconds: number
}

/**
 * Route classes the kernel limits by default (architecture §28):
 *
 * - `anonymous`: requests without credentials, keyed by client IP (`cf-connecting-ip`);
 * - `delivery`: requests with a delivery or preview key, keyed by the key;
 * - `actor`: everything else authenticated (users, API tokens, system), keyed by the actor.
 */
export type RateLimitClass = 'anonymous' | 'delivery' | 'actor'

/** Rate limiting of every request (`createBlixis({ rateLimits })`). */
export interface RateLimitOptions {
  /**
   * The limiters of this invocation by name. Receives the Worker environment, where platform
   * bindings live. A name without a limiter (e.g. a binding missing locally) is not limited.
   */
  readonly limiters: (
    env: Readonly<Record<string, unknown>>,
  ) => Readonly<Record<string, RateLimiter | undefined>>
  /**
   * Limiter name per route class, applied to every request after authentication. Health checks
   * are never limited. A class without a name is not limited by default.
   */
  readonly defaults?: Readonly<Partial<Record<RateLimitClass, string>>>
}

/**
 * The limiters of the current request by name (request-scoped), when rate limiting is
 * configured. Used by {@link rateLimit}; modules rarely need it directly.
 */
export const RATE_LIMITERS = createServiceToken<(name: string) => RateLimiter | undefined>(
  '@blixis/kernel.rate-limiters',
)

/** The client IP Cloudflare reports, or `unknown` (e.g. in tests). */
export function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown'
}

/** Route class and key of a request for the default policies. */
export function rateLimitClassOf(actor: Actor, request: Request): [RateLimitClass, string] {
  if (actor.type === 'anonymous') return ['anonymous', `ip:${clientIp(request)}`]
  if (actor.type === 'deliveryKey') return ['delivery', actorId(actor)]
  return ['actor', actorId(actor)]
}

/**
 * Counts one request and throws `RateLimitError` (429 with `Retry-After`) when `key` is over the
 * limit. Fails open: a limiter that errors is logged and the request continues, so an outage of
 * the counter never takes the API down.
 */
export async function enforceRateLimit(
  limiter: RateLimiter,
  key: string,
  logger: Logger,
  name: string,
): Promise<void> {
  let allowed: boolean
  try {
    allowed = await limiter.limit(key)
  } catch (error) {
    logger.warn('rate_limit.unavailable', { limiter: name, error })
    return
  }
  logger.debug('rate_limit.checked', { limiter: name, allowed })
  if (allowed) return
  // Never the key: it may be an IP address.
  logger.info('rate_limit.exceeded', { limiter: name })
  throw new RateLimitError('Too many requests; try again later', {
    retryAfterSeconds: limiter.periodSeconds,
  })
}

/** Options for {@link rateLimit}. */
export interface RateLimitMiddlewareOptions {
  /** Name of the limiter (`RateLimitOptions.limiters`), e.g. `'expensive'`. */
  readonly limiter: string
  /**
   * The key to count, e.g. the actor or the IP. Defaults to the actor, or the client IP for
   * anonymous requests. Return `undefined` to skip limiting for this request.
   */
  readonly key?: (c: Context<ModuleHonoEnv>) => string | undefined
}

/**
 * Middleware for module routes that need a tighter limit than the defaults, on top of them:
 *
 * @example
 * app.post('/exports', rateLimit({ limiter: 'expensive' }), handler)
 *
 * Does nothing when the app has no rate limiting or no limiter of that name.
 */
export function rateLimit(options: RateLimitMiddlewareOptions): MiddlewareHandler<ModuleHonoEnv> {
  return async (c, next) => {
    const limiter = c.get('services')?.getOptional(RATE_LIMITERS)?.(options.limiter)
    const context = c.get('requestContext')
    if (limiter !== undefined && context !== undefined) {
      const key = options.key ? options.key(c) : rateLimitClassOf(context.actor, c.req.raw)[1]
      if (key !== undefined) await enforceRateLimit(limiter, key, context.logger, options.limiter)
    }
    await next()
  }
}
