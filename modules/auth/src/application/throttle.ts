import { RateLimitError } from '@blixis/contracts'
import type { Database } from '@blixis/database'
import { sql } from 'drizzle-orm'
import { sha256Hex } from '../domain/encoding.ts'

/** Limits for failed sign-ins (007.006). */
export interface ThrottlePolicy {
  /** Failed attempts per email within the window before locking. */
  readonly maxFailuresPerEmail: number
  /** Failed attempts per client IP within the window before locking. */
  readonly maxFailuresPerIp: number
  readonly windowMinutes: number
  /** First lock duration; doubles for every further failure while over the limit. */
  readonly baseLockSeconds: number
  readonly maxLockSeconds: number
}

export const DEFAULT_THROTTLE_POLICY: ThrottlePolicy = Object.freeze({
  maxFailuresPerEmail: 5,
  maxFailuresPerIp: 30,
  windowMinutes: 15,
  baseLockSeconds: 60,
  maxLockSeconds: 3600,
})

/**
 * Postgres-backed sign-in throttle. Chosen over the Workers Rate Limiting binding, which counts
 * per Cloudflare location and eventually — too loose for brute-force protection (§14: strict
 * counting does not belong in KV either). Keys are hashed; unknown emails are counted like known
 * ones so a lock never reveals whether an account exists.
 */
export function createSignInThrottle(db: Database, policy: ThrottlePolicy) {
  const keysFor = async (email: string, ip: string | undefined) => {
    const keys = [{ hash: await sha256Hex(`email:${email}`), max: policy.maxFailuresPerEmail }]
    if (ip !== undefined)
      keys.push({ hash: await sha256Hex(`ip:${ip}`), max: policy.maxFailuresPerIp })
    return keys
  }

  return {
    /** @throws RateLimitError (429 with Retry-After) while the email or IP is locked. */
    async assertAllowed(email: string, ip: string | undefined): Promise<void> {
      const hashes = (await keysFor(email, ip)).map((k) => k.hash)
      const { rows } = await db.execute<{ retry: number | null }>(sql`
        select ceil(extract(epoch from max(locked_until) - now()))::int as retry
        from auth.sign_in_throttle
        where key_hash in (${sql.join(
          hashes.map((h) => sql`${h}`),
          sql`, `,
        )}) and locked_until > now()`)
      const retry = rows[0]?.retry
      if (retry !== null && retry !== undefined && retry > 0) {
        throw new RateLimitError('Too many sign-in attempts; try again later', {
          retryAfterSeconds: retry,
        })
      }
    },

    /** Counts a failed attempt; locks with exponential backoff once over the limit. */
    async recordFailure(email: string, ip: string | undefined): Promise<void> {
      for (const key of await keysFor(email, ip)) {
        await db.execute(sql`
          insert into auth.sign_in_throttle as t (key_hash, failures, window_started_at)
          values (${key.hash}, 1, now())
          on conflict (key_hash) do update set
            failures = case
              when t.window_started_at < now() - make_interval(mins => ${policy.windowMinutes}) then 1
              else t.failures + 1 end,
            window_started_at = case
              when t.window_started_at < now() - make_interval(mins => ${policy.windowMinutes}) then now()
              else t.window_started_at end`)
        await db.execute(sql`
          update auth.sign_in_throttle
          set locked_until = now() + make_interval(secs => least(
            ${policy.maxLockSeconds},
            ${policy.baseLockSeconds} * power(2, greatest(failures - ${key.max}, 0))
          ))
          where key_hash = ${key.hash} and failures >= ${key.max}`)
      }
    },

    /** A successful sign-in clears the email's counter (the IP's stays: it may be shared). */
    async recordSuccess(email: string): Promise<void> {
      await db.execute(
        sql`delete from auth.sign_in_throttle where key_hash = ${await sha256Hex(`email:${email}`)}`,
      )
    },

    /** Removes counters that are neither locked nor within a window (cron). */
    async cleanup(): Promise<void> {
      await db.execute(sql`
        delete from auth.sign_in_throttle
        where (locked_until is null or locked_until < now())
          and window_started_at < now() - make_interval(mins => ${policy.windowMinutes})`)
    },
  }
}
