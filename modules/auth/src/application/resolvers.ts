import { type Actor, ANONYMOUS_ACTOR, UnauthorizedError } from '@blixis/contracts'
import type { ActorResolverEntry } from '@blixis/kernel'
import { verifyAccessToken } from '../domain/jwt.ts'
import { ACCESS_TOKEN_AUDIENCE } from './auth.service.ts'
import { AUTH_CONFIG, signingKeysFor } from './config.ts'

const BEARER = /^Bearer\s+(\S+)$/i

/** Auth routes that must work with a stale or invalid access token attached (e.g. refresh). */
const PUBLIC_AUTH_PATHS = new Set([
  '/api/v1/auth/sign-up',
  '/api/v1/auth/sign-in',
  '/api/v1/auth/refresh',
  '/api/v1/auth/sign-out',
  '/api/v1/auth/jwks',
])

/** The bearer token of a request, if it sends `Authorization: Bearer <token>`. */
export function bearerToken(request: Request): string | undefined {
  const header = request.headers.get('authorization')
  return header === null ? undefined : BEARER.exec(header)?.[1]
}

/**
 * Resolves `Authorization: Bearer <access JWT>` to a `user` actor (ADR 0009). It runs before the
 * request context exists (the context contains the actor), so it must not resolve services that
 * need `REQUEST_CONTEXT`. No database lookup:
 * the token is trusted until it expires (≤ 15 min). Bearer values starting with `blx_` are other
 * token kinds (API tokens) and left to their resolver. On public auth routes an invalid token is
 * ignored, so a client can always sign in or refresh.
 */
export const jwtActorResolver: ActorResolverEntry = {
  name: 'jwt',
  async resolve(request, services): Promise<Actor | undefined> {
    const token = bearerToken(request)
    if (token === undefined || token.startsWith('blx_')) return undefined
    try {
      // Runs before the request context exists, so only config-level services are used here.
      const config = services.get(AUTH_CONFIG)
      const claims = await verifyAccessToken(token, await signingKeysFor(config), {
        issuer: config.issuer ?? 'blixis',
        audience: ACCESS_TOKEN_AUDIENCE,
        nowSeconds: Math.floor(Date.now() / 1000),
      })
      return { type: 'user', userId: claims.sub }
    } catch (error) {
      if (
        error instanceof UnauthorizedError &&
        PUBLIC_AUTH_PATHS.has(new URL(request.url).pathname)
      ) {
        return ANONYMOUS_ACTOR
      }
      throw error
    }
  },
}
