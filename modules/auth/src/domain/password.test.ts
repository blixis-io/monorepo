import { ValidationError } from '@blixis/contracts'
import { scryptAsync } from '@noble/hashes/scrypt.js'
import { describe, expect, it } from 'vitest'
import { toBase64Url } from './encoding.ts'
import {
  assertAcceptablePassword,
  hashPassword,
  SCRYPT_PARAMS,
  verifyPassword,
} from './password.ts'

describe('passwords', () => {
  it('hashes in the versioned scrypt format and verifies', async () => {
    const stored = await hashPassword('correct horse battery staple')
    expect(stored).toMatch(/^scrypt\$v=1\$N=32768,r=8,p=1\$[\w-]{22}\$[\w-]{43}$/)
    expect(await verifyPassword('correct horse battery staple', stored)).toEqual({
      valid: true,
      needsRehash: false,
    })
    expect(await verifyPassword('wrong horse battery staple', stored)).toEqual({
      valid: false,
      needsRehash: false,
    })
    expect(await hashPassword('correct horse battery staple')).not.toBe(stored) // random salt
  })

  it('flags hashes with old parameters for rehashing, and rejects malformed hashes', async () => {
    const salt = new Uint8Array(16)
    const old = await scryptAsync('pw-old-params-123', salt, { N: 16384, r: 8, p: 1, dkLen: 32 })
    const stored = `scrypt$v=1$N=16384,r=8,p=1$${toBase64Url(salt)}$${toBase64Url(old)}`
    expect(await verifyPassword('pw-old-params-123', stored)).toEqual({
      valid: true,
      needsRehash: true,
    })
    expect(await verifyPassword('x', 'md5$abc')).toEqual({ valid: false, needsRehash: false })
    expect(SCRYPT_PARAMS.N).toBe(32768)
  })

  it('enforces length and common-password rules (NIST 800-63B)', () => {
    expect(() => assertAcceptablePassword('short')).toThrow(ValidationError)
    try {
      assertAcceptablePassword('Password1234')
      expect.unreachable()
    } catch (error) {
      expect((error as ValidationError).issues).toEqual([
        { path: ['password'], message: 'This password is too common' },
      ])
    }
    expect(() => assertAcceptablePassword('x'.repeat(257))).toThrow(ValidationError)
    expect(() => assertAcceptablePassword('a long enough passphrase')).not.toThrow()
  })
})

describe('burnPasswordCheck', () => {
  it('costs one scrypt run, like a wrong-password check (no first-call penalty)', async () => {
    const { burnPasswordCheck } = await import('./password.ts')
    const stored = await hashPassword('the real passphrase')
    const time = async (fn: () => Promise<unknown>) => {
      const start = performance.now()
      await fn()
      return performance.now() - start
    }
    const burn = await time(() => burnPasswordCheck('guess guess guess'))
    const wrong = await time(() => verifyPassword('guess guess guess', stored))
    expect(burn).toBeLessThan(wrong * 1.8)
  })
})
