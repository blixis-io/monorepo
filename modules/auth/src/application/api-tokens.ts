import {
  type ApiTokenActor,
  createServiceToken,
  isPermissionId,
  NotFoundError,
  type PermissionId,
  type ServiceToken,
  UnauthorizedError,
  ValidationError,
  validate,
} from '@blixis/contracts'
import { type Database, newId } from '@blixis/database'
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { randomBytes, sha256Hex, toBase64Url } from '../domain/encoding.ts'
import { apiTokens } from '../infrastructure/schema.ts'

/** Prefix of personal API tokens (ADR 0009 §7). */
export const API_TOKEN_PREFIX = 'blx_pat_'
/** `last_used_at` is written at most this often per token. */
const TOUCH_INTERVAL_MINUTES = 5

/** A personal API token as listed to its owner — never the secret or its hash. */
export interface ApiTokenRecord {
  readonly id: string
  readonly name: string
  /** First characters of the token, for recognising it (`blx_pat_Ab3d…`). */
  readonly prefix: string
  readonly scopes: readonly PermissionId[]
  readonly expiresAt: string | null
  readonly lastUsedAt: string | null
  readonly createdAt: string
}

/** Personal API tokens. Request-scoped: `services.get(API_TOKEN_SERVICE)`. */
export interface ApiTokenService {
  /**
   * Creates a token for `userId`. The plaintext is returned **only here**.
   * @throws ValidationError — invalid name, unknown scopes, or bad expiry
   */
  create(
    userId: string,
    input: { name: string; scopes?: readonly string[]; expiresInDays?: number },
  ): Promise<{ readonly token: string; readonly record: ApiTokenRecord }>
  /** The user's active (not revoked) tokens, newest first. */
  list(userId: string): Promise<readonly ApiTokenRecord[]>
  /** @throws NotFoundError when the token does not exist or belongs to someone else */
  revoke(userId: string, tokenId: string): Promise<void>
  /** Revokes every token of a user (e.g. on `user.disabled`). */
  revokeAll(userId: string): Promise<void>
  /** Resolves a presented token to an actor. @throws UnauthorizedError */
  authenticate(token: string): Promise<ApiTokenActor>
}

/** Request-scoped {@link ApiTokenService}, provided by `authModule()`. */
export const API_TOKEN_SERVICE: ServiceToken<ApiTokenService> =
  createServiceToken<ApiTokenService>('@blixis/auth.api-tokens')

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.string()).max(100).default([]),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
})

type Row = typeof apiTokens.$inferSelect
const toRecord = (row: Row): ApiTokenRecord => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  scopes: row.scopes as PermissionId[],
  expiresAt: row.expiresAt?.toISOString() ?? null,
  lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
})

/** Creates the {@link ApiTokenService} of one request scope. */
export function createApiTokenService(deps: {
  readonly db: Database
  /** Permission ids modules registered (kernel contributions); scopes must be among them. */
  readonly knownPermissions: ReadonlySet<string>
  readonly now: () => Date
}): ApiTokenService {
  const { db, knownPermissions, now } = deps
  const invalid = () => new UnauthorizedError('Invalid, expired, or revoked API token')

  return {
    async create(userId, input) {
      const values = await validate(createSchema, input, { message: 'Invalid API token' })
      const unknown = values.scopes.filter(
        (scope) => !isPermissionId(scope) || !knownPermissions.has(scope),
      )
      if (unknown.length > 0) {
        throw new ValidationError('Unknown scopes', [
          { path: ['scopes'], message: `Unknown permissions: ${unknown.join(', ')}` },
        ])
      }
      const token = `${API_TOKEN_PREFIX}${toBase64Url(randomBytes(32))}`
      const [row] = await db
        .insert(apiTokens)
        .values({
          id: newId(),
          userId,
          name: values.name,
          prefix: token.slice(0, API_TOKEN_PREFIX.length + 4),
          tokenHash: await sha256Hex(token),
          scopes: [...new Set(values.scopes)],
          expiresAt:
            values.expiresInDays === undefined
              ? null
              : new Date(now().getTime() + values.expiresInDays * 86_400_000),
        })
        .returning()
      if (row === undefined) throw new Error('insert returned no row')
      return { token, record: toRecord(row) }
    },

    async list(userId) {
      const rows = await db
        .select()
        .from(apiTokens)
        .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
        .orderBy(desc(apiTokens.createdAt))
      return rows.map(toRecord)
    },

    async revoke(userId, tokenId) {
      const rows = await db
        .update(apiTokens)
        .set({ revokedAt: now() })
        .where(
          and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)),
        )
        .returning({ id: apiTokens.id })
      if (rows.length === 0) throw new NotFoundError('API token not found')
    },

    async revokeAll(userId) {
      await db
        .update(apiTokens)
        .set({ revokedAt: now() })
        .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    },

    async authenticate(token) {
      if (!token.startsWith(API_TOKEN_PREFIX)) throw invalid()
      const [row] = await db
        .select()
        .from(apiTokens)
        .where(eq(apiTokens.tokenHash, await sha256Hex(token)))
      const at = now()
      if (
        row === undefined ||
        row.revokedAt !== null ||
        (row.expiresAt !== null && row.expiresAt <= at)
      )
        throw invalid()
      await db
        .update(apiTokens)
        .set({ lastUsedAt: at })
        .where(
          and(
            eq(apiTokens.id, row.id),
            or(
              isNull(apiTokens.lastUsedAt),
              lt(
                apiTokens.lastUsedAt,
                sql`now() - make_interval(mins => ${TOUCH_INTERVAL_MINUTES})`,
              ),
            ),
          ),
        )
      return {
        type: 'apiToken',
        tokenId: row.id,
        ownerId: row.userId,
        scopes: row.scopes as PermissionId[],
      }
    },
  }
}
