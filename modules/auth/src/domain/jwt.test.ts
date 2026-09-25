import { UnauthorizedError } from '@blixis/contracts'
import { beforeAll, describe, expect, it } from 'vitest'
import { toBase64Url } from './encoding.ts'
import {
  type AccessTokenClaims,
  generateSigningKey,
  importSigningKeys,
  type SigningKeys,
  signAccessToken,
  verifyAccessToken,
} from './jwt.ts'

const now = 1_790_000_000
const claims: AccessTokenClaims = {
  iss: 'blixis',
  aud: 'blixis-api',
  sub: 'u1',
  sid: 'f1',
  iat: now,
  exp: now + 900,
  jti: 'j1',
}
const expected = { issuer: 'blixis', audience: 'blixis-api', nowSeconds: now }
const tamper = (token: string, part: 0 | 1, value: object) => {
  const parts = token.split('.')
  parts[part] = toBase64Url(new TextEncoder().encode(JSON.stringify(value)))
  return parts.join('.')
}

describe('access tokens (EdDSA JWT)', () => {
  let keys: SigningKeys
  let rotated: SigningKeys
  beforeAll(async () => {
    const k1 = await generateSigningKey('k1')
    const k2 = await generateSigningKey('k2')
    keys = await importSigningKeys(JSON.stringify([k1]))
    rotated = await importSigningKeys(JSON.stringify([k2, k1]))
  })

  it('signs and verifies, exposing only public keys', async () => {
    const token = await signAccessToken(claims, keys)
    expect(await verifyAccessToken(token, keys, expected)).toEqual(claims)
    expect(keys.publicJwks[0]).toEqual(
      expect.objectContaining({ kty: 'OKP', crv: 'Ed25519', kid: 'k1', alg: 'EdDSA' }),
    )
    expect(JSON.stringify(keys.publicJwks)).not.toContain('"d"')
  })

  it('verifies old tokens after key rotation (new key signs, old key still verifies)', async () => {
    const old = await signAccessToken(claims, keys)
    expect(await verifyAccessToken(old, rotated, expected)).toEqual(claims)
    const fresh = await signAccessToken(claims, rotated)
    expect(JSON.parse(atob(fresh.split('.')[0] ?? ''))).toMatchObject({ kid: 'k2' })
  })

  it.each([
    ['alg none', (t: string) => tamper(t, 0, { alg: 'none', typ: 'at+jwt', kid: 'k1' })],
    ['alg HS256', (t: string) => tamper(t, 0, { alg: 'HS256', typ: 'at+jwt', kid: 'k1' })],
    ['unknown kid', (t: string) => tamper(t, 0, { alg: 'EdDSA', typ: 'at+jwt', kid: 'nope' })],
    ['wrong typ', (t: string) => tamper(t, 0, { alg: 'EdDSA', typ: 'JWT', kid: 'k1' })],
    ['changed claims', (t: string) => tamper(t, 1, { ...claims, sub: 'admin' })],
    ['garbage', () => 'a.b.c'],
    ['two segments', (t: string) => t.split('.').slice(0, 2).join('.')],
  ])('rejects %s', async (_name, mutate) => {
    const token = mutate(await signAccessToken(claims, keys))
    await expect(verifyAccessToken(token, keys, expected)).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('checks expiry (30 s leeway), issuer, and audience', async () => {
    const token = await signAccessToken(claims, keys)
    await expect(
      verifyAccessToken(token, keys, { ...expected, nowSeconds: now + 929 }),
    ).resolves.toBeDefined()
    await expect(
      verifyAccessToken(token, keys, { ...expected, nowSeconds: now + 931 }),
    ).rejects.toThrow(UnauthorizedError)
    await expect(verifyAccessToken(token, keys, { ...expected, issuer: 'other' })).rejects.toThrow(
      UnauthorizedError,
    )
    await expect(
      verifyAccessToken(token, keys, { ...expected, audience: 'other' }),
    ).rejects.toThrow(UnauthorizedError)
  })

  it('rejects invalid key configuration without echoing key material', async () => {
    await expect(importSigningKeys('not json')).rejects.toThrow(
      'AUTH_SIGNING_KEYS is not valid JSON',
    )
    await expect(importSigningKeys('[{"kty":"RSA","d":"secret-material"}]')).rejects.toThrow(
      /Ed25519 private JWKs/,
    )
    await expect(importSigningKeys('[{"kty":"RSA","d":"secret-material"}]')).rejects.not.toThrow(
      /secret-material/,
    )
  })
})
