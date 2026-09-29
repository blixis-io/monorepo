import type { RateLimiter } from '@blixis-io/kernel'

/** A Workers Rate Limiting binding (`ratelimits` in `wrangler.jsonc`). */
export interface RateLimitBindingLike {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

/** One limiter: its binding name and the `simple.period` configured for it. */
export interface WorkersRateLimiterConfig {
  /** Binding name, e.g. `RATE_LIMIT_MANAGEMENT`. */
  readonly binding: string
  /** The binding's `simple.period` in seconds (Cloudflare allows 10 or 60). */
  readonly periodSeconds: 10 | 60
}

/** Wraps one Workers Rate Limiting binding as a kernel {@link RateLimiter}. */
export function workersRateLimiter(
  binding: RateLimitBindingLike,
  periodSeconds: number,
): RateLimiter {
  return {
    periodSeconds,
    limit: async (key) => (await binding.limit({ key })).success,
  }
}

/**
 * Limiters for `createBlixis({ rateLimits: { limiters } })` from Workers Rate Limiting bindings
 * (plan 020.003). The limit and window live in `wrangler.jsonc`, per environment; a binding that
 * is missing from the environment leaves its limiter unset, so that name is not limited.
 *
 * Counters are kept per Cloudflare location and are eventually consistent: good for abuse
 * protection, not for exact quotas.
 *
 * @example
 * createBlixis({
 *   modules,
 *   rateLimits: {
 *     limiters: workersRateLimiters({
 *       management: { binding: 'RATE_LIMIT_MANAGEMENT', periodSeconds: 60 },
 *     }),
 *     defaults: { actor: 'management' },
 *   },
 * })
 */
export function workersRateLimiters(
  config: Readonly<Record<string, WorkersRateLimiterConfig>>,
): (env: Readonly<Record<string, unknown>>) => Readonly<Record<string, RateLimiter | undefined>> {
  const cache = new WeakMap<object, Readonly<Record<string, RateLimiter | undefined>>>()
  return (env) => {
    const cached = cache.get(env)
    if (cached !== undefined) return cached
    const limiters = Object.fromEntries(
      Object.entries(config).map(([name, { binding, periodSeconds }]) => {
        const value = env[binding] as RateLimitBindingLike | undefined
        return [
          name,
          value !== undefined && typeof value.limit === 'function'
            ? workersRateLimiter(value, periodSeconds)
            : undefined,
        ]
      }),
    )
    cache.set(env, limiters)
    return limiters
  }
}
