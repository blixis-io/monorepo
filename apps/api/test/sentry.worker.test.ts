import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { scrubEvent, sentryOptions } from '../src/sentry.ts'

describe('Sentry configuration', () => {
  it('is disabled without a DSN (local and tests)', () => {
    expect(sentryOptions(env)).toBeUndefined()
  })

  it('uses environment, sampling, and privacy-first data collection with a DSN', () => {
    const options = sentryOptions({
      ...env,
      BLIXIS_ENV: 'production',
      SENTRY_DSN: 'https://key@o1.ingest.de.sentry.io/1',
    } as unknown as Env)
    expect(options).toMatchObject({ environment: 'production', tracesSampleRate: 0.1 })
    expect(options?.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
    })
  })

  it('removes credentials from events', () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        headers: {
          Authorization: 'Bearer blx_pat_secret',
          Cookie: 'sid=abc',
          'x-request-id': 'r1',
        },
        cookies: { sid: 'abc' },
        data: '{"password":"hunter2"}',
        query_string: 'token=abc&page=2',
      },
    })
    expect(event.request).toEqual({ headers: { 'x-request-id': 'r1' } })
  })
})
