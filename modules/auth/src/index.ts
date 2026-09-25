/**
 * `@blixis/auth` — authentication (architecture §30, ADR 0009): passwords (scrypt), EdDSA JWT
 * access tokens, rotating refresh tokens, and `/api/v1/auth/*`. Authorization is plan 009.
 *
 * @packageDocumentation
 */
export {
  AUTH_SERVICE,
  type Authentication,
  type AuthPolicy,
  type AuthService,
  type ClientInfo,
  DEFAULT_AUTH_POLICY,
  type IssuedTokens,
} from './application/auth.service.ts'
export { AUTH_CONFIG, type AuthConfig } from './application/config.ts'
export { bearerToken, jwtActorResolver } from './application/resolvers.ts'
export { type AccessTokenClaims, generateSigningKey } from './domain/jwt.ts'
export { userSignedIn, userSignedOut } from './events.ts'
export { type AuthModuleOptions, authModule } from './module.ts'
export { REFRESH_COOKIE } from './rest/routes.ts'
