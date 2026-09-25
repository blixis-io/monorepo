/**
 * Passwords rejected outright (NIST SP 800-63B §5.1.1.2: check against commonly used values).
 * A short list of the most common passwords that satisfy the 12-character minimum; extend via
 * the module option `blockedPasswords`.
 */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  '123456789012',
  '1234567890123',
  'qwertyuiopas',
  'qwerty123456',
  'password1234',
  'password12345',
  'passwordpassword',
  'iloveyou1234',
  'welcome12345',
  'administrator',
  'letmein12345',
  'aaaaaaaaaaaa',
  '111111111111',
  '000000000000',
  'abcdefghijkl',
  'abc123abc123',
  'changeme1234',
  'blixisblixis',
])
