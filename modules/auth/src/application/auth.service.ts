import {
  createServiceToken,
  type EventBus,
  type Logger,
  type ServiceToken,
  UnauthorizedError,
  validate,
} from '@blixis/contracts'
import { type Database, newId, toTransactionScope, withTransaction } from '@blixis/database'
import { displayNameSchema, emailSchema, type User, type UserService } from '@blixis/users'
import { z } from 'zod'
import { randomBytes, sha256Hex, toBase64Url } from '../domain/encoding.ts'
import { type AccessTokenClaims, signAccessToken, verifyAccessToken } from '../domain/jwt.ts'
import {
  assertAcceptablePassword,
  burnPasswordCheck,
  hashPassword,
  verifyPassword,
} from '../domain/password.ts'
import { userSignedIn, userSignedOut } from '../events.ts'
import { credentialRepository, refreshTokenRepository } from '../infrastructure/repositories.ts'
import { type AuthConfig, signingKeysFor } from './config.ts'

/** Lifetimes and rules (ADR 0009). */
export interface AuthPolicy {
  readonly accessTokenTtlSeconds: number
  readonly refreshTokenTtlDays: number
  readonly familyMaxDays: number
  /** Window in which an already-rotated refresh token is still accepted (concurrent tabs). */
  readonly rotationGraceSeconds: number
  readonly blockedPasswords?: ReadonlySet<string>
}

export const DEFAULT_AUTH_POLICY: AuthPolicy = Object.freeze({
  accessTokenTtlSeconds: 900,
  refreshTokenTtlDays: 30,
  familyMaxDays: 90,
  rotationGraceSeconds: 10,
})

/** Tokens returned to a client after sign-up, sign-in, or refresh. */
export interface IssuedTokens {
  readonly accessToken: string
  /** Seconds until the access token expires. */
  readonly expiresIn: number
  /** Opaque; deliver as an HttpOnly cookie to browsers. */
  readonly refreshToken: string
  readonly refreshTokenExpiresAt: string
}

/** Result of a successful authentication. */
export interface Authentication {
  readonly user: User
  readonly tokens: IssuedTokens
}

/** Client metadata stored with refresh tokens (no IPs). */
export interface ClientInfo {
  readonly userAgent?: string
}

/** Authentication flows (ADR 0009). Request-scoped: `services.get(AUTH_SERVICE)`. */
export interface AuthService {
  /**
   * Creates a user with a password, without signing in (CLI bootstrap, admin invites).
   * @throws ValidationError, ConflictError (email taken)
   */
  createAccount(input: { email: string; displayName: string; password: string }): Promise<User>
  /** @throws ValidationError, ConflictError (email taken) */
  signUp(
    input: { email: string; displayName: string; password: string },
    client?: ClientInfo,
  ): Promise<Authentication>
  /** @throws UnauthorizedError('Invalid email or password') — never reveals which part was wrong */
  signIn(input: { email: string; password: string }, client?: ClientInfo): Promise<Authentication>
  /** Rotates a refresh token. Reuse after the grace window revokes the family. @throws UnauthorizedError */
  refresh(refreshToken: string, client?: ClientInfo): Promise<Authentication>
  /** Revokes the token's family. Unknown tokens are ignored (idempotent). */
  signOut(refreshToken: string): Promise<void>
  /** Verifies an access token (actor resolution, 007.004). @throws UnauthorizedError */
  verifyAccessToken(token: string): Promise<AccessTokenClaims>
  /** Public keys for `GET /api/v1/auth/jwks`. */
  publicKeys(): Promise<readonly JsonWebKey[]>
}

/** Request-scoped {@link AuthService}, provided by `authModule()`. */
export const AUTH_SERVICE: ServiceToken<AuthService> =
  createServiceToken<AuthService>('@blixis/auth.service')

/** `aud` of access tokens. */
export const ACCESS_TOKEN_AUDIENCE = 'blixis-api'
const AUDIENCE = ACCESS_TOKEN_AUDIENCE
const invalidCredentials = () => new UnauthorizedError('Invalid email or password')
const invalidRefresh = () => new UnauthorizedError('Invalid or expired refresh token')

const signUpSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  password: z.string(),
})
const signInSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().max(1024),
})

/** Creates the {@link AuthService} of one request scope. */
export function createAuthService(deps: {
  readonly db: Database
  readonly users: UserService
  readonly events: EventBus
  /** Resolved lazily: flows that don't issue tokens need no signing keys. */
  readonly config: () => AuthConfig
  readonly policy: AuthPolicy
  readonly logger: Logger
  readonly now: () => Date
}): AuthService {
  const { db, users, events, config, policy, logger, now } = deps
  const issuer = () => config().issuer ?? 'blixis'

  async function issue(
    user: User,
    familyId: string,
    familyExpiresAt: Date,
    client: ClientInfo,
  ): Promise<IssuedTokens> {
    const issuedAt = now()
    const refreshToken = `blx_rt_${toBase64Url(randomBytes(32))}`
    const expiresAt = new Date(
      Math.min(
        issuedAt.getTime() + policy.refreshTokenTtlDays * 86_400_000,
        familyExpiresAt.getTime(),
      ),
    )
    await refreshTokenRepository.insert(db, {
      id: newId(),
      tokenHash: await sha256Hex(refreshToken),
      familyId,
      userId: user.id,
      expiresAt,
      familyExpiresAt,
      userAgent: client.userAgent?.slice(0, 256) ?? null,
    })
    const iat = Math.floor(issuedAt.getTime() / 1000)
    const accessToken = await signAccessToken(
      {
        iss: issuer(),
        aud: AUDIENCE,
        sub: user.id,
        sid: familyId,
        iat,
        exp: iat + policy.accessTokenTtlSeconds,
        jti: newId(),
      },
      await signingKeysFor(config()),
    )
    return {
      accessToken,
      expiresIn: policy.accessTokenTtlSeconds,
      refreshToken,
      refreshTokenExpiresAt: expiresAt.toISOString(),
    }
  }

  async function startFamily(user: User, client: ClientInfo): Promise<IssuedTokens> {
    const familyId = newId()
    const tokens = await issue(
      user,
      familyId,
      new Date(now().getTime() + policy.familyMaxDays * 86_400_000),
      client,
    )
    await events.emit(userSignedIn, { userId: user.id, familyId })
    return tokens
  }

  const service: AuthService = {
    async createAccount(input) {
      const values = await validate(signUpSchema, input, { message: 'Invalid sign-up' })
      assertAcceptablePassword(values.password, policy.blockedPasswords)
      const passwordHash = await hashPassword(values.password)
      return withTransaction(db, async (tx) => {
        const created = await users.create(
          { email: values.email, displayName: values.displayName },
          { transaction: toTransactionScope(tx) },
        )
        await credentialRepository.upsert(tx, created.id, passwordHash)
        return created
      })
    },

    async signUp(input, client = {}) {
      const user = await service.createAccount(input)
      return { user, tokens: await startFamily(user, client) }
    },

    async signIn(input, client = {}) {
      const values = await validate(signInSchema, input, { message: 'Invalid sign-in' })
      const user = await users.findByEmail(values.email)
      const stored =
        user === undefined ? undefined : await credentialRepository.passwordHash(db, user.id)
      if (user === undefined || stored === undefined) {
        await burnPasswordCheck(values.password)
        throw invalidCredentials()
      }
      const { valid, needsRehash } = await verifyPassword(values.password, stored)
      if (!valid || user.status !== 'active') throw invalidCredentials()
      if (needsRehash)
        await credentialRepository.upsert(db, user.id, await hashPassword(values.password))
      return { user, tokens: await startFamily(user, client) }
    },

    async refresh(refreshToken, client = {}) {
      const row = await refreshTokenRepository.findByHash(db, await sha256Hex(refreshToken))
      const at = now().getTime()
      if (
        row === undefined ||
        row.revokedAt !== null ||
        row.expiresAt.getTime() <= at ||
        row.familyExpiresAt.getTime() <= at
      ) {
        throw invalidRefresh()
      }
      if (
        row.rotatedAt !== null &&
        at - row.rotatedAt.getTime() > policy.rotationGraceSeconds * 1000
      ) {
        // Reuse of an old token: someone else may hold the family. Revoke all of it.
        await refreshTokenRepository.revokeFamily(db, row.familyId)
        logger.warn('auth.refresh_reuse', { userId: row.userId, familyId: row.familyId })
        throw invalidRefresh()
      }
      if (row.rotatedAt === null) await refreshTokenRepository.markRotated(db, row.id)
      const user = await users.findById(row.userId)
      if (user === undefined || user.status !== 'active') {
        await refreshTokenRepository.revokeFamily(db, row.familyId)
        throw invalidRefresh()
      }
      return { user, tokens: await issue(user, row.familyId, row.familyExpiresAt, client) }
    },

    async signOut(refreshToken) {
      const row = await refreshTokenRepository.findByHash(db, await sha256Hex(refreshToken))
      if (row === undefined) return
      await refreshTokenRepository.revokeFamily(db, row.familyId)
      await events.emit(userSignedOut, { userId: row.userId, familyId: row.familyId })
    },

    async verifyAccessToken(token) {
      return verifyAccessToken(token, await signingKeysFor(config()), {
        issuer: issuer(),
        audience: AUDIENCE,
        nowSeconds: Math.floor(now().getTime() / 1000),
      })
    },

    async publicKeys() {
      return (await signingKeysFor(config())).publicJwks
    },
  }
  return service
}
