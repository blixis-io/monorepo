import { InfrastructureError } from '@blixis/contracts'

/** Prefix of webhook signing secrets. */
export const WEBHOOK_SECRET_PREFIX = 'whsec_'

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
const fromB64 = (text: string) => {
  const normal = text.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(normal), (c) => c.charCodeAt(0))
}

/** A new signing secret: `whsec_` + 32 random bytes, base64url. */
export function generateWebhookSecret(): string {
  return WEBHOOK_SECRET_PREFIX + b64url(crypto.getRandomValues(new Uint8Array(32)))
}

/** A new `WEBHOOK_SECRET_KEYS` entry: `<kid>:<base64 of 32 random bytes>`. */
export function generateWebhookKey(kid: string): string {
  return `${kid}:${btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))}`
}

interface Key {
  readonly kid: string
  readonly key: CryptoKey
}
const parsed = new Map<string, Promise<Key[]>>()

/**
 * Parses `WEBHOOK_SECRET_KEYS` — `kid:base64key[,kid:base64key…]`, 32-byte AES keys. The first
 * key encrypts; every key decrypts (rotation: prepend a new key, re-encrypt, then drop the old).
 * Parsed once per isolate.
 */
export function secretKeys(value: string): Promise<Key[]> {
  let keys = parsed.get(value)
  if (keys === undefined) {
    keys = Promise.all(
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '')
        .map(async (entry) => {
          const [kid, material] = entry.split(':')
          const raw = material === undefined ? new Uint8Array() : fromB64(material)
          if (kid === undefined || kid === '' || raw.length !== 32)
            throw new InfrastructureError(
              'WEBHOOK_SECRET_KEYS must be kid:base64 entries of 32-byte keys (pnpm webhooks:generate-key)',
            )
          const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
            'encrypt',
            'decrypt',
          ])
          return { kid, key }
        }),
    )
    parsed.set(value, keys)
  }
  return keys
}

/** Encrypts `secret` bound to `context` (the webhook id): `v1.<kid>.<iv>.<ciphertext>`. */
export async function encryptSecret(keys: readonly Key[], secret: string, context: string) {
  const [current] = keys
  if (current === undefined) throw new InfrastructureError('No webhook secret key configured')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) },
    current.key,
    new TextEncoder().encode(secret),
  )
  return `v1.${current.kid}.${b64url(iv)}.${b64url(new Uint8Array(cipher))}`
}

/** Decrypts a value from {@link encryptSecret}. @throws InfrastructureError (unknown key, tampered) */
export async function decryptSecret(keys: readonly Key[], stored: string, context: string) {
  const [version, kid, iv, cipher] = stored.split('.')
  const key = keys.find((k) => k.kid === kid)
  if (version !== 'v1' || key === undefined || iv === undefined || cipher === undefined)
    throw new InfrastructureError(`Webhook secret key "${kid}" is not configured`)
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(iv), additionalData: new TextEncoder().encode(context) },
      key.key,
      fromB64(cipher),
    )
    return new TextDecoder().decode(plain)
  } catch (error) {
    throw new InfrastructureError('A webhook secret could not be decrypted', { cause: error })
  }
}
