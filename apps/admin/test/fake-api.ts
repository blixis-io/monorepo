import type { Organization, Space, User, UserPreferences } from '@blixis/sdk'

const stamp = '2026-01-01T00:00:00.000Z'
export const PASSWORD = 'correct horse battery'
export const USER: User = {
  id: 'u1',
  email: 'ada@example.com',
  displayName: 'Ada Lovelace',
  status: 'active',
  createdAt: stamp,
  updatedAt: stamp,
}

const problem = (status: number, code: string, detail: string, requestId = 'req-test-1') =>
  Response.json({ type: 'about:blank', title: code, status, code, detail, requestId }, { status })

/**
 * An in-memory Management API for component tests: sign-in with a cookie jar, organizations,
 * spaces. Only what the admin shell calls; everything else answers 404.
 */
export function createFakeApi(options: { signedIn?: boolean } = {}) {
  let cookie: string | undefined = options.signedIn ? 'rt-0' : undefined
  let issued = 0
  const live = new Set<string>()
  const organizations: Organization[] = [
    { id: 'o1', name: 'Acme', slug: 'acme', createdAt: stamp, updatedAt: stamp },
  ]
  const spaces: Space[] = [
    {
      id: 's1',
      organizationId: 'o1',
      name: 'Marketing site',
      slug: 'marketing',
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: 's2',
      organizationId: 'o1',
      name: 'Docs',
      slug: 'docs',
      createdAt: stamp,
      updatedAt: stamp,
    },
  ]
  const calls: string[] = []
  let preferences: UserPreferences = { colorScheme: 'system', theme: null }
  let failNext: Response | undefined

  const session = () => {
    issued++
    cookie = `rt-${issued}`
    live.add(`at-${issued}`)
    return Response.json({
      tokenType: 'Bearer',
      accessToken: `at-${issued}`,
      expiresIn: 900,
      user: USER,
    })
  }
  const details = (space: Space) => ({
    ...space,
    environments: [
      {
        id: `${space.id}-env`,
        organizationId: space.organizationId,
        spaceId: space.id,
        key: 'main',
        isDefault: true,
        createdAt: stamp,
      },
    ],
    locales: [
      {
        id: `${space.id}-loc`,
        organizationId: space.organizationId,
        spaceId: space.id,
        code: 'en-US',
        name: 'en-US',
        isDefault: true,
        fallbackCode: null,
        createdAt: stamp,
      },
    ],
  })

  async function fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname.replace(/^\/api\/v1/, '')
    calls.push(`${request.method} ${path}`)
    if (path === '/auth/sign-in') {
      const body = (await request.json()) as { email: string; password: string }
      if (body.email !== USER.email || body.password !== PASSWORD)
        return problem(401, 'UNAUTHORIZED', 'Invalid email or password')
      return session()
    }
    if (path === '/auth/refresh')
      return cookie === undefined ? problem(401, 'UNAUTHORIZED', 'No session') : session()
    if (path === '/auth/sign-out') {
      cookie = undefined
      live.clear()
      return new Response(null, { status: 204 })
    }
    const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
    if (token === undefined || !live.has(token))
      return problem(401, 'UNAUTHORIZED', 'Not signed in')
    if (failNext !== undefined) {
      const response = failNext
      failNext = undefined
      return response
    }

    if (path === '/users/me/preferences') {
      if (request.method === 'PUT') preferences = (await request.json()) as UserPreferences
      return Response.json(preferences)
    }
    if (path === '/organizations' && request.method === 'GET')
      return Response.json({ organizations })
    if (path === '/organizations' && request.method === 'POST') {
      const body = (await request.json()) as { name: string; slug: string }
      if (organizations.some((o) => o.slug === body.slug))
        return problem(409, 'CONFLICT', 'The slug is taken', 'req-conflict')
      const org = {
        id: `o${organizations.length + 1}`,
        ...body,
        createdAt: stamp,
        updatedAt: stamp,
      }
      organizations.push(org)
      return Response.json(org, { status: 201 })
    }
    const orgSpaces = path.match(/^\/organizations\/([^/]+)\/spaces$/)
    if (orgSpaces !== null) {
      const orgId = orgSpaces[1]
      if (request.method === 'GET')
        return Response.json({ spaces: spaces.filter((s) => s.organizationId === orgId) })
      const body = (await request.json()) as { name: string; slug: string }
      const space = {
        id: `s${spaces.length + 1}`,
        organizationId: orgId ?? '',
        name: body.name,
        slug: body.slug,
        createdAt: stamp,
        updatedAt: stamp,
      }
      spaces.push(space)
      return Response.json(details(space), { status: 201 })
    }
    const spacePath = path.match(/^\/spaces\/([^/]+)$/)
    if (spacePath !== null) {
      const space = spaces.find((s) => s.id === spacePath[1])
      return space === undefined
        ? problem(404, 'NOT_FOUND', 'Space not found', 'req-404')
        : Response.json(details(space))
    }
    return problem(404, 'NOT_FOUND', `No route ${path}`)
  }

  return {
    fetch,
    calls,
    organizations,
    spaces,
    /** Answers the next authenticated call with this response. */
    failNextWith(response: Response) {
      failNext = response
    },
    preferences: () => preferences,
    setPreferences(next: UserPreferences) {
      preferences = next
    },
    /** Server-side session end (e.g. revoked elsewhere). */
    revoke() {
      cookie = undefined
      live.clear()
    },
    problem,
  }
}
