import { createServiceToken, type ServiceToken } from '@blixis/contracts'
import { importSigningKeys, type SigningKeys } from '../domain/jwt.ts'

/**
 * Deployment configuration of `@blixis/auth`, provided by the app (it reads Worker secrets and
 * vars; the module itself never touches bindings — §19).
 */
export interface AuthConfig {
  /** JSON array of Ed25519 private JWKs (secret `AUTH_SIGNING_KEYS`); the first signs. */
  readonly signingKeys: string
  /** Origins allowed to use cookie-based refresh and sign-out (CSRF, ADR 0009). */
  readonly allowedOrigins: readonly string[]
  /** `iss` of access tokens. Default `blixis`. */
  readonly issuer?: string
}

/** Request-scoped {@link AuthConfig}. */
export const AUTH_CONFIG: ServiceToken<AuthConfig> =
  createServiceToken<AuthConfig>('@blixis/auth.config')

const keyCache = new Map<string, Promise<SigningKeys>>()

/** Imports signing keys once per isolate and key set. */
export function signingKeysFor(config: AuthConfig): Promise<SigningKeys> {
  let keys = keyCache.get(config.signingKeys)
  if (keys === undefined) {
    keys = importSigningKeys(config.signingKeys)
    keys.catch(() => keyCache.delete(config.signingKeys))
    keyCache.set(config.signingKeys, keys)
  }
  return keys
}
