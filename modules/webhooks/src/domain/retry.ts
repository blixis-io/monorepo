/**
 * Retry policy of webhook deliveries (plan 015.003).
 *
 * - 2xx: succeeded.
 * - 408, 429, 5xx, redirects (not followed), timeouts, and network errors: retried.
 * - Other 4xx (e.g. 400, 401, 404, 410): abandoned at once — the receiver rejected the request,
 *   and sending it again won't change that.
 */

/** Delay before attempt `n + 1` after `n` failed attempts (seconds), before jitter. */
export const RETRY_DELAYS_SECONDS: readonly number[] = Object.freeze([
  60, // 1 min
  300, // 5 min
  900, // 15 min
  3600, // 1 h
  3 * 3600, // 3 h
  6 * 3600, // 6 h
  12 * 3600, // 12 h
])

/** Attempts per delivery: the first plus one per delay (about 22.5 hours in total). */
export const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1

/** Consecutive failed attempts (across deliveries) that disable a webhook. */
export const DISABLE_AFTER_FAILURES = 50

export type AttemptOutcome = 'succeeded' | 'retry' | 'abandon'

export function outcomeOf(statusCode: number | undefined): AttemptOutcome {
  if (statusCode === undefined) return 'retry'
  if (statusCode >= 200 && statusCode < 300) return 'succeeded'
  if (statusCode === 408 || statusCode === 429 || statusCode >= 500 || statusCode < 400)
    return 'retry'
  return 'abandon'
}

/** When to try again after `attempts` failed attempts, or `undefined` when out of attempts. */
export function nextAttemptAt(
  attempts: number,
  now: number,
  random: () => number = Math.random,
): Date | undefined {
  const delay = RETRY_DELAYS_SECONDS[attempts - 1]
  if (delay === undefined) return undefined
  // ±20% jitter spreads retries of many deliveries to one endpoint.
  return new Date(now + delay * 1000 * (0.8 + random() * 0.4))
}
