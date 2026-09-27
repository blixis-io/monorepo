import { describe, expect, it } from 'vitest'
import {
  decryptSecret,
  encryptSecret,
  generateWebhookKey,
  generateWebhookSecret,
  secretKeys,
} from '../src/application/crypto.ts'

describe('webhook secret encryption', () => {
  it('round-trips, binds the ciphertext to the webhook, and never stores the plain secret', async () => {
    const keys = await secretKeys(generateWebhookKey('k1'))
    const secret = generateWebhookSecret()
    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/)
    const stored = await encryptSecret(keys, secret, 'webhook-a')
    expect(stored).toMatch(/^v1\.k1\./)
    expect(stored).not.toContain(secret.slice(6))
    expect(await decryptSecret(keys, stored, 'webhook-a')).toBe(secret)
    await expect(decryptSecret(keys, stored, 'webhook-b')).rejects.toThrow('could not be decrypted')
  })

  it('rotates keys: the first encrypts, every key decrypts', async () => {
    const oldKey = generateWebhookKey('old')
    const before = await encryptSecret(await secretKeys(oldKey), 'whsec_x', 'w')
    const rotated = await secretKeys(`${generateWebhookKey('new')},${oldKey}`)
    expect(await decryptSecret(rotated, before, 'w')).toBe('whsec_x')
    expect(await encryptSecret(rotated, 'whsec_x', 'w')).toMatch(/^v1\.new\./)
    await expect(
      decryptSecret(await secretKeys(generateWebhookKey('other')), before, 'w'),
    ).rejects.toThrow('Webhook secret key "old" is not configured')
  })

  it('rejects malformed key configuration', async () => {
    await expect(secretKeys('k1:dG9vIHNob3J0')).rejects.toThrow('32-byte keys')
    await expect(secretKeys('no-colon')).rejects.toThrow('32-byte keys')
  })
})
