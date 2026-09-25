import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { outboxModule } from '@blixis/events/outbox'
import { serviceOverride } from '@blixis/kernel'
import { captureEvents, createTestBlixis, type TestBlixis } from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { usersModule } from '@blixis/users'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  AUTH_CONFIG,
  type AuthModuleOptions,
  authModule,
  DEFAULT_THROTTLE_POLICY,
  generateSigningKey,
  REFRESH_COOKIE,
} from '../src/index.ts'

const ORIGIN = 'https://admin.example.com'
const PASSWORD = 'a very long passphrase'
const WRONG = 'wrong passphrase!!'

describe.skipIf(!databaseTestsEnabled())('auth security (Postgres)', () => {
  let db: TestDatabase
  let signingKeys: string
  beforeAll(async () => {
    signingKeys = JSON.stringify([await generateSigningKey('sec-1')])
    db = await createTestDatabase({
      modules: [databaseModule(), eventsModule(), outboxModule(), usersModule(), authModule()],
    })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function setup(options: AuthModuleOptions = {}) {
    const events = captureEvents()
    const t = await createTestBlixis({
      modules: [
        databaseModule(),
        events.module(),
        outboxModule(),
        usersModule(),
        authModule({ allowSignUp: true, ...options }),
      ],
      database: db,
      overrides: [serviceOverride(AUTH_CONFIG, { signingKeys, allowedOrigins: [ORIGIN] })],
    })
    return t
  }
  const post = (t: TestBlixis, path: string, json: unknown, headers: Record<string, string> = {}) =>
    t.request(`/api/v1/auth/${path}`, { method: 'POST', json, headers })
  const signIn = (t: TestBlixis, email: string, password: string, ip = '203.0.113.7') =>
    post(t, 'sign-in', { email, password, tokenDelivery: 'body' }, { 'cf-connecting-ip': ip })
  const signUp = (t: TestBlixis, email: string) =>
    post(t, 'sign-up', { email, displayName: 'U', password: PASSWORD, tokenDelivery: 'body' })

  describe('sign-in throttling', () => {
    const strict = {
      throttle: { ...DEFAULT_THROTTLE_POLICY, maxFailuresPerEmail: 3, maxFailuresPerIp: 6 },
    }

    it('locks an email after repeated failures — even the right password gets 429 with Retry-After', async () => {
      const t = await setup(strict)
      await signUp(t, 'victim@example.com')
      for (let i = 0; i < 3; i++)
        expect((await signIn(t, 'victim@example.com', WRONG)).status).toBe(401)
      const locked = await signIn(t, 'victim@example.com', PASSWORD)
      expect(locked.status).toBe(429)
      expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0)
      expect((await signIn(t, 'someone-else@example.com', WRONG, '198.51.100.1')).status).toBe(401)
    })

    it('locks unknown emails the same way (no account enumeration)', async () => {
      const t = await setup(strict)
      for (let i = 0; i < 3; i++) await signIn(t, 'ghost@example.com', WRONG)
      expect((await signIn(t, 'ghost@example.com', WRONG)).status).toBe(429)
    })

    it('locks an IP spraying many accounts', async () => {
      const t = await setup(strict)
      for (let i = 0; i < 6; i++) await signIn(t, `user${i}@example.com`, WRONG, '192.0.2.50')
      expect((await signIn(t, 'fresh@example.com', WRONG, '192.0.2.50')).status).toBe(429)
      expect((await signIn(t, 'fresh@example.com', WRONG, '192.0.2.51')).status).toBe(401)
    })

    it('a successful sign-in resets the email counter; keys are stored hashed', async () => {
      const t = await setup(strict)
      await signUp(t, 'ok@example.com')
      await signIn(t, 'ok@example.com', WRONG)
      await signIn(t, 'ok@example.com', WRONG)
      expect((await signIn(t, 'ok@example.com', PASSWORD)).status).toBe(200)
      await signIn(t, 'ok@example.com', WRONG)
      await signIn(t, 'ok@example.com', WRONG)
      expect((await signIn(t, 'ok@example.com', PASSWORD)).status).toBe(200)
      const rows = await db.db.execute<{ key_hash: string }>(
        sql`select key_hash from auth.sign_in_throttle`,
      )
      expect(rows.rows.length).toBeGreaterThan(0)
      expect(JSON.stringify(rows.rows)).not.toMatch(/example\.com|203\.0\.113/)
      expect(rows.rows.every((r) => /^[0-9a-f]{64}$/.test(r.key_hash))).toBe(true)
    })
  })

  it('session fixation: every sign-in starts a new family; a presented refresh cookie is ignored', async () => {
    const t = await setup()
    const first = (await (await signUp(t, 'fix@example.com')).json()) as {
      accessToken: string
      refreshToken: string
    }
    const second = await post(
      t,
      'sign-in',
      { email: 'fix@example.com', password: PASSWORD },
      { cookie: `${REFRESH_COOKIE}=${first.refreshToken}` },
    )
    const cookie = /blixis_refresh=([^;]*)/.exec(second.headers.get('set-cookie') ?? '')?.[1]
    expect(cookie).toBeDefined()
    expect(cookie).not.toBe(first.refreshToken)
    const sid = (jwt: string) =>
      JSON.parse(atob((jwt.split('.')[1] ?? '').replaceAll('-', '+').replaceAll('_', '/'))).sid
    const secondBody = (await second.json()) as { accessToken: string }
    expect(sid(secondBody.accessToken)).not.toBe(sid(first.accessToken))
  })

  it('no password, token, cookie, or key material ever reaches the logs', async () => {
    const t = await setup({ rotationGraceSeconds: 0 })
    const session = (await (await signUp(t, 'logs@example.com')).json()) as {
      accessToken: string
      refreshToken: string
    }
    await signIn(t, 'logs@example.com', WRONG)
    await signIn(t, 'nobody@example.com', WRONG)
    const cookieRefresh = await post(
      t,
      'refresh',
      {},
      { cookie: `${REFRESH_COOKIE}=${session.refreshToken}`, origin: ORIGIN },
    )
    const rotated =
      /blixis_refresh=([^;]*)/.exec(cookieRefresh.headers.get('set-cookie') ?? '')?.[1] ?? ''
    await new Promise((r) => setTimeout(r, 20))
    await post(t, 'refresh', { refreshToken: session.refreshToken }) // reuse → family revoked, warning logged
    const pat = (await (
      await t.request('/api/v1/auth/tokens', {
        method: 'POST',
        json: { name: 'x' },
        headers: { authorization: `Bearer ${session.accessToken}` },
      })
    ).json()) as { token?: string }
    await t.request('/api/v1/users/me', { headers: { authorization: `Bearer ${pat.token ?? ''}` } })
    await t.request('/api/v1/users/me', {
      headers: { authorization: 'Bearer blx_pat_invalidinvalidinvalid' },
    })

    const logged = JSON.stringify(t.logs.entries)
    expect(t.logs.entries.some((e) => e.message === 'auth.refresh_reuse')).toBe(true)
    const secrets = [
      PASSWORD,
      WRONG,
      session.accessToken,
      session.refreshToken,
      rotated,
      pat.token ?? '',
      'blx_pat_invalidinvalidinvalid',
    ]
    for (const secret of secrets.filter((s) => s !== '')) expect(logged).not.toContain(secret)
    expect(logged).not.toContain(JSON.parse(signingKeys)[0].d)
  })
})
