import { InfrastructureError, UnauthorizedError } from '@blixis/contracts'
import { fromBase64Url, toBase64Url } from './encoding.ts'

/** Claims of a Blixis access token (ADR 0009). No roles or permissions. */
export interface AccessTokenClaims {
  readonly iss: string
  readonly aud: string
  /** User id. */
  readonly sub: string
  /** Refresh-token family (the "session"). */
  readonly sid: string
  readonly iat: number
  readonly exp: number
  readonly jti: string
}

/** Signing and verification keys parsed from `AUTH_SIGNING_KEYS`. */
export interface SigningKeys {
  /** The first key: signs new tokens. */
  readonly current: { readonly kid: string; readonly privateKey: CryptoKey }
  /** All keys: verify tokens by `kid` (supports rotation). */
  readonly verification: ReadonlyMap<string, CryptoKey>
  /** Public JWKs for `GET /api/v1/auth/jwks`. */
  readonly publicJwks: readonly JsonWebKey[]
}

interface PrivateJwk extends JsonWebKey {
  kid?: string
}

const ED25519 = { name: 'Ed25519' } as const
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const LEEWAY_SECONDS = 30

/**
 * Parses `AUTH_SIGNING_KEYS`: a JSON array of Ed25519 private JWKs (`kty: OKP`, `crv: Ed25519`,
 * `d`, `x`, `kid`). The first signs; all verify.
 * @throws InfrastructureError (without key material in the message) when invalid.
 */
export async function importSigningKeys(json: string): Promise<SigningKeys> {
  let jwks: PrivateJwk[]
  try {
    jwks = JSON.parse(json) as PrivateJwk[]
  } catch {
    throw new InfrastructureError('AUTH_SIGNING_KEYS is not valid JSON')
  }
  if (!Array.isArray(jwks) || jwks.length === 0) {
    throw new InfrastructureError(
      'AUTH_SIGNING_KEYS must be a non-empty JSON array of Ed25519 JWKs',
    )
  }
  const verification = new Map<string, CryptoKey>()
  const publicJwks: JsonWebKey[] = []
  let current: SigningKeys['current'] | undefined
  for (const jwk of jwks) {
    if (
      jwk.kty !== 'OKP' ||
      jwk.crv !== 'Ed25519' ||
      typeof jwk.d !== 'string' ||
      typeof jwk.x !== 'string' ||
      !jwk.kid
    ) {
      throw new InfrastructureError(
        'AUTH_SIGNING_KEYS entries must be Ed25519 private JWKs with a kid',
      )
    }
    const publicJwk = {
      kty: 'OKP',
      crv: 'Ed25519',
      x: jwk.x,
      kid: jwk.kid,
      alg: 'EdDSA',
      use: 'sig',
    }
    const publicKey = await crypto.subtle.importKey('jwk', publicJwk, ED25519, true, ['verify'])
    verification.set(jwk.kid, publicKey)
    publicJwks.push(publicJwk)
    if (current === undefined) {
      const { kid, ...material } = jwk
      const privateKey = await crypto.subtle.importKey(
        'jwk',
        { ...material, key_ops: ['sign'] },
        ED25519,
        false,
        ['sign'],
      )
      current = { kid, privateKey }
    }
  }
  if (current === undefined) throw new InfrastructureError('AUTH_SIGNING_KEYS has no usable key')
  return { current, verification, publicJwks }
}

/** Generates a new Ed25519 private JWK with the given `kid` (for `pnpm auth:generate-key`). */
export async function generateSigningKey(kid: string): Promise<JsonWebKey & { kid: string }> {
  const pair = (await crypto.subtle.generateKey(ED25519, true, ['sign', 'verify'])) as CryptoKeyPair
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  return { kty: jwk.kty, crv: jwk.crv, d: jwk.d, x: jwk.x, kid } as JsonWebKey & { kid: string }
}

const segment = (value: unknown) => toBase64Url(encoder.encode(JSON.stringify(value)))

/** Signs `claims` as a compact JWS (`alg: EdDSA`, `typ: at+jwt`, `kid`). */
export async function signAccessToken(
  claims: AccessTokenClaims,
  keys: SigningKeys,
): Promise<string> {
  const header = { alg: 'EdDSA', typ: 'at+jwt', kid: keys.current.kid }
  const input = `${segment(header)}.${segment(claims)}`
  const signature = await crypto.subtle.sign(
    ED25519,
    keys.current.privateKey,
    encoder.encode(input),
  )
  return `${input}.${toBase64Url(new Uint8Array(signature))}`
}

/**
 * Verifies an access token strictly (ADR 0009): three segments, `alg` must be `EdDSA`, `typ`
 * `at+jwt`, known `kid`, valid signature, `iss`/`aud` match, `exp`/`iat` within 30 s leeway.
 * @throws UnauthorizedError — with a generic message; details never reach clients.
 */
export async function verifyAccessToken(
  token: string,
  keys: SigningKeys,
  expected: { readonly issuer: string; readonly audience: string; readonly nowSeconds: number },
): Promise<AccessTokenClaims> {
  const invalid = () => new UnauthorizedError('Invalid or expired access token')
  const parts = token.split('.')
  if (parts.length !== 3) throw invalid()
  const [h, p, s] = parts as [string, string, string]
  let header: { alg?: unknown; typ?: unknown; kid?: unknown }
  let claims: Partial<AccessTokenClaims>
  let signature: Uint8Array<ArrayBuffer>
  try {
    header = JSON.parse(decoder.decode(fromBase64Url(h)))
    claims = JSON.parse(decoder.decode(fromBase64Url(p)))
    signature = fromBase64Url(s)
  } catch {
    throw invalid()
  }
  if (header.alg !== 'EdDSA' || header.typ !== 'at+jwt' || typeof header.kid !== 'string')
    throw invalid()
  const key = keys.verification.get(header.kid)
  if (key === undefined) throw invalid()
  const ok = await crypto.subtle.verify(ED25519, key, signature, encoder.encode(`${h}.${p}`))
  if (!ok) throw invalid()
  const now = expected.nowSeconds
  if (
    claims.iss !== expected.issuer ||
    claims.aud !== expected.audience ||
    typeof claims.sub !== 'string' ||
    typeof claims.sid !== 'string' ||
    typeof claims.jti !== 'string' ||
    typeof claims.exp !== 'number' ||
    typeof claims.iat !== 'number' ||
    claims.exp + LEEWAY_SECONDS < now ||
    claims.iat - LEEWAY_SECONDS > now
  ) {
    throw invalid()
  }
  return claims as AccessTokenClaims
}
