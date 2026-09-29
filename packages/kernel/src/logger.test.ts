import { describe, expect, it } from 'vitest'
import {
  createJsonLogger,
  isLogLevel,
  type LogLevel,
  REDACTED,
  redactString,
  sanitize,
} from './logger.ts'

function capture(options: Parameters<typeof createJsonLogger>[0] = {}) {
  const lines: { level: LogLevel; entry: Record<string, unknown> }[] = []
  const logger = createJsonLogger({
    ...options,
    write: (level, line) => lines.push({ level, entry: JSON.parse(line) }),
  })
  return { logger, lines }
}

describe('isLogLevel', () => {
  it('accepts the four levels only', () => {
    expect(['debug', 'info', 'warn', 'error'].every(isLogLevel)).toBe(true)
    expect(isLogLevel('trace')).toBe(false)
    expect(isLogLevel(undefined)).toBe(false)
  })
})

describe('redactString', () => {
  it.each([
    ['token blx_pat_abcdefgh12345678 used', `token blx_${REDACTED} used`],
    ['postgres://app:s3cr3t@db.example/blixis', `postgres://app:${REDACTED}@db.example/blixis`],
    ['Authorization: Bearer abcdefghijklmnop', `Authorization: Bearer ${REDACTED}`],
    ['jwt eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.c2lnbmF0dXJlMTI', `jwt ${REDACTED}`],
    ['npm_abcdefghijklmnopqrstuvwx', `npm_${REDACTED}`],
    ['sk_live_abcdefghijklmnopqrst', `sk_live_${REDACTED}`],
  ])('redacts %s', (input, expected) => {
    expect(redactString(input)).toBe(expected)
  })

  it('leaves ordinary text alone', () => {
    expect(redactString('entry published in space 42')).toBe('entry published in space 42')
  })

  it('truncates very long strings', () => {
    const result = redactString('x'.repeat(2_100))
    expect(result).toHaveLength(2_000 + '…[truncated 100 chars]'.length)
    expect(result.endsWith('…[truncated 100 chars]')).toBe(true)
  })
})

describe('sanitize', () => {
  it('redacts secret field names at any depth, ignoring case, _ and -', () => {
    expect(
      sanitize({
        password: 'hunter2',
        nested: { API_KEY: 'k', 'set-cookie': 'c', refreshToken: 't', title: 'Hello' },
        list: [{ clientSecret: 's' }],
      }),
    ).toEqual({
      password: REDACTED,
      nested: { API_KEY: REDACTED, 'set-cookie': REDACTED, refreshToken: REDACTED, title: 'Hello' },
      list: [{ clientSecret: REDACTED }],
    })
  })

  it('caps arrays and depth', () => {
    const items = sanitize(Array.from({ length: 60 }, (_, i) => i)) as unknown[]
    expect(items).toHaveLength(51)
    expect(items.at(-1)).toBe('[truncated 10 items]')
    expect(sanitize({ a: { b: { c: { d: { e: { f: 1 } } } } } })).toEqual({
      a: { b: { c: { d: { e: '[truncated: too deep]' } } } },
    })
  })

  it('serializes errors with code, status and cause; stacks only on request', () => {
    const error = Object.assign(
      new Error('failed for postgres://u:pw@h/db', { cause: new TypeError('inner') }),
      {
        code: 'E_DB',
        status: 503,
      },
    )
    const plain = sanitize(error) as Record<string, unknown>
    expect(plain).toEqual({
      name: 'Error',
      message: `failed for postgres://u:${REDACTED}@h/db`,
      code: 'E_DB',
      status: 503,
      cause: { name: 'TypeError', message: 'inner' },
    })
    expect(plain).not.toHaveProperty('stack')
    expect(sanitize(error, true)).toHaveProperty('stack')
  })

  it('converts dates and bigints', () => {
    expect(sanitize({ at: new Date(0), n: 10n })).toEqual({
      at: '1970-01-01T00:00:00.000Z',
      n: '10',
    })
  })
})

describe('createJsonLogger', () => {
  it('writes one JSON object per entry with bound and call fields', () => {
    const { logger, lines } = capture({ fields: { service: 'api' } })
    logger.child({ requestId: 'r1' }).info('request', { status: 200 })
    expect(lines).toHaveLength(1)
    expect(lines[0]?.level).toBe('info')
    expect(lines[0]?.entry).toMatchObject({
      level: 'info',
      message: 'request',
      service: 'api',
      requestId: 'r1',
      status: 200,
    })
    expect(typeof lines[0]?.entry['time']).toBe('string')
  })

  it('filters by level and reads a level function on every call', () => {
    let level: LogLevel = 'warn'
    const { logger, lines } = capture({ level: () => level })
    logger.info('dropped')
    logger.warn('kept')
    level = 'debug'
    logger.debug('now kept')
    expect(lines.map((l) => l.entry['message'])).toEqual(['kept', 'now kept'])
  })

  it('includes stacks only at debug level by default', () => {
    let level: LogLevel = 'info'
    const { logger, lines } = capture({ level: () => level })
    logger.error('failed', { error: new Error('boom') })
    level = 'debug'
    logger.error('failed', { error: new Error('boom') })
    expect(lines[0]?.entry['error']).not.toHaveProperty('stack')
    expect(lines[1]?.entry['error']).toHaveProperty('stack')
  })

  it('redacts secrets in fields and in the message', () => {
    const { logger, lines } = capture()
    logger.warn('login with Bearer abcdefghijklmnop', { authorization: 'x', token: 'y' })
    expect(lines[0]?.entry).toMatchObject({
      message: `login with Bearer ${REDACTED}`,
      authorization: REDACTED,
      token: REDACTED,
    })
  })
})
