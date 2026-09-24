import {
  ConflictError,
  createServiceToken,
  defineMigration,
  type ServiceToken,
} from '@blixis/contracts'
import { sql } from 'drizzle-orm'
import type { Database } from '../create-database.ts'

/** Stores command results by idempotency key (§33). */
export interface IdempotencyService {
  /**
   * Runs `fn` once per `(scope, key)`:
   * - first call: runs `fn`, stores its (JSON) result when `shouldStore(result)` (default: always);
   * - repeat with the same `requestHash`: returns the stored result without running `fn`;
   * - repeat with a different `requestHash`: `ConflictError` (key reused for another request);
   * - repeat while the first is still running: `ConflictError` (retry later).
   * If `fn` throws, or the result is not stored, the key is released so the client can retry.
   */
  run<T>(
    scope: string,
    key: string,
    requestHash: string,
    fn: () => Promise<T>,
    options?: { readonly shouldStore?: (result: T) => boolean },
  ): Promise<{ readonly replayed: boolean; readonly result: T }>
}

/** Request-scoped {@link IdempotencyService}, provided by `idempotencyModule()`. */
export const IDEMPOTENCY: ServiceToken<IdempotencyService> = createServiceToken<IdempotencyService>(
  '@blixis/database.idempotency',
)

/** `blixis.idempotency_keys` (platform table, ADR 0007). */
export const createIdempotencyKeys = defineMigration({
  id: '0001_create_idempotency_keys',
  up: /* sql */ `
    create schema if not exists blixis;
    create table blixis.idempotency_keys (
      scope text not null,
      key text not null,
      request_hash text not null,
      status text not null check (status in ('in_progress', 'completed')),
      response jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      expires_at timestamptz not null,
      primary key (scope, key)
    );
    create index idempotency_keys_expires_idx on blixis.idempotency_keys (expires_at);
  `,
})

/** Options for {@link postgresIdempotency}. */
export interface IdempotencyOptions {
  /** How long a key is remembered. Default 24 hours. */
  readonly ttlSeconds?: number
  /** An `in_progress` key older than this is considered abandoned (crashed request). Default 60. */
  readonly staleSeconds?: number
}

/** {@link IdempotencyService} on `blixis.idempotency_keys`. */
export function postgresIdempotency(
  db: Database,
  options: IdempotencyOptions = {},
): IdempotencyService {
  const ttl = options.ttlSeconds ?? 86_400
  const stale = options.staleSeconds ?? 60
  const release = (scope: string, key: string) =>
    db.execute(sql`delete from blixis.idempotency_keys where scope = ${scope} and key = ${key}`)

  return {
    async run(scope, key, requestHash, fn, runOptions = {}) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const claimed = await db.execute(sql`
          insert into blixis.idempotency_keys (scope, key, request_hash, status, expires_at)
          values (${scope}, ${key}, ${requestHash}, 'in_progress', now() + make_interval(secs => ${ttl}))
          on conflict do nothing
          returning 1`)
        if (claimed.rows.length > 0) {
          let result: Awaited<ReturnType<typeof fn>>
          try {
            result = await fn()
          } catch (error) {
            await release(scope, key)
            throw error
          }
          if (runOptions.shouldStore !== undefined && !runOptions.shouldStore(result)) {
            await release(scope, key)
          } else {
            await db.execute(sql`
              update blixis.idempotency_keys
              set status = 'completed', response = ${JSON.stringify(result ?? null)}::jsonb, updated_at = now()
              where scope = ${scope} and key = ${key}`)
          }
          return { replayed: false, result }
        }
        const { rows } = await db.execute<{
          request_hash: string
          status: 'in_progress' | 'completed'
          response: unknown
          expired: boolean
          abandoned: boolean
        }>(sql`
          select request_hash, status, response,
                 expires_at < now() as expired,
                 status = 'in_progress' and updated_at < now() - make_interval(secs => ${stale}) as abandoned
          from blixis.idempotency_keys where scope = ${scope} and key = ${key}`)
        const row = rows[0]
        if (row === undefined) continue // released meanwhile: claim again
        if (row.expired || row.abandoned) {
          await release(scope, key)
          continue
        }
        if (row.request_hash !== requestHash) {
          throw new ConflictError('This Idempotency-Key was already used for a different request')
        }
        if (row.status === 'in_progress') {
          throw new ConflictError(
            'A request with this Idempotency-Key is still being processed; retry later',
          )
        }
        return { replayed: true, result: row.response as Awaited<ReturnType<typeof fn>> }
      }
      throw new ConflictError('Could not claim the Idempotency-Key; retry later')
    },
  }
}
