import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { outboxModule } from '@blixis/events/outbox'
import { serviceOverride } from '@blixis/kernel'
import { asUser, captureEvents, createTestBlixis, type TestBlixis } from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { USER_SERVICE, usersModule } from '@blixis/users'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  AUTH_CONFIG,
  AUTH_SERVICE,
  type AuthModuleOptions,
  authModule,
  generateSigningKey,
  REFRESH_COOKIE,
} from '../src/index.ts'

const ORIGIN = 'https://admin.example.com'
const PASSWORD = 'a very long passphrase'

describe.skipIf(!databaseTestsEnabled())('auth flows (Postgres)', () => {
  let db: TestDatabase
  let signingKeys: string
  beforeAll(async () => {
    signingKeys = JSON.stringify([await generateSigningKey('test-1')])
    db = await createTestDatabase({
      modules: [databaseModule(), eventsModule(), outboxModule(), usersModule(), authModule()],
    })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function setup(options: AuthModuleOptions = { allowSignUp: true }) {
    const events = captureEvents()
    const t = await createTestBlixis({
      modules: [
        databaseModule(),
        events.module(),
        outboxModule(),
        usersModule(),
        authModule(options),
      ],
      database: db,
      overrides: [serviceOverride(AUTH_CONFIG, { signingKeys, allowedOrigins: [ORIGIN] })],
    })
    return { t, events }
  }
  const post = (t: TestBlixis, path: string, json: unknown, headers: Record<string, string> = {}) =>
    t.request(`/api/v1/auth/${path}`, { method: 'POST', json, headers })
  const cookieOf = (res: Response) => {
    const header = res.headers.get('set-cookie') ?? ''
    return new RegExp(`${REFRESH_COOKIE}=([^;]*)`).exec(header)?.[1]
  }
  const signUp = (t: TestBlixis, email = 'ada@example.com') =>
    post(t, 'sign-up', { email, displayName: 'Ada', password: PASSWORD })

  it('sign-up creates the user, returns an access token, and sets the refresh cookie', async () => {
    const { t, events } = await setup()
    const res = await signUp(t)
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      accessToken: string
      tokenType: string
      expiresIn: number
      user: { id: string }
      refreshToken?: string
    }
    expect(body).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 })
    expect(body.refreshToken).toBeUndefined()
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/HttpOnly/)
    expect(setCookie).toMatch(/Secure/)
    expect(setCookie).toMatch(/SameSite=Strict/)
    expect(setCookie).toMatch(/Path=\/api\/v1\/auth/)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const claims = await t.app.runInScope({}, async ({ services }) =>
      services.get(AUTH_SERVICE).verifyAccessToken(body.accessToken),
    )
    expect(claims.sub).toBe(body.user.id)
    expect(events.emitted.map((e) => e.type)).toEqual(['user.created', 'user.signed-in'])
  })

  it('rejects duplicate emails (409), weak passwords (400), and sign-up when disabled (403)', async () => {
    const { t } = await setup()
    await signUp(t)
    expect((await signUp(t, 'ADA@example.com')).status).toBe(409)
    expect(
      (await post(t, 'sign-up', { email: 'b@example.com', displayName: 'B', password: 'short' }))
        .status,
    ).toBe(400)
    const closed = await setup({})
    expect((await signUp(closed.t, 'c@example.com')).status).toBe(403)
  })

  it('sign-in returns the same generic 401 for unknown emails, wrong passwords, and disabled users', async () => {
    const { t } = await setup()
    const created = (await (await signUp(t)).json()) as { user: { id: string } }
    const ok = await post(t, 'sign-in', { email: ' ADA@example.com ', password: PASSWORD })
    expect(ok.status).toBe(200)
    const wrong = await post(t, 'sign-in', {
      email: 'ada@example.com',
      password: 'wrong passphrase!!',
    })
    const unknown = await post(t, 'sign-in', { email: 'nobody@example.com', password: PASSWORD })
    await t.app.runInScope({}, async ({ services }) =>
      services.get(USER_SERVICE).disable(created.user.id),
    )
    const disabled = await post(t, 'sign-in', { email: 'ada@example.com', password: PASSWORD })
    for (const res of [wrong, unknown, disabled]) {
      expect(res.status).toBe(401)
      expect(((await res.json()) as { detail: string }).detail).toBe('Invalid email or password')
    }
  })

  it('refresh rotates the cookie token; reusing the old one after the grace window revokes the family', async () => {
    const { t } = await setup({ allowSignUp: true, rotationGraceSeconds: 0 })
    const first = cookieOf(await signUp(t))
    const refreshed = await post(
      t,
      'refresh',
      {},
      { cookie: `${REFRESH_COOKIE}=${first}`, origin: ORIGIN },
    )
    expect(refreshed.status).toBe(200)
    const second = cookieOf(refreshed)
    expect(second).toBeDefined()
    expect(second).not.toBe(first)

    await new Promise((r) => setTimeout(r, 20))
    const reuse = await post(
      t,
      'refresh',
      {},
      { cookie: `${REFRESH_COOKIE}=${first}`, origin: ORIGIN },
    )
    expect(reuse.status).toBe(401)
    expect(cookieOf(reuse)).toBe('') // cleared
    // The whole family is revoked: the legitimate newer token no longer works either.
    expect(
      (await post(t, 'refresh', {}, { cookie: `${REFRESH_COOKIE}=${second}`, origin: ORIGIN }))
        .status,
    ).toBe(401)
  })

  it('accepts a just-rotated token within the grace window (concurrent tabs)', async () => {
    const { t } = await setup()
    const first = cookieOf(await signUp(t))
    const a = await post(t, 'refresh', {}, { cookie: `${REFRESH_COOKIE}=${first}`, origin: ORIGIN })
    const b = await post(t, 'refresh', {}, { cookie: `${REFRESH_COOKIE}=${first}`, origin: ORIGIN })
    expect([a.status, b.status]).toEqual([200, 200])
  })

  it('cookie refresh and sign-out require an allowed Origin (CSRF); body tokens do not', async () => {
    const { t } = await setup()
    const token = cookieOf(await signUp(t))
    expect((await post(t, 'refresh', {}, { cookie: `${REFRESH_COOKIE}=${token}` })).status).toBe(
      403,
    )
    expect(
      (
        await post(
          t,
          'refresh',
          {},
          { cookie: `${REFRESH_COOKIE}=${token}`, origin: 'https://evil.example' },
        )
      ).status,
    ).toBe(403)
    const res = await t.request('/api/v1/auth/refresh', {
      method: 'POST',
      body: 'x',
      headers: {
        cookie: `${REFRESH_COOKIE}=${token}`,
        origin: ORIGIN,
        'content-type': 'text/plain',
      },
    })
    expect(res.status).toBe(400)

    const api = (await (
      await post(t, 'sign-in', {
        email: 'ada@example.com',
        password: PASSWORD,
        tokenDelivery: 'body',
      })
    ).json()) as { refreshToken: string }
    expect(api.refreshToken).toMatch(/^blx_rt_/)
    expect((await post(t, 'refresh', { refreshToken: api.refreshToken })).status).toBe(200)
  })

  it('sign-out revokes the family and clears the cookie', async () => {
    const { t, events } = await setup()
    const token = cookieOf(await signUp(t))
    const out = await post(
      t,
      'sign-out',
      {},
      { cookie: `${REFRESH_COOKIE}=${token}`, origin: ORIGIN },
    )
    expect(out.status).toBe(204)
    expect(cookieOf(out)).toBe('')
    expect(
      (await post(t, 'refresh', {}, { cookie: `${REFRESH_COOKIE}=${token}`, origin: ORIGIN }))
        .status,
    ).toBe(401)
    expect(events.emitted.at(-1)?.type).toBe('user.signed-out')
  })

  it('serves the public JWKS and /me for signed-in actors', async () => {
    const { t } = await setup()
    const { user } = (await (await signUp(t)).json()) as { user: { id: string } }
    const jwks = (await (await t.request('/api/v1/auth/jwks')).json()) as { keys: JsonWebKey[] }
    expect(jwks.keys).toHaveLength(1)
    expect(JSON.stringify(jwks)).not.toContain('"d"')
    expect((await t.request('/api/v1/auth/me', { actor: asUser(user.id) })).status).toBe(200)
    expect((await t.request('/api/v1/auth/me')).status).toBe(401)
  })

  describe('actor resolution (Authorization: Bearer)', () => {
    const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

    it('authenticates requests with an access token — no test actor involved', async () => {
      const { t } = await setup()
      const { accessToken, user } = (await (await signUp(t)).json()) as {
        accessToken: string
        user: { id: string }
      }
      const me = await t.request('/api/v1/users/me', { headers: bearer(accessToken) })
      expect(me.status).toBe(200)
      expect(((await me.json()) as { id: string }).id).toBe(user.id)
      expect((await t.request('/api/v1/auth/me', { headers: bearer(accessToken) })).status).toBe(
        200,
      )
    })

    it('rejects tampered, garbage, and not-yet-supported API tokens with 401 (never anonymous)', async () => {
      const { t } = await setup()
      const { accessToken } = (await (await signUp(t)).json()) as { accessToken: string }
      const [h, p, sig] = accessToken.split('.')
      // Flip a character in the middle: the last base64url character of a 64-byte signature
      // carries padding bits, so changing it may not change the decoded signature at all.
      const middle = Math.floor((sig ?? '').length / 2)
      const flipped = sig?.[middle] === 'A' ? 'B' : 'A'
      const tampered = `${h}.${p}.${sig?.slice(0, middle)}${flipped}${sig?.slice(middle + 1)}`
      for (const token of [tampered, 'not-a-jwt', 'blx_pat_abc']) {
        expect((await t.request('/api/v1/users/me', { headers: bearer(token) })).status).toBe(401)
      }
      expect(
        (await t.request('/api/v1/users/me', { headers: { authorization: 'Basic YTpi' } })).status,
      ).toBe(401)
    })

    it('ignores a stale access token on public auth routes so clients can always refresh', async () => {
      const { t } = await setup()
      const body = (await (
        await post(t, 'sign-up', {
          email: 'z@example.com',
          displayName: 'Z',
          password: PASSWORD,
          tokenDelivery: 'body',
        })
      ).json()) as { refreshToken: string }
      const stale = bearer('expired.or.garbage')
      expect((await post(t, 'refresh', { refreshToken: body.refreshToken }, stale)).status).toBe(
        200,
      )
      expect(
        (await post(t, 'sign-in', { email: 'z@example.com', password: PASSWORD }, stale)).status,
      ).toBe(200)
      expect((await t.request('/api/v1/auth/me', { headers: stale })).status).toBe(401)
    })
  })
})
