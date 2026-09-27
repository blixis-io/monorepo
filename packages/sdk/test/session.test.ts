import { describe, expect, it } from 'vitest'
import { type BlixisApiError, createBrowserSession, type User } from '../src/index.ts'

const user: User = {
  id: 'u1',
  email: 'ada@example.com',
  displayName: 'Ada',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const problem = (status: number, code: string) =>
  Response.json({ type: 'x', title: 'x', status, code, requestId: 'req-1' }, { status })

/** A fake API with a cookie jar: access tokens `at-1`, `at-2`, … and rotating refresh cookies. */
function fakeApi() {
  let cookie: string | undefined
  let issued = 0
  const live = new Set<string>()
  const seen: Request[] = []
  const session = () => {
    issued++
    cookie = `rt-${issued}`
    live.add(`at-${issued}`)
    return Response.json({ tokenType: 'Bearer', accessToken: `at-${issued}`, expiresIn: 900, user })
  }
  const fetch = async (request: Request) => {
    seen.push(request)
    const path = new URL(request.url).pathname
    if (path === '/api/v1/auth/sign-in') {
      const body = (await request.json()) as { password: string; tokenDelivery: string }
      if (body.tokenDelivery !== 'cookie') return problem(400, 'VALIDATION_FAILED')
      return body.password === 'right' ? session() : problem(401, 'UNAUTHORIZED')
    }
    if (path === '/api/v1/auth/refresh') {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return cookie === undefined ? problem(401, 'UNAUTHORIZED') : session()
    }
    if (path === '/api/v1/auth/sign-out') {
      cookie = undefined
      return new Response(null, { status: 204 })
    }
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? ''
    if (!live.has(token)) return problem(401, 'UNAUTHORIZED')
    return Response.json({ organizations: [] })
  }
  return {
    fetch,
    seen,
    /** Server-side expiry of every access token issued so far. */
    expireAccessTokens: () => live.clear(),
    dropCookie: () => {
      cookie = undefined
    },
    setCookie: (value: string) => {
      cookie = value
    },
    refreshes: () => seen.filter((r) => r.url.endsWith('/auth/refresh')).length,
  }
}

describe('browser session (ADR 0009, 0017)', () => {
  it('signs in with the cookie delivery and authenticates API calls from memory', async () => {
    const api = fakeApi()
    const session = createBrowserSession({ baseUrl: 'https://api.example.com', fetch: api.fetch })
    const events: (string | null)[] = []
    session.subscribe((u) => events.push(u?.id ?? null))
    await expect(session.signIn({ email: user.email, password: 'wrong' })).rejects.toMatchObject({
      status: 401,
    })
    expect(await session.signIn({ email: user.email, password: 'right' })).toEqual(user)
    expect(session.user).toEqual(user)
    expect(await session.client.organizations.list()).toEqual([])
    const call = api.seen.at(-1)
    expect(call?.headers.get('authorization')).toBe('Bearer at-1')
    expect(call?.credentials).toBe('include')
    expect(api.seen[0]?.credentials).toBe('include')
    expect(events).toEqual(['u1'])
  })

  it('restores from the refresh cookie, or reports no session', async () => {
    const api = fakeApi()
    const session = createBrowserSession({ baseUrl: 'https://api.example.com', fetch: api.fetch })
    expect(await session.restore()).toBeNull()
    api.setCookie('rt-old')
    expect(await session.restore()).toEqual(user)
    expect(await session.restore()).toEqual(user) // no second refresh
    expect(api.refreshes()).toBe(2)
  })

  it('refreshes once for concurrent requests when the access token is about to expire', async () => {
    const api = fakeApi()
    let clock = 0
    const session = createBrowserSession({
      baseUrl: 'https://api.example.com',
      fetch: api.fetch,
      now: () => clock,
    })
    await session.signIn({ email: user.email, password: 'right' })
    clock = 900_000 - 30_000 // inside the 60 s margin
    await Promise.all([session.client.organizations.list(), session.client.organizations.list()])
    expect(api.refreshes()).toBe(1)
    expect(api.seen.at(-1)?.headers.get('authorization')).toBe('Bearer at-2')
  })

  it('refreshes and repeats a request that answered 401', async () => {
    const api = fakeApi()
    const session = createBrowserSession({ baseUrl: 'https://api.example.com', fetch: api.fetch })
    await session.signIn({ email: user.email, password: 'right' })
    api.expireAccessTokens()
    expect(await session.client.organizations.list()).toEqual([])
    expect(api.refreshes()).toBe(1)
  })

  it('ends the session when the refresh cookie is gone', async () => {
    const api = fakeApi()
    const session = createBrowserSession({ baseUrl: 'https://api.example.com', fetch: api.fetch })
    const events: (string | null)[] = []
    session.subscribe((u) => events.push(u?.id ?? null))
    await session.signIn({ email: user.email, password: 'right' })
    api.expireAccessTokens()
    api.dropCookie()
    const error = (await session.client.organizations.list().catch((e) => e)) as BlixisApiError
    expect(error.status).toBe(401)
    expect(session.user).toBeNull()
    expect(events).toEqual(['u1', null])
  })

  it('serializes refreshes through the lock', async () => {
    const api = fakeApi()
    const names: string[] = []
    const session = createBrowserSession({
      baseUrl: 'https://api.example.com',
      fetch: api.fetch,
      lock: (name, run) => {
        names.push(name)
        return run()
      },
    })
    api.setCookie('rt-old')
    await session.restore()
    expect(names).toEqual(['blixis-session-refresh'])
  })

  it('signs out on the server and locally, even when the server call fails', async () => {
    const api = fakeApi()
    const session = createBrowserSession({ baseUrl: 'https://api.example.com', fetch: api.fetch })
    await session.signIn({ email: user.email, password: 'right' })
    await session.signOut()
    expect(session.user).toBeNull()
    expect(await session.restore()).toBeNull()

    const failing = createBrowserSession({
      baseUrl: 'https://api.example.com',
      fetch: async (request) =>
        request.url.endsWith('/sign-out')
          ? problem(503, 'INFRASTRUCTURE_ERROR')
          : api.fetch(request),
      retries: 0,
    })
    await failing.signIn({ email: user.email, password: 'right' })
    await expect(failing.signOut()).rejects.toMatchObject({ status: 503 })
    expect(failing.user).toBeNull()
  })
})
