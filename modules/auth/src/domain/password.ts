import { ValidationError } from '@blixis/contracts'
import { scryptAsync } from '@noble/hashes/scrypt.js'
import { COMMON_PASSWORDS } from './common-passwords.ts'
import { fromBase64Url, randomBytes, timingSafeEqual, toBase64Url } from './encoding.ts'

/** Current scrypt parameters (ADR 0009): 32 MiB, ~91 ms CPU on Workers. */
export const SCRYPT_PARAMS = Object.freeze({ N: 32768, r: 8, p: 1, dkLen: 32 })

const FORMAT = /^scrypt\$v=1\$N=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/

/** Length and common-password rules (NIST SP 800-63B): 12–256 characters, not on the list. */
export function assertAcceptablePassword(
  password: string,
  blocked: ReadonlySet<string> = COMMON_PASSWORDS,
): void {
  const issues: { path: string[]; message: string }[] = []
  const length = [...password].length
  if (length < 12) issues.push({ path: ['password'], message: 'Use at least 12 characters' })
  if (length > 256) issues.push({ path: ['password'], message: 'Use at most 256 characters' })
  if (blocked.has(password.toLowerCase())) {
    issues.push({ path: ['password'], message: 'This password is too common' })
  }
  if (issues.length > 0) throw new ValidationError('Password is not acceptable', issues)
}

/** Hashes a password: `scrypt$v=1$N=…,r=…,p=…$<salt>$<hash>` (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const { N, r, p, dkLen } = SCRYPT_PARAMS
  const hash = await scryptAsync(password.normalize('NFKC'), salt, { N, r, p, dkLen })
  return `scrypt$v=1$N=${N},r=${r},p=${p}$${toBase64Url(salt)}$${toBase64Url(hash)}`
}

/**
 * Verifies a password against a stored hash in constant time. `needsRehash` is set when the
 * stored parameters differ from {@link SCRYPT_PARAMS} (upgrade on successful sign-in).
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<{ readonly valid: boolean; readonly needsRehash: boolean }> {
  const match = FORMAT.exec(stored)
  if (match === null) return { valid: false, needsRehash: false }
  const [, n, r, p, salt, expected] = match
  const expectedBytes = fromBase64Url(expected ?? '')
  const actual = await scryptAsync(password.normalize('NFKC'), fromBase64Url(salt ?? ''), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    dkLen: expectedBytes.length,
  })
  const valid = timingSafeEqual(actual, expectedBytes)
  const needsRehash =
    Number(n) !== SCRYPT_PARAMS.N || Number(r) !== SCRYPT_PARAMS.r || Number(p) !== SCRYPT_PARAMS.p
  return { valid, needsRehash: valid && needsRehash }
}

/**
 * A fixed, valid hash with the current parameters (of a random, discarded password). Verifying
 * against it costs exactly one scrypt run — the same as a real wrong-password check.
 */
const DUMMY_HASH =
  'scrypt$v=1$N=32768,r=8,p=1$xbZYXokPyDqi6q_MlyZ57Q$3CHS79fbMpA2uZgi5Bc4mUNO0pE11TYaHB-a-KACtcc'

/**
 * Runs a full password verification against {@link DUMMY_HASH}, so that "unknown email" takes
 * as long as "wrong password" (prevents account enumeration by timing).
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  await verifyPassword(password, DUMMY_HASH)
}
